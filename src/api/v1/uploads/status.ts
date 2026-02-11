import { FastifyInstance } from "fastify";

import { UploadManager } from "../../../domain/upload/UploadManager.js";

export async function registerUploadStatus(
    app: FastifyInstance,
    uploadManager: UploadManager
) {
    app.get("/api/v1/uploads/status/:uploadId", async (req) => {
        const { uploadId } = req.params as { uploadId: string };

        return uploadManager.getStatus(uploadId);
    });
}