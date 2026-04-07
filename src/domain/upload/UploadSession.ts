// src/domain/upload/UploadSession.ts

import { UploadState } from "./UploadState.js";

export interface UploadSession {
    // Identifiers
    uploadId: string;
    fileId: string;
    userId: string;

    // File Metadata
    fileName: string;
    fileSize: number;
    chunkSize: number;
    totalChunks: number;

    // State
    state: UploadState;
    receivedChunks: boolean[];

    // Timestamps
    createdAt: number;
    lastActivity: number;
}
