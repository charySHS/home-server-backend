import { FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";
import { getServerSecret } from "../../../security/ServerIdentity.js";
import { db } from "../../../persistence/Database.js";

export async function registerRefreshRoute(app: FastifyInstance) {
    app.post("/api/v1/auth/refresh", async (req, reply) => {
        // authMiddleware has already validated the token by this point.
        const { userId, username, deviceId, role } = (req as any).user;

        const expiresIn = (process.env.JWT_EXPIRATION || "7d") as any;

        if (role === "dashboard") {
            const token = jwt.sign(
                { userId, username, role: "dashboard" },
                getServerSecret(),
                { expiresIn }
            );
            return { token };
        }

        db.prepare("UPDATE devices SET last_seen_at = ? WHERE id = ?")
            .run(Date.now(), deviceId);

        const token = jwt.sign(
            { userId, username, deviceId },
            getServerSecret(),
            { expiresIn }
        );

        return { token };
    });
}
