# Observability and Retention Policy

**Milestone:** MILESTONE 38 — SECURITY AND OPERATIONAL RESILIENCE  
**Phase:** Phase 113 — Observability without query surveillance  
**Status:** Verified & Production Ready  

---

## 1. Principles of Privacy-First Observability

Traditional search engines retain extensive query logs, clickstreams, user identifiers, and IP addresses under the guise of "telemetry" and "performance monitoring." **OpenSearch rejects query surveillance.**

The OpenSearch observability subsystem operates under strict privacy invariants:
1. **Zero Query Surveillance:** Raw search query text (`q`, `query`), phrases, or search terms are **never** included in log messages, metrics names, or Prometheus label values.
2. **Strictly Low-Cardinality Labels:** Metric labels are constrained to a predefined, bounded set of operational dimensions (`method`, `path`, `status`, `provider`, `mode`, `code`, `queue`, `le`).
3. **Route Normalization:** Dynamic URL parameters (such as `/api/v1/lenses/custom_123`) are normalized to canonical templates (`/api/v1/lenses/:id`). Unmatched paths are categorized as `/other`, preventing high-cardinality label explosions or query leakage.
4. **URL & Credential Redaction:** Any measured or logged URL automatically has sensitive parameters (`q`, `query`, `search`, `token`, `key`, `password`, `secret`, `auth`, `apikey`) redacted or stripped.
5. **IP Anonymization:** Client IP addresses are truncated to `/24` (IPv4) and `/48` (IPv6) before logging and are **never** emitted as metric labels.

---

## 2. Operational Metrics Catalog

Metrics are exposed via the standard Prometheus text exposition format (version 0.0.4) at `GET /metrics`. Clients requesting `Accept: application/json` receive an identical structured JSON snapshot.

### A. HTTP Request & Latency Metrics
- `opensearch_http_requests_total`: Counter tracking total processed requests.
  - **Labels:** `method` (e.g. `GET`), `path` (normalized canonical route), `status` (HTTP status code).
- `opensearch_http_request_duration_seconds`: Histogram tracking end-to-end request latency.
  - **Buckets:** `0.005`, `0.01`, `0.025`, `0.05`, `0.1`, `0.25`, `0.5`, `1.0`, `2.5`, `5.0`, `10.0`.
  - **Labels:** `method`, `path`.

### B. Search Pipeline & Result Counts
- `opensearch_search_queries_total`: Counter tracking search operations partitioned by privacy mode.
  - **Labels:** `mode` (`standard` vs `local_only`).
- `opensearch_search_pipeline_duration_seconds`: Histogram measuring internal search pipeline execution time.
  - **Labels:** `mode`.
- `opensearch_search_results_count`: Histogram of the number of search results returned per query.
  - **Buckets:** `0`, `1`, `5`, `10`, `20`, `50`, `100`.

### C. Search Provider Health & Resiliency
- `opensearch_provider_requests_total`: Counter tracking outbound requests to search providers.
  - **Labels:** `provider` (e.g. `wikimedia`), `status` (`success`, `failure`, `cached`, `timeout`).
- `opensearch_provider_request_duration_seconds`: Histogram of external provider response latencies.
  - **Labels:** `provider`.
- `opensearch_provider_circuit_breaker_state`: Gauge tracking upstream circuit breaker state.
  - **Values:** `0` (CLOSED / Healthy), `1` (HALF-OPEN / Trial), `2` (OPEN / Tripped).
  - **Labels:** `provider`.

### D. Index Status & Storage Health
- `opensearch_index_documents_total`: Gauge representing the total number of indexed documents in the inverted index.
- `opensearch_index_terms_total`: Gauge representing the total unique vocabulary term count.
- `opensearch_index_segments_total`: Gauge representing the active index segments.

### E. Queue Depths & Background Processing
- `opensearch_queue_depth`: Gauge tracking pending items in asynchronous processing queues.
  - **Labels:** `queue` (`crawl`, `feedback_review`).

### F. Errors & Diagnostics
- `opensearch_errors_total`: Counter recording error responses grouped by standardized error codes.
  - **Labels:** `code` (`RATE_LIMITED`, `NOT_FOUND`, `VALIDATION_ERROR`, `UNAUTHORIZED`, `SERVICE_UNAVAILABLE`, `INTERNAL_ERROR`), `path`.

### G. Runtime & Memory
- `opensearch_process_uptime_seconds`: Gauge of process uptime.
- `opensearch_memory_heap_used_bytes`: Gauge of V8 heap memory used.
- `opensearch_memory_heap_total_bytes`: Gauge of V8 heap memory allocated.
- `opensearch_memory_rss_bytes`: Gauge of process resident set size.

---

## 3. Data Retention & Deletion Policy

| Data Type | Storage Medium | Retention Duration | Deletion / Pruning Mechanism |
|:---|:---|:---|:---|
| **Prometheus Metrics** | Process Memory (RAM) | Lifetime of Process | Ephemeral: Automatically discarded when process terminates or restarts. No disk persistence. |
| **Operational Logs** | stdout / Console Stream | Ephemeral / Operator Discretion (Recommended $\le$ 14 days) | No disk storage by OpenSearch runtime. If ingested by external log aggregators (e.g. Vector, Promtail), retention must be bounded to 14 days maximum. |
| **Search Queries** | Transient Event Loop | 0 seconds (Immediate drop) | Queries are processed entirely in volatile memory and discarded once response serialization completes. |
| **Client IP Addresses** | Transient Socket | Truncated to `/24` or `/48` | Last octet zeroed in memory before logging. Never stored or persisted. |
| **User Feedback Queue** | Local SQLite / JSON file | 30 days maximum | Expired feedback items are automatically pruned upon queue maintenance sweeps. |

---

## 4. Privacy Review Sign-Off

- **Review Date:** 2026-10-29  
- **Reviewer:** OpenSearch Core Security & Privacy Review Board  
- **Findings:**
  1. *Search History Reconstruction:* **IMPOSSIBLE**. Neither metric labels nor structured logs contain raw query strings, search tokens, or search-bearing URLs.
  2. *User Profiling:* **IMPOSSIBLE**. No user identifiers, session cookies, browser fingerprints, or client IP addresses are collected in telemetry.
  3. *High-Cardinality Denial-of-Service:* **MITIGATED**. All metric paths pass through `normalizeRoutePath()`, mapping arbitrary URLs and dynamic IDs to static route templates or `/other`.
  4. *Conclusion:* Approved for production use.
