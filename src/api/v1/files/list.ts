import { FastifyInstance } from "fastify";
import { promises as fs } from "fs";
import path from "path";
import { STORAGE_CONFIG } from "../../../config/storage.js";

interface FileEntry {
    name:       string;   // path relative to the user's root (includes subdirs)
    size:       number;
    modifiedAt: number;
}

async function listRecursive(dir: string, base: string): Promise<FileEntry[]> {
    let entries: import("fs").Dirent[];
    try {
        entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
        return [];
    }

    const results: FileEntry[] = [];
    for (const e of entries) {
        const fullPath = path.join(dir, e.name);
        const relPath  = base ? `${base}/${e.name}` : e.name;
        if (e.isDirectory()) {
            results.push(...await listRecursive(fullPath, relPath));
        } else if (e.isFile()) {
            const stat = await fs.stat(fullPath);
            results.push({ name: relPath, size: stat.size, modifiedAt: stat.mtimeMs });
        }
    }
    return results;
}

export async function registerFileListRoute(app: FastifyInstance) {
    app.get("/api/v1/files", async (req, _reply) => {
        const { userId, role } = (req as any).user as { userId: string; role?: string };

        if (role === "dashboard") {
            // Admin sees all files under all user folders, prefixed with userId
            let userDirs: import("fs").Dirent[];
            try {
                userDirs = await fs.readdir(STORAGE_CONFIG.dataDir, { withFileTypes: true });
            } catch {
                return { files: [] };
            }

            const all: FileEntry[] = [];
            for (const d of userDirs) {
                if (!d.isDirectory()) continue;
                const sub = await listRecursive(
                    path.join(STORAGE_CONFIG.dataDir, d.name),
                    d.name
                );
                all.push(...sub);
            }
            return { files: all };
        }

        // Device: scoped to the user's own folder
        const userDir = path.join(STORAGE_CONFIG.dataDir, userId);
        const files   = await listRecursive(userDir, "");
        return { files };
    });
}
