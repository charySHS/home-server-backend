import { FastifyInstance } from "fastify";
import { db } from "../../../persistence/Database.js";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { getServerSecret } from "../../../security/ServerIdentity.js";
import { randomUUID } from "crypto";

export async function registerLoginRoute(app: FastifyInstance) {
    app.post("/api/v1/auth/login", async (req, reply) => {
        const { username, password, deviceId, deviceName, isDashboard } = req.body as {
            username: string;
            password: string;
            deviceId?: string;
            deviceName?: string;
            isDashboard?: boolean;
        };

        const user = db
            .prepare("SELECT * FROM users WHERE username = ?")
            .get(username) as { id: string; password_hash: string } | undefined;

        if (!user) {
            return reply.code(401).send({ error: "INVALID_CREDENTIALS" });
        }

        const valid = await argon2.verify(user.password_hash, password);

        if (!valid) {
            return reply.code(401).send({ error: "INVALID_CREDENTIALS" });
        }

        const expiresIn = (process.env.JWT_EXPIRATION || "7d") as any;

        // Dashboard is a monitor/viewport — it doesn't register as a device.
        if (isDashboard) {
            const token = jwt.sign(
                { userId: user.id, role: "dashboard" },
                getServerSecret(),
                { expiresIn }
            );
            return { token };
        }

        let finalDeviceId = deviceId;

        if (deviceId) {
            const existingDevice = db.prepare(`
      SELECT * FROM devices 
      WHERE id = ? AND user_id = ?
    `).get(deviceId, user.id);

            if (existingDevice) {
                db.prepare(`
        UPDATE devices 
        SET last_seen_at = ?
        WHERE id = ?
      `).run(Date.now(), deviceId);
            } else {
                finalDeviceId = undefined; // force new device creation
            }
        }

        if (!finalDeviceId) {
            finalDeviceId = randomUUID();

            db.prepare(`
      INSERT INTO devices (id, user_id, device_name, created_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
                finalDeviceId,
                user.id,
                deviceName || "Unknown Device",
                Date.now(),
                Date.now()
            );
        }

        const token = jwt.sign(
            { userId: user.id, deviceId: finalDeviceId },
            getServerSecret(),
            { expiresIn }
        );

        return { token, deviceId: finalDeviceId };
    });
}