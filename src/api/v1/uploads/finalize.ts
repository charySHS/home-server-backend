import { FastifyInstance } from "fastify";

import { UploadManager } from "../../../domain/upload/UploadManager.js";

export async function registerFinalizeUpload(
    app: FastifyInstance,
    uploadManager: UploadManager
) {
    app.post("/api/v1/uploads/finalize", async (req) => {
        const { uploadId } = req.body as { uploadId: string };

        await uploadManager.finalize(uploadId);

        return { status: "COMPLETED" };
    });
}
