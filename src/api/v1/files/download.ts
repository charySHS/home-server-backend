import { FastifyInstance } from "fastify";
import fs from "fs";
import path from "path";
import { STORAGE_CONFIG } from "../../../config/storage.js";

const STORAGE_DIR = STORAGE_CONFIG.dataDir;

export function registerDownloadRoute(app: FastifyInstance) {
    app.get("/api/v1/files/:fileName", async (req, reply) => {
        const { fileName } = req.params as { fileName: string };

        const filePath = path.join(STORAGE_DIR, fileName);

        // 🔒 Prevent path traversal
        if (!filePath.startsWith(STORAGE_DIR)) {
            return reply.code(400).send({ error: "INVALID_FILE_PATH" });
        }

        if (!fs.existsSync(filePath)) {
            return reply.code(404).send({ error: "FILE_NOT_FOUND" });
        }

        const stat = fs.statSync(filePath);
        const range = req.headers.range;

        // =============================
        // 🔥 RANGE SUPPORT SECTION
        // =============================
        if (range) {
            const bytesPrefix = "bytes=";

            if (!range.startsWith(bytesPrefix)) {
                return reply.code(400).send();
            }

            const rangeParts = range.replace(bytesPrefix, "").split("-");
            const start = parseInt(rangeParts[0], 10);
            const end = rangeParts[1]
                ? parseInt(rangeParts[1], 10)
                : stat.size - 1;

            if (isNaN(start) || isNaN(end) || start > end || start >= stat.size) {
                return reply.code(416).send(); // Range Not Satisfiable
            }

            const chunkSize = end - start + 1;
            const stream = fs.createReadStream(filePath, { start, end });

            reply.code(206).headers({
                "Content-Range": `bytes ${start}-${end}/${stat.size}`,
                "Accept-Ranges": "bytes",
                "Content-Length": chunkSize,
                "Content-Type": "application/octet-stream",
                "Content-Disposition": `attachment; filename="${fileName}"`,
            });

            return reply.send(stream);
        }

        // =============================
        // Normal full download
        // =============================

        reply.headers({
            "Content-Length": stat.size,
            "Content-Type": "application/octet-stream",
            "Accept-Ranges": "bytes",
            "Content-Disposition": `attachment; filename="${fileName}"`,
        });

        return reply.send(fs.createReadStream(filePath));
    });
}