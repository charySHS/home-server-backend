import { FastifyInstance } from "fastify";
import { db } from "../../../persistence/Database.js";
import argon2 from "argon2";

export async function registerAdminAccountRoute(app: FastifyInstance) {
    app.patch("/api/v1/admin/account", async (req, reply) => {
        const { currentPassword, username, newPassword } = req.body as {
            currentPassword: string;
            username?:       string;
            newPassword?:    string;
        };

        if (!currentPassword) {
            return reply.code(400).send({ error: "CURRENT_PASSWORD_REQUIRED" });
        }

        const userId = (req as any).user.userId;

        const user = db
            .prepare("SELECT * FROM users WHERE id = ?")
            .get(userId) as { id: string; username: string; password_hash: string } | undefined;

        if (!user) return reply.code(404).send({ error: "USER_NOT_FOUND" });

        const valid = await argon2.verify(user.password_hash, currentPassword);
        if (!valid) return reply.code(401).send({ error: "INVALID_PASSWORD" });

        if (username !== undefined) {
            if (!username.trim()) return reply.code(400).send({ error: "USERNAME_EMPTY" });

            const conflict = db
                .prepare("SELECT id FROM users WHERE username = ? AND id != ?")
                .get(username.trim(), userId);
            if (conflict) return reply.code(409).send({ error: "USERNAME_TAKEN" });

            db.prepare("UPDATE users SET username = ? WHERE id = ?")
                .run(username.trim(), userId);
        }

        if (newPassword !== undefined) {
            if (newPassword.length < 6) return reply.code(400).send({ error: "PASSWORD_TOO_SHORT" });
            const hash = await argon2.hash(newPassword);
            db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, userId);
        }

        return { ok: true };
    });
}
