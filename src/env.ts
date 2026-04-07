/**
 * Loads .env from the project root into process.env before any other module reads it.
 * Must be the first import in index.ts.
 * Only sets keys that are not already present — environment always wins over .env.
 */

import { readFileSync } from "fs";
import path from "path";

try {
    const envPath = path.resolve(process.cwd(), ".env");
    for (const line of readFileSync(envPath, "utf-8").split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim();
        if (!(key in process.env)) process.env[key] = val;
    }
} catch {
    // .env is optional — environment variables set externally take precedence
}
