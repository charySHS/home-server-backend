import fs from "fs";

// ------------------------------------------------------------
// -- Config
// ------------------------------------------------------------

const BASE_URL = "http://localhost:3000";
const FILE_ID = "node-test-file";
const FILE_NAME = "node-test.bin";
const FILE_SIZE = 300;
const CHUNK_SIZE = 100;
const TOTAL_CHUNKS = 3;

// ------------------------------------------------------------

// Helper: Create fake chunk data
function makeChunk(index) { return new Uint8Array(CHUNK_SIZE).fill(index); }

async function initUpload() {
    const res = await fetch(`${BASE_URL}/api/v1/uploads/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json"},
        body: JSON.stringify({
            fileId: FILE_ID,
            fileName: FILE_NAME,
            fileSize: FILE_SIZE,
            chunkSize: CHUNK_SIZE,
            totalChunks: TOTAL_CHUNKS,
        }),
    });

    if (!res.ok) { throw new Error(`Init failed: ${res.status}`); }

    return res.json();
}

async function uploadChunk(uploadId, chunkIndex, buffer) {
    const form = new FormData();

    form.append("file", new Blob([buffer]), `chunk-${chunkIndex}.bin`);

    const res = await fetch(`${BASE_URL}/api/v1/uploads/chunk`, {
        method: "POST",
        headers: {
            "x-upload-id": uploadId,
            "x-chunk-index": String(chunkIndex),
        },
        body: form,
    });

    if (!res.ok) { throw new Error(`Chunk ${chunkIndex} failed: ${res.status}`); }
}

async function finalize(uploadId){
    const res = await fetch(`${BASE_URL}/api/v1/uploads/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId }),
    });

    if (!res.ok) { throw new Error(`Finalize failed: ${res.status}`); }
}

async function run() {
    console.log("▶ init upload");
    const init = await initUpload();

    console.log("uploadId", init.uploadId);
    console.log("missingChunks:", init.missingChunks);

    for (const chunkIndex of init.missingChunks) {
        console.log(`▶ uploading chunk ${chunkIndex}`);
        await uploadChunk(
            init.uploadId,
            chunkIndex,
            makeChunk(chunkIndex)
        );
    }

    console.log("▶ finalize upload");
    await finalize(init.uploadId);

    console.log("✅ upload complete");
}

run().catch((err) => {
    console.error("❌ error:", err);
    process.exit(1);
});