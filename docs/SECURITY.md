# OpenSearch V1.0.0 — Security & Threat Model

> **Document Classification:** Security Architecture & Threat Model  
> **Target Version:** V1.0.0  
> **Status:** Production Audited (Phase 33)  

---

## 1. Overview & Threat Vectors

OpenSearch is designed from the ground up as a zero-cost, privacy-first, self-hostable search engine. As a public web service, it considers the following primary threat vectors:
1. **Server-Side Request Forgery (SSRF) & Hostile Crawling Targets**
2. **API Abuse, Denial-of-Service (DoS) & Resource Exhaustion**
3. **Information Disclosure & Privacy Leakage**
4. **Injection Attacks (XSS, Command Injection, Directory Traversal)**
5. **Dependency Supply Chain Vulnerabilities & Secret Exposure**

---

## 2. Defensive Controls Matrix

| Threat / Risk | Mitigating Architecture / Implementation | Test Verification |
| :--- | :--- | :--- |
| **SSRF & Private Network Probing** | `SsrfGuard` validates all URLs and resolves DNS before fetching. Strictly blocks RFC 1918 private IPs (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), loopback (`127.0.0.1`, `::1`), link-local (`169.254.0.0/16`), AWS metadata (`169.254.169.254`), non-HTTP schemes (`file://`, `ftp://`), and private domains (`localhost`, `.local`, `.internal`). | `ssrf-guard.test.ts` (21 tests) |
| **Robots.txt Non-Compliance** | `RobotsService` and `RobotsParser` strictly fetch and evaluate `robots.txt` before crawling any URL path. Honors `Disallow` rules, custom `User-agent: OpenSearchBot`, and enforces `Crawl-delay`. | `robots-service.test.ts`, `robots-parser.test.ts` (21 tests) |
| **Crawler Traps & Resource Exhaustion** | Strict constraints: `maxDepth` (default: 3), `maxPages` (default: 1000), `maxPageBytes` (2MB limit), `timeoutMs` (10s), `politenessDelayMs` (1000ms), `maxRedirects` (5), and bounded URL queues with cyclic redirect detection. | `crawler-security.test.ts`, `crawler-limits.test.ts` |
| **API Abuse & Query Flooding** | In-memory sliding window `MemoryRateLimiter` limits clients by anonymized IP address (default: 60 req/min). Emits standard headers (`X-RateLimit-*`, `Retry-After`). | `api.test.ts`, `middlewares.test.ts` |
| **Query Injection & Oversized Inputs** | Search query parser enforces maximum length (200 chars), sanitizes control characters, strips excessive whitespace, and validates positive page parameters. | `query-parser.test.ts`, `cross-environment.test.ts` |
| **Cross-Site Scripting (XSS)** | Web frontend completely sanitizes and escapes all document titles, snippets, and domains. Only explicitly allowed `<mark>` highlighting tags are rendered via `sanitizeHighlightedHtml()`. | `web.test.ts`, `cross-environment.test.ts` |
| **Referrer Leakage & Tracking** | All outbound result links enforce `rel="noopener noreferrer"` and `target="_blank"`. No search queries or user context are passed to third-party destinations. | `PRIVACY.md`, `cross-environment.test.ts` |
| **HTTP Security Headers** | Injected on all API and Web responses: `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`, `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`. | `middlewares.ts`, `server.ts` |
| **Error Exposure & Stack Leaks** | All API errors pass through `toSafeErrorResponse()`. Error messages are sanitized into typed payloads (`category`, `code`, `statusCode`, `message`). Stack traces and internal memory layouts are never exposed. | `errors.test.ts`, `api.test.ts` |
| **Secret Exposure** | `.gitignore` strictly ignores `.env`, `*.env.local`, logs, and temporary data. The logging system uses `redactSensitiveData()` to scrub any bearer tokens or keys. Zero secret credentials are hardcoded. | `audit-verification.test.ts` |
| **Supply Chain Security** | Zero external runtime dependencies in `@opensearch/web` and `@opensearch/api` core server routines. Regular `npm audit` scans confirm 0 vulnerabilities. | `npm audit` (0 vulnerabilities) |

---

## 3. Production Hardening Checklist

- [x] HTTPS / TLS termination configured with HSTS preload headers
- [x] CORS origin enforcement in production environment
- [x] Rate limiting active on all public API routes
- [x] IP masking active in all structured logs (IPv4 `/24`, IPv6 `/48`)
- [x] Zero cookie issuance verified across all endpoints
- [x] All dependency vulnerabilities resolved (`npm audit` reports 0 issues)
- [x] Self-contained memory footprint verified under 512MB RAM free-tier limits
