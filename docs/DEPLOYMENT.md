# OpenSearch V1.0.0 — Free-Tier Deployment & Operations Guide

> Complete, step-by-step procedures to deploy, operate, and maintain OpenSearch on zero-cost, free-tier cloud infrastructure (Render, Fly.io, Railway, Hugging Face Spaces, Koyeb, or a self-hosted single-node VPS).

---

## 1. Free-Tier Architecture Overview

OpenSearch is designed from the ground up to operate reliably on zero-cost computing platforms without requiring external databases, paid cloud search APIs, or complex Kubernetes clusters.

### Service Topology

```
┌──────────────────────────────────────────────────────────────┐
│                    Web Browser / Client                      │
└──────────────┬───────────────────────────────┬───────────────┘
               │ (HTTPS :443)                  │ (HTTPS :443)
               ▼                               ▼
     ┌──────────────────┐            ┌──────────────────┐
     │  Web Application │            │    Search API    │
     │  (Port 5173 /    │            │    (Port 3000 /  │
     │   Static Host)   │            │     PaaS Node)   │
     └──────────────────┘            └─────────┬────────┘
                                               │
                                     ┌─────────▼────────┐
                                     │  Inverted Index  │
                                     │   & Document DB  │
                                     │ (Disk Persistence│
                                     │  / Persistent    │
                                     │   Volume)        │
                                     └──────────────────┘
```

---

## 2. Environment Variables Reference

| Variable                  | Required | Default (Dev)                         | Default (Prod)                        | Description                                          |
| :------------------------ | :------- | :------------------------------------ | :------------------------------------ | :--------------------------------------------------- |
| `NODE_ENV`                | Yes      | `development`                         | `production`                          | Runtime mode (`development`, `production`, `test`)   |
| `PORT`                    | Auto     | `3000`                                | Injected by PaaS                      | Server listening port                                |
| `HOST`                    | No       | `localhost`                           | `0.0.0.0`                             | Server listening host                                |
| `API_PORT`                | No       | `3000`                                | Inherits `PORT`                       | Explicit port for API service                        |
| `WEB_PORT`                | No       | `5173`                                | Inherits `PORT`                       | Explicit port for Web service                        |
| `CORS_ORIGIN`             | No       | `http://localhost:5173`               | `*`                                   | Allowed CORS origins for public API                  |
| `VITE_API_URL`            | No       | `http://localhost:3000/api/v1/search` | `http://localhost:3000/api/v1/search` | Public endpoint accessed by web frontend             |
| `STORAGE_DIR`             | No       | `./data/storage`                      | `./data/storage`                      | Storage directory for documents/crawls               |
| `INDEX_DIR`               | No       | `./data/index`                        | `./data/index`                        | Active inverted index directory                      |
| `CRAWLER_DATA_DIR`        | No       | `./data/crawler`                      | `./data/crawler`                      | Queue and crawl checkpoint directory                 |
| `LOG_LEVEL`               | No       | `debug`                               | `info`                                | Logging verbosity (`debug`, `info`, `warn`, `error`) |
| `LOG_FORMAT`              | No       | `pretty`                              | `json`                                | Log format (`json` or `pretty`)                      |
| `CRAWLER_MAX_CONCURRENCY` | No       | `1`                                   | `1`                                   | Max concurrent crawl workers (free-tier max: 2-3)    |
| `CRAWLER_MAX_PAGES`       | No       | `1000`                                | `1000`                                | Page budget ceiling per crawl run                    |
| `CRAWLER_RETRY_BUDGET`    | No       | `50`                                  | `50`                                  | Retry budget to suppress transient storm loops       |
| `RATE_LIMIT_PER_MINUTE`   | No       | `60`                                  | `60`                                  | In-memory API rate limit per client IP mask          |

---

## 3. Deployment Guides for Popular Free-Tier Providers

### Option A: Render (Free Web Service)

1. Create a **Web Service** on Render connected to your repository.
2. Configure settings:
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run start:api`
3. Environment variables:
   - `NODE_ENV=production`
   - `STORAGE_DIR=/data/storage`
   - `INDEX_DIR=/data/index`
4. Health check path: `/health` (Responds with HTTP 200 and system readiness).

### Option B: Fly.io / Docker

Create a `Dockerfile` using the official Node.js Alpine base image:

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
COPY apps/ ./apps/
COPY packages/ ./packages/
RUN npm ci
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app ./
EXPOSE 3000
CMD ["npm", "run", "start:api"]
```

Deploy with `fly launch --no-deploy` and `fly deploy`.

---

## 4. Index Deployment & Update Procedure

When updating the search index in production without incurring downtime:

1. **Pre-build the index artifacts** locally or in a batch container using the seed corpus:
   ```bash
   node ./scripts/seed-and-build.mjs
   ```
2. **Atomic Index Activation**:
   - The index directory contains versioned subdirectories (`builds/<build-id>/`).
   - The active pointer `active.json` points atomically to the verified build.
   - Deploy the new build directory and update `active.json`.
3. **Zero-Downtime Reload**:
   - The Search API dynamically validates and reloads the active index upon receiving a request or container restart.

---

## 5. Health Monitoring & Diagnostics

OpenSearch provides native health and telemetry endpoints without third-party monitoring agents:

- **Endpoint**: `GET /health`
- **Response Format**:
  ```json
  {
    "name": "OpenSearch",
    "version": "1.0.0",
    "status": "ok",
    "uptimeSeconds": 3600,
    "memoryUsageMb": 42.5,
    "totalDocumentsIndexed": 1250,
    "components": {
      "index": { "status": "ok" },
      "rateLimiter": { "status": "ok" },
      "queryCache": { "status": "ok" }
    }
  }
  ```

If memory consumption exceeds 512MB (free-tier limit) or documents are missing, the status safely transitions to `degraded` allowing auto-recovery and alerts.
