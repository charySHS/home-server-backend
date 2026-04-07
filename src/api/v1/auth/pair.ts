import { FastifyInstance } from "fastify";
import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import { db } from "../../../persistence/Database.js";
import { getServerSecret } from "../../../security/ServerIdentity.js";

const PAIRING_TTL_MS  = 5 * 60 * 1000;   // codes expire after 5 minutes
const POLL_MAX_AGE_MS = 6 * 60 * 1000;   // polling window (slightly longer)

function generateCode(): string {
    // 6-digit numeric code — returned as a string so leading zeros are preserved
    return String(Math.floor(100_000 + Math.random() * 900_000));
}

function pruneExpired() {
    db.prepare("DELETE FROM pairing_requests WHERE expires_at < ?").run(Date.now());
}

export async function registerPairRoutes(app: FastifyInstance) {

    // ── POST /api/v1/auth/pair ────────────────────────────────────────────────
    // iOS calls this to start a pairing session. Returns the code to display.
    // This is a public endpoint — no token required.
    app.post("/api/v1/auth/pair", async (req, reply) => {
        pruneExpired();

        const { username, deviceName } = req.body as {
            username:   string;
            deviceName: string;
        };

        if (!username?.trim() || !deviceName?.trim()) {
            return reply.code(400).send({ error: "USERNAME_AND_DEVICE_NAME_REQUIRED" });
        }

        const user = db
            .prepare("SELECT id FROM users WHERE username = ?")
            .get(username.trim()) as { id: string } | undefined;

        if (!user) {
            // Don't reveal whether the user exists — just say pending
            // (The code will simply never be approved if the username is wrong)
        }

        const id        = randomUUID();
        const code      = generateCode();
        const now       = Date.now();
        const expiresAt = now + PAIRING_TTL_MS;

        db.prepare(`
            INSERT INTO pairing_requests (id, user_id, device_name, code, status, created_at, expires_at)
            VALUES (?, ?, ?, ?, 'pending', ?, ?)
        `).run(id, user?.id ?? "", deviceName.trim(), code, now, expiresAt);

        return { pairingId: id, code };
    });

    // ── GET /api/v1/auth/pair/:id ─────────────────────────────────────────────
    // iOS polls this. On approval it receives a JWT and deviceId.
    app.get("/api/v1/auth/pair/:id", async (req, reply) => {
        const { id } = req.params as { id: string };

        const row = db
            .prepare("SELECT * FROM pairing_requests WHERE id = ?")
            .get(id) as {
                id: string; user_id: string; device_name: string;
                code: string; status: string; device_id: string | null;
                created_at: number; expires_at: number;
            } | undefined;

        if (!row) {
            return reply.code(404).send({ error: "PAIRING_NOT_FOUND" });
        }

        if (Date.now() > row.expires_at) {
            return reply.code(410).send({ error: "PAIRING_EXPIRED" });
        }

        if (row.status === "denied") {
            return { status: "denied" };
        }

        if (row.status === "approved" && row.device_id) {
            const expiresIn = (process.env.JWT_EXPIRATION || "7d") as any;
            const token = jwt.sign(
                { userId: row.user_id, deviceId: row.device_id },
                getServerSecret(),
                { expiresIn }
            );
            return { status: "approved", token, deviceId: row.device_id };
        }

        return { status: "pending" };
    });

    // ── GET /api/v1/admin/pairs ───────────────────────────────────────────────
    // Dashboard fetches the list of pending pairing requests.
    app.get("/api/v1/admin/pairs", async (_req, _reply) => {
        pruneExpired();

        const rows = db.prepare(`
            SELECT p.id, p.device_name, p.code, p.created_at, p.expires_at,
                   u.username
            FROM pairing_requests p
            LEFT JOIN users u ON u.id = p.user_id
            WHERE p.status = 'pending'
            ORDER BY p.created_at DESC
        `).all() as {
            id: string; device_name: string; code: string;
            created_at: number; expires_at: number; username: string | null;
        }[];

        return {
            pairs: rows.map(r => ({
                id:         r.id,
                deviceName: r.device_name,
                code:       r.code.slice(0, 3) + "-" + r.code.slice(3),  // "482-917"
                username:   r.username ?? "(unknown user)",
                createdAt:  r.created_at,
                expiresAt:  r.expires_at,
            })),
        };
    });

    // ── POST /api/v1/admin/pairs/:id/approve ──────────────────────────────────
    app.post("/api/v1/admin/pairs/:id/approve", async (req, reply) => {
        const { id } = req.params as { id: string };

        const row = db
            .prepare("SELECT * FROM pairing_requests WHERE id = ? AND status = 'pending'")
            .get(id) as {
                id: string; user_id: string; device_name: string;
                expires_at: number;
            } | undefined;

        if (!row) {
            return reply.code(404).send({ error: "PAIRING_NOT_FOUND" });
        }
        if (Date.now() > row.expires_at) {
            return reply.code(410).send({ error: "PAIRING_EXPIRED" });
        }
        if (!row.user_id) {
            return reply.code(422).send({ error: "UNKNOWN_USER" });
        }

        const deviceId = randomUUID();
        const now      = Date.now();

        db.prepare(`
            INSERT INTO devices (id, user_id, device_name, approved, created_at, last_seen_at)
            VALUES (?, ?, ?, 1, ?, ?)
        `).run(deviceId, row.user_id, row.device_name, now, now);

        db.prepare(`
            UPDATE pairing_requests SET status = 'approved', device_id = ? WHERE id = ?
        `).run(deviceId, id);

        return { ok: true };
    });

    // ── POST /api/v1/admin/pairs/:id/deny ─────────────────────────────────────
    app.post("/api/v1/admin/pairs/:id/deny", async (req, reply) => {
        const { id } = req.params as { id: string };

        const result = db
            .prepare("UPDATE pairing_requests SET status = 'denied' WHERE id = ? AND status = 'pending'")
            .run(id);

        if (result.changes === 0) {
            return reply.code(404).send({ error: "PAIRING_NOT_FOUND" });
        }

        return { ok: true };
    });
}
