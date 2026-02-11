import { FastifyInstance } from "fastify";
import { z } from "zod";
import { UploadManager } from "../../../domain/upload/UploadManager.js";

const InitSchema = z.object({
    fileId: z.string(),
    fileName: z.string(),
    fileSize: z.number().positive(),
    chunkSize: z.number().positive(),
    totalChunks: z.number().positive(),
});

export async function registerInitUpload(
    app: FastifyInstance,
    uploadManager: UploadManager
) {
    app.post("/api/v1/uploads/init", async (req) => {
        const body = InitSchema.parse(req.body);

        const session = await uploadManager.initUpload(body);

        const missingChunks: number[] = [];

        session.receivedChunks.forEach((ok, index) => {
            if (!ok) missingChunks.push(index);
        });

        return {
            uploadId: session.uploadId,
            missingChunks,
            chunkSize: session.chunkSize,
            totalChunks: session.totalChunks,
        };
    });
}