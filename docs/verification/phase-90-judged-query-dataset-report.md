# Phase 90 — Judged Query Dataset Verification Report

**Milestone:** Milestone 32 — Search Quality Lab  
**Phase:** Phase 90 — Judged query dataset  
**Date:** 2026-10-27  
**Branch:** `ashish`  
**Status:** **PASSED / READY FOR PHASE 91**

---

## 1. Executive Summary

Phase 90 introduces a structured, privacy-preserving, and versioned relevance judgment dataset framework into `@opensearch/ranking`. This establishes the offline evaluation foundation for the Search Quality Lab (Milestone 32), enabling quantitative benchmarking (NDCG, MAP, MRR) without network dependencies or privacy risks.

---

## 2. Dataset Architecture & Specifications

### 2.1 Schema Definition (`JudgedDataset` v1.0.0)
Located in [`packages/ranking/src/evaluation/judged-dataset-types.ts`](file:///D:/OPENSEARCH/packages/ranking/src/evaluation/judged-dataset-types.ts):
- **4-Level Graded Relevance Scale:**
  - `3` (**Perfect**): Definitive answer or primary canonical resource.
  - `2` (**Relevant**): Highly useful and directly addresses query intent.
  - `1` (**Marginal**): Tangentially relevant or context background.
  - `0` (**Irrelevant**): Off-topic, spam, or distractor.
- **Five Search Intent Categories:**
  - `everyday`: Common consumer queries (e.g. recipes, transit, weather).
  - `education`: Academic and pedagogical inquiries (e.g. physics, photosynthesis, calculus).
  - `programming`: Software engineering and API lookups (e.g. TypeScript interfaces, React hooks, Rust memory safety).
  - `research`: Advanced scientific and technical topics (e.g. quantum supremacy, CRISPR, NLP transformers).
  - `ambiguous`: Polysemous entities requiring disambiguation (e.g. Mercury, Apple, Python, Java).
- **Split Segmentation:**
  - `tuning`: 50% of queries reserved for parameter sweeps and ranking tuning.
  - `held_out`: 50% held-out test set for unbiased offline validation.

### 2.2 Datasets Provided
1. **CI Dataset (`CI_JUDGED_DATASET` / `ci-judged-dataset.json`):**
   - 20 queries, 63 judged document pairs.
   - 10 tuning queries, 10 held-out queries.
   - Execution time: < 15ms.
2. **Full Local Evaluation Dataset (`FULL_JUDGED_DATASET` / `full-judged-dataset.json`):**
   - 40 queries, 106 judged document pairs.
   - 20 tuning queries, 20 held-out queries.
   - Rich collection across multi-faceted query types.

---

## 3. Privacy, Provenance & Licensing

- **Zero PII & Synthetic Curation:**
  - Hand-curated from public open curriculum sources (MDN Web Docs, W3C specifications, Wikipedia public summaries).
  - Zero personal search histories, zero user IPs, zero session cookies, and zero production logs.
- **Automated Privacy Scanner:**
  - `scanDatasetForPrivacyViolations()` inspects every query, URL, and snippet with regex rules for emails, IPv4/IPv6 addresses, auth tokens, and phone numbers. 0 violations detected.
- **License:** CC0-1.0 Universal (Public Domain Dedication).
- **Offline Guarantee:** Evaluates completely offline with zero outbound HTTP calls.

---

## 4. Verification & Test Suite

### 4.1 Unit & Integration Tests
`packages/ranking/tests/judged-query-dataset.test.ts` (13 tests):
- Schema validation for CI and Full datasets (`validateJudgedDataset`).
- Category distribution checks across all 5 categories.
- Strict 50/50 tuning vs held_out split verification.
- Relevance grade bounds invariants (0 to 3).
- Automated regex PII audit on both datasets.
- Query filter utilities (`getTuningQueries`, `getHeldOutQueries`, `getQueriesByCategory`).
- Ideal Qrels extraction for NDCG.
- Rejection of invalid schema versions and out-of-bounds grades.
- Deserialization and validation of static JSON files from `data/quality/`.

### 4.2 Monorepo Test Summary
- **Ranking Package Tests:** 15 test files, 180 tests passed.
- **Full Monorepo Suite:** 75 test files, 803 tests passed, 0 failures.
- **TypeScript Typecheck (`tsc -b`):** 0 errors.

---

## 5. Next Steps

- **Milestone 32, Phase 91 — Evaluation metrics**: Implement NDCG@k, DCG@k, MRR, MAP, Precision@k, Recall@k evaluation calculations using this judged dataset.
