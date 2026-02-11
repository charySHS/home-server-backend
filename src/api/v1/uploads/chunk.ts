import { FastifyInstance } from "fastify";
import { UploadManager } from "../../../domain/upload/UploadManager.js";
import {ADMIN_DEBUG_LOGS} from "../../../config/flags.js";

export async function registerChunkUpload(
    app: FastifyInstance,
    uploadManager: UploadManager
) {
    app.post("/api/v1/uploads/chunk", async (req) => {
        if (ADMIN_DEBUG_LOGS) console.log("-> /uploads/chunk hit");

        const uploadId = req.headers["x-upload-id"] as string;
        const chunkIndex = Number(req.headers["x-chunk-index"]);

        if (ADMIN_DEBUG_LOGS) console.log("headers:", { uploadId, chunkIndex });

        if (!uploadId || Number.isNaN(chunkIndex)) { throw new Error("MISSING_HEADERS"); }

        if (ADMIN_DEBUG_LOGS) console.log("about to iterate parts");

        for await(const part of req.parts()) {
            if (ADMIN_DEBUG_LOGS) {
                console.log("part:", {
                    type: part.type,
                    fieldname: part.fieldname,
                    filename: (part as any).filename,
                });
            }

            if (part.type === "file") {
                if (ADMIN_DEBUG_LOGS) console.log("writing chunk", chunkIndex);

                await uploadManager.writeChunk(
                    uploadId,
                    chunkIndex,
                    part.file
                );

                if (ADMIN_DEBUG_LOGS) console.log("chunk written");

                return { ok: true};
            }
        }

        throw new Error("NO_FILE_PART");
    });
}