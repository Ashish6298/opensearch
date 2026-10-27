# Phase 91 — Evaluation Metrics Verification Report

**Milestone:** Milestone 32 — Search Quality Lab  
**Phase:** Phase 91 — Evaluation metrics  
**Date:** 2026-10-27  
**Branch:** `ashish`  
**Status:** **PASSED / READY FOR PHASE 92**

---

## 1. Overview & Objectives

Phase 91 implements the core information retrieval (IR) evaluation metrics for OpenSearch (`@opensearch/ranking`), establishing quantitative benchmark scoring for search quality across retrieval strategies, PageRank signal blending, and BM25 parameter sweeps.

---

## 2. Implemented Evaluation Metrics

### 2.1 Normalized Discounted Cumulative Gain (nDCG@k)
- **Discount:** $\frac{1}{\log_2(i + 1)}$ where $i$ is 1-based rank.
- **Gain Functions:**
  - `exponential` (default): $\text{gain}(g) = 2^g - 1$
  - `linear`: $\text{gain}(g) = g$
- **Ideal DCG (IDCG):** Computed dynamically by sorting ground-truth judgments descending.
- **Bounds:** Guaranteed in $[0.0, 1.0]$. Returns $0.0$ when IDCG is 0.

### 2.2 Mean Reciprocal Rank (MRR)
- **Reciprocal Rank (RR):** $\frac{1}{\text{rank}_1}$ where $\text{rank}_1$ is the first position meeting relevance threshold $\theta \ge 1$ (or $0.0$ if none retrieved).
- **MRR:** Arithmetic mean of RR across all evaluated queries.

### 2.3 Precision@k & Recall@k
- **Precision@k:** $\frac{\text{relevant retrieved within top } k}{k}$.
- **Recall@k:** $\frac{\text{relevant retrieved within top } k}{\text{total relevant in judgment pool}}$.
- **No Relevant Documents Policy:**
  - `zero` (default): returns $0.0$.
  - `one`: returns $1.0$ (vacuous truth).
  - `ignore`: excluded from macro-averaging.

### 2.4 Mean Average Precision (MAP@k)
- **Average Precision (AP):** $\frac{1}{\min(T_{\text{rel}}, k)} \sum_{i=1}^{\min(|R|, k)} (P@i \cdot \text{rel}(i))$.
- **MAP:** Arithmetic mean of AP across evaluated queries.

---

## 3. Edge-Case Handling & Determinism

### 3.1 Unjudged Documents (Missing Judgments)
- `zero` (default): Assigns grade 0, penalizing unverified retrieval.
- `ignore`: Omits unjudged items, measuring only known ground-truth items.
- `defaultGrade`: Assigns custom fallback grade.

### 3.2 Deterministic Tie-Breaking
- Equal scores: Document IDs sorted lexicographically ascending (`docId.localeCompare()`).
- Ideal ranking: Documents with equal grades sorted by document ID ascending.
- Evaluation output is bit-for-bit identical across multiple invocations.

---

## 4. Hand-Calculated Verification Fixtures

Tested against manual derivations in `packages/ranking/tests/evaluation-metrics.test.ts`:
- **Fixture A (4 documents, graded 3, 2, 1, 0; non-optimal order `[doc-B, doc-A, doc-D, doc-C]`):**
  - Expected DCG@4: $7.84718$ (computed: $7.84718$)
  - Expected IDCG@4: $9.39279$ (computed: $9.39279$)
  - Expected nDCG@4: $0.83545$ (computed: $0.83545$)
  - Expected P@4: $0.75$ (computed: $0.75$)
  - Expected R@4: $1.0$ (computed: $1.0$)
  - Expected RR: $1.0$ (computed: $1.0$)
  - Expected AP@4: $0.91667$ (computed: $0.91667$)
- **Fixture B (Perfect order):** nDCG = $1.0$, MRR = $1.0$, MAP = $1.0$.
- **Fixture C (All irrelevant):** nDCG = $0.0$, MRR = $0.0$, MAP = $0.0$.
- **Fixture D (Linear gain formulation):** exact match with manual derivation.

---

## 5. Test & Quality Audit Summary

- **Evaluation Metrics Test Suite:** 19/19 tests passed (19ms).
- **Ranking Package Suite:** 16 test files, 199 tests passed.
- **Monorepo Full Suite:** 76 test files, 822 tests passed, 0 failures.
- **TypeScript Composite Typecheck (`tsc -b`):** 0 errors.

---

## 6. Readiness for Next Phase

- **Status:** **`READY FOR NEXT PHASE`**
- Ready to proceed to **Phase 92 — Experiment runner** (CLI command, parameter sweeps for BM25/ranking weights, JSON/Markdown reporting).
