# OpenSearch Web — Docker & Docker Compose Operations Guide

**Milestone:** MILESTONE 40 — DEPLOYMENT AND CONTAINER SUPPORT  
**Phase:** Phase 119 — Docker and Compose  
**Date:** 2026-10-31  
**Status:** Authoritative & Complete  

---

## 1. Overview & Architectural Principles

OpenSearch Web provides an official, multi-stage production container designed for self-hosting with minimal operational overhead:

- **Sovereign & Self-Contained:** Runs the search engine, inverted index, ranking pipeline, crawler, and web interface in a single container. Requires **zero external services** (no Redis, no external SQL/NoSQL databases, no third-party APIs).
- **Non-Root Security:** Operates under a dedicated unprivileged user (`opensearch`, UID/GID `1001`) on a minimal `node:20-alpine` base image.
- **Durable Persistence:** Employs an explicit volume mount (`/app/data`) ensuring index and document data survive container restarts, upgrades, and recreations.
- **Zero Mandatory Secrets:** Boots cleanly without an `.env` file or API tokens.
- **Native Health Checking:** Includes built-in `HEALTHCHECK` instructions using Node.js native `fetch` (no `curl` or `wget` dependencies needed in the minimal image).
- **Graceful Termination:** Listens for `STOPSIGNAL SIGTERM` and completes in-flight queries before shutting down.

---

## 2. Quickstart

### Option A: Using Docker Compose (Recommended)

1. **Launch the Container:**
   ```bash
   docker compose up -d
   ```
2. **View Live Container Logs:**
   ```bash
   docker compose logs -f
   ```
3. **Verify Container Health:**
   ```bash
   docker compose ps
   ```
   *Expected output:* `STATUS: Up (healthy)`
4. **Access the Interface:**
   - Web Search UI: [http://localhost:3000](http://localhost:3000)
   - API Status: [http://localhost:3000/api/v1/status](http://localhost:3000/api/v1/status)
   - Health Check: [http://localhost:3000/health](http://localhost:3000/health)

---

### Option B: Using Standalone Docker CLI

1. **Build the Production Image:**
   ```bash
   docker build -t opensearch-web:latest .
   ```
2. **Run with a Persistent Volume:**
   ```bash
   docker run -d \
     --name opensearch-web \
     --restart unless-stopped \
     -p 3000:3000 \
     -v opensearch_data:/app/data \
     opensearch-web:latest
   ```

---

## 3. Persistent Volume Architecture

All persistent state is isolated under `/app/data`:

```
/app/data/
├── storage/        # SQLite document metadata, crawler checkpoints, and ACID logs
├── index/          # Inverted index posting lists, vocabularies, and BM25 statistics
└── crawler/        # Robots.txt cache, politeness registries, and queue state
```

### Durability Invariant
When `-v opensearch_data:/app/data` is mounted, all indexed documents, crawl queues, and user configuration survive container stop, removal, and redeployment.

---

## 4. Operational Procedures

### A. Backing Up Persistent Data

To create a compressed snapshot of the persistent index while the container is running:

```bash
# 1. Create a timestamped archive of the persistent volume
docker run --rm \
  -v opensearch_data:/data:ro \
  -v $(pwd)/backups:/backup \
  alpine tar -czvf /backup/opensearch-backup-$(date +%Y%m%d-%H%M%S).tar.gz -C /data .

echo "Backup complete in ./backups/"
```

### B. Upgrading OpenSearch Container

Upgrading to a new release or git revision preserves your existing search index:

```bash
# 1. Pull the latest repository updates
git pull origin main

# 2. Rebuild the container image
docker compose build

# 3. Recreate the container with zero data loss
docker compose up -d --force-recreate

# 4. Verify healthy boot
docker compose logs --tail=50
```

### C. Resetting to a Clean Slate

To purge all local documents, indexes, and start fresh:

```bash
# WARNING: This deletes the persistent volume and wipes the search index!
docker compose down -v

# Start with a fresh initial seed corpus
docker compose up -d
```

---

## 5. Security & Runtime Configuration

### Configurable Environment Variables

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Enables optimized production execution mode |
| `DEPLOYMENT_MODE` | `self-hosted` | Sets deployment mode and storage durability validation |
| `PORT` | `3000` | Port to expose and bind the unified gateway |
| `HOST` | `0.0.0.0` | Network interface binding |
| `STORAGE_DIR` | `/app/data/storage` | Path for SQLite storage adapter |
| `INDEX_DIR` | `/app/data/index` | Path for inverted index postings |
| `LOG_LEVEL` | `info` | Logging verbosity (`debug`, `info`, `warn`, `error`) |
| `LOG_FORMAT` | `json` | Structured JSON logging for Docker log collectors |
| `TRUST_PROXY` | `false` | Set `true` if behind Nginx / Caddy to respect `X-Forwarded-For` |

---

## 6. Reverse Proxy Integration (TLS & Custom Domains)

To terminate SSL/TLS with Caddy or Nginx in front of OpenSearch:

```caddyfile
# Example Caddyfile configuration
search.example.com {
    reverse_proxy localhost:3000 {
        header_up X-Forwarded-Proto {scheme}
        header_up X-Forwarded-Host {host}
    }
}
```
*Note: Set `TRUST_PROXY=true` in `docker-compose.yml` when operating behind a reverse proxy.*
