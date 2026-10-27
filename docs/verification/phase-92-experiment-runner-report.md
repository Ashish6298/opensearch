# Phase 92 — Experiment Runner Verification Report

**Milestone:** Milestone 32 — Search Quality Lab  
**Phase:** Phase 92 — Experiment runner  
**Date:** 2026-10-27  
**Branch:** `ashish`  
**Status:** **PASSED / READY FOR PHASE 93**

---

## 1. Overview & Architectural Capabilities

Phase 92 implements the offline ranking Experiment Runner and CLI evaluation suite for OpenSearch (`@opensearch/ranking` & `@opensearch/cli`). This enables reproducible benchmarking, controlled parameter sweeps across BM25 and PageRank signals, side-by-side baseline comparisons, and exportable audit reports.

---

## 2. Implemented Features & Modules

### 2.1 CLI Experiment Command (`opensearch experiment`)
Integrated into `@opensearch/cli`:
```bash
# Compare candidate parameter adjustments against baseline on CI tuning split
opensearch experiment --dataset ci --split tuning --k1 1.5 --b 0.8 --pagerank-weight 0.25

# Execute multi-parameter grid sweep and export reports
opensearch experiment --sweep --dataset ci --out-json ./sweep.json --out-md ./sweep.md
```

### 2.2 Comprehensive Experiment Record & Reproducibility
Every experiment run records:
- `experimentId`: unique execution identifier.
- `timestamp`: ISO timestamp.
- `runtimeMs`: execution duration.
- `indexVersion`: active index schema version.
- `datasetName` & `datasetVersion`: dataset metadata.
- `datasetSplit`: partition used (`tuning`, `held_out`, or `all`).
- `queryCount`: evaluated queries count.
- `rankingConfig`: complete snapshot of baseline and candidate parameter dictionaries.
- `metricOptions`: cutoff $k$, gain method, unjudged doc policy, no-relevant policy.
- `productionSafeguard`: mandatory anti-auto-tuning banner.

### 2.3 Baseline vs. Candidate Ranking Comparison
- **Metric Deltas:** Evaluates nDCG@k, MRR, MAP, Precision@k, Recall@k with absolute ($\Delta$) and relative ($\%\Delta$) changes.
- **Win / Tie / Loss Distribution:** Tracks individual query wins, ties, and losses.
- **Category Breakdown:** Reports per-category performance across everyday, education, programming, research, and ambiguous queries.
- **Evidence Verification:** Improvement is claimed *only* when statistically verified ($\Delta \text{nDCG} > 0.005$ and $\text{Wins} \ge \text{Losses}$). No improvements are claimed without evidence.

### 2.4 Controlled Parameter Grid Sweeps (`runParameterSweep`)
- Evaluates Cartesian products of BM25 ($k_1, b, \text{titleBoost}$) and PageRank ($\text{weight}, \text{transform}$) parameters.
- Deterministically ranks configurations descending by mean nDCG and MRR.
- Identifies Rank 1 optimal configuration.

### 2.5 Strict Production Auto-Tuning Safeguard
- In accordance with the acceptance criteria ("Do not automatically tune production ranking based on unreviewed feedback"), automated modification of production configurations is strictly prohibited.
- Every experiment output contains the safeguard notice:
  > *Automated production tuning is strictly prohibited. Any ranking adjustments require manual review and pull request approval.*

---

## 3. Test & Quality Audit Summary

- **Experiment Runner Test Suite** (`packages/ranking/tests/experiment-runner.test.ts`): 8/8 tests passed (30ms).
- **CLI Experiment Test Suite** (`packages/cli/tests/cli-experiment.test.ts`): 6/6 tests passed (32ms).
- **Monorepo Full Suite:** 78 test files, 836 total tests passed, 0 failures.
- **TypeScript Composite Typecheck (`tsc -b`):** 0 errors.

---

## 4. Readiness for Next Phase

- **Status:** **`READY FOR NEXT PHASE`**
- Ready to proceed to **Phase 93 — Ranking regression checks** (acceptable regression thresholds, CI deterministic evaluation, query-level regressions, category trade-offs).
