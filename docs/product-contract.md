# OpenSearch Product Requirements & Search Contract

**Document Version:** 1.0.0  
**Milestone:** 26 — Repository Audit and Baseline  
**Phase:** 68 — Product Requirements and Privacy Contract  
**Status:** Approved Architectural Specification  
**Date:** October 2026  

---

## 1. Product Vision & Principles

OpenSearch is an independent, privacy-first web search engine engineered for everyday use with developer-grade systems under the hood. It delivers fast, reliable search without tracking, profiling, surveillance advertising, or mandatory paid third-party dependencies.

### Core Non-Negotiable Principles

1. **Independent Retrieval Substrate:** OpenSearch operates its own crawler (`@opensearch/crawler`), inverted index (`@opensearch/indexer`), and BM25 relevance ranking engine (`@opensearch/ranking`). It is not an opaque proxy or meta-search wrapper.
2. **Verifiable Privacy:** Privacy claims must match actual wire behavior. The Privacy Receipt provides cryptographic and operational transparency for every query.
3. **Zero Mandatory Paid APIs:** Core local development, crawling, indexing, and search must remain 100% operational on commodity hardware with zero cloud subscriptions or API keys.
4. **Data Minimization by Default:** Zero tracking cookies, zero user profiling databases, zero persistent query logs correlated with user identity, and mandatory IP address truncation in operational diagnostics.
5. **No Unsupported Promises:** Documentation must never promise capabilities that are not implemented or technically verifiable.

---

## 2. Target User Personas & Primary Search Journeys

| User Persona | Core Needs | Primary Search Journey | OpenSearch Feature Alignment |
| :--- | :--- | :--- | :--- |
| **Everyday User** | Fast answers, general web lookup, news, reference, weather, conversions, definitions. | Types natural queries (e.g., `"weather forecast"`, `"how to make sourdough"`, `"100 usd to eur"`). Expects relevant snippets and immediate instant answers without ads. | Clean UI, instant answer cards, typo tolerance ("Did you mean"), high-salience snippets, zero ads. |
| **Developer & Engineer** | Code documentation, API references, library lookups, network tools, syntax syntax. | Searches technical queries with exact syntax (e.g., `site:github.com rust`, `!gh react`, `subnet 192.168.1.0/24`, `solve 2x + 4 = 10`). | Bang shortcuts (`!gh`, `!npm`, `!so`), regex/quoted phrase filters, cheatsheet engine, network/crypto calculators, CLI (`opensearch`). |
| **Student & Educator** | Academic papers, encyclopedic summaries, mathematical derivations, historical timelines. | Queries scientific terms, authors, or topics (e.g., `"machine learning survey filetype:pdf"`, `"integrate x^2"`). | Math solver, knowledge entity cards, arXiv/academic crawl corpus, clean word-boundary snippets. |
| **Privacy-Conscious User** | Zero data harvesting, absolute privacy assurance, local-only search capability. | Executes personal or sensitive queries with assurance that no third party receives query text. | **Local-only mode**, Privacy Receipt, IPv4/IPv6 masking, zero-cookie architecture, strict CSP. |
| **Power User / Researcher** | Search operator precision, ranking transparency, custom lenses, explainability. | Uses complex Boolean expressions (`intitle:`, `inurl:`, `-term`, `+term`) and reviews ranking rationale. | Full boolean parser, `explain=true` query scoring breakdowns, ranking parameter customization. |

---

## 3. Search Experience & Feature Tiers

### 3.1 Default Search Experience

The default search interface provides a distraction-free, zero-ad search experience:

1. **Query Bar & Autocomplete:**
   - Real-time prefix suggestions powered by an in-memory Prefix Trie (`/api/v1/suggest`).
   - Debounced (150ms) to prevent keystroke flooding.
   - Fully local computation; no keystrokes are transmitted to commercial ad networks.
2. **Instant Answer Evaluation:**
   - Queries matching deterministic patterns (math expressions, unit conversions, currency conversions, timezone lookups, crypto hashes, network CIDR calculators, developer cheatsheets, bang shortcuts) emit a prominent zero-click card above results.
   - All instant answers are computed locally in-memory with zero remote API latency.
3. **Ranked Web Results:**
   - Multi-field Okapi BM25 scored hits (Title, Headings, Description, Body).
   - High-salience snippets with highlighted matching terms (`<mark>` tags).
   - Domain attribution badge, canonical URL preview, and indexing timestamp.
   - Dot-leader pagination with accessible navigation controls.
4. **Vim & Keyboard Navigation:**
   - Terminal keybindings: `j`/`k` (navigate results), `/` (focus search), `v` (open result), `Esc` (clear/blur), `?` (help modal).

### 3.2 Optional Advanced Capabilities

- **Explain Plan (`explain=true`):** Emits a structured breakdown of BM25 term weights, IDF scores, field contributions, exact match bonuses, and domain authority tiers for every ranked result.
- **SSE Streaming Search (`GET /api/v1/search/stream`):** Real-time Server-Sent Events stream yielding instant answers, candidate results, and completion telemetry over a persistent connection.
- **Standalone Terminal CLI (`@opensearch/cli`):** Full search engine access directly inside developer terminals without a browser.
- **Developer API Reference (`/docs`):** Interactive Swagger/OpenAPI 3.1.0 playground.

---

## 4. Search Modes Specification

OpenSearch formally defines two distinct operational modes:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        OPENSEARCH SEARCH MODES                         │
├───────────────────────────────────┬────────────────────────────────────┤
│ 1. STANDARD MODE (HYBRID)         │ 2. LOCAL-ONLY MODE                 │
├───────────────────────────────────┼────────────────────────────────────┤
│ • Local BM25 Inverted Index       │ • Local BM25 Inverted Index ONLY   │
│ • Local Instant Answer Engines    │ • Local Instant Answer Engines ONLY│
│ • Curated Permitted Web Providers │ • Zero Outbound Network Requests   │
│ • Provenance Retained per Hit     │ • Zero Third-Party Query Dispatch  │
│ • Privacy Receipt Emitted         │ • Privacy Receipt Emitted          │
└───────────────────────────────────┴────────────────────────────────────┘
```

### 4.1 Standard Mode (Hybrid Search)

- **Execution Flow:**
  1. The query is evaluated by the local inverted index and local instant answer engines.
  2. If local index hits are sufficient ($\ge \text{pageSize}$), results are returned immediately without outbound calls.
  3. If local hits are insufficient, the query planner queries permitted, documented search providers (replacing brittle HTML scraping with structured APIs per Milestone 27).
- **Data Transmitted:** Query string is transmitted to designated external provider APIs exclusively to retrieve web results.
- **Privacy Controls:** Outbound provider requests never forward client IP addresses, user identifiers, or browser cookies. Provider requests originate from the OpenSearch host server.

### 4.2 Local-Only Mode

- **Execution Flow:**
  1. The query is evaluated exclusively against the local `MemoryInvertedIndex` and local computation engines.
  2. All external provider requests, remote autocomplete fallbacks, and remote answer modules are strictly disabled.
  3. If local results are fewer than requested `pageSize`, the engine returns available local results accompanied by an honest notification: *"Local-only mode active: limited results found in local index."*
- **Data Transmitted:** **ZERO bytes transmitted to third-party providers.** The query string never leaves the hosting server.
- **Enforcement:** Enforced at the query planner level in `apps/api`, not merely via UI client toggles.

---

## 5. Safe Search, Content Moderation & Source Attribution

### 5.1 Safe Search Policy

OpenSearch implements safe search filtering without behavioral censorship:
- **Strict Mode:** Filters known adult/NSFW domains, explicit keywords, and malicious domains using curated blocklists.
- **Moderate Mode (Default):** Filters explicit images and adult multimedia while allowing adult text reference articles (e.g., medical or educational).
- **Off Mode:** Raw, unfiltered BM25 relevance ranking based strictly on query match.

### 5.2 Source Attribution & Provenance Standards

Every search result item must provide explicit provenance metadata:
- **Source Identifier:** Indicates origin (`"local-index"`, or permitted provider ID e.g., `"wikimedia"`, `"stackexchange"`).
- **Canonical URL:** Direct un-proxied destination URL with `rel="noopener noreferrer"`.
- **Domain Trust Tier:** Visual indication of authoritative official documentation (`.gov`, `.edu`, official documentation).
- **License & Terms:** Where third-party provider data is utilized, required copyright attribution and licensing notices are displayed adjacent to the result snippet.

---

## 6. Data Retention, Reset & Deletion Protocol

1. **Search History Retention:**
   - **Zero User Search History:** OpenSearch does not store, index, or associate user search queries with IP addresses or sessions in any persistent database.
   - **Transient LRU Cache:** Queries are cached in an in-memory LRU cache (`maxSize: 1000`) solely to accelerate identical repeat searches within a 5-minute TTL. No client identifiers are stored in cache keys.
2. **Preference Reset:**
   - Users can reset all local interface preferences (theme, safe search tier, search mode) with a single click.
   - Clearing browser storage completely purges all local configuration.
3. **Server State Flushing:**
   - Restarting the OpenSearch daemon instantly flushes all in-memory rate-limiter buckets and LRU query caches.

---

## 7. Explicit Non-Guarantees (What OpenSearch Does Not Guarantee)

To maintain absolute integrity, OpenSearch explicitly documents its technical boundaries:

1. **Global Web Coverage Parity:** OpenSearch does not guarantee the 50-billion-page index depth of trillion-dollar commercial search giants on a single self-hosted node. Its crawl corpus is curated and focused.
2. **Anonymity from the Hosting Node:** When a user accesses a hosted OpenSearch instance (e.g., a shared public instance), the hosting server necessarily receives the incoming HTTP request and IP packet. Users requiring anonymity from the host must self-host locally or connect via Tor/VPN.
3. **Downstream Website Privacy:** When a user clicks a result link to navigate to a third-party website, OpenSearch strips the HTTP `Referer` header (`rel="noopener noreferrer"`), but OpenSearch cannot control what the destination website logs once the user establishes a direct connection with that destination.
4. **Guaranteed Uptime of Third-Party Fallbacks:** When running in Standard Mode, third-party provider APIs may experience transient outages, rate limits, or latency spikes. OpenSearch isolates these failures gracefully but does not guarantee third-party availability.
