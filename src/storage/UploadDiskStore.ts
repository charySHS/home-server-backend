import { promises as fs } from "fs";
import path from "path";
import { UploadSession } from "../domain/upload/UploadSession.js";
import { UploadState } from "../domain/upload/UploadState.js";

/**
 * Shape of the mutable upload state stored on disk.
 * This file is rewritten frequently and must always be correct.
 */
export interface UploadStateFile {
    state: UploadState;
    receivedChunks: boolean[];
    lastActivity: number;
}

/**
 * UploadDiskStore is the ONLY place that knows
 * about the on-disk upload directory structure.
 *
 * UploadManager owns the logic.
 * UploadDiskStore owns the filesystem.
 *
 * This separation prevents accidental corruption
 * and makes future changes (locks, atomic writes,
 * encryption) localized.
 */
export class UploadDiskStore {
    constructor(
        /**
         * Root directory where all uploads live.
         * Example: "<project>/uploads"
         */
        private readonly uploadsRoot: string
    ) {}

    /** Absolute path to an upload's root directory */
    getUploadDir(uploadId: string): string {
        return path.join(this.uploadsRoot, uploadId);
    }

    /** Path to immutable upload metadata */
    getMetaPath(uploadId: string): string {
        return path.join(this.getUploadDir(uploadId), "meta.json");
    }

    /** Path to mutable upload state */
    getStatePath(uploadId: string): string {
        return path.join(this.getUploadDir(uploadId), "state.json");
    }

    /** Directory containing chunk files */
    getChunksDir(uploadId: string): string {
        return path.join(this.getUploadDir(uploadId), "chunks");
    }

    /**
     * Create upload directory structure.
     * Safe to call multiple times.
     */
    async createUploadDirs(uploadId: string): Promise<void> {
        await fs.mkdir(this.getUploadDir(uploadId), { recursive: true });
        await fs.mkdir(this.getChunksDir(uploadId), { recursive: true });
    }

    /**
     * Persist immutable metadata about an upload.
     * This file should NEVER be modified after creation.
     */
    async writeMeta(session: UploadSession): Promise<void> {
        const meta = {
            uploadId: session.uploadId,
            fileId: session.fileId,
            fileName: session.fileName,
            fileSize: session.fileSize,
            chunkSize: session.chunkSize,
            totalChunks: session.totalChunks,
            createdAt: session.createdAt,
        };

        await fs.writeFile(
            this.getMetaPath(session.uploadId),
            JSON.stringify(meta, null, 2),
            "utf-8"
        );
    }

    /**
     * Persist mutable upload state.
     * This file is the authoritative source of progress.
     */
    async writeState(uploadId: string, state: UploadStateFile): Promise<void> {
        const statePath = this.getStatePath(uploadId);
        const tempPath = `${statePath}.tmp`;

        // First, write to temporary file.
        await fs.writeFile(
            tempPath,
            JSON.stringify(state, null, 2),
            "utf-8"
        );

        // Atomic rename into place
        await fs.rename(tempPath, statePath);
    }

    /**
     * Read current upload state from disk.
     */
    async readState(uploadId: string): Promise<UploadStateFile> {
        const raw = await fs.readFile(this.getStatePath(uploadId), "utf-8");
        return JSON.parse(raw) as UploadStateFile;
    }

    /**
     * Check if an upload directory exists.
     * Used to validate uploadId.
     */
    async exists(uploadId: string): Promise<boolean> {
        try {
            await fs.access(this.getUploadDir(uploadId));
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Returns all uploadIds currently on disk.
     * Used from resume detection.
     */
    async listUploads(): Promise<string[]> {
        try {
            return await fs.readdir(this.uploadsRoot);
        } catch { return []; }
    }
}