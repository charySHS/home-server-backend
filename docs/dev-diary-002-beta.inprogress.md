# Dev Diary 002 — Beta Identity & Security Foundation

**Version:** v0.1.2-beta  
**Status:** Structural Beta Complete  
**Focus:** Identity Boundaries & Security Hardening

---

## Overview

This milestone marks the transition from a LAN file transfer prototype to a structured, identity-bound storage system.

The core transfer engine remains intact and stable. This release introduces authentication, device binding, and foundational security architecture required for a real product.

The goal of this beta stage was structural integrity — not feature expansion.

---

## Beta Accomplishments

### 🔐 Authentication Layer
- Introduced SQLite-backed persistence (single-node, zero-config).
- Implemented local user accounts.
- Argon2 password hashing.
- Server-scoped JWT authentication.
- First-run admin setup endpoint (one-time use).
- All API routes now protected by auth middleware.

---

### 📱 Device Authorization
- Devices registered on login.
- JWT tied to user + device ID.
- Device approval validation enforced on protected routes.
- Prevented device explosion by reusing deviceId when provided.

---

### 🛡 Security Improvements
- Server identity secret generated on first run.
- JWTs signed with server-specific secret.
- No plaintext password storage.
- Setup endpoint permanently locked after admin creation.
- Download route secured against path traversal.

---

### 📦 Transfer Engine Stability (v0.1.1 → v0.1.2)

Retained previous reliability improvements:

- Per-upload AsyncMutex for safe parallel chunk writes.
- Atomic state persistence.
- Streaming final file assembly (no memory spike).
- Final file size integrity verification.
- Secure file resolution.
- Disk-backed resumable upload state.

Parallel chunk uploads are supported safely.

---

## Architectural Decisions

### Why SQLite?
- Self-hosted single-node system.
- Zero installation friction.
- Embedded and reliable.
- Aligns with “download → run → done” philosophy.

PostgreSQL may be used for a future hosted SaaS edition, but self-hosted will remain SQLite.

---

### Why No Email Authentication?
This is intentionally a self-hosted home storage system.

Email verification, recovery flows, and SaaS-style identity are deferred to preserve:
- Simplicity
- Offline capability
- Family-friendly setup

---

### Remote Access
Remote access remains:
- Disabled by default
- Planned to require explicit enablement
- Planned to require additional device approval

---

## Beta Definition

This beta is considered structurally complete because:

- Identity boundaries exist.
- Device binding exists.
- Upload integrity is hardened.
- Concurrency issues are resolved.
- Secrets are server-scoped.
- No unauthenticated access remains.

Future work will focus on:
- Per-user storage isolation
- Remote access guardrails
- Device approval flow
- Observability improvements

---

## Reflection

This milestone transitions the project from a functional prototype into a security-aware, identity-bound storage engine.

The system is now positioned as a real product foundation rather than an experimental transfer tool.