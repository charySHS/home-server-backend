import { FastifyInstance } from "fastify";
import { promises as fs } from "fs";
import path from "path";
import { STORAGE_CONFIG } from "../../../config/storage.js";

export async function registerFileMkdirRoute(app: FastifyInstance) {
    app.post("/api/v1/files/mkdir", async (req, reply) => {
        const { username } = (req as any).user as { username: string };
        const { path: subPath } = req.body as { path: string };

        if (!subPath || typeof subPath !== "string") {
            return reply.code(400).send({ error: "PATH_REQUIRED" });
        }

        const userRoot = path.resolve(STORAGE_CONFIG.dataDir, username);
        const target   = path.resolve(userRoot, subPath);

        // Ensure the new directory stays within the user's own folder
        if (!target.startsWith(userRoot + path.sep) && target !== userRoot) {
            return reply.code(400).send({ error: "INVALID_PATH" });
        }

        await fs.mkdir(target, { recursive: true });
        return { ok: true };
    });
}
