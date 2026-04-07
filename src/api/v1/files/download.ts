import { FastifyInstance } from "fastify";
import path from "path";
import fs, { promises as fsp } from "fs";
import { STORAGE_CONFIG } from "../../../config/storage.js";
import { statsCollector } from "../../../stats/StatsCollector.js";

const MIME_TYPES: Record<string, string> = {
    // Images
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    gif: "image/gif", webp: "image/webp", heic: "image/heic",
    heif: "image/heif", svg: "image/svg+xml", bmp: "image/bmp",
    // Video
    mp4: "video/mp4", mov: "video/quicktime", avi: "video/x-msvideo",
    mkv: "video/x-matroska", webm: "video/webm", m4v: "video/mp4",
    // Audio
    mp3: "audio/mpeg", aac: "audio/aac", wav: "audio/wav",
    m4a: "audio/mp4", flac: "audio/flac", ogg: "audio/ogg",
    // Documents
    pdf: "application/pdf", txt: "text/plain",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    // Archives
    zip: "application/zip", gz: "application/gzip",
};

function getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase().slice(1);
    return MIME_TYPES[ext] ?? "application/octet-stream";
}

export function registerDownloadRoute(app: FastifyInstance) {
    app.get("/api/v1/files/*", async (req, reply) => {
        const { userId, role } = (req as any).user as { userId: string; role?: string };
        const rawPath = (req.params as any)["*"] as string;

        // Dashboard can access any file; devices are scoped to their own folder
        const scopeRoot = role === "dashboard"
            ? path.resolve(STORAGE_CONFIG.dataDir)
            : path.resolve(STORAGE_CONFIG.dataDir, userId);

        const filePath = path.resolve(scopeRoot, rawPath);

        if (!filePath.startsWith(scopeRoot + path.sep) && filePath !== scopeRoot) {
            return reply.code(400).send({ error: "INVALID_FILE_PATH" });
        }

        let stat: fs.Stats;
        try {
            stat = await fsp.stat(filePath);
        } catch {
            return reply.code(404).send({ error: "FILE_NOT_FOUND" });
        }

        if (!stat.isFile()) {
            return reply.code(404).send({ error: "FILE_NOT_FOUND" });
        }

        const mimeType = getMimeType(filePath);
        const rangeHeader = req.headers.range;

        if (rangeHeader) {
            const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
            if (!match) return reply.code(416).send({ error: "INVALID_RANGE" });

            const start = match[1] ? parseInt(match[1], 10) : 0;
            const end   = Math.min(
                match[2] ? parseInt(match[2], 10) : stat.size - 1,
                stat.size - 1,
            );

            if (start > end || start >= stat.size) {
                return reply.code(416)
                    .header("Content-Range", `bytes */${stat.size}`)
                    .send({ error: "RANGE_NOT_SATISFIABLE" });
            }

            const chunkSize = end - start + 1;

            reply.code(206).headers({
                "Content-Range":       `bytes ${start}-${end}/${stat.size}`,
                "Accept-Ranges":       "bytes",
                "Content-Length":      chunkSize,
                "Content-Type":        mimeType,
                "Content-Disposition": `attachment; filename="${path.basename(filePath).replace(/"/g, "")}"`,
            });

            statsCollector.trackDownload(chunkSize);
            return reply.send(fs.createReadStream(filePath, { start, end }));
        }

        reply.headers({
            "Content-Length":      stat.size,
            "Content-Type":        mimeType,
            "Accept-Ranges":       "bytes",
            "Content-Disposition": `attachment; filename="${path.basename(filePath).replace(/"/g, "")}"`,
        });

        statsCollector.trackDownload(stat.size);
        return reply.send(fs.createReadStream(filePath));
    });
}
