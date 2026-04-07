import { FastifyInstance } from "fastify";
import { promises as fs } from "fs";
import path from "path";
import { STORAGE_CONFIG } from "../../../config/storage.js";

export async function registerFileDeleteRoute(app: FastifyInstance) {
    app.delete("/api/v1/files/*", async (req, reply) => {
        const { userId, role } = (req as any).user as { userId: string; role?: string };
        const rawPath = (req.params as any)["*"] as string;

        // Dashboard can delete any file; devices are scoped to their own folder
        const scopeRoot = role === "dashboard"
            ? path.resolve(STORAGE_CONFIG.dataDir)
            : path.resolve(STORAGE_CONFIG.dataDir, userId);

        const filePath = path.resolve(scopeRoot, rawPath);

        if (!filePath.startsWith(scopeRoot + path.sep) && filePath !== scopeRoot) {
            return reply.code(400).send({ error: "INVALID_FILE_PATH" });
        }

        try {
            await fs.unlink(filePath);
            return { status: "DELETED" };
        } catch (err: any) {
            if (err.code === "ENOENT") return reply.code(404).send({ error: "FILE_NOT_FOUND" });
            throw err;
        }
    });
}
