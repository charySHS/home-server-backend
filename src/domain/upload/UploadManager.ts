// src/domain/upload/UploadManager.ts

import {promises as fs} from "fs";
import path from "path";

import {UploadSession} from "./UploadSession.js";
import {UploadState} from "./UploadState.js";
import {UploadDiskStore} from "../../storage/UploadDiskStore.js";
import {randomUUID} from "node:crypto";

import { STORAGE_CONFIG } from "../../config/storage.js";

export interface UploadInitRequest {
    fileId: string;
    fileName: string;
    fileSize: number;
    chunkSize: number;
    totalChunks: number;
}

export interface UploadStatus {
    uploadId: string;
    state: UploadState;
    receivedChunks: number[];
    missingChunks: number[];
}

export class UploadManager {
    private readonly disk: UploadDiskStore;

    constructor( uploadsRoot: string ) { this.disk = new UploadDiskStore(uploadsRoot); }

    /**
     * Initialize or resume an upload session.
     * Alpha logic:
     * - Always create new session
     * - TODO: Add resume logic
     */
    async initUpload(request: UploadInitRequest): Promise<UploadSession> {
        // 1. Scan existing uploads
        const uploadIds = await this.disk.listUploads();

        for (const uploadId of uploadIds) {
            try {
                const metaRaw = await fs.readFile(
                    path.join(this.disk.getUploadDir(uploadId), "meta.json"),
                    "utf-8"
                );

                const meta = JSON.parse(metaRaw) as {
                    fileId: string;
                    fileSize: number;
                    chunkSize: number;
                    totalChunks: number;
                    fileName: string;
                };

                // 2. Check resume compatability
                const isSameFile =
                    meta.fileId === request.fileId &&
                    meta.fileSize === request.fileSize &&
                    meta.chunkSize === request.chunkSize &&
                    meta.totalChunks === request.totalChunks;

                if (!isSameFile) continue;

                // 3. Load state
                const state = await this.disk.readState(uploadId);

                // Do not resume completed uploads
                if (state.state === UploadState.COMPLETED) continue;

                // 4. Resume existing session
                return {
                    uploadId,
                    fileId: meta.fileId,
                    fileName: meta.fileName,
                    fileSize: meta.fileSize,
                    chunkSize: meta.chunkSize,
                    totalChunks: meta.totalChunks,
                    state: state.state,
                    receivedChunks: state.receivedChunks,
                    createdAt: Date.now(),
                    lastActivity: state.lastActivity,
                };
            } catch { continue; } // TODO: Treat corrupted uploads
        }

        // 5. No resume found -> create new upload
        const uploadId = randomUUID();

        const session: UploadSession = {
            uploadId,
            fileId: request.fileId,
            fileName: request.fileName,
            fileSize: request.fileSize,
            chunkSize: request.chunkSize,
            totalChunks: request.totalChunks,
            state: UploadState.UPLOADING,
            receivedChunks: new Array(request.totalChunks).fill(false),
            createdAt: Date.now(),
            lastActivity: Date.now(),
        };

        await this.disk.createUploadDirs(uploadId);
        await this.disk.writeMeta(session);
        await this.disk.writeState(uploadId, {
            state: session.state,
            receivedChunks: session.receivedChunks,
            lastActivity: session.lastActivity
        });

        return session;
    }

    /**
     * Write single chunk to disk.
     * Alpha logic:
     * - Sequential writes
     * - No parallel enforcement
     */
    async writeChunk(uploadId: string, chunkIndex: number, dataStream: NodeJS.ReadableStream): Promise<void> {

        // 1. Validate upload exists
        if (!(await this.disk.exists(uploadId))) { throw new Error("UPLOAD_NOT_FOUND"); }

        // 2. Load authoritative state
        const state = await this.disk.readState(uploadId);

        // 3. Validate chunk index
        if (chunkIndex < 0 || chunkIndex >= state.receivedChunks.length) { throw new Error("INVALID_CHUNK_INDEX"); }

        // 4. Idempotency check (already received)
        if (state.receivedChunks[chunkIndex]) { return; } // Chunk already safely written - ignore duplicates

        const chunksDir = this.disk.getChunksDir(uploadId);
        const finalPath = path.join(chunksDir, `${chunkIndex}.chunk`);
        const tempPath = `${finalPath}.tmp`;

        // 5. Write chunk atomically
        const writeStream = (await import("fs")).createWriteStream(tempPath);

        await new Promise<void>((resolve, reject) => {
            dataStream.pipe(writeStream);

            dataStream.on("error", reject);
            writeStream.on("error", reject);
            writeStream.on("finish", resolve);
        });

        // 6. Atomic rename (guarantees full write)
        await fs.rename(tempPath, finalPath);

        // 7. Update state
        state.receivedChunks[chunkIndex] = true;
        state.lastActivity = Date.now();

        await this.disk.writeState(uploadId, state);
    }

    /**
     * Get authoritative upload status from server state.
     */
    async getStatus(uploadId: string): Promise<UploadStatus> {
        if (!(await this.disk.exists(uploadId))) { throw new Error("UPLOAD_NOT_FOUND"); }

        const state = await this.disk.readState(uploadId);

        const received: number[] = [];
        const missing: number[] = [];

        state.receivedChunks.forEach((ok, index) => {
            if (ok) received.push(index);
            else missing.push(index);
        });

        return {
            uploadId,
            state: state.state,
            receivedChunks: received,
            missingChunks: missing,
        };
    }

    /**
     * Finalize upload once all chunks are present.
     */
    async finalize(uploadId: string): Promise<void> {
        // 1. Validate upload exists
        if (!(await this.disk.exists(uploadId))) { throw new Error("UPLOAD_NOT_FOUND"); }

        // 2. Load authoritative state
        const state = await this.disk.readState(uploadId);

        // 3. Ensure upload is not already completed
        if (state.state === UploadState.COMPLETED) { return; } // Idempotent finish

        // 4. Ensure all chunks are present
        const missing = state.receivedChunks.some(ok => !ok);
        if (missing) { throw new Error("UPLOAD_INCOMPLETE"); }

        // 5. Mark Finalizing
        state.state = UploadState.FINALIZING;
        state.lastActivity = Date.now();
        await this.disk.writeState(uploadId, state);

        const uploadDir = this.disk.getUploadDir(uploadId);
        const chunksDir = this.disk.getChunksDir(uploadId);

        const metaRaw = await fs.readFile(
            path.join(uploadDir, "meta.json"),
            "utf-8"
        );

        const meta = JSON.parse(metaRaw) as {
            fileName: string;
            totalChunks: number;
        };

        const finalTempPath = path.join(STORAGE_CONFIG.dataDir, `${uploadId}.tmp`);
        const finalPath = path.join(STORAGE_CONFIG.dataDir, meta.fileName);

        // 6. Switch chunks into temp file (sequentially)
        const writeStream = (await import("fs")).createWriteStream(finalTempPath);

        for (let i = 0; i < meta.totalChunks; i++) {
            const chunkPath = path.join(chunksDir, `${i}.chunk`);
            const data = await fs.readFile(chunkPath);

            writeStream.write(data);
        }

        await new Promise<void>((resolve, reject) => {
            writeStream.end();

            writeStream.on("finish", resolve);
            writeStream.on("error", reject);
        });

        // 7. Atomic move into final location
        await fs.rename(finalTempPath, finalPath);

        // 8. Mark COMPLETED
        state.state = UploadState.COMPLETED;
        state.lastActivity = Date.now();

        await this.disk.writeState(uploadId, state);

        // 9. Cleanup upload directory
        await fs.rm(uploadDir, { recursive: true, force: true });
    }

}