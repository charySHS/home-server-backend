import { FastifyInstance } from "fastify";
import { db } from "../../../persistence/Database.js";

interface DeviceRow {
    id: string;
    device_name: string;
    approved: number;
    created_at: number;
    last_seen_at: number;
    username: string;
}

export async function registerAdminDevicesRoute(app: FastifyInstance) {
    app.get("/api/v1/admin/devices", async (_req, _reply) => {
        const devices = db.prepare(`
            SELECT d.id, d.device_name, d.approved, d.created_at, d.last_seen_at,
                   u.username
            FROM devices d
            JOIN users u ON u.id = d.user_id
            ORDER BY d.last_seen_at DESC
        `).all() as DeviceRow[];

        return {
            devices: devices.map(d => ({
                id: d.id,
                deviceName: d.device_name,
                approved: d.approved === 1,
                createdAt: d.created_at,
                lastSeenAt: d.last_seen_at,
                username: d.username,
            })),
        };
    });

    app.patch("/api/v1/admin/devices/:id", async (req, reply) => {
        const { id } = req.params as { id: string };
        const { approved } = req.body as { approved: boolean };

        if (typeof approved !== "boolean") {
            return reply.code(400).send({ error: "APPROVED_REQUIRED" });
        }

        const result = db
            .prepare("UPDATE devices SET approved = ? WHERE id = ?")
            .run(approved ? 1 : 0, id);

        if (result.changes === 0) {
            return reply.code(404).send({ error: "DEVICE_NOT_FOUND" });
        }

        return { ok: true };
    });
}
