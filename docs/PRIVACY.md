# OpenSearch Privacy & Data Minimization Policy (V1.0.0)

> **Document Classification:** Public Architecture & Security Policy  
> **Status:** Production Policy (V1.0.0)  
> **Project Principle:** Strict Privacy-First & Data Minimization

---

## 1. Executive Summary

OpenSearch is designed from first principles as an independent, privacy-respecting search engine. Unlike commercial search engines that collect user profiles, search histories, device fingerprints, and location data to monetize via advertising, OpenSearch operates under a strict **Zero-Tracking, Zero-Profiling, and Data-Minimization Policy**.

---

## 2. Core Privacy Guarantees

| Category                          | Policy / Implementation                                                                                                       | Guarantee                         |
| :-------------------------------- | :---------------------------------------------------------------------------------------------------------------------------- | :-------------------------------- |
| **User Accounts**                 | Zero account system. No registration, login, or identity storage.                                                             | **No Accounts Required**          |
| **Search Queries**                | Queries are processed strictly transiently in-memory for index retrieval and scoring. No query logging database exists.       | **Zero Query Retention**          |
| **Cookies & Trackers**            | Zero `Set-Cookie` headers. No session cookies, tracking cookies, or tracking IDs.                                             | **Zero Cookie Usage**             |
| **Client Storage**                | No `localStorage` or `sessionStorage` tracking or profiling keys.                                                             | **No Client-Side Fingerprinting** |
| **IP Address Logging**            | Operational request logs immediately mask/truncate IP addresses (IPv4 `/24` e.g. `192.168.1.0`, IPv6 `/48`).                  | **Anonymized IP Handling**        |
| **Third-Party CDNs & Scripts**    | All CSS and JavaScript are self-hosted and inlined. Zero external scripts (Google Analytics, Mixpanel, Facebook Pixel, etc.). | **Zero Third-Party Telemetry**    |
| **External Result Links**         | Outbound links to crawled websites include `rel="noopener noreferrer"`.                                                       | **Zero Referrer Leakage**         |
| **Content Security Policy (CSP)** | Enforces strict CSP: `default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`.                       | **Zero Unauthorized Execution**   |

---

## 3. Operational Logging & Minimization Audit

### 3.1 What We Log

For operational diagnostic purposes and rate-limiting defense, OpenSearch logs minimal structured diagnostic metadata to standard output (`stdout`):

- HTTP Request Method (e.g. `GET`)
- Normalized Request Path (e.g. `/api/v1/search`)
- Anonymized IP Address (e.g. `203.0.113.0` or `127.0.0.0`)
- HTTP Status Code (e.g. `200`, `400`, `429`)
- Processing Duration in milliseconds (e.g. `12ms`)

### 3.2 What We NEVER Log

- Raw, unmasked IP addresses
- User-identifying request headers (e.g., `Cookie`, `Authorization`)
- User search queries correlated with client identity
- Device fingerprints or browser histories
- Internal secrets, credentials, or tokens (automatically stripped via `redactSensitiveData()`)

---

## 4. Third-Party Dependencies & Zero-Telemetry Verification

1. **No External Fonts or Trackers:** Frontend HTML shells are completely self-contained.
2. **Deterministic BM25 Ranking:** Results are ranked solely on query relevance to indexed documents. There is no personalized re-ranking or behavioral manipulation.
3. **Open Source & Auditable:** All code is public, self-hostable, and contains zero closed-source tracking binaries.
