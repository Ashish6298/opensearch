# Phase 111 — Rate Limiting & Hosting Compatibility Verification Report

**Milestone:** MILESTONE 38 — SECURITY AND OPERATIONAL RESILIENCE  
**Phase:** Phase 111 — Rate limiting and hosting compatibility  
**Status:** Completed & Fully Verified  
**Branch:** `ashish`  
**Ready for Next Phase:** **YES** (Ready for Milestone 38 — Phase 112: Health, status, and graceful shutdown)

---

## 1. Executive Summary

Phase 111 establishes the hosting compatibility and multi-tier rate limiting architecture of OpenSearch. It formalizes deployment models (`standalone`, `cluster`, `serverless`), validates storage durability invariants to prevent index loss on ephemeral file systems, introduces pluggable in-memory and file-backed rate-limit persistence (enabling restart survival and multi-worker sharing without Redis), implements route-specific and provider-specific quotas, weights expensive queries against resource exhaustion, and secures client IP resolution behind reverse proxies to prevent header spoofing.

---

## 2. Key Implementations

### 1. Storage Durability & Ephemeral Filesystem Auditing ([`packages/storage/src/persistence-audit.ts`](file:///D:/OPENSEARCH/packages/storage/src/persistence-audit.ts))
- **`isEphemeralPath(path)`**: Accurately detects whether a storage directory resides in `/tmp`, `/var/tmp`, `/dev/shm`, Windows `%TEMP%`, or transient container scratch spaces.
- **`auditStoragePersistence(dir, deploymentModel, isProduction)`**: Automatically audits storage durability on boot; logs actionable volume mount recommendations and critical warnings when production instances point to ephemeral disks.
- **`verifyStorageWritable(dir)`**: Verifies filesystem write, read, and delete permissions with a safe probe test.

### 2. Pluggable Rate Limit Storage Backends ([`apps/api/src/rate-limiter.ts`](file:///D:/OPENSEARCH/apps/api/src/rate-limiter.ts))
- **`MemoryRateLimitStore`**: High-performance in-memory Map for standalone single-instance deployments and unit tests.
- **`FileBackedRateLimitStore`**: Atomic file-persisted store surviving process restarts and synchronizing token buckets across multiple local worker processes without external paid infrastructure (Redis, etc.).
- **Multi-Instance Guarantees**: Formally documents that in-memory limits apply per-instance, explaining how to coordinate via shared volumes or ingress reverse proxies (Nginx, Caddy, Cloudflare).

### 3. Route-Specific Rate Tiers & Complexity Protection ([`apps/api/src/middlewares.ts`](file:///D:/OPENSEARCH/apps/api/src/middlewares.ts))
- **Route Tiers**: Search and MCP routes (60 req/min), instant answers (30 req/min), crawl and review management (10–20 req/min), and lightweight metadata (180–300 req/min).
- **Operation Complexity Weighting ([`calculateOperationCost`](file:///D:/OPENSEARCH/apps/api/src/middlewares.ts#L75-L108))**:
  - Assigns base cost of 1 to standard queries.
  - Assigns elevated cost of 2 to wildcard or pattern-intensive search queries (`*`, `?`, `~`).
  - Assigns elevated cost of 2 to queries requesting oversized page sizes (`limit > 50`).
  - Assigns cost of 2 to administrative and review imports.
  - Quotas exhaust proportionally faster for expensive queries, preventing denial of service.

### 4. Search Provider Rate Limiting ([`packages/ranking/src/providers/provider-rate-limiter.ts`](file:///D:/OPENSEARCH/packages/ranking/src/providers/provider-rate-limiter.ts))
- **`ProviderRateLimiter`**: Proactively meters outbound search requests per upstream provider (e.g. Wikimedia).
- Prevents burning upstream API quotas and eliminates HTTP 429 errors from upstream services.

### 5. Trusted Proxy Settings & IP Spoofing Prevention ([`apps/api/src/router.ts`](file:///D:/OPENSEARCH/apps/api/src/router.ts))
- **`resolveClientIp(req, trustProxy)`**:
  - When `trustProxy` is `false` (default): strictly uses `req.socket.remoteAddress`, ignoring any forged `X-Forwarded-For` header.
  - When `trustProxy` is `true` or an IP array: validates IP syntax with `net.isIP()` and extracts the verified client IP.

### 6. Hosting & Deployment Documentation ([`docs/hosting-and-deployment.md`](file:///D:/OPENSEARCH/docs/hosting-and-deployment.md))
- Authored a comprehensive deployment and hosting guide detailing standalone, cluster, and serverless environments, persistent Docker volume mounting, reverse proxy setups, and the zero paid infrastructure guarantee.

---

## 3. Test Verification Results

```
Test Files  106 passed (106)
Tests       1209 passed (1209)
Duration    16.28s
Pass Rate   100.0%
```

### Dedicated Suite ([`apps/api/tests/rate-limiting-and-hosting.test.ts`](file:///D:/OPENSEARCH/apps/api/tests/rate-limiting-and-hosting.test.ts) — 22 tests passed):
- Ephemeral filesystem detection (`/tmp`, `/dev/shm`, etc.)
- Persistent path identification and probe write/read validation
- Storage persistence audit and production critical warnings
- `MemoryRateLimitStore` bucket tracking and window expiration
- `FileBackedRateLimitStore` atomic disk persistence and restart survival
- Route-specific rate limits and tier isolation
- Operation complexity cost calculation (wildcards, large limits, review endpoints)
- Accelerated quota exhaustion for high-cost operations
- `ProviderRateLimiter` provider quotas, isolation, and resetting
- IP spoofing prevention with `trustProxy: false`
- Safe `X-Forwarded-For` parsing with `trustProxy: true` and IP whitelisting
- Malformed IP string rejection
- HTTP 429 status, `Retry-After` header, and rate limit headers

---

## 4. Conclusion & Readiness

All Phase 111 acceptance criteria have been achieved:
- Storage and rate-limit guarantees match the documented deployment.
- Restart and multi-instance behavior is documented and tested.
- Core use does not require paid infrastructure.

**Readiness:** OpenSearch is ready for **Milestone 38 — Phase 112: Health, status, and graceful shutdown**.
