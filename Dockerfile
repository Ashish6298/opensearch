# syntax=docker/dockerfile:1
# ==============================================================================
# OpenSearch Web — Production Multi-Stage Container (Phase 119)
#
# Multi-stage container architecture:
# 1. Builder stage (Node 20 Alpine) compiling TypeScript composite packages
# 2. Minimal runner stage (Node 20 Alpine)
# 3. Non-root user (opensearch:opensearch, UID/GID 1001)
# 4. Explicit persistent data volume (/app/data)
# 5. Integrated health check (GET /health via native fetch)
# 6. Graceful shutdown signal handling (STOPSIGNAL SIGTERM)
# 7. Zero baked-in secrets, zero tracking, zero mandatory cloud services
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Build & Compile TypeScript
# ------------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Install build prerequisites for native bindings (if required by SQLite/build tools)
# Copy package manifests for deterministic dependency caching
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/cli/package.json ./packages/cli/
COPY packages/crawler/package.json ./packages/crawler/
COPY packages/indexer/package.json ./packages/indexer/
COPY packages/ranking/package.json ./packages/ranking/
COPY packages/shared/package.json ./packages/shared/
COPY packages/storage/package.json ./packages/storage/

# Clean reproducible install of all monorepo dependencies
RUN npm ci

# Copy root configurations and source packages
COPY tsconfig.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
COPY scripts ./scripts
COPY api ./api

# Build all TypeScript composite projects and web frontend assets
RUN npm run build

# Prune development dependencies to keep production footprint minimal
RUN npm prune --omit=dev


# ------------------------------------------------------------------------------
# Stage 2: Minimal Production Runtime
# ------------------------------------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

# Set production environment defaults (all overrideable at runtime)
ENV NODE_ENV=production \
    DEPLOYMENT_MODE=self-hosted \
    PORT=3000 \
    HOST=0.0.0.0 \
    STORAGE_DIR=/app/data/storage \
    INDEX_DIR=/app/data/index \
    CRAWLER_DATA_DIR=/app/data/crawler

# Security: Create dedicated non-root system user and group (UID/GID 1001)
RUN addgroup -S -g 1001 opensearch && \
    adduser -S -u 1001 -G opensearch opensearch

# Create explicit persistent storage directory structure with non-root ownership
RUN mkdir -p /app/data/storage /app/data/index /app/data/crawler && \
    chown -R opensearch:opensearch /app

# Copy production node_modules from builder
COPY --from=builder --chown=opensearch:opensearch /app/node_modules ./node_modules

# Copy package manifests for workspace resolution
COPY --from=builder --chown=opensearch:opensearch /app/package.json ./package.json
COPY --from=builder --chown=opensearch:opensearch /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder --chown=opensearch:opensearch /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder --chown=opensearch:opensearch /app/packages/cli/package.json ./packages/cli/package.json
COPY --from=builder --chown=opensearch:opensearch /app/packages/crawler/package.json ./packages/crawler/package.json
COPY --from=builder --chown=opensearch:opensearch /app/packages/indexer/package.json ./packages/indexer/package.json
COPY --from=builder --chown=opensearch:opensearch /app/packages/ranking/package.json ./packages/ranking/package.json
COPY --from=builder --chown=opensearch:opensearch /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder --chown=opensearch:opensearch /app/packages/storage/package.json ./packages/storage/package.json

# Copy compiled JavaScript dist directories and static assets
COPY --from=builder --chown=opensearch:opensearch /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=opensearch:opensearch /app/apps/web/dist ./apps/web/dist
COPY --from=builder --chown=opensearch:opensearch /app/packages/cli/dist ./packages/cli/dist
COPY --from=builder --chown=opensearch:opensearch /app/packages/crawler/dist ./packages/crawler/dist
COPY --from=builder --chown=opensearch:opensearch /app/packages/indexer/dist ./packages/indexer/dist
COPY --from=builder --chown=opensearch:opensearch /app/packages/ranking/dist ./packages/ranking/dist
COPY --from=builder --chown=opensearch:opensearch /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=opensearch:opensearch /app/packages/storage/dist ./packages/storage/dist

# Copy unified production runner and serverless router
COPY --from=builder --chown=opensearch:opensearch /app/api ./api
COPY --from=builder --chown=opensearch:opensearch /app/scripts ./scripts

# Declare explicit persistent volume mount point
VOLUME ["/app/data"]

# Switch to unprivileged non-root user
USER opensearch

# Expose HTTP port (3000 default)
EXPOSE 3000

# Integrated health check probe using Node 20 global fetch (zero curl/wget dependency)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Standard POSIX graceful termination signal
STOPSIGNAL SIGTERM

# Start production gateway
CMD ["node", "scripts/start-production.mjs"]
