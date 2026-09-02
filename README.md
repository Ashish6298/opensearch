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

- **Current Milestone**: Milestone 1 — Project Foundation
- **Current Phase**: **Phase 2 — Configuration & Shared Infrastructure (COMPLETED)**
- **Next Phase**: Phase 3 — Storage Foundation

| Milestone        | Scope                                            | Status                             |
| :--------------- | :----------------------------------------------- | :--------------------------------- |
| **Milestone 1**  | Project Foundation (Phases 1–3)                  | In Progress (Phase 1 & 2 Complete) |
| **Milestone 2**  | Crawler Foundation (Phases 4–8)                  | Scheduled                          |
| **Milestone 3**  | Search Index (Phases 9–11)                       | Scheduled                          |
| **Milestone 4**  | Query & Ranking (Phases 12–15)                   | Scheduled                          |
| **Milestone 5**  | Search API (Phases 16–18)                        | Scheduled                          |
| **Milestone 6**  | Public Web Application (Phases 19–21)            | Scheduled                          |
| **Milestone 7**  | End-to-End Integration (Phases 22–24)            | Scheduled                          |
| **Milestone 8**  | Security, Reliability & Privacy (Phases 25–27)   | Scheduled                          |
| **Milestone 9**  | Performance & Free Infrastructure (Phases 28–30) | Scheduled                          |
| **Milestone 10** | Production Release (Phases 31–34)                | Scheduled                          |

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

## 4. Getting Started

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

| Command                 | Description                                                                      |
| :---------------------- | :------------------------------------------------------------------------------- |
| `npm run typecheck`     | Type-checks all packages and apps using TypeScript composite projects (`tsc -b`) |
| `npm run build`         | Compiles TypeScript into distribution outputs (`dist/`) across all workspaces    |
| `npm run lint`          | Runs ESLint across all TypeScript and JavaScript files                           |
| `npm run format:check`  | Verifies code formatting with Prettier                                           |
| `npm run format`        | Automatically formats code with Prettier                                         |
| `npm run test`          | Runs the automated test suite via Vitest                                         |
| `npm run clean`         | Removes compiled distribution directories                                        |
| `npm run verify:phase1` | Runs the automated verification suite for Phase 1                                |

---

## 5. Environment Configuration

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

## 6. Coding & Contribution Guidelines

Refer to [`CONTRIBUTING.md`](file:///d:/OPENSEARCH/CONTRIBUTING.md) for detailed guidelines regarding architecture boundaries, coding style, git commit practices, and testing requirements.
