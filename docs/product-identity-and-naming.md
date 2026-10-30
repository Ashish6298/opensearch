# Product Identity and Trademark Disambiguation

## Overview

This document defines the official product naming, branding policy, and trademark disambiguation architecture for **OpenSearch Web** (Milestone 39, Phase 114).

---

## 1. Context and Potential Confusion Assessment

The project name "OpenSearch" interacts with two distinct existing entities in the technology landscape:

1. **Amazon OpenSearch Service / The OpenSearch Project (AWS / Linux Foundation)**:
   - A distributed search and analytics engine derived from Elasticsearch and Kibana (Apache 2.0).
   - Widely associated with AWS cloud infrastructure, server-side log indexing, and distributed enterprise search clusters.
2. **OpenSearch 1.1 Specification (A9 / OpenSearch Community)**:
   - An open specification format (draft 6) defining browser autodiscovery description documents (`opensearch.xml`), search URL templates, and suggestion syndication protocols.
3. **OpenSearch Web (This Project)**:
   - An independent, sovereign, privacy-preserving web search engine featuring local BM25 ranking, federated query dispatch, zero user tracking, and transparent Privacy Receipts.

### Confusion Risk Matrix & Mitigation Strategy

| Dimension | Amazon OpenSearch (AWS) | OpenSearch 1.1 Specification | OpenSearch Web (This Project) |
| :--- | :--- | :--- | :--- |
| **Domain** | Cloud log analytics & cluster search | Browser search descriptor XML format | Web search engine & privacy federation |
| **Public Identity** | "Amazon OpenSearch Service" / "OpenSearch Project" | "OpenSearch Description Document" | **"OpenSearch Web"** |
| **Risk of Confusion** | High if marketed simply as "OpenSearch" | Moderate due to shared protocol naming | Mitigated by explicit qualifier "Web" and disclaimers |
| **Mitigation Applied** | Explicit non-affiliation disclaimer across all public touchpoints | References compliance with standard (`<ShortName>OpenSearch Web</ShortName>`) | Distinct brand: **OpenSearch Web** |

---

## 2. Naming Standards & Architectural Invariants

### Distinct Public Product Name: `OpenSearch Web`
For all outward-facing surfaces, user interfaces, documentation, browser integration, API metadata, and public releases:
- **Full Name**: `OpenSearch Web — Sovereign Privacy-Preserving Search Engine`
- **Short / Display Name**: `OpenSearch Web`
- **Browser ShortName**: `OpenSearch Web`

### Intentional Internal & Legacy Invariants
To preserve workspace compatibility, code clarity, and historical package references without breaking changes:
- **Package Scope**: `@opensearch/*` (e.g., `@opensearch/shared`, `@opensearch/api`, `@opensearch/indexer`, `@opensearch/crawler`)
- **Internal Engine Constant**: `PROJECT_NAME = 'OpenSearch'`
- **Git Repository**: `opensearch`
- **Specification Alignment**: XML root `<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">`

---

## 3. Legal Disclaimers & Trademark Stance

> [!IMPORTANT]
> **No Claim of Legal Trademark Clearance**
> OpenSearch Web is an independent open-source project. **No claim of legal trademark clearance, registration, or proprietary trademark ownership is asserted or implied.**
> All trademarks, service marks, and trade names mentioned in this project are the property of their respective owners.

### Official Non-Affiliation Disclaimer
```text
OpenSearch Web is an independent software project. It is not affiliated with, funded by, or endorsed by Amazon Web Services, Inc. (AWS) or the Amazon OpenSearch project.
```

---

## 4. Implementation Across Surfaces

### A. Shared Substrate (`packages/shared`)
The central constants in `packages/shared/src/constants.ts` and `packages/shared/src/index.ts` define:
- `PRODUCT_IDENTITY.distinctName`: `'OpenSearch Web'`
- `PRODUCT_IDENTITY.legalDisclaimer`: Non-affiliation disclaimer
- `PRODUCT_IDENTITY.trademarkNotice`: Non-claim of trademark clearance
- `getProjectIdentity()`: Programmatic interface returning both internal engine identifiers and distinct public identity.

### B. REST API Endpoints (`apps/api`)
- `GET /`: Exposes `product: "OpenSearch Web"`, `fullName`, and `legal` metadata including disclaimer, non-affiliation, and trademark statement.
- `GET /api/v1/status`: Returns system status annotated with product identity and legal metadata.
- `GET /opensearch.xml`: Serves browser autodiscovery XML with `<ShortName>OpenSearch Web</ShortName>` and embedded non-affiliation comment.
- `GET /docs`: Interactive Swagger-style documentation displays `OpenSearch Web` branding and disclaimer.

### C. Web Frontend (`apps/web`)
- Document title: `<title>OpenSearch Web — Privacy-First Web Search</title>`.
- OpenSearch `<link>` tag: `title="OpenSearch Web"`.
- Terminal UI Footer: Includes a `.footer-identity-notice` clarifying that OpenSearch Web is an independent project and not affiliated with AWS or the Amazon OpenSearch project.
- `/browser-search` help page: Clear instructions on installing OpenSearch Web into Firefox, Chrome, Edge, and Safari with explicit disambiguation.
