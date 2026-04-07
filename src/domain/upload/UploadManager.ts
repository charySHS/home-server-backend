// src/domain/upload/UploadManager.ts

import {promises as fs} from "fs";
import path from "path";

import {UploadSession} from "./UploadSession.js";
import {UploadState} from "./UploadState.js";
import {UploadDiskStore} from "../../storage/UploadDiskStore.js";
import {randomUUID} from "node:crypto";

import {STORAGE_CONFIG} from "../../config/storage.js";
import { AsyncMutex } from "../../utils/AsyncMutex.js";
import { statsCollector } from "../../stats/StatsCollector.js";
import { logger } from "../../logger/Logger.js";

export interface UploadInitRequest {
    fileId: string;
    fileName: string;
    fileSize: number;
    chunkSize: number;
    totalChunks: number;
    username: string;
}

export interface UploadStatus {
    uploadId: string;
    state: UploadState;
    receivedChunks: number[];
    missingChunks: number[];
}

export class UploadManager {
    private readonly disk: UploadDiskStore;
    private locks = new Map<string, AsyncMutex>();

    constructor( uploadsRoot: string ) { this.disk = new UploadDiskStore(uploadsRoot); }

    /**
     * Initialize or resume an upload session.
     */
    async initUpload(request: UploadInitRequest): Promise<UploadSession> {
        // 1. Scan existing uploads for a resumable match
        const uploadIds = await this.disk.listUploads();

        for (const uploadId of uploadIds) {
            try {
                const metaRaw = await fs.readFile(
                    path.join(this.disk.getUploadDir(uploadId), "meta.json"),
                    "utf-8"
                );

                const meta = JSON.parse(metaRaw) as {
                    fileId: string;
                    userId: string;
                    fileSize: number;
                    chunkSize: number;
                    totalChunks: number;
                    fileName: string;
                };

                // 2. Check resume compatibility — must match userId too
                const isSameFile =
                    meta.userId      === request.username &&
                    meta.fileId      === request.fileId &&
                    meta.fileSize    === request.fileSize &&
                    meta.chunkSize   === request.chunkSize &&
                    meta.totalChunks === request.totalChunks;

                if (!isSameFile) continue;

                // 3. Load state
                const state = await this.disk.readState(uploadId);

                // Do not resume completed uploads
                if (state.state === UploadState.COMPLETED) continue;

                // 4. Resume existing session
                return {
                    uploadId,
                    fileId:        meta.fileId,
                    username:      meta.userId,
                    fileName:      meta.fileName,
                    fileSize:      meta.fileSize,
                    chunkSize:     meta.chunkSize,
                    totalChunks:   meta.totalChunks,
                    state:         state.state,
                    receivedChunks: state.receivedChunks,
                    createdAt:     Date.now(),
                    lastActivity:  state.lastActivity,
                };
            } catch { continue; }
        }

        // 5. No resume found — create new upload
        const uploadId = randomUUID();

        const session: UploadSession = {
            uploadId,
            fileId:        request.fileId,
            username:      request.username,
            fileName:      request.fileName,
            fileSize:      request.fileSize,
            chunkSize:     request.chunkSize,
            totalChunks:   request.totalChunks,
            state:         UploadState.UPLOADING,
            receivedChunks: new Array(request.totalChunks).fill(false),
            createdAt:     Date.now(),
            lastActivity:  Date.now(),
        };

        await this.disk.createUploadDirs(uploadId);
        await this.disk.writeMeta(session);
        await this.disk.writeState(uploadId, {
            state:          session.state,
            receivedChunks: session.receivedChunks,
            lastActivity:   session.lastActivity,
        });

        return session;
    }

    /**
     * Write single chunk to disk.
     */
    async writeChunk(uploadId: string, chunkIndex: number, dataStream: NodeJS.ReadableStream): Promise<void> {
        const lock = this.getLock(uploadId);

        await lock.runExclusive(async () => {
            if (!(await this.disk.exists(uploadId))) { throw new Error("UPLOAD_NOT_FOUND"); }

            const state = await this.disk.readState(uploadId);

            if (chunkIndex < 0 || chunkIndex >= state.receivedChunks.length) { throw new Error("INVALID_CHUNK_INDEX"); }

            if (state.receivedChunks[chunkIndex]) { return; }

            const chunksDir = this.disk.getChunksDir(uploadId);
            const finalPath = path.join(chunksDir, `${chunkIndex}.chunk`);
            const tempPath  = `${finalPath}.tmp`;

            const writeStream = (await import("fs")).createWriteStream(tempPath);

            await new Promise<void>((resolve, reject) => {
                dataStream.pipe(writeStream);
                dataStream.on("error", reject);
                writeStream.on("error", reject);
                writeStream.on("finish", resolve);
            });

            await fs.rename(tempPath, finalPath);

            state.receivedChunks[chunkIndex] = true;
            state.lastActivity = Date.now();

            await this.disk.writeState(uploadId, state);
        });
    }

    /**
     * Get authoritative upload status from server state.
     */
    async getStatus(uploadId: string): Promise<UploadStatus> {
        if (!(await this.disk.exists(uploadId))) { throw new Error("UPLOAD_NOT_FOUND"); }

        const state = await this.disk.readState(uploadId);

        const received: number[] = [];
        const missing:  number[] = [];

        state.receivedChunks.forEach((ok, index) => {
            if (ok) received.push(index);
            else    missing.push(index);
        });

        return { uploadId, state: state.state, receivedChunks: received, missingChunks: missing };
    }

    /**
     * Finalize upload: assemble chunks and place file in the user's folder.
     */
    async finalize(uploadId: string): Promise<void> {
        const lock = this.getLock(uploadId);

        await lock.runExclusive(async () => {
            if (!(await this.disk.exists(uploadId))) { throw new Error("UPLOAD_NOT_FOUND"); }

            const state = await this.disk.readState(uploadId);

            if (state.state === UploadState.COMPLETED) { return; }

            const missing = state.receivedChunks.some(ok => !ok);
            if (missing) { throw new Error("UPLOAD_INCOMPLETE"); }

            state.state = UploadState.FINALIZING;
            state.lastActivity = Date.now();
            await this.disk.writeState(uploadId, state);

            const uploadDir = this.disk.getUploadDir(uploadId);
            const chunksDir = this.disk.getChunksDir(uploadId);

            const metaRaw = await fs.readFile(path.join(uploadDir, "meta.json"), "utf-8");

            const meta = JSON.parse(metaRaw) as {
                userId:      string;   // stored as username
                fileName:    string;
                fileSize:    number;
                totalChunks: number;
            };

            // Files live in dataDir/{username}/{fileName}
            // fileName may include subdirectory path (e.g. "photos/vacation.jpg")
            const userDir     = path.join(STORAGE_CONFIG.dataDir, meta.userId);
            const finalPath   = path.resolve(userDir, meta.fileName);

            // Safety: ensure destination is within the user's folder
            if (!finalPath.startsWith(userDir + path.sep) && finalPath !== userDir) {
                throw new Error("INVALID_FILE_PATH");
            }

            // Create intermediate directories if needed
            await fs.mkdir(path.dirname(finalPath), { recursive: true });

            const finalTempPath = path.join(STORAGE_CONFIG.dataDir, `${uploadId}.tmp`);
            const writeStream   = (await import("fs")).createWriteStream(finalTempPath);

            for (let i = 0; i < meta.totalChunks; i++) {
                const data = await fs.readFile(path.join(chunksDir, `${i}.chunk`));
                writeStream.write(data);
            }

            await new Promise<void>((resolve, reject) => {
                writeStream.end();
                writeStream.on("finish", resolve);
                writeStream.on("error", reject);
            });

            await fs.rename(finalTempPath, finalPath);

            const stats = await fs.stat(finalPath);

            if (stats.size !== meta.fileSize) {
                await fs.rm(finalPath, { force: true });
                state.state = UploadState.FAILED;
                state.lastActivity = Date.now();
                await this.disk.writeState(uploadId, state);
                throw new Error("FILE_SIZE_MISMATCH");
            }

            // Track bytes uploaded for stats
            statsCollector.trackUpload(meta.fileSize);
            logger.info("file_uploaded", { username: meta.userId, file: meta.fileName, bytes: meta.fileSize });

            state.state = UploadState.COMPLETED;
            state.lastActivity = Date.now();
            await this.disk.writeState(uploadId, state);

            await fs.rm(uploadDir, { recursive: true, force: true });
        });
    }

    private getLock(uploadId: string): AsyncMutex {
        if (!this.locks.has(uploadId)) { this.locks.set(uploadId, new AsyncMutex()); }
        return this.locks.get(uploadId)!;
    }
}
