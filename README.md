# OpenSearch (V1.0.0)

> A public, general-purpose, privacy-first web search engine built from scratch.

---

## 1. Project Overview

**OpenSearch** is an independent web search engine built to allow anyone to discover and search the web through a privacy-first, zero-tracking interface backed by its own crawler, inverted index, ranking engine, and search API.

The goal of V1.0.0 is **not** to rival Google-scale data centers, but to establish a genuine, completely functional, and self-hosted search pipeline:

- Crawls publicly permitted web pages safely and politely.
- Indexes page content without third-party search APIs.
- Normalizes and processes user queries deterministically.
- Ranks search results using transparent, explainable algorithms (BM25 + quality signals).
- Serves results via a responsive, accessible web frontend.
- Zero-cost architecture: Runs locally or on free hosting tiers without requiring paid services.
- Privacy-first: No accounts, no profiling, and no selling of user queries.

---

## 2. Current Development Status

- **Current Milestone**: **Milestone 6 — Public Web Application** (In Progress)
- **Completed Phases**: **Phase 1 through Phase 19 (ALL PASSED)**
- **Next Phase**: **Phase 20: Search Results UI**

| Milestone        | Scope                                            | Status                                           |
| :--------------- | :----------------------------------------------- | :----------------------------------------------- |
| **Milestone 1**  | Project Foundation (Phases 1–3)                  | **COMPLETED** (Phases 1, 2, 3 Passed)            |
| **Milestone 2**  | Crawler Foundation (Phases 4–8)                  | **COMPLETED** (Phases 4, 5, 6, 7, 8 Passed)      |
| **Milestone 3**  | Search Index (Phases 9–11)                       | **COMPLETED** (Phases 9, 10, 11 Passed)          |
| **Milestone 4**  | Query & Ranking (Phases 12–15)                   | **COMPLETED** (Phases 12, 13, 14, 15 Passed)     |
| **Milestone 5**  | Search API (Phases 16–18)                        | **COMPLETED** (Phases 16, 17, 18 Passed)         |
| **Milestone 6**  | Public Web Application (Phases 19–21)            | **In Progress** (Phase 19 Passed; Phase 20 Next) |
| **Milestone 7**  | End-to-End Integration (Phases 22–24)            | Scheduled                                        |
| **Milestone 8**  | Security, Reliability & Privacy (Phases 25–27)   | Scheduled                                        |
| **Milestone 9**  | Performance & Free Infrastructure (Phases 28–30) | Scheduled                                        |
| **Milestone 10** | Production Release (Phases 31–34)                | Scheduled                                        |

---

## 3. Architecture & Repository Boundaries

The repository is organized as a modular TypeScript monorepo with explicit module boundaries:

```
opensearch/
├── apps/
│   ├── api/          # Public Search API service (HTTP endpoints, validation, health)
│   └── web/          # Public search web interface (accessible, responsive, clean UI)
├── packages/
│   ├── crawler/      # Polite web crawler (robots.txt, scheduler, fetcher, HTML extractor)
│   ├── indexer/      # Document processing, inverted index, index builder
│   ├── ranking/      # Relevance calculation (BM25 lexical scoring, ranking signals)
│   ├── storage/      # Document storage and persistence abstractions
│   └── shared/       # Common types, models, constants, and utilities
├── scripts/          # Root lifecycle and verification scripts
├── report/           # Audit and phase verification reports
├── PROJECT.txt       # Project specification and requirements
└── PHASE.txt         # Phase roadmap and definition of done
```

---

## 4. Completed Milestone Capabilities

### Milestone 1 — Project Foundation (Phases 1–3)

- **Monorepo & Workspace Foundation**: Node 20+, TypeScript 5.7+ composite projects, ESLint 9 flat config, Prettier, and Vitest test runner.
- **Shared Infrastructure**: Strongly typed configuration parsing (`AppConfig`), centralized error hierarchies, structured JSON logger, constants, and ID/cryptographic utilities.
- **JSON Storage Engine**: Safe, atomic document/URL repositories with ACID file-locking, validation schemas, and metadata storage.

### Milestone 2 — Crawler Foundation (Phases 4–8)

- **URL Engine**: RFC 3986 URL validation, canonical normalization, and SHA-256 fingerprinting.
- **HTTP Fetcher**: Policy-enforced network client with SSRF guard protection blocking private IP ranges.
- **Robots & Policy Engine**: Robots.txt parser and caching evaluator supporting User-agent and Crawl-delay rules.
- **HTML Extractor**: Content parsing extracting titles, meta descriptions, headings, visible body text, and links.
- **Crawl Orchestrator**: Multi-stage crawler coordinating queue scheduling, link discovery, deduplication, retry limits, politeness delays, and graceful aborts.

### Milestone 3 — Search Index (Phases 9–11)

- **Document Processing Pipeline**: Multilingual text normalization, accent/case folding, positional tokenization, stop-word filtering, and field weighting metadata (Title: 3.0x, Headings: 2.0x, Description: 1.5x, Body: 1.0x).
- **Inverted Index**: Term dictionary, posting lists with field breakdown and token positions, document frequency (DF), term frequency (TF), and disk persistence.
- **Index Builder & Rebuild Pipeline**: Batch document indexing from storage, incremental updates for newly crawled/pending documents, deterministic rebuilds, staging isolation (`<indexDir>/builds/<buildId>`), error handling, and index metadata tracking.

### Milestone 4 — Query & Ranking (Phases 12–15)

- **Phase 12 (Query Processing)**: Safe user query parser, character length bounds (`SEARCH_LIMITS.MAX_QUERY_LENGTH = 200`), Unicode NFC / accent / case folding, quoted exact phrase extraction (`"exact phrase"`), negation tokens (`-term` and `NOT term`), non-Latin script parsing (Cyrillic, CJK, Arabic), and empty/malformed query safety.
- **Phase 13 (Candidate Retrieval)**: High-performance posting lookup, candidate document merging across multiple terms, Boolean retrieval modes (`union`, `intersection`, and `adaptive`), negated term exclusion, positional phrase verification, and candidate limits.
- **Phase 14 (Ranking Engine)**: Multi-field BM25 relevance scoring ($k_1=1.2, b=0.75$), structural field boosts (Title: 3.0x, Headings: 2.0x, Description: 1.5x, Body: 1.0x), exact quoted phrase boosts (1.5x), full-query term match multipliers (1.25x), URL slug/hostname lexical bonus (+0.35), domain clustering / near-duplicate penalty dampening (0.8x), optional freshness decay signal, and deterministic score explanation breakdowns.
- **Phase 15 (Result Generation & Snippets)**: Safe search result formatting, keyword density-centered snippet extraction with word boundary alignment, safe HTML escaping against XSS before `<mark>` tag query term highlighting, breadcrumb-style display URLs, title fallbacks, and multi-page pagination metadata calculation.

### Milestone 5 — Search API (Phases 16–18)

- **Phase 16 (Search API Foundation)**: Stable HTTP REST API application (`apps/api`) built on native Node.js HTTP primitives, parameterized router with path parameter extraction, modular middleware pipeline (CORS, security headers, request logging), structured JSON error payloads, system discovery endpoint (`GET /`), and detailed health check with memory and uptime telemetry (`GET /health`).
- **Phase 17 (Search Endpoint)**: Full search endpoint exposed over HTTP (`GET /api/v1/search` and `POST /api/v1/search`) connecting safe query parsing, inverted index candidate retrieval, BM25 relevance ranking, contextual snippet generation, keyword highlighting, pagination controls, parameter validation, and response performance metadata.
- **Phase 18 (API Security, Limits & Reliability)**: Rate limiting via in-memory sliding-window counter per IP address (`X-RateLimit-*`, `Retry-After`, `429 Too Many Requests`), request timeout controls (`504 Gateway Timeout` via `TimeoutError`), request payload limit enforcement (64KB `413 Payload Too Large`), search query length capping (200 chars `400 Bad Request`), strict defensive security headers (`CSP`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`), safe zero-leak error responses, and privacy-minimizing structured logging (IP anonymization).

### Milestone 6 — Public Web Application (Phases 19–21)

- **Phase 19 (Search UI Foundation)**: Clean, fast, accessible public web search frontend (`apps/web`), semantic HTML5 application shell, responsive mobile/desktop design tokens (`style.css`), accessible search box with clear button and length validation, reactive state containers (home hero, loading skeleton with progress bar, empty state with search tips, error state with retry), and embedded zero-external-dependency Node.js HTTP `WebServer`.

---

## 5. Getting Started

### Prerequisites

- **Node.js**: `>= 20.0.0` (LTS recommended)
- **npm**: `>= 10.0.0`
- **Git**

### Installation

```bash
# Clone the repository (or navigate to workspace)
cd opensearch

# Install dependencies across all workspaces
npm install
```

### Development Scripts

| Command                  | Description                                                                      |
| :----------------------- | :------------------------------------------------------------------------------- |
| `npm run typecheck`      | Type-checks all packages and apps using TypeScript composite projects (`tsc -b`) |
| `npm run build`          | Compiles TypeScript into distribution outputs (`dist/`) across all workspaces    |
| `npm run lint`           | Runs ESLint across all TypeScript and JavaScript files                           |
| `npm run format:check`   | Verifies code formatting with Prettier                                           |
| `npm run format`         | Automatically formats code with Prettier                                         |
| `npm run test`           | Runs the automated test suite via Vitest (328 tests passing)                     |
| `npm run clean`          | Removes compiled distribution directories                                        |
| `npm run verify:phase1`  | Runs the automated verification suite for Phase 1                                |
| `npm run verify:phase2`  | Runs the automated verification suite for Phase 2                                |
| `npm run verify:phase3`  | Runs the automated verification suite for Phase 3                                |
| `npm run verify:phase4`  | Runs the automated verification suite for Phase 4                                |
| `npm run verify:phase5`  | Runs the automated verification suite for Phase 5                                |
| `npm run verify:phase6`  | Runs the automated verification suite for Phase 6                                |
| `npm run verify:phase7`  | Runs the automated verification suite for Phase 7                                |
| `npm run verify:phase8`  | Runs the automated verification suite for Phase 8                                |
| `npm run verify:phase9`  | Runs the automated verification suite for Phase 9                                |
| `npm run verify:phase10` | Runs the automated verification suite for Phase 10                               |
| `npm run verify:phase11` | Runs the automated verification suite for Phase 11                               |
| `npm run verify:phase12` | Runs the automated verification suite for Phase 12                               |
| `npm run verify:phase13` | Runs the automated verification suite for Phase 13                               |
| `npm run verify:phase14` | Runs the automated verification suite for Phase 14                               |
| `npm run verify:phase15` | Runs the automated verification suite for Phase 15                               |
| `npm run verify:phase16` | Runs the automated verification suite for Phase 16                               |
| `npm run verify:phase17` | Runs the automated verification suite for Phase 17                               |
| `npm run verify:phase18` | Runs the automated verification suite for Phase 18                               |
| `npm run verify:phase19` | Runs the automated verification suite for Phase 19                               |

---

## 6. Environment Configuration

The project uses `.env.example` templates to document required variables without exposing secrets:

- Root: [`.env.example`](file:///d:/OPENSEARCH/.env.example)
- API Service: [`apps/api/.env.example`](file:///d:/OPENSEARCH/apps/api/.env.example)
- Web Application: [`apps/web/.env.example`](file:///d:/OPENSEARCH/apps/web/.env.example)

To configure local overrides, copy the template:

```bash
cp .env.example .env
```

Actual `.env` files are ignored by git and must never be committed.

---

## 7. Coding & Contribution Guidelines

Refer to [`CONTRIBUTING.md`](file:///d:/OPENSEARCH/CONTRIBUTING.md) for detailed guidelines regarding architecture boundaries, coding style, git commit practices, and testing requirements.
