import Fastify from "fastify";
import fastifyMultipart from "@fastify/multipart";

import { registerSetupRoute } from "./api/v1/auth/setup.js";
import { registerSetupPageRoute } from "./api/v1/auth/setup-page.js";
import { registerLoginRoute } from "./api/v1/auth/login.js";
import { registerRefreshRoute } from "./api/v1/auth/refresh.js";
import { registerPairRoutes } from "./api/v1/auth/pair.js";
import { registerInitUpload } from "./api/v1/uploads/init.js";
import { registerChunkUpload } from "./api/v1/uploads/chunk.js";
import { registerUploadStatus } from "./api/v1/uploads/status.js";
import { registerFinalizeUpload } from "./api/v1/uploads/finalize.js";
import { registerFileListRoute } from "./api/v1/files/list.js";
import { registerDownloadRoute } from "./api/v1/files/download.js";
import { registerFileDeleteRoute } from "./api/v1/files/delete.js";
import { registerFileMkdirRoute } from "./api/v1/files/mkdir.js";
import { registerAdminDevicesRoute } from "./api/v1/admin/devices.js";
import { registerAdminStatsRoute } from "./api/v1/admin/stats.js";
import { registerAdminSettingsRoute } from "./api/v1/admin/settings.js";
import { registerAdminAccountRoute } from "./api/v1/admin/account.js";
import { registerAdminPowerRoute } from "./api/v1/admin/power.js";
import "./stats/StatsCollector.js"; // start the collector on boot

import { initDatabase } from "./persistence/Database.js";
import { authMiddleware } from "./middleware/Auth.js";
import { UploadManager } from "./domain/upload/UploadManager.js";
import { ADMIN_DEBUG_LOGS } from "./config/flags.js";
import { STORAGE_CONFIG } from "./config/storage.js";
import { logger } from "./logger/Logger.js";
import fs from "fs";

[
    STORAGE_CONFIG.baseDir,
    STORAGE_CONFIG.dataDir,
    STORAGE_CONFIG.uploadsDir,
    STORAGE_CONFIG.logsDir,
].forEach(dir => {
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
});

// Routes that do not require a valid token.
const PUBLIC_ROUTES = new Set([
    "/api/v1/auth/setup",
    "/api/v1/auth/login",
    "/health",
    "/setup",
]);

// Pairing poll endpoints are public (iOS needs to reach them before it has a token).
// Admin pair management (/api/v1/admin/pairs/...) goes through normal auth.
function isPairingPublic(url: string): boolean {
    const path = url.split("?")[0];
    if (path === "/api/v1/auth/pair") return true;
    if (path.startsWith("/api/v1/auth/pair/")) return true;
    return false;
}

async function createApp() {
    const app = Fastify({ logger: true });

    // Allow POST requests with Content-Type: application/json but no body (e.g. /auth/refresh).
    app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
        if (!body || body === "") { done(null, {}); return; }
        try { done(null, JSON.parse(body as string)); }
        catch (err) { (err as any).statusCode = 400; done(err as Error); }
    });

    initDatabase();
    const uploadManager = new UploadManager(STORAGE_CONFIG.uploadsDir);

    app.register(fastifyMultipart, {
        limits: { fileSize: 1024 * 1024 * 1024 },
    });

    app.addHook("preHandler", async (req, reply) => {
        // Strip query string before checking — req.url includes it (e.g. /health?foo=1)
        const path = req.url.split("?")[0];
        if (PUBLIC_ROUTES.has(path)) return;
        if (isPairingPublic(req.url)) return;
        await authMiddleware(req, reply);
    });

    app.get("/health", async () => ({ status: "ok" }));

    // Auth
    await registerSetupPageRoute(app);
    await registerSetupRoute(app);
    await registerLoginRoute(app);
    await registerRefreshRoute(app);
    await registerPairRoutes(app);

    // Uploads
    await registerInitUpload(app, uploadManager);
    await registerChunkUpload(app, uploadManager);
    await registerUploadStatus(app, uploadManager);
    await registerFinalizeUpload(app, uploadManager);

    // Files
    await registerFileListRoute(app);
    registerDownloadRoute(app);
    await registerFileDeleteRoute(app);
    await registerFileMkdirRoute(app);

    // Admin
    await registerAdminDevicesRoute(app);
    await registerAdminStatsRoute(app);
    await registerAdminSettingsRoute(app);
    await registerAdminAccountRoute(app);
    await registerAdminPowerRoute(app);

    app.setErrorHandler((error, request, reply) => {
        const err = error as Error;
        logger.error("server_error", { method: request.method, url: request.url, message: err.message });
        if (ADMIN_DEBUG_LOGS()) {
            console.error("FASTIFY ERROR", err);
            return reply.status(500).send({
                error: err.message,
                stack: err.stack,
            });
        }
        return reply.status(500).send({ error: "INTERNAL_SERVER_ERROR" });
    });

    return app;
}

export default createApp;
