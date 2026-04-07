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
    app.post("/api/v1/uploads/init", async (req, reply) => {
        const body   = InitSchema.parse(req.body);
        const userId = (req as any).user?.userId as string | undefined;

        if (!userId) return reply.code(401).send({ error: "UNAUTHORIZED" });

        const session = await uploadManager.initUpload({ ...body, userId });

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