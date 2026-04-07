import { FastifyInstance } from "fastify";
import fs from "fs";
import path from "path";

const ENV_PATH = path.resolve(process.cwd(), ".env");

function parseEnv(): Record<string, string> {
    try {
        const out: Record<string, string> = {};
        for (const line of fs.readFileSync(ENV_PATH, "utf8").split("\n")) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) continue;
            const idx = trimmed.indexOf("=");
            if (idx === -1) continue;
            out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
        }
        return out;
    } catch {
        return {};
    }
}

function writeEnv(values: Record<string, string>): void {
    const content = Object.entries(values)
        .map(([k, v]) => `${k}=${v}`)
        .join("\n") + "\n";
    fs.writeFileSync(ENV_PATH, content, "utf8");
}

export async function registerAdminSettingsRoute(app: FastifyInstance) {
    app.get("/api/v1/admin/settings", async (_req, _reply) => {
        const envFile = parseEnv();
        return {
            storageDir:           process.env.BASE_DIR ?? "D:\\server-storage",
            storageDirConfigured: envFile.BASE_DIR ?? process.env.BASE_DIR ?? "D:\\server-storage",
            jwtExpiration:        envFile.JWT_EXPIRATION ?? process.env.JWT_EXPIRATION ?? "7d",
            debugLogs:            (envFile.ADMIN_DEBUG_LOGS ?? process.env.ADMIN_DEBUG_LOGS ?? "false") === "true",
        };
    });

    app.patch("/api/v1/admin/settings", async (req, reply) => {
        const { storageDir, jwtExpiration, debugLogs } = req.body as {
            storageDir?:    string;
            jwtExpiration?: string;
            debugLogs?:     boolean;
        };

        const envFile = parseEnv();
        let restartRequired = false;

        if (storageDir !== undefined) {
            if (!storageDir.trim()) return reply.code(400).send({ error: "STORAGE_DIR_EMPTY" });
            envFile.BASE_DIR = storageDir.trim();
            restartRequired = true;
        }

        if (jwtExpiration !== undefined) {
            if (!jwtExpiration.trim()) return reply.code(400).send({ error: "JWT_EXPIRATION_EMPTY" });
            envFile.JWT_EXPIRATION = jwtExpiration.trim();
            restartRequired = true;
        }

        if (debugLogs !== undefined) {
            envFile.ADMIN_DEBUG_LOGS = debugLogs ? "true" : "false";
            // Apply immediately — no restart needed for this flag
            process.env.ADMIN_DEBUG_LOGS = envFile.ADMIN_DEBUG_LOGS;
        }

        writeEnv(envFile);
        return { ok: true, restartRequired };
    });
}
