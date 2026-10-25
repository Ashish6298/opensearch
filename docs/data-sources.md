# Data Sources, Attribution & Compliance

**Document Version:** 1.0.0  
**Phase:** Phase 72 (Milestone 27 — Search Providers and Source Reliability)  
**Status:** Active & Enforced  
**Last Updated:** October 2026  

---

## 1. Overview & Data Ethics Commitment

OpenSearch is architected on the principle of sovereign, privacy-preserving information retrieval backed by transparent provenance. To protect users and respect upstream ecosystem maintainers, OpenSearch enforces three fundamental operational rules:

1. **No Undocumented Scraping:** We do not bypass terms of service, bot challenges, paywalls, or rate limits via brittle HTML regex or headless browser trickery. All external results originate exclusively from documented, permitted public APIs.
2. **Honest License Characterization:** A data source is **only** described as "open" or "openly licensed" if its license explicitly permits downstream redistribution, modification, and search indexing (e.g., Creative Commons CC-BY, CC-BY-SA, MIT, Public Domain). Permitted, free-to-use public APIs with proprietary or fair-use terms (e.g., Algolia Hacker News) are transparently categorized as "Public Permitted Interface", never misrepresented as open source.
3. **Rigorous Attribution & Provenance Retention:** Every search result emitted across API and UI layers retains provenance metadata (`source`, `attribution`, `contentType`, `canonicalUrl`). Users can immediately identify where every piece of information originated.

---

## 2. Active Provider Catalog

| Provider Identifier | Display Name | Source Category | Content License / Terms | Required User Attribution | Rate Limits | Caching Policy | Query Sent Upstream? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| `local-index` | Sovereign Local Index | Local Sovereign Corpus | Sovereign / Public Domain / Crawled under RFC 9309 robots.txt | Self-hosted Index (`source: local-index`) | None (local memory/disk) | Permanent Inverted Index | **No** (air-gapped) |
| `wikimedia` | Wikipedia & Wikimedia | Encyclopedic & Reference | Creative Commons CC BY-SA 4.0 | `Source: Wikipedia (CC BY-SA 4.0)` | 200 req/min, 100ms delay | Max TTL: 3600s in-memory | **Yes** (query only, zero PII) |
| `hackernews` | Hacker News (Algolia Search) | Tech News & Discussion | Algolia HN Community Terms (Public Read API) | `Source: Hacker News (Algolia Search API)` | 10,000 req/hr (~166 req/min) | Max TTL: 300s in-memory | **Yes** (query only, zero PII) |
| `mock-provider` | Mock Test Provider | Deterministic Test Fixture | MIT License | `OpenSearch Mock Fixtures (MIT)` | 600 req/min | Max TTL: 60s in-memory | **No** (in-process fixture) |

---

## 3. Detailed Data Source Specifications

### 3.1. Sovereign Local Index (`local-index`)
- **Origin & Ingestion:** Ingested via `@opensearch/crawler` respecting `robots.txt` (RFC 9309), crawl delays, nofollow directives, and operator seed URLs.
- **Licensing & Usage:** Operates entirely within the user's sovereign computing environment. Corpus documents retain original publication copyright.
- **Attribution Display:**
  - `source`: `'local-index'`
  - Display badge: Clean domain badge (e.g., `docs.python.org`).
- **Caching & Storage:** Persisted locally in `data/index/` using inverted index postings and document store.
- **Privacy Model:** Standard Boundary A (client-to-host only); zero external network transmission occurs when serving local index hits.

---

### 3.2. Wikimedia Foundation OpenSearch API (`wikimedia`)
- **Canonical Endpoint:** `https://en.wikipedia.org/w/api.php`
- **Official Documentation:** [MediaWiki Action API: OpenSearch](https://www.mediawiki.org/wiki/API:Opensearch)
- **Legal Terms & Policy:** [Wikimedia Foundation Terms of Use](https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use) & [Wikimedia User-Agent Policy](https://meta.wikimedia.org/wiki/User-Agent_policy).
- **License Classification:** **Openly Licensed (CC BY-SA 4.0)**.
  - Text is available under the Creative Commons Attribution-ShareAlike License 4.0.
- **Mandatory Attribution Requirements:**
  - Attribution text: `Source: Wikipedia (CC BY-SA 4.0)`
  - URL backlink: Must point directly to the canonical Wikipedia page.
- **Politeness & Rate Limits:**
  - Maximum 200 requests per minute per IP.
  - Minimum 100ms delay between burst requests.
  - Mandatory User-Agent header specifying project name, version, repository URL, and contact email:
    `User-Agent: OpenSearch/1.4.0 (https://github.com/Ashish6298/opensearch; search@opensearch.local)`
- **Caching Permissibility:**
  - In-memory response caching permitted up to 3600 seconds TTL.
  - No user identifiers or cookies may be attached to cached records.
- **Network Privacy Behavior:**
  - Query text is transmitted over HTTPS to Wikimedia servers.
  - Client IP is **never** forwarded (`forwardClientIp: false`).
  - Client cookies and sessions are **never** forwarded (`forwardCookies: false`).

---

### 3.3. Hacker News Algolia Search API (`hackernews`)
- **Canonical Endpoint:** `https://hn.algolia.com/api/v1/search`
- **Official Documentation:** [HN Search API by Algolia](https://hn.algolia.com/api)
- **Legal Terms & Policy:** Y Combinator Hacker News terms & Algolia Community API guidelines.
- **License Classification:** **Public Permitted API** (Community Free Tier).
  - *Notice:* This source is **not** openly licensed content under Creative Commons. It is a permitted community read interface. Documentation must not describe this as "openly licensed".
- **Attribution Requirements:**
  - Attribution text: `Source: Hacker News (Algolia Search API)`
  - Direct item backlink: `https://news.ycombinator.com/item?id=:id`
- **Politeness & Rate Limits:**
  - Max 10,000 queries per hour per IP.
  - Recommended concurrency: 2 concurrent requests max.
  - Graceful backoff on HTTP 429 with `Retry-After`.
- **Caching Permissibility:**
  - In-memory response caching permitted with short TTL (up to 300 seconds) to avoid stale story discussion scores.
- **Network Privacy Behavior:**
  - Query text transmitted over HTTPS to Algolia HN origin.
  - Zero client IP or tracking header forwarding.

---

## 4. Attribution Display in User Interfaces

To ensure users always understand where results originate, OpenSearch surfaces provenance across all presentation boundaries:

### 4.1. Terminal & Web Frontend Display
In the search results list, each entry displays its destination URL alongside its provenance tag:
```text
[1] Decentralized Search Architecture — Wikipedia
    > en.wikipedia.org › wiki › Distributed_search [Source: Wikipedia (CC BY-SA 4.0)]
    A distributed search engine is a search engine where indexing and query processing...

[2] Show HN: OpenSearch — Privacy-First Hybrid Search Engine
    > news.ycombinator.com › item [Source: Hacker News (Algolia Search API)]
    342 points by username 14 hours ago | 118 comments
```

### 4.2. HTTP JSON API Response
Every item returned by `/api/v1/search` retains its provenance schema:
```json
{
  "documentId": "wikimedia-1",
  "title": "Decentralized Search Architecture",
  "url": "https://en.wikipedia.org/wiki/Distributed_search",
  "displayUrl": "en.wikipedia.org › wiki › Distributed_search",
  "domain": "en.wikipedia.org",
  "snippet": "A distributed search engine is a search engine where...",
  "source": "wikimedia",
  "contentType": "encyclopedia",
  "attribution": "Source: Wikipedia (CC BY-SA 4.0)"
}
```

---

## 5. Checklist for Evaluating Future Search Providers

Before integrating any prospective search provider into OpenSearch, the integration pull request **must** satisfy every item in the following 10-point checklist:

```markdown
### Provider Integration Vetting Checklist

- [ ] 1. Documented Public Interface:
         Integration uses an official, documented API endpoint. No HTML scraping,
         undocumented internal endpoints, or spoofed mobile headers.
- [ ] 2. Cost & Access Tier:
         Usable in local and self-hosted environments without mandatory paid subscriptions,
         per-query credit cards, or proprietary SDKs.
- [ ] 3. Terms of Service Compliance:
         Upstream terms explicitly permit third-party query aggregation and search result display.
- [ ] 4. Accurate License Classification:
         Provider is only classified as "open" or "openly licensed" if its content is governed
         by a recognized FOSS or Creative Commons license. Commercial / fair-use APIs are
         labeled "Public Permitted Interface".
- [ ] 5. Rate Limits & Politeness:
         Specific requests-per-minute / hour quotas are codified in `rateLimits`.
         Provider implementation respects HTTP 429 and `Retry-After` headers.
- [ ] 6. Caching Legality:
         Caching TTL and size limits conform to upstream policies (e.g. no permanent disk mirroring
         if forbidden by terms).
- [ ] 7. Privacy Guarantees:
         No client IP addresses, browser cookies, authorization headers, or device fingerprints
         are forwarded to the upstream provider (`forwardClientIp: false`, `forwardCookies: false`).
- [ ] 8. Source Attribution Notice:
         Required attribution, license notices, and backlinks are registered in `metadata.attribution`
         and surfaced automatically in result cards.
- [ ] 9. Failure Isolation:
         The provider implements the `SearchProvider` interface and catches all network, syntax,
         and HTTP errors without crashing parallel providers or throwing unhandled rejections.
- [ ] 10. Politeness User-Agent:
          Requests pass an identifiable User-Agent including project version and contact info.
```

---

## 6. Verification and Compliance Matrix

| Requirement | Enforcing Code Unit | Test Coverage | Status |
| :--- | :--- | :--- | :---: |
| Source metadata retained in results | `packages/ranking/src/providers/provider-normalizer.ts` | `packages/ranking/tests/search-providers.test.ts` | **VERIFIED** |
| Attribution text rendered on result cards | `apps/web/src/result-formatter.ts` & `apps/web/src/app.js` | `apps/web/tests/web.test.ts` | **VERIFIED** |
| Zero scraping in default search path | `apps/api/src/external-search.ts` | `apps/api/tests/removed-scrapers-regression.test.ts` | **VERIFIED** |
| Rate limits & `Retry-After` compliance | `packages/ranking/src/providers/resilience-manager.ts` | `packages/ranking/tests/provider-resilience.test.ts` | **VERIFIED** |
| Privacy-preserving query caching | `packages/ranking/src/providers/provider-cache.ts` | `packages/ranking/tests/provider-resilience.test.ts` | **VERIFIED** |
