# OpenSearch Deployment Architecture Decision Record (ADR)

**Milestone:** MILESTONE 40 — DEPLOYMENT AND CONTAINER SUPPORT  
**Phase:** Phase 118 — Deployment architecture decision  
**Status:** Approved & Authoritative  
**Date:** 2026-10-31  

---

## 1. Context & Problem Statement

OpenSearch Web is an independent, sovereign, privacy-preserving web search engine engineered for zero query surveillance, zero user tracking, and zero paid infrastructure dependencies.

As the system moves toward containerization (Phase 119) and formal release packaging (Phase 120), this Architectural Decision Record (ADR) formally defines:
1. Which deployment modes are officially supported and their corresponding capability tiers.
2. The multi-dimensional evaluation of candidate deployment platforms (storage durability, background task execution, memory bounds, networking, rate limiting, and privacy).
3. The explicit non-assumptions regarding serverless filesystems and multi-instance process-memory rate limits.
4. The preservation of an out-of-the-box, zero-credential local deployment path.

---

## 2. Decision: Supported Deployment Modes & Tiers

OpenSearch formally classifies deployment targets into two support tiers:

```
+--------------------------------------------------------------------------------+
|                         OPEN SEARCH DEPLOYMENT MODES                           |
+--------------------------------------------------------------------------------+
|  TIER 1: FULLY SUPPORTED (Primary)                                             |
|  - local-first  : Desktop, laptop, or developer machine (single node)          |
|  - self-hosted  : Dedicated Linux VPS, bare-metal server, or persistent Docker |
+--------------------------------------------------------------------------------+
|  TIER 2: RESTRICTED / ADVISORY (Read-Only / Delegated Ingress)                 |
|  - serverless   : AWS Lambda, Vercel Serverless, Netlify Functions             |
|                   (Restricted to read-only queries or pre-built demo corpus)   |
|  - cluster      : Multi-instance processes behind reverse proxy / load balancer|
|                   (Requires ingress rate-limiting & shared/replicated storage) |
+--------------------------------------------------------------------------------+
```

### Tier 1: Primary Supported Modes

#### 1. `local-first` (Default in Development)
- **Target Audience:** Developers, privacy enthusiasts, offline desktop workstations.
- **Architectural Characteristics:**
  - Single-machine Node.js runtime (`npm run dev`, `npm run build && npm start`).
  - Durable local disk persistence for SQLite document stores, inverted index posting lists, PageRank link graphs, and crawl states (`STORAGE_DIR=./data/storage`).
  - Zero cloud dependencies, zero external database requirements, zero API keys or secrets.
  - 100% offline-capable with built-in curated demo dataset.

#### 2. `self-hosted` (Default in Production Container / VPS)
- **Target Audience:** Home lab operators, self-hosters, private intranets, small-to-medium enterprise intranets.
- **Architectural Characteristics:**
  - Single Linux VPS, Raspberry Pi 4/5, home server, or Docker container with a persistent volume mounted at `/app/data` or `/data`.
  - Supports continuous background crawlers, scheduled re-indexing, PageRank computations, and SQLite WAL durability.
  - Rate limiting is managed in-process with `MemoryRateLimitStore` (ultra-fast) or `FileBackedRateLimitStore` (persists token buckets across process restarts).
  - Reverse proxy friendly (Nginx, Caddy, Traefik, HAProxy) with configurable `trustProxy` IP verification.

---

### Tier 2: Restricted & Advisory Modes

#### 3. `serverless` (Stateless / Ephemeral Functions)
- **Platforms:** AWS Lambda, Vercel Functions, Netlify Functions, Google Cloud Run (without mounted persistent disks).
- **Architectural Decision & Limitations:**
  - **Serverless filesystem writes DO NOT persist between instances.** Any local file written to `/tmp` is wiped when the container instance terminates or scales to zero.
  - **Autonomous background crawlers CANNOT run.** Serverless functions have strict execution timeouts (typically 10s–60s) and freeze execution loops between invocations.
  - **Process-memory rate limits DO NOT apply globally.** Dynamically spun-up serverless instances do not share memory; in-memory rate limiting only protects that specific warm container.
  - **SQLite concurrency risks:** Concurrent writes from disparate serverless instances to a shared network share cause `SQLITE_BUSY` database lock contention.
  - **Authoritative Policy:** Serverless deployment is supported **strictly as a stateless read-only query node** against a pre-built static index or external search providers, or with external managed storage.

#### 4. `cluster` (Multi-Instance Behind Load Balancer)
- **Target Audience:** High-traffic self-hosted installations running multiple API replicas.
- **Architectural Requirements:**
  - **Rate Limiting:** Must terminate or enforce global client quotas at the ingress/reverse proxy layer (e.g. Nginx `limit_req_zone`, Caddy `rate_limit`, or Cloudflare WAF). In-memory rate limits on individual nodes only throttle traffic routed to that specific node.
  - **Storage:** Index writes must be managed by a designated primary writer node or persistent shared volume with synchronized read replicas.

---

## 3. Candidate Platform Evaluation Matrix

| Platform Candidate | Storage Durability | Background Crawling | Memory Bounds | Networking / Ingress | Rate Limit Guarantee | Privacy & Data Sovereignty | Overall Assessment |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Local Workstation** *(macOS / Linux / Windows)* | **Durable** (Local NVMe/SSD, SQLite WAL) | **Fully Supported** (Unbounded worker loops) | Low overhead (~150MB heap) | Localhost (`127.0.0.1:3000`) | **Global Guarantee** (Single process) | **Maximum** (Zero external network leakage) | **Tier 1 (Fully Supported)** |
| **Self-Hosted VPS** *(Ubuntu / Debian / Alpine)* | **Durable** (Host filesystem, snapshots) | **Fully Supported** (Systemd background services) | Configurable Node heap (`--max-old-space-size`) | Direct or Reverse Proxy (Nginx/Caddy) | **Global Guarantee** (In-memory or file-backed) | **Maximum** (Full user hardware control) | **Tier 1 (Fully Supported)** |
| **Docker / Podman** *(Volume Mounted)* | **Durable** (Named volume `-v opensearch_data:/app/data`) | **Fully Supported** (Container lifecycle) | Predictable container memory limits | Bridge / Host network with port mapping | **Global Guarantee** (Single container) | **Maximum** (Isolated container sandbox) | **Tier 1 (Fully Supported)** |
| **Serverless Functions** *(AWS Lambda / Vercel)* | **Ephemeral** (`/tmp` wiped on cold start) | **Unsupported** (Timeout 10s–60s, frozen event loop) | Strict memory allocation (128MB–3GB) | API Gateway / Edge Ingress | **Per-Instance Only** (No cross-instance sync) | High (Stateless query execution) | **Tier 2 (Restricted: Read-Only Query Node)** |
| **Ephemeral PaaS** *(Render / Heroku free)* | **Ephemeral** (Dyno restart wipes filesystem) | **Unsupported** (Killed on idle / sleep) | Ephemeral RAM bounds | Platform Router / Load Balancer | **Per-Instance Only** | High | **Tier 2 (Requires persistent disk add-on)** |
| **Multi-Instance Cluster** | **Hybrid** (Shared volume or read-replicas) | **Supported** (Dedicated primary crawler) | Scalable horizontally | Load Balancer (Round-robin / Least connections) | **Gateway Required** (Nginx / Edge WAF) | High (Private network VPC) | **Tier 2 (Cluster with Ingress Gateway)** |

---

## 4. Architectural Non-Assumptions (Explicitly Disclosed)

To prevent operational failures and architectural misconceptions, the codebase enforces the following explicit rules:

### Rule 1: Never assume serverless filesystem writes persist between instances
```
[Client Request] --> [Serverless Container A (Writes /tmp/index)] --> Wiped on spin-down!
                 --> [Serverless Container B (Empty /tmp/index)]   --> Data missing!
```
- The application automatically probes storage directories via `isEphemeralStoragePath()` and `auditStoragePersistence()`.
- If an ephemeral storage path or serverless runtime is detected, the server logs explicit warnings and informs API clients via `GET /api/v1/deployment`.

### Rule 2: Never assume process-memory rate limits apply globally
- An in-memory token bucket operates strictly within the V8 heap of a single Node.js process.
- In a multi-instance cluster or dynamically scaled serverless deployment, a client can theoretically consume `N * Quota` requests across `N` instances.
- OpenSearch explicitly documents that distributed deployments must enforce rate limiting at the reverse proxy or API gateway.

### Rule 3: SQLite is single-writer per database file
- SQLite WAL mode permits concurrent readers but strictly serializes writes through file locks.
- Disparate containers mounting a network NFS share must never attempt concurrent write transactions without dedicated coordination.

---

## 5. Non-Negotiable Invariants

All deployment modes in OpenSearch must satisfy the following four core invariants:

1. **Zero Paid Domains Invariant:**  
   The application must bind and operate cleanly on `localhost`, `127.0.0.1`, `0.0.0.0`, private network IPs, or custom local domains without requiring a registered public domain.
2. **Zero Mandatory Paid Services Invariant:**  
   The search engine, ranking pipeline, indexer, crawler, and rate limiter require zero commercial third-party subscriptions (no paid Elasticsearch/Algolia, no paid Redis, no paid AWS DynamoDB).
3. **Zero Mandatory Secrets Invariant:**  
   The server must start and serve queries cleanly without a `.env` file or with all environment variables empty. No secrets, license keys, or API tokens are required for core functionality.
4. **Local-First Functional Path:**  
   A new developer or user running `npm run dev` or `npm start` from a clean repository checkout gets a 100% working search engine and web interface immediately.

---

## 6. Runtime Introspection & Endpoints

OpenSearch exposes truthful deployment capabilities via standard API endpoints:

- **`GET /api/v1/deployment`**: Returns the complete evaluation record including mode (`local-first`, `self-hosted`, `serverless`, `cluster`), support tier, storage durability, rate limit scope, limitations, and recommendations.
- **`GET /api/v1/status`**: Includes the `deployment` summary object reporting active mode, durability, and zero-paid guarantees alongside system health.
- **Boot Diagnostics:** During server initialization (`validateStartupConfig`), the server outputs structured log warnings if ephemeral storage or non-global rate limits are detected in production.

---

## 7. Migration & Backup Policy

- **Persistent Volumes:** For production Docker deployments, always mount a persistent host volume:
  ```bash
  docker run -d \
    --name opensearch \
    -p 3000:3000 \
    -v /var/data/opensearch:/app/data \
    -e STORAGE_DIR=/app/data/storage \
    -e INDEX_DIR=/app/data/index \
    opensearch:latest
  ```
- **Snapshots:** Use built-in database snapshots before executing migrations or updating container image tags.
