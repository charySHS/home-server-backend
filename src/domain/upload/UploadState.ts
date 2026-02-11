// src/domain/upload/UploadState.ts

export enum UploadState {
    CREATED = "CREATED",
    UPLOADING = "UPLOADING",
    PAUSED = "PAUSED",
    FINALIZING = "FINALIZING",
    COMPLETED = "COMPLETED",
    FAILED = "FAILED",
}
