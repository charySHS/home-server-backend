import Fastify from "fastify";
import fastifyMultipart from "@fastify/multipart";

import { registerInitUpload } from "./api/v1/uploads/init.js";
import { registerChunkUpload } from "./api/v1/uploads/chunk.js";
import { registerUploadStatus } from "./api/v1/uploads/status.js";
import { registerFinalizeUpload } from "./api/v1/uploads/finalize.js";
import { registerDownloadRoute } from "./api/v1/files/download.js";

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
    const uploadManager = new UploadManager(STORAGE_CONFIG.uploadsDir);

    app.register(fastifyMultipart, {
        limits: {
            fileSize: 1024 * 1024 * 1024,
        },
    });

    app.get("/health", async() => { return { status: "ok" }; });

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