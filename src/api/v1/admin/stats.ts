import { FastifyInstance } from "fastify";
import { db } from "../../../persistence/Database.js";
import { STORAGE_CONFIG } from "../../../config/storage.js";
import { statsCollector } from "../../../stats/StatsCollector.js";
import { promises as fsp } from "fs";
import os from "os";
import path from "path";

const SERVER_START_TIME = Date.now();

async function walkDir(dir: string): Promise<{ files: number; bytes: number }> {
    let files = 0, bytes = 0;
    let entries;
    try {
        entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
        return { files, bytes };
    }
    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            const sub = await walkDir(full);
            files += sub.files;
            bytes += sub.bytes;
        } else if (e.isFile()) {
            files++;
            try { bytes += (await fsp.stat(full)).size; } catch { /* skip */ }
        }
    }
    return { files, bytes };
}

export async function registerAdminStatsRoute(app: FastifyInstance) {
    app.get("/api/v1/admin/stats", async (_req, _reply) => {
        const { files: totalFiles, bytes: totalSize } = await walkDir(STORAGE_CONFIG.dataDir);

        let activeUploads = 0;
        try {
            activeUploads = (await fsp.readdir(STORAGE_CONFIG.uploadsDir)).length;
        } catch { /* directory may not exist yet */ }

        const { count: totalDevices } = db
            .prepare("SELECT COUNT(*) as count FROM devices")
            .get() as { count: number };

        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const { count: recentDevices } = db
            .prepare("SELECT COUNT(*) as count FROM devices WHERE last_seen_at > ?")
            .get(weekAgo) as { count: number };

        const mem = process.memoryUsage();

        const history = statsCollector.getHistory();
        const latest  = history[history.length - 1];

        return {
            storage: {
                totalFiles,
                totalSize,
                activeUploads,
            },
            system: {
                uptime: process.uptime(),
                processMemoryUsed: mem.heapUsed,
                processMemoryTotal: mem.heapTotal,
                osMemoryTotal: os.totalmem(),
                osMemoryFree: os.freemem(),
                platform: os.platform(),
                arch: os.arch(),
                hostname: os.hostname(),
                nodeVersion: process.version,
                cpuModel: os.cpus()[0]?.model ?? "Unknown",
                cpuCount: os.cpus().length,
                cpuPct: latest?.cpuPct ?? 0,
            },
            server: {
                version: "0.1.2-beta",
                startedAt: SERVER_START_TIME,
                devices: {
                    total: totalDevices,
                    activeLastWeek: recentDevices,
                },
            },
            history,
        };
    });
}
