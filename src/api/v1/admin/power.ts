import { FastifyInstance } from "fastify";
import { spawn } from "child_process";

export async function registerAdminPowerRoute(app: FastifyInstance) {
    app.post("/api/v1/admin/power", async (req, reply) => {
        const user = (req as any).user;
        if (user.role !== "dashboard") {
            return reply.code(403).send({ error: "FORBIDDEN" });
        }

        const { action } = req.body as { action: "shutdown" | "restart" };
        if (action !== "shutdown" && action !== "restart") {
            return reply.code(400).send({ error: "INVALID_ACTION" });
        }

        // Schedule the exit after the response has had time to flush
        setTimeout(() => {
            if (action === "restart") {
                try {
                    spawn(process.execPath, process.argv.slice(1), {
                        detached: true,
                        stdio:    "ignore",
                        cwd:      process.cwd(),
                        env:      process.env as NodeJS.ProcessEnv,
                    }).unref();
                } catch { /* fall through — process exits regardless */ }
            }
            process.exit(0);
        }, 400);

        return { ok: true, action };
    });
}
