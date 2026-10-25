# OpenSearch Privacy Model & Data-Flow Contract

**Document Version:** 1.0.0  
**Milestone:** 26 — Repository Audit and Baseline  
**Phase:** 68 — Product Requirements and Privacy Contract  
**Status:** Canonical Architectural Specification  
**Date:** October 2026  

---

## 1. Threat Model & Privacy Architecture

OpenSearch's privacy architecture is built around defense against the commercial surveillance search paradigm:

```
[Threat Vector]                          [OpenSearch Defense]
├── Tracking Cookies & Profiling   ──►   Zero Set-Cookie headers; zero session tokens.
├── Search History Harvesting      ──►   Zero persistent query storage correlated with identity.
├── IP Correlation Across Queries  ──►   Immediate truncation (IPv4 /24 mask, IPv6 /48 mask).
├── Third-Party Ad / Analytics     ──►   Strict zero third-party CDNs, fonts, or tracking scripts.
├── Search Term Referrer Leaks     ──►   rel="noopener noreferrer" and strict Referrer-Policy.
└── Host vs Provider Confusion     ──►   Explicit network boundary demarcation + Privacy Receipt.
```

---

## 2. Network Boundaries: Browser-to-Host vs. Host-to-Provider

A fundamental privacy requirement is disambiguating client-to-server traffic from server-to-upstream traffic.

```
┌─────────────────┐           Boundary A            ┌───────────────────┐           Boundary B            ┌─────────────────────┐
│                 │  (Browser-to-Host Traffic)      │                   │   (Host-to-Provider Traffic)    │                     │
│   User Client   │ ──────────────────────────────► │  OpenSearch Host  │ ──────────────────────────────► │  External Providers │
│ (Browser / CLI) │ ◄────────────────────────────── │   Server Node     │ ◄────────────────────────────── │ (Wikimedia/APIs/Web)│
└─────────────────┘                                 └───────────────────┘                                 └─────────────────────┘
```

### 2.1 Boundary A: Browser-to-Host Traffic

- **What Transits:**
  - HTTP `GET` request to `/api/v1/search?q={query}&page={page}`.
  - Standard HTTP headers (`User-Agent`, `Accept-Language`, client IP address).
- **Host Handling:**
  - Client IP address is **immediately truncated** in operational memory before any log output is generated:
    - IPv4: `192.168.1.150` $\to$ `192.168.1.0` (`/24` subnet mask).
    - IPv6: `2001:0db8:85a3:0000:0000:8a2e:0370:7334` $\to$ `2001:0db8:85a3::` (`/48` prefix).
  - Raw client IP addresses are **never stored on disk or committed to persistent logs**.
  - Query parameters are processed in transient memory to retrieve postings.
  - Zero `Set-Cookie` headers are ever returned.
- **Self-Hosted vs. Shared Host Reality:**
  - When running locally (`localhost:3000`), Boundary A remains on the local loopback interface. No network entity receives the query.
  - When using a public/hosted instance, the host receives the incoming TCP/IP connection. OpenSearch guarantees the host software does not profile or retain queries, but cannot alter the underlying TCP/IP protocol.

### 2.2 Boundary B: Host-to-Provider Traffic

- **Standard Mode (Hybrid):**
  - If local index results are insufficient, the host queries configured external providers.
  - **What Transits:** Query string only to designated provider API endpoints.
  - **What NEVER Transits:** Client IP address, browser cookies, client user-agents, or persistent user identifiers. The provider sees the request as originating from the OpenSearch host server.
- **Local-Only Mode:**
  - **Boundary B is completely severed.**
  - Outbound requests to external search providers, scrapers, and remote endpoints are strictly blocked at the backend query planner level.
  - Zero bytes cross Boundary B.

---

## 3. The Privacy Receipt Specification

Every response from the OpenSearch API includes a versioned, typed **Privacy Receipt**. This receipt provides verifiable transparency for the exact execution of that query.

### 3.1 Receipt Schema (`PrivacyReceiptV1`)

```typescript
export interface PrivacyReceiptV1 {
  /** Receipt Schema Version */
  receiptVersion: '1.0.0';
  /** Unique request execution timestamp (ISO 8601) */
  timestamp: string;
  /** Active search privacy mode */
  mode: 'standard' | 'local-only';
  /** Host-level operational privacy behavior */
  hostBehavior: {
    ipTruncated: boolean;
    ipMask: 'ipv4-24' | 'ipv6-48' | 'loopback';
    queryLoggedToDisk: false;
    cookiesIssued: false;
    localStorageRequired: false;
  };
  /** Upstream external network dispatch telemetry */
  networkDispatch: {
    externalProvidersContacted: Array<{
      providerId: string;
      endpoint: string;
      purpose: 'web-retrieval' | 'instant-answer' | 'academic';
      queryTransmitted: boolean;
      statusCode: number;
      latencyMs: number;
    }>;
    externalProvidersSkipped: Array<{
      providerId: string;
      reason: 'local-only-mode' | 'sufficient-local-results' | 'rate-limited' | 'disabled';
    }>;
    totalOutboundRequests: number;
  };
  /** Browser / client isolation */
  clientIsolation: {
    thirdPartyScriptsPresent: false;
    analyticsPixelsPresent: false;
    referrerPolicyEnforced: 'strict-origin-when-cross-origin' | 'no-referrer';
    cspHeaderPresent: boolean;
  };
  /** Plain-language summary for non-technical users */
  userSummary: string;
}
```

### 3.2 User-Facing Plain-Language Translations

The UI renders the Privacy Receipt as an expandable badge near search results:

- **Local-Only Mode:**
  > *"🔒 **Local-Only Search:** Your query was processed entirely within the local search index on this server. Zero external search engines or remote websites were contacted."*
- **Standard Mode (Local Hits Only):**
  > *"🛡️ **Local Index Match:** Your query was resolved using only documents stored in our independent index. No outbound search calls were required."*
- **Standard Mode (Hybrid Retrieval):**
  > *"🌐 **Hybrid Search:** To provide comprehensive results, this server queried [Provider Name]. Your IP address was masked by our server; the provider never saw your computer or network identity."*

---

## 4. Operational Logging & Secrets Redaction

### 4.1 Allowed Operational Diagnostics (stdout)

Operational diagnostics are emitted as structured JSON to `stdout` exclusively for monitoring service availability and mitigating denial-of-service floods:

```json
{
  "timestamp": "2026-10-25T14:40:26.487Z",
  "level": "INFO",
  "module": "@opensearch/api",
  "method": "GET",
  "path": "/api/v1/search",
  "ip": "198.51.100.0",
  "statusCode": 200,
  "durationMs": 10
}
```

### 4.2 Prohibited Logging Patterns (Enforced via Tests)

The logger explicitly strips and redacts:
1. **Raw IP Addresses:** Last octet must be `.0` for IPv4 or `::` for IPv6.
2. **Credentials & Tokens:** Automatically redacts `password`, `secret`, `token`, `key`, `authorization`, `cookie`, `credential`, `apikey`.
3. **User-Query Correlated Identity:** Operational logs never output `{ query: "...", clientIp: "..." }` tuples.

---

## 5. Automated Verification & Testable Claims Matrix

Every privacy guarantee in this model corresponds to an automated regression test in the test suite:

| Privacy Guarantee | Formal Claim | Test Verification File | Verification Method |
| :--- | :--- | :--- | :--- |
| **Zero Cookies** | Response headers never contain `Set-Cookie` | `packages/shared/tests/privacy-audit.test.ts` | Asserts `set-cookie` header is undefined across all endpoints (`/`, `/health`, `/api/v1/search`, `/docs`). |
| **IP Truncation** | IPs are truncated before logging | `packages/shared/tests/privacy-audit.test.ts` | Validates `anonymizeIpAddress('192.168.1.150') === '192.168.1.0'`. |
| **Zero External Scripts** | HTML shells contain 0 third-party `<script>` or `<link>` tags | `packages/shared/tests/privacy-audit.test.ts` | Regex scan of rendered HTML verifying zero CDNs, Google Analytics, or external domains. |
| **Referrer Isolation** | External links use `rel="noopener noreferrer"` | `apps/web/tests/web.test.ts` | HTML parser verifies all external `<a>` tags enforce `rel="noopener noreferrer"`. |
| **Local-Only Boundary** | Zero outbound network calls in Local-only mode | Milestone 30 test suite (`Phase 86`) | Intercepts HTTP requests at Node socket layer to assert zero outbound calls. |
| **Strict CSP** | HTTP headers include restrictive Content-Security-Policy | `apps/api/tests/security-audit.test.ts` | Asserts CSP header contains `default-src 'self'` and blocks inline scripts. |

---

## 6. What OpenSearch Does Not Guarantee (Explicit Limitations)

1. **Host-Level Packet Inspection:** If a user accesses a remote hosted OpenSearch instance across the public internet, the transit network (ISPs, VPNs, routing hops) can observe that an HTTPS packet was sent to the host server. End-to-end anonymity requires Tor or a trusted VPN.
2. **Post-Click Third-Party Behavior:** Once a user clicks an external link to leave OpenSearch, the destination site operates under its own privacy policy. OpenSearch strips the HTTP Referrer but cannot govern destination site logging.
3. **Local Machine Security:** OpenSearch cannot defend against client-side malware, keyloggers, or compromised browser extensions running on the user's personal device.
