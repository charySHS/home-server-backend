import fs from "fs";
import path from "path";
import crypto from "crypto";

const BASE_DIR = process.env.BASE_DIR || ".";
const SECRET_PATH = path.join(BASE_DIR, "server.secret");

let cachedSecret: string | null = null;

export function getServerSecret(): string {
    if (cachedSecret) { return cachedSecret; }

    if (!fs.existsSync(SECRET_PATH)) {
        const secret = crypto.randomBytes(64).toString("hex");
        fs.writeFileSync(SECRET_PATH, secret, { mode: 0o600 });
    }

    cachedSecret = fs.readFileSync(SECRET_PATH, "utf-8").trim();
    return cachedSecret;
}