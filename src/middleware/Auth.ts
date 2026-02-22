import { FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import { getServerSecret } from "../security/ServerIdentity.js";
import { db } from "../persistence/Database.js";

export async function authMiddleware(
    req: FastifyRequest,
    reply: FastifyReply
) {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
        reply.code(401).send({ error: "UNAUTHORIZED" });
        return reply;
    }

    try {
        const token = header.split(" ")[1];
        const payload = jwt.verify(token, getServerSecret()) as any;

        const device = db
            .prepare("SELECT * FROM devices WHERE id = ? AND approved = 1")
            .get(payload.deviceId);

        if (!device) {
            reply.code(403).send({ error: "DEVICE_NOT_APPROVED" });
            return reply;
        }

        (req as any).user = payload;
    } catch (err) {
        console.error("JWT ERROR:", err);
        reply.code(401).send({ error: "INVALID_TOKEN" });
        return reply;
    }
}