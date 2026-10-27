# Phase 93 — Ranking Regression Checks Verification Report

**Milestone:** Milestone 32 — Search Quality Lab  
**Phase:** Phase 93 — Ranking regression checks  
**Date:** 2026-10-27  
**Branch:** `ashish`  
**Status:** **PASSED / MILESTONE 32 COMPLETE / READY FOR MILESTONE 33 (PHASE 94)**

---

## 1. Executive Summary

Phase 93 establishes automated ranking regression gating and category trade-off review protocols in `@opensearch/ranking`. This concludes **Milestone 32 (Search Quality Lab)** by ensuring all future ranking adjustments (e.g. BM25 weight changes, PageRank updates, machine-learned scoring) receive reproducible, query-level regression checks in CI without masking individual regressions behind aggregate scores.

---

## 2. Regression Gate Thresholds & Specifications

### 2.1 Default Operational Thresholds
```typescript
export const DEFAULT_REGRESSION_THRESHOLDS: RegressionThresholds = {
  maxAggregateNdcgDrop: 0.01,          // Max 1.0% drop in overall macro nDCG
  maxAggregateMrrDrop: 0.02,           // Max 2.0% drop in overall MRR
  maxIndividualQueryNdcgDrop: 0.10,    // Hard cap: single query drop > 0.10 fails gate
  maxCategoryNdcgDrop: 0.03,           // Max 0.03 drop for any semantic category
  categoryTradeoffDropThreshold: 0.02, // Drop of 0.02 in one category while another gains triggers review
  maxAllowedRegressionRatio: 0.20,     // At most 20% of evaluated queries may regress
};
```

### 2.2 Anti-Hiding Architecture
A central vulnerability of IR evaluation is hiding severe regressions behind an improving macro average.
Phase 93 explicitly audits:
- **Individual Query Drops:** Any query dropping $> 0.10$ nDCG is classified as `SEVERE_REGRESSION` and fails the gate, even if 90% of other queries improved.
- **Severity Classifications:** `severe` ($<-0.10$), `moderate` ($-0.10\dots -0.05$), `minor` ($-0.05\dots -0.001$), `none` ($\ge -0.001$).

### 2.3 Category Trade-Off Protocol
- Evaluates whether one semantic category (e.g. `programming`) improved at the direct expense of another (e.g. `everyday` or `education`).
- If an algorithmic change boosts code search but degrades medical or everyday search, `requiresReview: true` is triggered, requiring human engineering sign-off.

### 2.4 Lightweight Continuous Integration Gate (`runCiRegressionGate`)
- Evaluates against the deterministic, offline `CI_JUDGED_DATASET` (20 queries, 63 judgments).
- **Execution Runtime:** < 30ms (observed: 26ms).
- Zero network requests, zero flake risk, zero external dependencies.

### 2.5 Zero-PII Assurance
- All regression suites consume solely CC0-1.0 public curriculum queries.
- Automated regex scans assert zero emails, IPv4/IPv6 addresses, or live user tokens exist.

---

## 3. Test & Quality Audit Summary

- **Ranking Regression Checks Suite** (`packages/ranking/tests/ranking-regression.test.ts`): 7/7 tests passed (26ms).
- **Ranking Package Suite:** 18 test files, 214 tests passed.
- **Monorepo Full Suite:** 79 test files, 843 total tests passed, 0 failures.
- **TypeScript Composite Typecheck (`tsc -b`):** 0 errors.

---

## 4. Milestone 32 Completion & Next Steps

- **Milestone 32 (Search Quality Lab)** is 100% complete:
  - Phase 90: Judged query dataset (CI & Full evaluation sets, schema v1.0.0, zero-PII)
  - Phase 91: Evaluation metrics (nDCG@k, MRR, MAP, Precision@k, Recall@k, hand fixtures)
  - Phase 92: Experiment runner (CLI `opensearch experiment`, parameter sweeps, JSON/MD exports)
  - Phase 93: Ranking regression checks (regression thresholds, anti-hiding gate, trade-off review)
- **Ready for Milestone 33 (Performance and Large-Scale Search), Phase 94 — Benchmark harness**.
