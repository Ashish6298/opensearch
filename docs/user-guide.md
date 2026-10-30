# OpenSearch Web — User & Self-Hosting Guide

**Version:** 1.5.0 (Milestone 39, Phase 115)  
**Product:** OpenSearch Web — Sovereign Privacy-Preserving Search Engine  
**License:** MIT Permissive Open Source  

---

## 1. What is OpenSearch Web? (Plain-Language Overview)

**OpenSearch Web** is an independent, sovereign web search engine designed for people who want accurate, fast web search without surveillance, tracking, profiling, or targeted advertising.

Corporate search engines track your search queries, IP addresses, browsing habits, device fingerprints, and click histories to build persistent behavioral dossiers sold to advertisers. Meta-search engines often forward your raw query and headers to third-party search APIs.

**OpenSearch Web is fundamentally different:**
1. **It has its own crawler and index**: It builds a locally hosted, mathematically transparent inverted index (using the BM25 ranking algorithm and PageRank link graphs).
2. **It preserves total privacy**: It stores zero user search history, issues zero tracking cookies, logs zero raw query text on disk, and truncates IP addresses.
3. **It provides an auditable Privacy Receipt**: Every single search result returns cryptographic proof showing which providers were contacted (if any), confirm zero PII was forwarded, and prove that your query was handled with privacy-first standards.
4. **It features Local-Only Mode**: With a single toggle or flag (`--local-only`), you can turn off all external network calls and search strictly against your own indexed documents.
5. **It runs on free, open infrastructure**: Anyone can self-host OpenSearch Web locally on a laptop, a Raspberry Pi, or a free cloud tier without paid APIs or mandatory subscription keys.

---

## 2. Who is OpenSearch Web For?

- **Everyday Users**: Search for general information, recipes, tutorials, news, and definitions without behavioral profiling or retargeting ads following you across the web.
- **Students & Educators**: Rapid lookup of academic research, peer-reviewed journals, and encyclopedic definitions with verified, deterministic citations and zero hallucinated facts.
- **Developers & Sysadmins**: Instant access to language specifications, manual pages, RFCs, GitHub repos, and algorithmic documentation directly from the browser or the terminal CLI.
- **Privacy-Conscious Individuals & Organizations**: Complete control over search data. Search private intranets, confidential documentation, and internal wikis with guaranteed zero data leakage.
- **AI Agents & Model Context Protocol (MCP)**: Safely query web knowledge and index status through native MCP tools without exposing shell execution or arbitrary file access.

---

## 3. Privacy Modes & The Privacy Receipt

### A. The Two Privacy Modes

| Mode | Trigger | Behavior | Ideal Use Case |
| :--- | :--- | :--- | :--- |
| **Standard Mode** | Default (`privacy_mode=standard`) | Queries the local BM25 index first. If more results are needed, queries verified external public APIs (e.g., Wikipedia, arXiv) without forwarding user cookies, IPs, or identifiers. | General web searching with maximal recall and zero user tracking. |
| **Local-Only Mode** | `privacy_mode=local_only` or CLI `--local-only` | Completely severs external network communication. Only the local disk-based inverted index is searched. Outbound calls = 0. | Searching private documents, air-gapped environments, offline work, or zero-trust networks. |

### B. Anatomy of a Privacy Receipt
Every query response includes a transparent `privacyReceipt` JSON object:

```json
{
  "queryHash": "7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
  "privacyMode": "standard",
  "providersContacted": ["wikipedia"],
  "providersSkipped": ["duckduckgo"],
  "ipMasked": true,
  "zeroTracking": true,
  "clientIpTruncated": "192.168.1.0/24",
  "timestamp": "2026-10-30T16:20:00.000Z"
}
```

- **`queryHash`**: SHA-256 hash of the query tokens. The raw query is never written to disk, metrics, or logs.
- **`providersContacted`**: Exact, auditable list of external search providers queried.
- **`ipMasked`**: Confirmation that the incoming client IP was truncated before any processing.
- **`zeroTracking`**: Confirmation that zero tracking cookies, user-agent headers, or persistent identifiers were stored or transmitted.

---

## 4. Supported Runtimes & System Requirements

- **Node.js**: `v20.0.0` or higher (tested on Node 20 LTS and Node 22 LTS).
- **npm**: `v10.0.0` or higher.
- **Operating Systems**: Linux (Ubuntu, Debian, Fedora, Arch), macOS (Apple Silicon & Intel), Windows (Windows 10/11 with PowerShell or WSL).
- **Hardware Minimums**:
  - RAM: 512 MB minimum (1 GB recommended for indexing large corpora).
  - Storage: 100 MB free disk space for baseline index; scales linearly with corpus size.
  - Network: Optional for Local-Only mode; outbound HTTPS required for Standard Mode federated queries.

---

## 5. Quick-Start Guide (Tested from Clean Checkout)

Follow these steps to run OpenSearch Web locally:

```bash
# 1. Clone the repository
git clone https://github.com/Ashish6298/opensearch.git
cd opensearch

# 2. Install workspace dependencies
npm install

# 3. Transpile TypeScript packages and bundle assets
npm run build

# 4. Ingest and index the curated seed corpus (114 domains across 19 categories)
npm run seed

# 5. Launch the Search API daemon (Port 3001)
npm run start:api
```

In a second terminal window, launch the Web user interface:

```bash
# 6. Launch the Web Terminal interface (Port 3000)
npm run start:web
```

Visit **`http://localhost:3000`** in any web browser to start searching!

---

## 6. Command-Line Search (Terminal CLI)

Search directly from your command-line without launching a browser:

```bash
# Basic query
npm run opensearch "typescript compiler"

# Limit output results
npm run opensearch "distributed algorithms" -- -l 5

# Inspect ranking explainability scores
npm run opensearch "bm25 ranking" -- --explain

# Output parseable JSON into jq
npm run opensearch "cryptography" -- --json | jq .results[0].title

# Run offline search in Local-Only mode
npm run opensearch "privacy" -- --api http://localhost:3001
```

---

## 7. Configuration Reference (`.env`)

Copy `.env.example` to `.env` to customize runtime settings:

| Variable | Default | Purpose / Allowed Values |
| :--- | :--- | :--- |
| `API_PORT` | `3001` | HTTP port for the Search API daemon |
| `API_HOST` | `127.0.0.1` | Network interface to bind (`127.0.0.1` for local, `0.0.0.0` for containers) |
| `WEB_PORT` | `3000` | HTTP port for the Web UI frontend |
| `WEB_HOST` | `127.0.0.1` | Network interface for the Web UI |
| `VITE_API_URL` | `http://localhost:3001/api/v1/search` | Search endpoint URL consumed by the web browser |
| `STORAGE_DIR` | `./data/storage` | Path for atomic document and metadata stores |
| `INDEX_DIR` | `./data/index` | Path for inverted index postings on disk |
| `RATE_LIMIT_PER_MINUTE` | `60` | Maximum requests per minute per IP address |
| `ENABLE_MCP` | `true` | Enable/disable Model Context Protocol server (`true` or `false`) |
| `TRUST_PROXY` | `false` | Enable reverse proxy IP trust (`true`, `false`, or comma-separated CIDR list) |
| `DEPLOYMENT_MODEL` | `standalone` | Hosting model: `standalone`, `persistent-disk`, or `stateless-container` |
| `LOG_LEVEL` | `info` | Logger verbosity: `debug`, `info`, `warn`, `error` |

---

## 8. Troubleshooting & Common Questions

### `Error: listen EADDRINUSE: address already in use :::3000 / :::3001`
- **Cause**: Another application or a previous instance of OpenSearch Web is occupying the port.
- **Solution**:
  - Stop the running process or change `API_PORT` / `WEB_PORT` in your `.env` file:
  ```bash
  API_PORT=3005 WEB_PORT=3006 npm run start:api
  ```

### `Error: Cannot find module './dist/index.js'`
- **Cause**: Project was not built after cloning or pulling new commits.
- **Solution**: Run `npm run build` from the repository root.

### `Search returns 0 results on a fresh checkout`
- **Cause**: The search index has not been seeded yet.
- **Solution**: Run `npm run seed` to populate the initial corpus.

### `HTTP 429 Too Many Requests`
- **Cause**: Rate limit exceeded for your IP address.
- **Solution**: Increase `RATE_LIMIT_PER_MINUTE` in `.env` (e.g. `RATE_LIMIT_PER_MINUTE=200`).

### `Is OpenSearch Web affiliated with Amazon OpenSearch?`
- **No**: OpenSearch Web is an independent open-source search engine. It is not affiliated with, funded by, or endorsed by Amazon Web Services (AWS) or the Amazon OpenSearch project. All trademarks belong to their respective owners.

---

## 9. Known Boundaries & Limitations

1. **Scale Boundaries**: OpenSearch Web is engineered for local-first, self-hostable, and federated search across tens of thousands to hundreds of thousands of documents per instance. It is not designed to index the entire 100-billion-page public web on a single laptop.
2. **Third-Party Provider Outages**: In Standard Mode, upstream providers (e.g., Wikipedia) may experience transient network downtime or rate limiting. When this occurs, OpenSearch Web reports partial degradation honestly in the Privacy Receipt rather than synthesizing fake results.
3. **Trademark Notice**: No legal trademark clearance is claimed or implied.
