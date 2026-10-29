# OpenSearch Hosting & Deployment Compatibility Guide

**Milestone:** MILESTONE 38 — SECURITY AND OPERATIONAL RESILIENCE  
**Phase:** Phase 111 — Rate limiting and hosting compatibility  
**Status:** Complete & Fully Verified  

---

## 1. Overview & Architectural Guarantees

OpenSearch is designed from the ground up to be fully self-hostable, private, and independent of proprietary cloud services. The search engine, inverted index, crawl queue, PageRank calculator, and rate-limiting infrastructure require **zero paid cloud infrastructure** (no paid Redis clusters, third-party databases, or SaaS subscriptions).

This document establishes the official deployment models, storage durability invariants, multi-instance rate-limiting behavior, and reverse proxy security configurations.

---

## 2. Deployment Models

OpenSearch supports three primary deployment models:

| Deployment Model | Typical Environment | Rate-Limiter Storage | Storage Durability | External Paid Cost |
| :--- | :--- | :--- | :--- | :--- |
| **`standalone`** *(Default)* | Linux VPS, bare-metal server, Raspberry Pi, local development | `MemoryRateLimitStore` or `FileBackedRateLimitStore` | Local filesystem / Persistent Volume (`./data`) | **$0.00** |
| **`cluster`** | Multi-instance Node processes behind Nginx / Caddy / Traefik / ALB | `FileBackedRateLimitStore` (shared volume) or Ingress Rate Limiting | Replicated Persistent Volume / Read-only replica mount | **$0.00** (self-hosted) |
| **`serverless`** | Containerized ephemeral tasks (Cloud Run, AWS Fargate) | In-Memory (per container) | Persistent Network Volume (NFS / EFS / Cloud Storage FUSE) | Variable |

### 1. Standalone Deployment (Recommended for Self-Hosters)
- Single Node.js process owning the index and crawler data.
- Stores index data locally in `STORAGE_DIR` (default: `./data/storage`).
- Rate limiting is managed in-process with `MemoryRateLimitStore` (ultra-fast, zero dependencies) or `FileBackedRateLimitStore` (persists token usage across process restarts).

### 2. Multi-Instance Clustered Deployment
- **Multi-Instance Guarantees:** Process-memory rate limits apply **per process instance**. If 3 API instances are running behind a round-robin load balancer, an in-memory limit of 60 req/min allows a client up to 180 req/min globally.
- **Shared Storage Options:**
  - **Shared Volume:** Use `FileBackedRateLimitStore` pointing to a shared filesystem mount (`STORAGE_DIR/rate-limits.json`) with atomic file writes to synchronize token buckets across local processes without Redis.
  - **Ingress Proxy Rate Limiting:** For high-throughput production clusters, configure rate limiting at the reverse proxy layer (e.g. Nginx `limit_req_zone`, Caddy `rate_limit`, or Cloudflare WAF).

### 3. Serverless & Ephemeral Environments
- Serverless environments (e.g. AWS Lambda, Google Cloud Run without volume mounts) discard local disk storage when instances terminate.
- Running OpenSearch with an ephemeral index causes complete index loss upon container redeployment.
- **Requirement:** Attach a persistent volume or mount before running in production.

---

## 3. Storage Persistence & Durability Auditing

OpenSearch features an automated storage auditor (`auditStoragePersistence`) executed on server boot:

```typescript
import { auditStoragePersistence } from '@opensearch/storage';

const audit = auditStoragePersistence(process.env.STORAGE_DIR, 'standalone', process.env.NODE_ENV === 'production');
if (audit.warnings.length > 0) {
  // Logs warnings if path is ephemeral (/tmp, /var/tmp, /dev/shm, os.tmpdir())
}
```

### Ephemeral Storage Rules:
1. **Forbidden in Production:** Paths resolving to `/tmp`, `/var/tmp`, `/dev/shm`, or temporary folders are flagged with a critical data loss warning in production.
2. **Docker Recommended Mounting:**
   ```bash
   docker run -d \
     --name opensearch \
     -p 3000:3000 \
     -p 5173:5173 \
     -v /var/data/opensearch:/app/data \
     -e STORAGE_DIR=/app/data/storage \
     -e INDEX_DIR=/app/data/index \
     opensearch:latest
   ```

---

## 4. Multi-Tier Rate Limiting & Complexity Protection

OpenSearch enforces rate limiting across three tiers:

### 1. Route-Specific Rate Tiers
Different API routes impose distinct compute footprints. OpenSearch applies tiered quotas per client IP:
- **Search & MCP Endpoints** (`/api/v1/search`, `/api/v1/search/stream`, `/api/v1/mcp`): Default 60 req/min.
- **Instant / Quick Answers** (`/api/v1/instant-answer`): Default 30 req/min.
- **Crawl & Admin Review Operations** (`/api/v1/feedback/review`, crawler initiation): Default 10–20 req/min.
- **Lightweight Metadata** (`/api/v1/suggest`, `/health`, `/api/v1/status`, `/opensearch.xml`): Default 180–300 req/min.

### 2. Query Complexity Weighting (Resource Exhaustion Defense)
Search queries that impose high algorithmic or posting traversal costs consume additional quota tokens:
- **Standard Lexical Queries:** Cost = 1 token.
- **Wildcard & Pattern Queries** (`privac*`, `?`, `~`): Cost = 2 tokens.
- **Oversized Result Requests** (`limit > 50`): Cost = 2 tokens.
- **Heavy Administrative Operations:** Cost = 2 tokens.

### 3. Outbound Provider Rate Limiting (`ProviderRateLimiter`)
To protect external upstream search providers (such as Wikimedia) from rate-limit exhaustion and avoid IP bans:
- Tracks outbound queries per provider domain.
- Returns proactive throttling (`allowed: false` with `retryAfterSeconds`) before dispatching outbound requests.

---

## 5. Trusted Reverse Proxy Configuration & IP Spoofing Defense

Clients connecting over the internet often sit behind reverse proxies (Nginx, Caddy, Cloudflare, AWS ALB).

### Security Invariant:
When `trustProxy` is `false` (the default), `X-Forwarded-For` headers are **strictly ignored**. Rate limiting exclusively uses the socket remote address (`req.socket.remoteAddress`). This completely prevents attackers from bypassing IP rate limits by spoofing `X-Forwarded-For` headers.

### Configuring Trusted Proxies:
When deployed behind an authorized reverse proxy, configure `trustProxy` via environment variable or server options:

```bash
# Trust all reverse proxies (e.g. in private Docker networks behind Caddy/Nginx)
export TRUST_PROXY=true

# Or trust specific reverse proxy IPs
export TRUST_PROXY=127.0.0.1,10.0.0.1,192.168.1.1
```

Or programmatically:
```typescript
const server = createApiServer({
  trustProxy: ['127.0.0.1', '10.0.0.1'],
});
```

---

## 6. HTTP 429 Response Specification

When rate limits are exceeded, OpenSearch emits standards-compliant headers and structured JSON errors:

### Response Headers:
- `X-RateLimit-Limit`: Maximum requests allowed in active window.
- `X-RateLimit-Remaining`: Remaining request quota.
- `X-RateLimit-Reset`: Unix epoch timestamp (seconds) when the window resets.
- `Retry-After`: Integer seconds until the client is permitted to retry.

### HTTP 429 JSON Body:
```json
{
  "error": {
    "message": "Too many requests. Please retry after 42 seconds.",
    "code": "RATE_LIMIT_EXCEEDED",
    "category": "SECURITY",
    "statusCode": 429,
    "timestamp": "2026-10-29T22:30:00.000Z"
  }
}
```

---

## 7. Zero Paid Infrastructure Checklist

To deploy OpenSearch in production at zero subscription cost:
- [x] Host on Linux VPS (Hetzner, OVH, DigitalOcean, local hardware).
- [x] Use `STORAGE_DIR` mapped to a persistent local directory or Docker volume.
- [x] Set `TRUST_PROXY=true` if using Nginx/Caddy for TLS termination.
- [x] Rely on the built-in `FileBackedRateLimitStore` or ingress proxy for rate limiting.
- [x] Enjoy private, full-text search without paid third-party dependencies!
