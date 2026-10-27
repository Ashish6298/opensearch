# OpenSearch — Search Quality Judged Query Dataset

**Milestone:** Milestone 32 — Search Quality Lab  
**Phase:** Phase 90 — Judged query dataset  
**Schema Version:** `1.0.0`  
**License:** [CC0-1.0 Universal (Public Domain)](https://creativecommons.org/publicdomain/zero/1.0/)  
**Curator:** OpenSearch Quality Engineering Guild

---

## 1. Overview & Information Retrieval Purpose

The **OpenSearch Judged Query Dataset** provides an offline, deterministic, and privacy-first ground-truth evaluation benchmark for Information Retrieval (IR) quality assessments.

It enables repeatable evaluations of ranking algorithms (BM25, PageRank, Field Boosts, Freshness, and Query Expansion) against expert-annotated relevance labels without relying on runtime networks, external search engines, or private user telemetry.

---

## 2. Privacy & Zero-Telemetry Invariant

In strict adherence to OpenSearch's privacy model:
- **Zero Real-World Query Logs:** No raw server access logs, clickstream tracking, or user search histories are used.
- **Zero Identifiers:** No user IDs, session cookies, IP addresses, or device fingerprints exist in the dataset.
- **Pure Synthetic Curation:** All queries represent public educational, technical, and everyday information needs constructed from public documentation and curricula.

---

## 3. Four-Level Graded Relevance Rubric

Relevance judgments are annotated on a discrete 4-level scale ($0 \le \text{grade} \le 3$), following standard TREC and MS MARCO Information Retrieval methodologies:

| Grade | Label | Description | Criteria & Annotation Rule |
|:---:|:---:|:---|:---|
| **3** | **Perfect** | Definitive & Authoritative | Directly answers the intent with highest authority. For navigational searches, it is the official homepage. For programming/research, it is official docs or canonical peer-reviewed publications. |
| **2** | **Relevant** | Substantial & Accurate | Contains comprehensive, accurate information directly satisfying the query, but is not the sole canonical reference. |
| **1** | **Marginal** | Peripheral / Secondary Sense | Mentions the topic tangentially, or satisfies a valid secondary interpretation in an ambiguous query. |
| **0** | **Irrelevant** | Off-Topic / Keyword Collision | Does not satisfy the user's intent. Includes unrelated domains, spam, or false lexical collisions. |

---

## 4. Query Categories & Taxonomies

The dataset is systematically balanced across 5 query categories:

1. **Everyday Information (`everyday`)**:
   - Universal utility searches: time zones, metric conversions, first aid, public transit schedules, leavening agents.
2. **Education (`education`)**:
   - Core scientific and historical concepts: photosynthesis, cell division, calculus derivatives, laws of motion, water cycle, French Revolution.
3. **Programming (`programming`)**:
   - Software engineering syntax and systems: TypeScript generic constraints, Python comprehensions, Rust async/Tokio, Git cherry-pick, Docker networking, SQL indexing.
4. **Research (`research`)**:
   - Foundational computer science and math papers: Okapi BM25, PageRank power iteration, zk-SNARKs, Transformer self-attention, Raft consensus, Diffie-Hellman.
5. **Ambiguous Queries (`ambiguous`)**:
   - Polysemous terms requiring balanced multi-intent representation: `apple` (fruit vs tech), `mercury` (element vs planet vs god), `rust` (corrosion vs language), `java` (island vs programming vs coffee), `amazon` (biome vs retail).

---

## 5. Dataset Partitions: Tuning vs. Held-Out

To prevent overfitting ranking weights to benchmark queries:
- **`tuning` (50% of queries)**: Designated for parameter sweeps, BM25 $(k_1, b)$ grid searches, and signal weight estimation.
- **`held_out` (50% of queries)**: Strictly held out for blind final validation and regression testing.

---

## 6. Datasets Summary

| Dataset File | Target Environment | Total Queries | Total Judgments | Splits |
|---|---|:---:|:---:|:---:|
| `data/quality/ci-judged-dataset.json` | Continuous Integration / Unit Tests | 20 | 68 | 10 Tuning / 10 Held-out |
| `data/quality/full-judged-dataset.json` | Local Quality Lab / Parameter Sweeps | 40 | 136 | 20 Tuning / 20 Held-out |

---

## 7. Programmatic Usage in `@opensearch/ranking`

```typescript
import {
  CI_JUDGED_DATASET,
  FULL_JUDGED_DATASET,
  getTuningQueries,
  getHeldOutQueries,
  getQueriesByCategory,
  filterJudgedDataset,
  validateJudgedDataset,
} from '@opensearch/ranking';

// 1. Validate dataset integrity
const { valid, errors } = validateJudgedDataset(CI_JUDGED_DATASET);

// 2. Extract tuning partition for BM25 parameter optimization
const tuningQueries = getTuningQueries(CI_JUDGED_DATASET);

// 3. Extract held-out partition for unbiased scoring
const testQueries = getHeldOutQueries(CI_JUDGED_DATASET);

// 4. Query specific categories
const programmingQueries = getQueriesByCategory('programming', FULL_JUDGED_DATASET);
```
