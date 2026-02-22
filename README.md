🏠 Home Server Backend

Self-hosted, LAN-first file transfer and personal storage server.

Designed for reliability, privacy, and zero cloud dependency.

Current Version

v0.1.2-beta

This release introduces identity boundaries and device-based authentication on top of a hardened resumable transfer engine.

🚀 Core Features (Beta)
📦 Transfer Engine

Chunked uploads

Resume support (server authoritative state)

Disk-backed persistence

Atomic chunk writes

Parallel chunk upload support

Streaming-based file assembly

Final file size integrity verification

Atomic finalize step

HTTP Range support for downloads

Secure path resolution (path traversal protection)

🔐 Authentication & Identity

SQLite-backed persistence (zero-config)

First-run admin setup endpoint

Local user accounts

Argon2 password hashing

Server-scoped JWT authentication

Device registration on login

Device-bound tokens

All API routes protected by auth middleware

Setup endpoint locked after admin creation

🛡 Security Model

No plaintext passwords stored

Server secret generated on first run

JWT signed per-server

Device validation required for all protected routes

LAN-first architecture

Remote access planned but disabled by default

🗂 Storage Layout
<BASE_DIR>/
├── data/
├── uploads/
├── server.db
└── server.secret

Upload state stored per upload session

Final files assembled atomically

Persistent server identity

📡 API Overview
Auth
POST /api/v1/auth/setup
POST /api/v1/auth/login
Uploads
POST /api/v1/uploads/init
POST /api/v1/uploads/chunk
POST /api/v1/uploads/finalize
GET  /api/v1/uploads/status/:uploadId
Files
GET /api/v1/files/:fileName
Health
GET /health

All non-auth routes require a valid Bearer token.

🧠 Architectural Philosophy

Self-hosted first.

Zero external service dependency.

Reliability over feature count.

Identity boundaries enforced early.

Simplicity over premature SaaS infrastructure.

Remote access optional and intentionally guarded.

🛣 Next Backend Goals
1️⃣ Per-User Storage Isolation

Data and upload directories scoped per user

Filesystem-level separation

2️⃣ Remote Access Guardrails

Disabled by default

Explicit enable toggle

Device approval required for remote connections

3️⃣ Device Management

Device listing endpoint

Device revocation endpoint

Last-seen tracking improvements

4️⃣ Observability

Structured audit logging

Upload lifecycle events

Login attempt tracking

5️⃣ Hardening

Rate limiting login attempts

Token refresh strategy

Improved error taxonomy

❌ Explicit Non-Goals (For Now)

Email-based authentication

Cloud-hosted accounts

Centralized SaaS infrastructure

Multi-node clustering

Team collaboration features

📘 Status

This backend is now considered structurally complete for beta testing:

Concurrency-safe transfers

Integrity-verified finalization

Identity boundaries enforced

Device-bound authentication active

Future work will focus on polish, isolation, and optional remote security controls.