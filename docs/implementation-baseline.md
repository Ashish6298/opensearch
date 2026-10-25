# OpenSearch Implementation Baseline & Architecture Inventory

**Milestone:** 26 — Repository Audit and Baseline  
**Phase:** 66 — Repository and Architecture Inventory  
**Target:** OpenSearch Engine Monorepo  
**Status:** Completed & Verified  
**Date:** October 2026  

---

## 1. Executive Summary & Monorepo Topology

OpenSearch is a privacy-first, self-hostable search engine engineered in native TypeScript with strict zero-external-dependency constraints. The monorepo uses npm workspaces (`apps/*`, `packages/*`) running on Node.js 20+ with TypeScript 5.7+ project references (`tsc -b`).

### Workspace Manifest & Roles

| Package / Application | Directory | Purpose | Primary Dependencies |
| :--- | :--- | :--- | :--- |
| `@opensearch/shared` | `packages/shared` | Core constants, environment parsing, structured JSON logger, error taxonomy, IP anonymization, privacy receipt utilities. | Zero external dependencies; Node.js built-ins (`node:crypto`, `node:path`, `node:url`). |
| `@opensearch/storage` | `packages/storage` | File-backed atomic JSON storage adapters for documents, URLs, crawls, index metadata, and Variable-Byte (VByte) posting list compression. | `@opensearch/shared`, Node.js `node:fs`, `node:crypto`. |
| `@opensearch/crawler` | `packages/crawler` | Polite web crawler with persistent FIFO queue, RFC 9309 robots parser, XML/Gzip sitemap ingestion, SSRF DNS/IP guard, and multi-worker pool. | `@opensearch/shared`, `@opensearch/storage`, Node.js `node:dns`, `node:zlib`. |
| `@opensearch/indexer` | `packages/indexer` | Inverted index, Unicode tokenizer, accent folder, stop words filter, BM25 length statistics, and prefix-trie autocomplete index. | `@opensearch/shared`, Node.js `node:fs`. |
| `@opensearch/ranking` | `packages/ranking` | Query parsing, boolean/site/filetype filters, synonym expansion, typo correction, BM25 multi-field scoring, authority/freshness decay, snippet generation, and zero-API instant answers. | `@opensearch/shared`, `@opensearch/indexer`. |
| `@opensearch/cli` | `packages/cli` | Standalone terminal CLI client (`opensearch` binary) with formatted table outputs, interactive queries, and health probes. | `@opensearch/shared`. |
| `@opensearch/api` | `apps/api` | Production HTTP REST API server with custom router, sliding-window rate limiting, OpenAPI 3.1.0 specification, `/docs` playground, SSE streaming, and hybrid external search fallback. | `@opensearch/shared`, `@opensearch/indexer`, `@opensearch/ranking`. |
| `@opensearch/web` | `apps/web` | Zero-dependency terminal-aesthetic web frontend, server-side HTML rendering, Vim keyboard navigation, 5 CRT themes, and client-side instant answer rendering. | `@opensearch/shared`. |
| `api/index.js` | Root `api/` | Vercel Serverless Function entrypoint integrating API and Web servers with warm seed corpus index. | `@opensearch/api`, `@opensearch/web`, `@opensearch/crawler`, `@opensearch/indexer`. |

---

## 2. Complete Search & Indexing Lifecycle

### 2.1 Complete Search Request Lifecycle

```
[User Browser / CLI]
       │
       ▼ (GET /api/v1/search?q=...&page=1&pageSize=10&explain=true)
[apps/api Router & Middleware Stack]
       │  ├── 1. Request logging with IP anonymization (IPv4 /24, IPv6 /48)
       │  ├── 2. In-Memory Sliding-Window Rate Limiter (MemoryRateLimiter)
       │  └── 3. CORS & Security headers injection (HSTS, CSP, X-Frame-Options)
       ▼
[apps/api/src/routes.ts: handleSearch]
       │  ├── Check LRU Query Cache (HIT -> Return cached payload with X-Cache: HIT)
       │  └── MISS: Proceed to query evaluation
       ▼
[Instant Answers Engine (@opensearch/ranking)]
       │  ├── Bang shortcuts (!w, !gh, !yt)
       │  ├── Math calculations & Symbolic LaTeX solver
       │  ├── Conversions (units, currencies, crypto, timezones, epoch, colors)
       │  ├── Developer cheatsheets & Network subnet/CIDR calculators
       │  └── Knowledge Graph entity info-cards
       ▼
[Query Parsing & Normalization (@opensearch/ranking)]
       │  ├── Strip diacritics, lowercase, extract boolean operators (+, -)
       │  ├── Extract field filters (site:, filetype:, intitle:, inurl:)
       │  ├── Expand query terms via Synonym Engine
       │  └── Generate Levenshtein distance suggestions ("Did You Mean")
       ▼
[Candidate Retrieval (@opensearch/ranking)]
       │  ├── Look up postings in MemoryInvertedIndex dictionary
       │  ├── Apply Boolean filtering (intersect required, remove negated)
       │  └── Filter by URL domain (site:) or extension (filetype:)
       ▼
[Relevance Ranking Engine (@opensearch/ranking)]
       │  ├── Okapi BM25 across fields (title: 3.0, headings: 2.0, description: 1.5, body: 1.0)
       │  ├── Title match & exact phrase match multipliers
       │  ├── Freshness score decay (exponential half-life: 30 days)
       │  ├── Domain authority trust tiers (.gov, .edu, curated developer domains)
       │  ├── Host clustering & duplicate penalization
       │  └── Detailed score explanation synthesis (if explain=true)
       ▼
[External Web Search Hybrid Fallback (apps/api/src/external-search.ts)]
       │  └── TRIGGER: page === 1 AND non-test env AND local hits < pageSize
       │        ├── Google Suggest endpoint (suggestqueries.google.com)
       │        ├── DuckDuckGo HTML scraping fallback (html.duckduckgo.com)
       │        └── DuckDuckGo Instant Answers API (api.duckduckgo.com)
       ▼
[Snippet Generation & Highlighting (@opensearch/ranking)]
       │  ├── Dynamic sliding window centering on high-density query terms
       │  ├── HTML sanitization & <mark> term highlighting
       │  └── Clean word-boundary truncation with ellipsis
       ▼
[JSON Response Delivery & LRU Cache Insertion]
```

### 2.2 Crawling & Indexing Lifecycle

```
[Seed Corpus / URL Injection]
       │
       ▼
[PersistentCrawlQueue (@opensearch/crawler)]
       │  ├── Normalization (RFC 3986, lowercased hostname, strip fragment)
       │  ├── URL Fingerprinting (SHA-256 / SHA-1)
       │  ├── Seen URLs deduplication set
       │  └── Disk persistence (queue-data.json, seen-urls.json)
       ▼
[Robots & Security Gate]
       │  ├── SSRF Guard: Syntactic check + DNS resolution (rejects 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, ::1)
       │  ├── RobotsPolicyService: Fetch & parse robots.txt (respects Disallow, Allow, Crawl-delay)
       │  └── SlidingWindowRateLimiter: Per-host politeness rate limiting
       ▼
[NodeFetcher / WorkerPool (@opensearch/crawler)]
       │  ├── HTTP conditional recrawl (ETag / If-None-Match, Last-Modified / If-Modified-Since)
       │  ├── HTTP 304 Not Modified fast-path
       │  └── Max response size cap & strict timeout enforcement
       ▼
[HTML Parser & Text Cleaner (@opensearch/crawler)]
       │  ├── Strip scripts, styles, comments, navigation boilerplate
       │  ├── Extract title, meta description, H1-H6 headings, clean body
       │  └── Extract and normalize candidate outbound URLs -> Enqueue
       ▼
[DocumentProcessor (@opensearch/indexer)]
       │  ├── Unicode tokenization & diacritic accent folding
       │  ├── Stop word removal
       │  └── Field-level term frequency & positional tracking
       ▼
[MemoryInvertedIndex (@opensearch/indexer)]
       │  ├── In-memory posting list updates
       │  ├── Document length statistics & corpus metadata updates
       │  └── Atomic disk serialization (index-data.json.tmp -> index-data.json)
```

---

## 3. Subsystem Architecture & Implementation Inventory

### 3.1 Inverted Index & Tokenization
- **Inverted Index Implementation:** `packages/indexer/src/index/inverted-index.ts` (`MemoryInvertedIndex`).
  - Term Dictionary: `Map<string, PostingList>` mapping normalized term to posting list.
  - Postings: Each posting records `documentId`, `termFrequency`, `fieldTermFrequencies: Record<FieldName, number>`, and `fieldPositions: Record<FieldName, number[]>`.
  - Document Store: `Map<string, IndexedDocumentMeta>` maintaining document metadata and field token lengths.
  - Serialization: Serializes full index to `index-data.json` via atomic rename (`index-data.json.tmp` -> `index-data.json`).
- **Tokenization Pipeline:** `packages/indexer/src/pipeline/tokenizer.ts`.
  - Unicode regex `[\p{L}\p{N}]+/gu` matching contiguous letter/number sequences.
  - Accent stripping via `normalizer.ts` (`normalize('NFD').replace(/[\u0300-\u036f]/g, '')`).
  - Stopword filtering using curated standard stopword dictionary (`stop-words.ts`).
  - Sequential token positions and character offsets recorded for positional and phrase queries.

### 3.2 BM25/BM25F Scoring & Ranking
- **BM25 Implementation:** `packages/ranking/src/scorer/bm25-scorer.ts` (`BM25Scorer`).
  - Okapi BM25 formula with Robertson-Spärck Jones IDF:
    $$\text{IDF}(q_i) = \ln\left(1 + \frac{N - n(q_i) + 0.5}{n(q_i) + 0.5}\right)$$
  - Parameters: $k_1 = 1.2$, $b = 0.75$.
  - Multi-field weighting boosts:
    - Title: $3.0$
    - Headings: $2.0$
    - Description: $1.5$
    - Body: $1.0$
- **Ranking Engine:** `packages/ranking/src/scorer/ranking-engine.ts` (`DefaultRankingEngine`).
  - Computes composite document scores combining:
    - Multi-field BM25 score
    - Exact full-query match multiplier ($1.25\times$)
    - Exact quoted phrase match multiplier ($1.5\times$)
    - URL/slug match bonus ($+0.35$)
    - Temporal freshness decay bonus ($+0.10 \times \text{freshness}$)
    - Domain authority trust bonus ($+0.10 \times \text{authority}$)
    - Near-duplicate and domain clustering penalty ($0.8^{\text{count}}$ per additional host result)

### 3.3 PageRank Reality Audit
- **Audit Finding:** **PageRank is NOT calculated over the web link graph in the current implementation.**
  - `packages/ranking/src/scorer/authority-scorer.ts` provides a `blendScores` method that accepts an optional `pageRank` argument defaulting to `0.5`.
  - In `packages/ranking/src/scorer/ranking-engine.ts`, PageRank is never computed or populated from link topology; the ranking engine relies solely on BM25, freshness exponential decay, and curated domain authority heuristics (`TRUSTED_DOMAIN_TIERS` for `.edu`, `.gov`, `.org`, and known developer platforms).
  - PageRank calculation over crawled link graphs remains a theoretical roadmap placeholder.

### 3.4 VByte and Positional Index Behavior
- **VByte Compression:** Implemented in `packages/storage/src/compression/vbyte-compression.ts` (`VByteCompressor`).
  - Lossless Delta (gap) integer encoding (`deltaEncode`, `deltaDecode`).
  - 7-bit continuation byte packing into native `Uint8Array` binary payloads (`encodeVarints`, `decodeVarints`).
  - Supports compact serialization for document IDs, frequencies, and positions.
  - **Audit Finding:** The VByte compressor is currently an isolated module in `@opensearch/storage`. The primary `MemoryInvertedIndex.save()` method still serializes postings directly to formatted JSON (`index-data.json`). VByte binary storage has not yet been wired into the primary index file persistence path.
- **Positional Indexing:** `Posting.fieldPositions` stores token positions in-memory for each document field. `RankingEngine` inspects these positions to verify exact adjacency for quoted phrase queries.

### 3.5 Server-Sent Events (SSE) Streaming & Explain Plan
- **SSE Streaming:** `apps/api/src/routes.ts` (`handleSearchStream`) exposed at `GET /api/v1/search/stream`.
  - Headers: `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`.
  - Event Sequence:
    1. `event: answer` — Emits evaluated zero-click instant answer immediately if matched.
    2. `event: results` — Emits local candidate retrieval and BM25 ranked document hits.
    3. `event: done` — Emits completion metrics (total hits, candidate count, durationMs, timestamp).
    4. Client disconnect handling: listends to `req.raw.on('close')` and terminates stream immediately.
  - **Audit Finding:** SSE streaming only evaluates local index results and instant answers; it does NOT invoke external web fallbacks.
- **Explain Plan:** Activated via `explain=true` (or `explain=1`) query parameter on `GET /api/v1/search`.
  - Emits detailed `ScoreExplanation` per document hit:
    - `bm25Score`: Raw Okapi BM25 score.
    - `termBreakdowns`: Term-by-term IDF, TF, and field contribution.
    - `fieldScoreSums`: Score aggregate by field (title, headings, description, body).
    - `fullMatchMultiplier`, `phraseMultiplier`, `urlBonus`, `freshnessBonus`, `authorityBonus`, `duplicatePenalty`.
    - `finalScore`: Final combined ranking score.
    - Meta flag: `meta.explainPlan: true`.

### 3.6 Security Mechanisms & Abuse Protection
- **SSRF Guard:** `packages/crawler/src/fetcher/ssrf-guard.ts` (`ssrfCheck`).
  - Syntactic inspection against private/reserved IPv4 and IPv6 CIDRs (RFC 1918, RFC 3927, RFC 4193, loopback `127.0.0.0/8`, link-local, carrier-grade NAT).
  - Asynchronous DNS resolution via `node:dns/promises` (`dns.lookup({ all: true })`) to prevent DNS rebinding attacks and DNS SSRF.
  - Validates initial target URL and is explicitly re-checked on **every** HTTP redirect hop before following.
- **Robots Policy Compliance:** `packages/crawler/src/robots/robots-policy-service.ts`.
  - Conforms to RFC 9309 (Robots Exclusion Standard).
  - Fetches `/robots.txt` using SSRF-guarded fetcher with bounded size (64 KB) and timeout.
  - Honors `User-agent: *` and `User-agent: OpenSearchBot`.
  - Respects `Disallow`, `Allow`, and `Crawl-delay` directives.
  - In-memory cache with configurable TTL (default 24 hours).
- **Rate Limiting:**
  - API Layer: `apps/api/src/rate-limiter.ts` (`MemoryRateLimiter`). In-memory sliding-window bucket limiter per client IP. Returns HTTP 429 with standard `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers.
  - Crawler Layer: `packages/crawler/src/worker/worker-pool.ts` (`SlidingWindowRateLimiter`). Per-host rate limiter enforcing max requests/sec and minimum inter-request delay (200ms default), integrated with `Crawl-delay` from `robots.txt`.
  - **Audit Finding:** Both rate limiters reside exclusively in process memory (`Map` data structures). State is cleared upon process restart.
- **IP Anonymization:** `packages/shared/src/privacy/index.ts` (`anonymizeIpAddress`).
  - Truncates IPv4 addresses by masking the last octet (e.g., `192.168.1.150` -> `192.168.1.0`, `/24` prefix).
  - Truncates IPv6 addresses by masking host bits (e.g., `2001:0db8:85a3:...` -> `2001:0db8:85a3::`, `/48` prefix).
  - Applied in `apps/api/src/middlewares.ts` before logging request metadata. Raw IP addresses are never written to disk or logs.

---

## 4. Comprehensive Inventory of Outbound Network Requests

A critical requirement of Phase 66 is tracing every network call initiated by both browser and backend.

### 4.1 Backend Outbound Requests

| Calling Module | Target URL / Protocol | Trigger / Condition | Method / Payload | Data Sent | Classification |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `apps/api/src/external-search.ts` | `https://suggestqueries.google.com/complete/search?client=chrome&q=${query}` | `page === 1` AND `NODE_ENV !== 'test'` AND local results < `pageSize` | `GET`, Chrome User-Agent, 2500ms timeout | Raw user query string | **Undocumented Fallback (Google Suggest)** |
| `apps/api/src/external-search.ts` | `https://html.duckduckgo.com/html/?q=${query}` | `page === 1` AND `NODE_ENV !== 'test'` AND local results < `pageSize` | `GET`, Chrome User-Agent, 3500ms timeout | Raw user query string | **Brittle Fallback (DuckDuckGo HTML Scraping)** |
| `apps/api/src/external-search.ts` | `https://api.duckduckgo.com/?q=${query}&format=json&no_html=1` | `page === 1` AND `NODE_ENV !== 'test'` AND local results < `pageSize` | `GET`, `User-Agent: Mozilla/5.0`, 2500ms timeout | Raw user query string | External Fallback (DDG Instant Answers API) |
| `packages/crawler/src/fetcher/ssrf-guard.ts` | OS DNS Resolver (UDP/TCP 53) via `node:dns/promises` | SSRF verification of crawl target host | DNS A / AAAA lookup | Target hostname | Legitimate Security Check |
| `packages/crawler/src/robots/robots-fetcher.ts` | `${origin}/robots.txt` | Before crawling new origin | `GET`, `User-Agent: OpenSearchBot/1.0` | Target domain path | Legitimate Crawler Politeness |
| `packages/crawler/src/sitemap/sitemap-service.ts` | `${origin}/sitemap.xml` | Sitemap discovery for host | `GET`, `User-Agent: OpenSearchBot/1.0` | Target domain path | Legitimate Crawl Seed Ingestion |
| `packages/crawler/src/fetcher/node-fetcher.ts` | Target Web Page URLs | Crawl queue dequeue | `GET`, `User-Agent: OpenSearchBot/1.0` | Target URL path, optional ETag/Last-Modified | Core Web Crawler Operation |
| `packages/cli/src/cli.ts` | Configured OpenSearch API (default `http://localhost:3001`) | CLI command execution | `GET` to `/health`, `/api/v1/suggest`, `/api/v1/search` | Query string to local API | Local API Management |

### 4.2 Browser Frontend Outbound Requests

| Calling Module | Target Endpoint | Trigger / Condition | Method | Data Sent | Classification |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `apps/web/src/app.js` | `/api/v1/search?q=...&page=...` | Form submission or pagination click | `GET` | User query, page number | First-party host API request |
| `apps/web/src/app.js` | `/api/v1/suggest?q=...&limit=6` | Search input change (debounced 150ms) | `GET` | Partial query prefix | First-party host API request |

**Key Privacy Verification:** The browser client initiates **zero** external requests to third-party CDNs, analytics providers, tracking pixels, or third-party search engines. All assets (`style.css`, `app.js`) and endpoints are hosted strictly first-party.

---

## 5. Storage, State & Memory Architecture

| State Category | Subsystem | Storage Mechanism | Persistence / Lifetime | File System Location |
| :--- | :--- | :--- | :--- | :--- |
| Document Records | `@opensearch/storage` | `JsonFileStorageAdapter` | Atomic disk write via `.tmp` rename | `./data/documents.json` |
| URL Records | `@opensearch/storage` | `JsonFileStorageAdapter` | Atomic disk write via `.tmp` rename | `./data/urls.json` |
| Crawl State | `@opensearch/storage` | `JsonFileStorageAdapter` | Atomic disk write via `.tmp` rename | `./data/crawls.json` |
| Inverted Index | `@opensearch/indexer` | `MemoryInvertedIndex` | In-memory `Map`; optional atomic JSON dump | `./data/index/index-data.json` |
| Prefix Trie (Suggest) | `@opensearch/indexer` | `PrefixTrie` | In-memory tree rebuilt during indexing | In-memory only |
| Crawl Queue | `@opensearch/crawler` | `PersistentCrawlQueue` | In-memory queue + JSON persistence | `<persistenceDir>/queue-data.json` |
| Seen URLs Set | `@opensearch/crawler` | `PersistentCrawlQueue` | In-memory `Set` + JSON persistence | `<persistenceDir>/seen-urls.json` |
| Robots Rule Cache | `@opensearch/crawler` | `RobotsCache` | In-memory `Map` with TTL | In-memory only |
| API Rate Limiter | `@opensearch/api` | `MemoryRateLimiter` | In-memory `Map` with periodic sweep | In-memory only |
| Crawler Rate Limiter | `@opensearch/crawler` | `SlidingWindowRateLimiter` | In-memory `Map` | In-memory only |
| Query LRU Cache | `@opensearch/api` | LRU Cache (`@opensearch/ranking`) | In-memory bounded cache (default 1000 items) | In-memory only |
| Serverless Deployment | `api/index.js` (Vercel) | In-memory singleton | Ephemeral function container lifetime | In-memory warmed from seed corpus |

---

## 6. Test Suite Inventory & Baseline Mapping

The repository includes 50 test files across all workspaces.

### 6.1 Test Suite Breakdown by Package

| Package / App | Test Directory | Test Files | Primary Focus Areas |
| :--- | :--- | :---: | :--- |
| `packages/shared` | `packages/shared/tests` | 6 | Config parsing, errors, logger, privacy audit, utilities, project identity. |
| `packages/storage` | `packages/storage/tests` | 3 | Document repository, URL repository, crawl/index integration. |
| `packages/crawler` | `packages/crawler/tests` | 14 | URL validation, normalizer, fingerprinting, HTML parser, fetcher, SSRF guard, robots parser, robots service, sitemaps, queue, orchestrator, recrawl, crawler security, efficiency. |
| `packages/indexer` | `packages/indexer/tests` | 9 | Normalizer, tokenizer, prefix trie, document processor, inverted index, index builder, seed corpus, end-to-end pipeline, release benchmark. |
| `packages/ranking` | `packages/ranking/tests` | 8 | Query parser, candidate retriever, ranking engine, result generator, typo corrector, instant answers, performance optimization, quality evaluation. |
| `packages/cli` | `packages/cli/tests` | 1 | Terminal CLI commands, formatting, option parsing. |
| `apps/api` | `apps/api/tests` | 7 | Search API server, routes, rate limiter, OpenAPI docs, security audit, deployment preparation, Vercel deployment. |
| `apps/web` | `apps/web/tests` | 2 | Web server, terminal UI template, accessibility, cross-environment compatibility. |
| **Total** | | **50** | **521 Total Tests** |

### 6.2 Pre-Existing Test Failures (Version Assertion Mismatches)

Execution of `npm test` across the repository yields:
- **Total Test Files:** 50 (46 passing, 4 failing)
- **Total Tests:** 521 (515 passing, 6 failing)

The 6 failures are:
1. `apps/api/tests/api.test.ts`: Server status test asserts `version` equals `'1.2.0'`, but receives `'1.4.0'`.
2. `apps/web/tests/web.test.ts`: Web status test asserts `version` equals `'1.2.0'`, but receives `'1.4.0'`.
3. `packages/indexer/tests/v1-2-0-release-benchmark.test.ts`: Test 1 asserts `identity.version` equals `'1.2.0'`, but receives `'1.4.0'`.
4. `packages/indexer/tests/v1-2-0-release-benchmark.test.ts`: Test 2 asserts OpenAPI version equals `'1.2.0'`, but receives `'1.4.0'`.
5. `packages/indexer/tests/v1-2-0-release-benchmark.test.ts`: Test 3 asserts docs HTML contains `'v1.2.0'`, but receives `'v1.4.0'`.
6. `packages/shared/tests/shared.test.ts`: Test asserts `PROJECT_VERSION` equals `'1.2.0'`, but receives `'1.4.0'`.

**Conclusion:** All 6 failures are legacy hardcoded string assertions from v1.2.0 release gates that were not updated when the project version bumped to v1.4.0 in `packages/shared/src/constants.ts` and `package.json`. No functional or architectural regressions exist. These will be formally resolved in Phase 67.

---

## 7. Strategic Findings for Upcoming Phases

1. **Phase 69–70 (Provider Interface & Removing Brittle Scraping):**
   - `apps/api/src/external-search.ts` contains direct calls to `suggestqueries.google.com` (Google Suggest) and regular-expression scraping of `html.duckduckgo.com`.
   - These violate project principles (brittle HTML scraping, undocumented interfaces, sending raw queries to third-party endpoints).
   - Milestone 27 will replace these with typed, permitted, documented data providers (Wikimedia, Stack Exchange, arXiv, etc.) and isolate them behind the provider interface.
2. **Phase 73–74 (Index Storage & Compression):**
   - `VByteCompressor` is fully implemented in `packages/storage/src/compression/vbyte-compression.ts`, but `MemoryInvertedIndex` still writes uncompressed JSON to `index-data.json`.
   - Milestone 28 will wire VByte and Delta compression directly into the index persistence layer.
3. **PageRank Link Topology:**
   - Real PageRank computation is missing; `AuthorityScorer` uses a default `0.5` placeholder and domain heuristics. Link graph calculation can be planned when crawl corpus scales.
4. **Readiness for Phase 67:**
   - The architecture and inventory are completely mapped.
   - All outbound network calls, storage backends, and security mechanisms are identified.
   - Pre-existing test discrepancies are isolated and understood.
   - The repository is fully ready to proceed to **Phase 67 — Baseline tests and measurements**.
