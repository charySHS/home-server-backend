import { FastifyInstance } from "fastify";
import { db } from "../../../persistence/Database.js";
import { randomUUID } from "crypto";
import argon2 from "argon2";

export async function registerSetupRoute(app: FastifyInstance) {
    app.post("/api/v1/auth/setup", async (req, reply) => {
        const existingAdmin = db
            .prepare("SELECT id FROM users WHERE is_admin = 1")
            .get();

        if (existingAdmin) {
            return reply.code(403).send({ error: "SETUP_ALREADY_COMPLETED" });
        }

        const { username, password } = req.body as {
            username: string;
            password: string;
        };

        if (!username || !password) {
            return reply.code(400).send({ error: "INVALID_INPUT" });
        }

        const hash = await argon2.hash(password);

        db.prepare(`
      INSERT INTO users (id, username, password_hash, created_at, is_admin)
      VALUES (?, ?, ?, ?, 1)
    `).run(randomUUID(), username, hash, Date.now());

        return { status: "ADMIN_CREATED" };
    });
}