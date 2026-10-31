# OpenSearch Web — Release Packaging, Schema Migration & Rollback Guide

**Milestone:** MILESTONE 40 — DEPLOYMENT AND CONTAINER SUPPORT  
**Phase:** Phase 120 — Release packaging and rollback  
**Status:** Authoritative Operational Runbook  

---

## 1. Release Versioning & Build Traceability

OpenSearch Web follows the [Semantic Versioning 2.0.0 (SemVer)](https://semver.org/) specification:

- **`MAJOR` (e.g. `2.0.0`):** Incompatible architectural changes, major breaking storage schema redesigns, or breaking API contract overhauls.
- **`MINOR` (e.g. `1.5.0`):** Backward-compatible feature additions, new search operators, or non-destructive storage enhancements.
- **`PATCH` (e.g. `1.4.1`):** Backward-compatible security hardening, bug fixes, or performance optimizations.

### Build Traceability Introspection
Every running instance exposes traceable release metadata via standard endpoints:

```bash
# Query release metadata from the API
curl -s http://localhost:3000/api/v1/release | jq
```

*Sample Response:*
```json
{
  "status": "ok",
  "release": {
    "version": "1.4.0",
    "productName": "OpenSearch Web",
    "canonicalName": "OpenSearch",
    "timestamp": "2026-10-31T14:15:00.000Z",
    "nodeRuntime": "v20.18.0",
    "gitRevision": "6622059",
    "isRepeatableBuild": true,
    "isPublishProtected": true,
    "defaultSchemaVersion": 1,
    "supportedDeploymentModes": ["local-first", "self-hosted", "serverless", "cluster"],
    "guarantees": {
      "zeroPaidServices": true,
      "zeroSecretsRequired": true,
      "localPathAvailable": true
    }
  }
}
```

---

## 2. Repeatable Build Procedures

To build a bit-for-bit reproducible release from a clean checkout:

```bash
# 1. Fetch official release tag
git fetch --tags
git checkout v1.4.0

# 2. Enforce clean, deterministic dependency installation
npm ci

# 3. Compile composite TypeScript packages & web assets
npm run build

# 4. Run automated test suite
npm test
```

---

## 3. Storage Schema Migrations & Invariants

OpenSearch Web features a resilient schema migration engine (`packages/storage/src/migration/`):

### Invariant: Failed upgrades never silently destroy the previous index
Before any destructive change or schema migration is applied to the database:
1. **Pre-flight Integrity Verification:** The storage subsystem runs `verifyStorageIntegrity(storageDir)` to ensure existing database files are not corrupted.
2. **Automated Atomic Backup:** A timestamped snapshot is created in `<storageDir>/backups/pre-migration-v<version>-<timestamp>` with SHA-256 manifests.
3. **Transactional Execution:** Migrations execute sequentially.
4. **Post-Validation:** Validates that new collections and indexes match expected schemas.
5. **Automated Rollback on Error:** If any step fails or throws an exception, the system **automatically aborts and restores the pre-migration backup**, leaving the existing index completely intact and untainted.

---

## 4. Operational Rollback Runbooks

### Runbook A: Rolling Back a Container Release

If a newly deployed container image exhibits regressions:

```bash
# Step 1: Stop the current running container
docker compose down

# Step 2: Checkout the previous known-good tag
git checkout v1.4.0

# Step 3: Rebuild the known-good container image
docker compose build

# Step 4: Launch the previous version with existing persistent volume intact
docker compose up -d

# Step 5: Verify container health
docker compose ps
curl -s http://localhost:3000/health
```
*Note: The named persistent volume `opensearch_data` is preserved and immediately reattached.*

---

### Runbook B: Rolling Back a Storage Schema Migration

If a schema migration must be manually reverted to an earlier snapshot:

```typescript
import { rollbackSchemaMigration } from '@opensearch/storage';

const result = await rollbackSchemaMigration({
  storageDir: './data/storage',
  targetVersion: 1, // Rollback to schema version 1
});

console.log(`Rollback completed: Success=${result.success}, CurrentVersion=${result.currentVersion}`);
```

---

## 5. Registry Publication Safety Policy

To prevent unintended distribution of private monorepo packages:

1. **Monorepo Protection (`"private": true`):** All 9 workspace packages (`packages/*`, `apps/*`, and root `package.json`) are configured with `"private": true`. `npm publish` is rejected at the npm client level.
2. **Pre-Publish Safety Guard (`scripts/publish-guard.mjs`):** The root `prepublishOnly` hook blocks any publish attempt unless explicitly authorized via:
   ```bash
   ALLOW_PUBLISH=true npm publish
   ```
3. **Container Registry Protection:** Docker images are tagged locally (`opensearch-web:latest`) and are never pushed to remote registries without explicit user credentials and explicit invocation.
