import Fastify from "fastify";
import fastifyMultipart from "@fastify/multipart";

import { registerInitUpload } from "./api/v1/uploads/init.js";
import { registerLoginRoute } from "./api/v1/auth/login.js";
import { registerChunkUpload } from "./api/v1/uploads/chunk.js";
import { registerUploadStatus } from "./api/v1/uploads/status.js";
import { registerFinalizeUpload } from "./api/v1/uploads/finalize.js";
import { registerDownloadRoute } from "./api/v1/files/download.js";
import { registerSetupRoute } from "./api/v1/auth/setup.js";

import { initDatabase } from "./persistence/Database.js";

import { authMiddleware } from "./middleware/Auth.js";
import { UploadManager } from "./domain/upload/UploadManager.js";
import {ADMIN_DEBUG_LOGS} from "./config/flags.js";
import fs from "fs";
import { STORAGE_CONFIG } from "./config/storage.js";

[
    STORAGE_CONFIG.baseDir,
    STORAGE_CONFIG.dataDir,
    STORAGE_CONFIG.uploadsDir,
].forEach(dir => {
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }) }
});

async function createApp() {
    const app = Fastify({ logger: true });

    initDatabase();
    const uploadManager = new UploadManager(STORAGE_CONFIG.uploadsDir);

    app.register(fastifyMultipart, {
        limits: {
            fileSize: 1024 * 1024 * 1024,
        },
    });

    app.addHook("preHandler", async (req, reply) => {
        if (
            req.url.startsWith("/api/v1/auth") ||
            req.url === "/health"
        ) {
            return;
        }

        await authMiddleware(req, reply);
    });

    app.get("/health", async() => { return { status: "ok" }; });

    await registerSetupRoute(app);
    await registerLoginRoute(app);
    await registerInitUpload(app, uploadManager);
    await registerChunkUpload(app, uploadManager);
    await registerUploadStatus(app, uploadManager);
    await registerFinalizeUpload(app, uploadManager);
    registerDownloadRoute(app);

    app.setErrorHandler((error, request, reply) => {
        if (ADMIN_DEBUG_LOGS) {
            console.error("FASTIFY ERROR");
            console.error(error);
            reply.status(500).send({ // @ts-ignore
                error: error.message, // @ts-ignore
                stack: error.stack,
            });
        }
    });

    return app;
}

export default createApp