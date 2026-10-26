# OpenSearch Network & Data-Flow Audit Specification

**Document Version:** 1.0.0  
**Milestone:** 30 — Privacy Receipt and Local-Only Mode  
**Phase:** 82 — Network and data-flow audit  
**Status:** Canonical Architectural Specification  
**Date:** October 2026  
**Auditor:** OpenSearch Core Team & Antigravity  

---

## 1. Overview & Scope

Phase 82 conducts a rigorous, comprehensive network and data-flow audit of all HTTP, HTTPS, and internal IPC requests triggered by search execution, web UI rendering, asset hydration, multimedia retrieval, suggestions, and diagnostic logging.

This audit:
1. Disambiguates **Browser-to-Host** traffic from **Host-to-Provider** traffic.
2. Inventories every request destination triggered directly or indirectly by a search query.
3. Formally identifies which requests receive query text, client IP metadata, HTTP referrers, or client identifiers.
4. Confirms that third-party scripts, external CDNs, web fonts, analytics beacons, and third-party crash reporters are **removed and disabled by default**.
5. Establishes and enforces a privacy-first `Referrer-Policy`.
6. Guarantees that query-bearing URLs are never transmitted to unrelated origins.

---

## 2. Network Boundary Architecture

The network model establishes four mutually exclusive operational boundaries:

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                   CLIENT DEVICE / BROWSER                               │
│                                                                                         │
│  [User Search Input] ────► [Local Autocomplete (Prefix Trie)]  (Zero Egress)            │
│          │                                                                              │
│          │ 1. Boundary A: Browser-to-Host                                               │
│          ▼                                                                              │
│  GET /api/v1/search?q=...                                                               │
└──────────┬──────────────────────────────────────────────────────────────────────────────┘
           │
           │ (HTTPS / HTTP over local loopback)
           ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                   OPENSEARCH HOST SERVER                                │
│                                                                                         │
│  [Client IP Masking] ──► IPv4 /24 Truncation (192.168.1.0) / IPv6 /48 Prefix            │
│  [Query Planner]                                                                        │
│       ├──► [Local Inverted Index (NVMe/SSD)] (Zero Network Egress)                      │
│       │                                                                                 │
│       └──► 2. Boundary B: Host-to-Provider (Shields Client IP & Headers)                │
│                 │                                                                       │
└─────────────────┼───────────────────────────────────────────────────────────────────────┘
                  │
                  ├──► Wikimedia OpenSearch API (en.wikipedia.org)
                  ├──► Wikimedia Commons API (commons.wikimedia.org)
                  └──► Hacker News Algolia API (hn.algolia.com)
                  
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                             3. BOUNDARY C: BROWSER-TO-THIRD-PARTY                       │
│                                                                                         │
│  - Image Thumbnails: Direct fetch to upload.wikimedia.org (referrerpolicy="no-referrer")│
│  - Destination Clicks: User clicks result link (rel="noopener noreferrer")               │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Boundary Classifications

- **Boundary A (Browser-to-Host):**
  - Origin: User Browser / API Client
  - Destination: OpenSearch Web / API Server (`localhost:3000` or deployed host origin)
  - Data Carried: Query string (`q`), category, filter options.
  - Client IP Handling: Socket receives client IP, which is immediately anonymized in memory before operational logging (`anonymizeIpAddress`).
  - Cookies / Identifiers: Zero `Set-Cookie` headers issued; zero session tokens required.
  - Referrer: Governed by `Referrer-Policy: strict-origin-when-cross-origin`.

- **Boundary B (Host-to-Provider):**
  - Origin: OpenSearch Server Node (Node.js runtime)
  - Destination: Approved public REST APIs (`en.wikipedia.org`, `commons.wikimedia.org`, `hn.algolia.com`)
  - Data Carried: Query term strictly needed for retrieval (`search` or `query` param).
  - Client IP Shielding: The external provider **never** receives the end user's client IP. The provider only observes the outbound server IP of the OpenSearch host node.
  - Identifiers: Zero client cookies or device fingerprints are forwarded.

- **Boundary C (Browser-to-Third-Party Media / Links):**
  - Origin: User Browser
  - Destination: External content origins (Wikimedia upload CDN, destination websites)
  - Thumbnails: Loaded only when viewing multimedia results. Protected with `referrerpolicy="no-referrer"` so the referring search URL is never leaked.
  - Outbound Links: User-initiated navigation. Protected with `rel="noopener noreferrer"`.

- **Boundary D (Internal / Zero Egress):**
  - Components: Local Inverted Index, Local Document Store, Prefix Trie Autocomplete, System Fonts.
  - Network Footprint: 0 bytes. Completely local computation.

---

## 3. Comprehensive Request Inventory & Payload Disclosure Matrix

| ID | Endpoint / Destination | Boundary | Category | Query Text? | Client IP? | Referrer Transmitted? | Identifiers? | Default Enabled? |
|---|---|---|---|---|---|---|---|---|
| `search-api` | `/api/v1/search` | Browser-to-Host | Search API | **Yes** (`q` param) | Masked in memory (`/24` or `/48`) | No | None (0 cookies) | **Yes** |
| `frontend-shell` | `/`, `/search` | Browser-to-Host | Frontend Shell | No | Masked in memory | No | None | **Yes** |
| `frontend-assets` | `/style.css`, `/app.js`, `/sw.js` | Browser-to-Host | Static Assets | No | Masked in memory | No | None | **Yes** |
| `provider-wikimedia` | `https://en.wikipedia.org/w/api.php` | Host-to-Provider | Provider | **Yes** (server-to-server) | **Shielded** (Host IP only) | None | None | **Yes** |
| `provider-commons` | `https://commons.wikimedia.org/w/api.php` | Host-to-Provider | Provider | **Yes** (server-to-server) | **Shielded** (Host IP only) | None | None | **Yes** |
| `provider-hn` | `https://hn.algolia.com/api/v1/search` | Host-to-Provider | Provider | **Yes** (server-to-server) | **Shielded** (Host IP only) | None | None | **Yes** |
| `local-index` | `opensearch://internal/inverted-index` | Internal | Storage Engine | **Yes** (in-memory) | None (Local) | None | None | **Yes** |
| `suggestions-trie`| `opensearch://internal/prefix-trie` | Internal | Suggestions | **Yes** (in-memory) | None (Local) | None | None | **Yes** |
| `thumbnails-cdn` | `https://upload.wikimedia.org/...` | Browser-to-Third-Party | Thumbnails | **No** (media hash only) | Client IP connects to Wikimedia CDN | **Blocked** (`referrerpolicy="no-referrer"`) | None | **Yes** (Images tab) |
| `fonts-stack` | `local://system-fonts` | Internal | Typography | **No** | None (OS native) | None | None | **Yes** |
| `scripts-third-party`| External CDNs / unpkg / cdnjs | Browser-to-Third-Party | Scripts | **No** | None | None | None | **REMOVED (Disabled)** |
| `analytics-beacons` | GA / Meta / Segment / Datadog | Browser-to-Third-Party | Analytics | **No** | None | None | None | **REMOVED (Disabled)** |
| `error-reporting` | Sentry / Rollbar / Datadog APM | Host-to-Provider | Telemetry | **No** | None | None | None | **REMOVED (Disabled)** |
| `outbound-links` | External search result targets | Browser-to-Third-Party | Navigation | **No** | Client IP connects on user click | **Blocked** (`rel="noopener noreferrer"`) | None | **Yes** (User click) |

---

## 4. Privacy Defenses & Hardening Implementations

### 4.1 Zero Third-Party Scripts & Trackers Policy
- OpenSearch HTML documents contain **zero external `<script src="...">` tags** and **zero external `<link rel="stylesheet">` tags**.
- Content Security Policy (CSP) headers enforce local execution:
  ```http
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://upload.wikimedia.org https://commons.wikimedia.org; connect-src 'self' http://localhost:* http://127.0.0.1:* https:; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';
  ```
- No analytics beacons, telemetry pings, or conversion trackers are included anywhere in the codebase.

### 4.2 Referrer Policy & Cross-Origin Query Protection
- **Response Headers:** `Referrer-Policy: strict-origin-when-cross-origin` is served by both the Web and API servers.
- **HTML Document Meta Tag:** `<meta name="referrer" content="strict-origin-when-cross-origin">` is embedded in the `<head>` of the search shell.
- **Image Thumbnails:** All image elements enforce `referrerpolicy="no-referrer"`. When the user loads thumbnail images from `upload.wikimedia.org`, the browser omits the `Referer` header entirely.
- **Destination Links:** All search result anchors enforce `rel="noopener noreferrer"`. Clicking a result link strips the referrer and prevents `window.opener` access.

### 4.3 Preventing Query-Bearing URLs on Unrelated Origins
- The web application executes all user searches exclusively through `GET /api/v1/search?q={query}` on the OpenSearch host.
- Outbound destination URLs returned from the indexer and search providers represent clean canonical URLs (e.g., `https://en.wikipedia.org/wiki/Linux`).
- Search terms are never appended to external URLs as query parameters.

### 4.4 Separate Documentation of Host-to-Provider Traffic
- **Client IP Shielding:** External search APIs never observe client network addresses.
- **Request Minimization:** Only the cleaned search string is sent upstream.
- **No User Identity Tracking:** No API keys, persistent cookies, or account identifiers are passed to providers.

---

## 5. Automated Verification Plan

Compliance with this specification is verified through automated tests in `packages/shared/tests/network-data-flow-audit.test.ts`:
1. **Inventory Completeness**: Verifies all 10 active and 3 disabled-by-default endpoint categories exist in the inventory.
2. **Zero Third-Party Scripts**: Asserts that no third-party scripts or analytics are enabled by default.
3. **Client IP Isolation**: Asserts that zero host-to-provider requests leak client IP addresses.
4. **Thumbnail Isolation**: Verifies that image cards include `referrerpolicy="no-referrer"`.
5. **Referrer-Policy Headers & Meta**: Validates `Referrer-Policy` headers and meta tag enforcement.
6. **Query-Bearing URL Check**: Verifies `isQueryBearingUrlLeaked` flags improper query leakage on outbound targets.
