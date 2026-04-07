import { promises as fs } from "fs";
import path from "path";
import { STORAGE_CONFIG } from "../config/storage.js";

type Level = "INFO" | "WARN" | "ERROR";

function todayFile(): string {
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return path.join(STORAGE_CONFIG.logsDir, `${date}.log`);
}

function formatLine(level: Level, event: string, meta: Record<string, unknown> = {}): string {
    const ts    = new Date().toISOString();
    const pairs = Object.entries(meta).map(([k, v]) => `${k}=${String(v)}`).join("  ");
    return `${ts} [${level.padEnd(5)}] ${event}${pairs ? "  " + pairs : ""}\n`;
}

async function write(level: Level, event: string, meta: Record<string, unknown> = {}) {
    try {
        await fs.appendFile(todayFile(), formatLine(level, event, meta), "utf-8");
    } catch {
        // Silently skip if the logs dir doesn't exist yet — never crash the request path
    }
}

export const logger = {
    info:  (event: string, meta?: Record<string, unknown>) => write("INFO",  event, meta),
    warn:  (event: string, meta?: Record<string, unknown>) => write("WARN",  event, meta),
    error: (event: string, meta?: Record<string, unknown>) => write("ERROR", event, meta),
};
