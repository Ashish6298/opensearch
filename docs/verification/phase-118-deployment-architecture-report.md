# Verification Report: Phase 118 — Deployment Architecture Decision

**Milestone:** MILESTONE 40 — DEPLOYMENT AND CONTAINER SUPPORT  
**Phase:** Phase 118 — Deployment architecture decision  
**Date:** 2026-10-31  
**Branch:** `ashish`  
**Status:** Complete & Fully Verified  
**Ready for Next Phase:** **YES** (Ready for Milestone 40, Phase 119 — Docker and Compose)  

---

## 1. Executive Summary

Phase 118 establishes the authoritative **Deployment Architecture Decision Record (ADR)** and platform capability evaluation for OpenSearch Web.

Supported deployment targets are formally classified into two support tiers:
- **Tier 1 (Primary & Fully Supported):** `local-first` (desktop/developer workstation) and `self-hosted` (Linux VPS / persistent container).
- **Tier 2 (Restricted / Advisory):** `serverless` (stateless/ephemeral cloud functions) and `cluster` (multi-instance behind an ingress reverse proxy).

The architecture explicitly enforces and discloses critical non-assumptions:
- **Serverless Filesystem Persistence:** Writes to `/tmp` in serverless environments do NOT persist between invocations or instances. Background crawlers cannot run due to execution timeouts.
- **Rate-Limiting Scope:** Process-memory token bucket rate limits do NOT provide global guarantees across dynamically scaled serverless instances or multi-instance clusters without ingress proxy enforcement.
- **Zero-Cost & Zero-Secret Invariants:** The entire system functions 100% out-of-the-box without paid domains, paid cloud infrastructure (no Redis, no cloud databases), and with zero mandatory secrets.

---

## 2. Platform Capability Matrix

| Platform Candidate | Durability | Background Crawling | Memory Bounds | Networking / Ingress | Rate Limit Scope | Support Tier |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Local Workstation** *(macOS/Linux/Win)* | **Durable** (Local NVMe/SSD) | **Supported** (Background workers) | Low footprint (~150MB) | Localhost (`127.0.0.1:3000`) | **Global Guarantee** | **Tier 1 (Fully Supported)** |
| **Self-Hosted VPS** *(Ubuntu/Debian/Alpine)* | **Durable** (Host filesystem, snapshots) | **Supported** (Systemd services) | Configurable heap | Direct or Reverse Proxy | **Global Guarantee** | **Tier 1 (Fully Supported)** |
| **Docker Container** *(Volume Mounted)* | **Durable** (Named volume at `/data`) | **Supported** (Container lifecycle) | Predictable container bounds | Bridge / Host port mapping | **Global Guarantee** | **Tier 1 (Fully Supported)** |
| **Serverless Functions** *(AWS Lambda/Vercel)* | **Ephemeral** (`/tmp` wiped on cold start) | **Unsupported** (Execution timeout) | Strict serverless memory | API Gateway / Edge Ingress | **Per-Instance Only** | **Tier 2 (Restricted: Read-Only)** |
| **Multi-Instance Cluster** | **Hybrid** (Shared volume / replicas) | **Supported** (Designated writer) | Horizontally scalable | Load Balancer | **Gateway Required** | **Tier 2 (Cluster with Ingress)** |

---

## 3. Implemented Components & Code Artifacts

1. **`packages/shared/src/deployment/types.ts`**:
   - `SupportedDeploymentMode` (`local-first`, `self-hosted`, `serverless`, `cluster`).
   - `PlatformCapabilities`, `StorageDurabilityMode`, `RateLimiterScope`, `DeploymentArchitectureEvaluation`.
2. **`packages/shared/src/deployment/evaluator.ts`**:
   - Runtime platform detection (`detectRuntimePlatform` detecting AWS Lambda, Vercel, Netlify, Google Cloud Run, Docker, and Workstations).
   - Mode resolution (`resolveDeploymentMode`), capability profiling (`getPlatformCapabilities`), and ephemeral directory checking (`isEphemeralStoragePath`).
   - Comprehensive deployment evaluation (`evaluateDeploymentArchitecture`).
3. **`apps/api/src/server.ts` & `apps/api/src/routes.ts`**:
   - Added `GET /api/v1/deployment` endpoint exposing real-time deployment architecture diagnostics.
   - Updated `GET /api/v1/status` with `deployment` capability block.
   - Enhanced startup configuration validation with structured deployment warnings.
4. **`docs/deployment-architecture.md`**:
   - Authoritative Architectural Decision Record (ADR) detailing platform evaluations, invariants, and storage persistence recommendations.
5. **`README.md`**:
   - Added dedicated "Deployment Architecture & Hosting Compatibility" section and updated milestone tracking.

---

## 4. Test Verification Results

### Dedicated Test Suite
**File:** `apps/api/tests/deployment-architecture.test.ts`  
**Result:** **23 / 23 tests passed** (100%)  
- Mode resolution defaults to `local-first` in dev and `self-hosted` in prod.
- Detects AWS Lambda, Vercel, Netlify, Google Cloud Run, and Docker.
- Ephemeral path detection across Linux, macOS, and Windows.
- Evaluates local storage as durable and flags serverless `/tmp` as ephemeral.
- Explicit warnings on serverless and ephemeral production storage.
- Rate limit disclosures (instance-local vs file-shared vs gateway-delegated).
- Zero mandatory secrets invariant: Server starts cleanly with empty environment `{}`.
- Zero paid dependencies invariant: All modes report `$0.00` paid dependencies.
- `GET /api/v1/deployment` returns truthful evaluation without leaking sensitive internals.
- `GET /api/v1/status` includes deployment capability block.
- Out-of-the-box local-first functional path with offline demo fallback.

### Monorepo Full Regression Run
- **Test Files Passed:** 112 / 112 (100%)
- **Tests Passed:** 1,290 / 1,290 (100%)
- **Regressions:** 0

---

## 5. Conclusion & Readiness

All requirements and acceptance criteria for **Milestone 40, Phase 118** are complete:
- A fully supported local-first deployment path remains available with zero dependencies.
- Public deployment claims match actual platform capabilities.
- Persistence limitations on serverless and ephemeral platforms are explicit.

**Ready for Next Phase: YES**  
Codebase is ready to proceed to **Milestone 40, Phase 119 — Docker and Compose**.
