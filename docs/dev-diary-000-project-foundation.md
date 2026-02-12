📓 Dev Diary #000 — Project Foundation

Author: Zach
Status: Foundational Document
Phase: Pre-Alpha
Purpose: Define long-term vision and architectural direction

🌱 Origin

This project began with a simple question:

Why is transferring large files between devices still unreliable, platform-locked, or cloud-dependent?

The goal was not to build another cloud storage service.

The goal was to build:

A private, self-hosted, reliable file transfer system that users fully own.

This document defines the original intent and long-term design philosophy of the system.

🧭 Core Vision

A cross-platform, self-hosted personal cloud system that enables:

Fast large-file transfers

Resume support

Cross-device compatibility

User ownership of storage

LAN-first operation

Commercial-grade reliability

The system must be:

Deterministic

Transparent

Versioned

Monetizable without compromising ownership

🧨 The Problem

Existing solutions commonly suffer from:

Poor large file handling

No true resumable uploads

Platform lock-in (Apple-only, Google-only)

Forced subscription models

Mandatory cloud storage

Weak or confusing mobile UX

Lack of user ownership

Users want:

Speed

Reliability

Cross-platform support

Control over their data

Native applications

This project aims to solve those problems without adding complexity.

🏗 Product Philosophy

Guiding principles:

User owns the storage

LAN-first, internet-optional

Native apps only

Reliability over features

Transparent behavior

Commercial-grade engineering

The system is built to scale from internal alpha to public beta to monetized product without architectural rewrites.

👥 Target Users

Primary audiences:

Developers

Creators (video/photo)

Students

Power users

Families with shared storage

Common needs:

Large file transfers

Batch uploads

Resume on failure

Background transfers

Simple pairing

Trustworthy behavior

🧱 Platform Overview
Clients

iOS (SwiftUI)

Android (Kotlin)

Desktop/Web dashboard (future)

Server

User-hosted

Runs on PC / NAS / Mac

Exposes HTTPS API

Manages storage and transfer state

🧠 Architectural Model
Mobile Clients
↓
HTTPS + Token Auth
↓
User-Hosted Server
↓
Local Storage (User-Owned)

Key decisions:

Clients are stateless

Server is authoritative

Disk is the source of truth

Protocol is stable and versioned

API is namespaced (/api/v1)

These principles are foundational and non-negotiable.

🔄 Transfer Protocol (High-Level)

The protocol is:

Chunk-based

Resumable

Idempotent

Streaming

Backward compatible

Upload lifecycle:

Client initializes upload session

File split into fixed-size chunks

Chunks uploaded independently

Resume possible at any time

Finalization occurs atomically

Versioning is enforced via /api/v1.

⚙️ Scheduling Philosophy (Future-Oriented)

Parallel scheduling goals:

Maximize throughput

Avoid saturating networks

Remain deterministic

Support bounded retries

Distribute load across files

Server guarantees:

Idempotent chunk writes

Atomic final file assembly

No partial file exposure

📂 Storage Layout Concept

Temporary uploads and final files are separated.

/uploads/
└─ uploadId/
├─ meta.json
├─ chunks/
└─ state.lock (conceptual)
/data/
└─ final files

Final files are moved atomically into storage directories.

This ensures no corrupted files are ever exposed.

🔐 Authentication & Pairing (Planned Model)

Authentication:

Token-based

Per-device tokens

Secure device storage

Pairing (Beta):

QR code pairing

Local trust establishment

No accounts required for LAN mode

🛡 Security Model

Baseline:

HTTPS everywhere

No plaintext credentials

Server-side validation

Token revocation

Future:

End-to-end encryption

Folder-level permissions

Multi-user support

Security must evolve without rewriting core architecture.

📈 Performance Expectations

Performance bottlenecks are expected to be:

Network bandwidth

Router quality

Disk write speed

The protocol must never be the bottleneck.

Expected behavior:

Stable long-running transfers

Predictable progress

Resume after interruption

Background-safe operation

💰 Monetization Direction

Model:

Freemium + One-Time Pro Upgrade

Free Tier:

LAN transfers

Limited background usage

Pro Tier:

Background transfers

Remote access

Encryption

Multiple servers

Advanced controls

Monetization must remain App Store compliant and optional.

🚫 Explicit Non-Goals

Not in scope (v1):

Cloud-hosted storage

Team collaboration

Social features

AI functionality

Media streaming

Public share links

The product is focused and intentional.

⚠️ Risks & Constraints

iOS background execution limits

Network variability

Disk failure scenarios

App Store policy compliance

Mitigation strategies are designed into the protocol and scheduling model.

🛣 Long-Term Roadmap
Phase 1 — Alpha

Core protocol

Single-file uploads

Resume support

Phase 2 — Beta

Parallel scheduling

Background transfers

Monetization

UI polish

Phase 3 — v2+

Sync

Encryption

Multi-user support

Each phase builds on the previous without structural rewrites.

🧠 Open Questions

Final product name

Branding direction

Installer UX

Update mechanism

Legal / privacy wording

These remain intentionally open.

📌 Status

This document remains:

Foundational

Versioned

Authoritative

Living

It defines the original design philosophy that guides all implementation decisions.