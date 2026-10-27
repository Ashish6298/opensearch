# Ranking Regression Gating & Category Trade-Off Standards

**Milestone:** Milestone 32 — Search Quality Lab  
**Phase:** Phase 93 — Ranking regression checks  
**Package:** `@opensearch/ranking`  
**Status:** **ACTIVE CONTINUOUS INTEGRATION GATE**  

---

## 1. Principles of Ranking Regression Gating

A high macro-averaged metric (such as global nDCG@10 or MAP) can easily conceal critical query-level degradation. For example, a ranking adjustment might increase average nDCG across 80% of queries while severely breaking navigational and factual educational queries.

To protect user experience and algorithmic integrity:
1. **Regressions Cannot Be Hidden Behind A Single Aggregate Score:** Query-level losses are audited, categorized by severity, and evaluated against strict drop ceilings.
2. **Category Trade-Offs Require Human Engineering Review:** If a ranking change improves one domain category (e.g. `programming`) at the direct expense of another (e.g. `everyday` or `education`), automated promotion is blocked and an engineering review is mandated.
3. **Continuous Integration (CI) Evaluation Must Be Lightweight & Deterministic:** CI gating runs exclusively on curated, deterministic datasets (`CI_JUDGED_DATASET`) in < 25ms without external network requests or flake.
4. **Zero-PII Assurance:** User queries from production logs are strictly prohibited from entering CI datasets or regression logs.

---

## 2. Regression Threshold Definitions

| Threshold Identifier | Default Value | Purpose |
| :--- | :--- | :--- |
| `maxAggregateNdcgDrop` | `0.01` (1.0%) | Ceiling for acceptable macro-average nDCG drop across all evaluated queries. |
| `maxAggregateMrrDrop` | `0.02` (2.0%) | Ceiling for acceptable macro-average Mean Reciprocal Rank drop. |
| `maxIndividualQueryNdcgDrop` | `0.10` | Hard threshold for an individual query. Any query dropping > 0.10 triggers a **SEVERE_REGRESSION** gate failure. |
| `maxCategoryNdcgDrop` | `0.03` | Ceiling for allowable drop in any single semantic category (`everyday`, `education`, etc.). |
| `categoryTradeoffDropThreshold` | `0.02` | If any category improves by > 0.01 while another category regresses by > 0.02, `requiresReview` is flagged. |
| `maxAllowedRegressionRatio` | `0.20` (20%) | No more than 20% of evaluated queries may exhibit negative metric shifts. |

---

## 3. Query-Level Severity Classifications

For each evaluated query $q$, the delta $\Delta \text{nDCG}(q) = \text{nDCG}_{\text{cand}}(q) - \text{nDCG}_{\text{base}}(q)$ is computed:

- **`severe` ($\Delta \text{nDCG} < -0.10$):** Catastrophic loss of relevance. The target canonical document was pushed out of the top ranks. Blocks merge gate.
- **`moderate` ($-0.10 \le \Delta \text{nDCG} < -0.05$):** Noticeable rank displacement. Reported in query regression logs.
- **`minor` ($-0.05 \le \Delta \text{nDCG} < -0.001$):** Slight score variance due to feature re-weighting.
- **`none` ($\Delta \text{nDCG} \ge -0.001$):** Query is neutral or improved.

---

## 4. Category Trade-Off Protocol

When evaluating candidate configurations:
1. Every query is labeled with its semantic category: `everyday`, `education`, `programming`, `research`, or `ambiguous`.
2. Macro-averages are computed per category.
3. If an algorithmic change benefits technical/programming search but degrades medical/educational queries, the gate outputs:
   ```
   ⚠️ REVIEW REQUIRED: Category 'programming' improved (+0.0512 nDCG) while category 'education' regressed (-0.0345 nDCG).
   ```
4. This requires explicit sign-off in the pull request review before deployment.

---

## 5. Lightweight CI Execution Model

In the automated test runner:
```typescript
import { runCiRegressionGate } from '@opensearch/ranking';

const result = runCiRegressionGate();
expect(result.passed).toBe(true);
expect(result.privacyVerified).toBe(true);
```
- Runtime: **< 25ms**
- Determinism: **100%**
- Outbound Network Calls: **0**
