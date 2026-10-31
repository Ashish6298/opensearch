# OpenSearch Web — Environment Variables & Safe Defaults Reference

**Milestone:** MILESTONE 40 — DEPLOYMENT AND CONTAINER SUPPORT  
**Phase:** Phase 120 — Release packaging and rollback  
**Status:** Authoritative Specification  

---

## 1. Overview & Safe Defaults Guarantee

OpenSearch Web enforces a strict architectural invariant: **Zero Mandatory Secrets & Zero Mandatory Configuration**.

- All environment variables are completely optional for local development and self-hosting.
- When no environment variables or `.env` file are provided, the application automatically boots under safe, local-first defaults with full functionality.
- No third-party API keys, license tokens, database connection strings, or cloud secrets are required.

---

## 2. Environment Variables Specification

| Variable | Type | Allowed Values | Default Value | Service / Component | Description & Safety Guarantee |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `NODE_ENV` | String | `development`, `production`, `test` | `development` | Core Runtime | Sets runtime optimization mode. In `production`, structured JSON logging and security headers are enforced. |
| `DEPLOYMENT_MODE` | String | `local-first`, `self-hosted`, `serverless`, `cluster` | `local-first` (dev) / `self-hosted` (prod) | Core Architecture | Resolves deployment tier and storage durability checks. |
| `DEPLOYMENT_MODEL` | String | `standalone`, `cluster`, `serverless` | `standalone` | Storage & Routing | Backward-compatible alias for deployment mode. |
| `PORT` | Integer | `1` – `65535` | `3000` | Unified Gateway | Primary HTTP port for the container or unified gateway. |
| `HOST` | String | IP Address / Hostname | `0.0.0.0` (prod) / `localhost` (dev) | Unified Gateway | Network interface binding address. |
| `API_PORT` | Integer | `1` – `65535` | `3000` | API Daemon | Dedicated port for standalone HTTP Search API daemon. |
| `API_HOST` | String | IP Address / Hostname | `0.0.0.0` (prod) / `localhost` (dev) | API Daemon | Interface binding for standalone API daemon. |
| `WEB_PORT` | Integer | `1` – `65535` | `5173` | Web UI Daemon | Dedicated port for standalone search web interface. |
| `WEB_HOST` | String | IP Address / Hostname | `0.0.0.0` (prod) / `localhost` (dev) | Web UI Daemon | Interface binding for standalone web frontend. |
| `STORAGE_DIR` | String | Filesystem Path | `./data/storage` | Storage Adapter | Path for SQLite database, collection files, and migration checkpoints. |
| `INDEX_DIR` | String | Filesystem Path | `./data/index` | Inverted Index | Path for BM25 inverted index postings and vocabulary files. |
| `CRAWLER_DATA_DIR` | String | Filesystem Path | `./data/crawler` | Web Crawler | Path for crawl queue, checkpoints, and robots.txt cache. |
| `CORS_ORIGIN` | String | URL / `*` | `*` (dev) / `http://localhost:5173` (prod) | HTTP Security | Permitted CORS origin header for browser requests. |
| `TRUST_PROXY` | Boolean / String | `true`, `false`, or IP list | `false` | Reverse Proxy Ingress | Controls whether `X-Forwarded-For` is trusted for client rate limiting. Default `false` prevents IP spoofing. |
| `RATE_LIMIT_PER_MINUTE` | Integer | `1` – `10000` | `60` | Rate Limiter | Default baseline sliding-window rate limit per client IP. |
| `BODY_LIMIT_BYTES` | Integer | Positive Integer | `65536` (64 KB) | HTTP Security | Maximum allowed request body size to prevent DoS attacks. |
| `ENABLE_MCP` | Boolean | `true`, `false` | `true` | AI Tooling | Enables Model Context Protocol (`/api/v1/mcp`) endpoints. |
| `LOG_LEVEL` | String | `debug`, `info`, `warn`, `error`, `silent` | `info` (prod) / `debug` (dev) | Structured Logging | Verbosity threshold for structured logs. |
| `LOG_FORMAT` | String | `json`, `pretty` | `json` (prod) / `pretty` (dev) | Structured Logging | Output formatting for logs. |
| `CRAWLER_MAX_CONCURRENCY` | Integer | `1` – `10` | `1` | Crawler Politeness | Maximum parallel crawler workers. |
| `CRAWLER_MAX_PAGES` | Integer | Positive Integer | `1000` | Crawler Bounds | Hard limit on pages crawled per job run. |
| `CRAWLER_MAX_DEPTH` | Integer | Positive Integer | `3` | Crawler Bounds | Maximum link traversal depth. |
| `CRAWLER_TIMEOUT_MS` | Integer | Milliseconds | `10000` (10s) | Crawler Network | HTTP fetch timeout for web pages. |
| `CRAWLER_POLITENESS_DELAY_MS` | Integer | Milliseconds | `1000` (1s) | Crawler Politeness | Mandatory politeness delay between fetches from the same origin. |
| `CRAWLER_USER_AGENT` | String | User-Agent string | `OpenSearchBot/1.0` | Crawler Identity | Disclosed bot identifier and contact URL. |
| `ALLOW_PUBLISH` | Boolean | `true`, `false` | `false` | Release Safety | Guard variable required to authorize any package publication. |

---

## 3. Zero-Secret Verification

The following tokens are strictly prohibited as mandatory configuration:
- `API_KEY`: Never required for core functionality.
- `DATABASE_PASSWORD`: SQLite WAL operates locally without credentials.
- `REDIS_URL`: In-memory and file-backed rate limiting require no external Redis.
- `CLOUD_TOKEN`: Local-first and self-hosted deployments require zero SaaS services.
