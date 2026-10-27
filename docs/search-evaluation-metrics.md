# Information Retrieval Evaluation Metrics & Policies

**Milestone:** Milestone 32 — Search Quality Lab  
**Phase:** Phase 91 — Evaluation metrics  
**Package:** `@opensearch/ranking`  
**Schema Version:** 1.0.0  

---

## 1. Overview & Mathematical Foundations

The OpenSearch Evaluation Metrics engine provides standardized, deterministic, offline Information Retrieval (IR) metrics to benchmark ranking algorithms, PageRank integrations, and BM25 parameter sweeps without external dependencies or online tracking.

---

## 2. Core Metric Formulations

### 2.1 Discounted Cumulative Gain (DCG@k) & Normalized DCG (nDCG@k)

Given a ranked list of retrieved documents $R = [d_1, d_2, \dots, d_{\min(|R|, k)}]$ and their associated relevance grades $g(d_i) \in \{0, 1, 2, 3\}$:

#### Gain Formulations:
- **Exponential Gain (Default / TREC Standard):**
  $$\text{gain}(g) = 2^g - 1$$
- **Linear Gain:**
  $$\text{gain}(g) = g$$

#### Discount Function:
$$\text{discount}(i) = \log_2(i + 1)$$

#### Discounted Cumulative Gain:
$$\text{DCG}@k = \sum_{i=1}^{\min(|R|, k)} \frac{2^{g(d_i)} - 1}{\log_2(i + 1)}$$

#### Ideal DCG (IDCG@k):
Let $g_{(1)} \ge g_{(2)} \ge \dots \ge g_{(N)}$ be all judged documents available in the ground-truth judgment pool for query $q$, sorted in descending order of relevance.
$$\text{IDCG}@k = \sum_{i=1}^{\min(N, k)} \frac{2^{g_{(i)}} - 1}{\log_2(i + 1)}$$

#### Normalized DCG (nDCG@k):
$$\text{nDCG}@k = \begin{cases} 0.0 & \text{if } \text{IDCG}@k = 0 \\ \min\left(1.0, \frac{\text{DCG}@k}{\text{IDCG}@k}\right) & \text{otherwise} \end{cases}$$

---

### 2.2 Precision@k (P@k)
Measures the proportion of retrieved documents within the top $k$ ranks that meet or exceed the binary relevance threshold $\theta$ (default $\theta = 1$ for marginal or higher):

$$\text{Precision}@k = \frac{\sum_{i=1}^{\min(|R|, k)} \mathbb{I}[g(d_i) \ge \theta]}{k}$$

If $|R| < k$, missing ranks are treated as unretrieved (irrelevant).

---

### 2.3 Recall@k (R@k)
Measures the fraction of total known relevant documents in the judgment pool that were retrieved within the top $k$ positions:

Let $T_{\text{rel}} = \sum_{d \in \text{judgments}(q)} \mathbb{I}[g(d) \ge \theta]$.

$$\text{Recall}@k = \begin{cases} \text{Policy}(T_{\text{rel}} = 0) & \text{if } T_{\text{rel}} = 0 \\ \min\left(1.0, \frac{\sum_{i=1}^{\min(|R|, k)} \mathbb{I}[g(d_i) \ge \theta]}{T_{\text{rel}}}\right) & \text{otherwise} \end{cases}$$

---

### 2.4 Reciprocal Rank (RR) & Mean Reciprocal Rank (MRR)
For a query $q$, Reciprocal Rank is the multiplicative inverse of the 1-based rank of the first retrieved document that satisfies $g(d) \ge \theta$:

$$\text{RR}(q) = \begin{cases} \frac{1}{\text{rank}_1} & \text{if a relevant document is retrieved at rank}_1 \le k \\ 0.0 & \text{if no relevant document is retrieved within top } k \end{cases}$$

Across a benchmark set of $Q$ queries:
$$\text{MRR} = \frac{1}{|Q|} \sum_{q \in Q} \text{RR}(q)$$

---

### 2.5 Average Precision (AP@k) & Mean Average Precision (MAP)
Average Precision evaluates the precision at every rank where a relevant document is retrieved, normalized by the total relevant documents (or cutoff $k$):

$$\text{AP}@k = \frac{1}{\min(T_{\text{rel}}, k)} \sum_{i=1}^{\min(|R|, k)} \Big( \text{Precision}@i \cdot \mathbb{I}[g(d_i) \ge \theta] \Big)$$

For queries with $T_{\text{rel}} = 0$, the configurable `noRelevantDocsPolicy` applies.

Across $Q$ queries:
$$\text{MAP} = \frac{1}{|Q|} \sum_{q \in Q} \text{AP}@k(q)$$

---

## 3. Explicit Edge Case Policies

### 3.1 Treatment of Missing Judgments (Unjudged Documents)
When a search engine retrieves documents not present in the curated ground truth pool:
1. **`zero` (Default):** Unjudged documents are assigned grade 0 (non-relevant). This is standard in TREC, MS MARCO, and BEIR to penalize retrieving unverified documents.
2. **`ignore`:** Unjudged documents are omitted from the retrieved list prior to computing metrics, evaluating only known items.
3. **`defaultGrade`:** Unjudged documents receive a user-specified fallback grade (e.g. 0 or 1).

### 3.2 Treatment of Queries with Zero Relevant Documents
When a query has $T_{\text{rel}} = 0$ in its judgment pool:
1. **`zero` (Default):** Recall@k and AP@k return `0.0`.
2. **`one`:** Returns `1.0` (vacuously true, zero false negatives).
3. **`ignore`:** Query is skipped when calculating macro-averages (MRR, MAP, mean nDCG) in `evaluateQuerySet()`.

---

## 4. Deterministic Tie-Breaking Rules

To ensure 100% reproducible metric output across platforms and environments:
1. **Candidate Score Ties:** When retrieved items share identical scores, tie-breaking sorts lexicographically ascending by document identifier (`a.id.localeCompare(b.id)`).
2. **Ground-Truth Ideal Ordering (IDCG):** When multiple judged documents share the identical relevance grade, tie-breaking sorts lexicographically ascending by document identifier.

---

## 5. Hand-Calculated Verification Fixtures

### Fixture A: 4-Document Non-Optimal Retrieval
- **Ground Truth:** `doc-A: 3`, `doc-B: 2`, `doc-C: 1`, `doc-D: 0`.
- **Retrieved Ranking:** `[doc-B, doc-A, doc-D, doc-C]`.
- **Threshold:** $\theta = 1$ (grades 3, 2, 1 relevant; $T_{\text{rel}} = 3$).

#### Hand Derivations:
1. **DCG@4:**
   - Rank 1 (`doc-B`, grade 2): $(2^2 - 1) / \log_2(2) = 3 / 1 = 3.0$
   - Rank 2 (`doc-A`, grade 3): $(2^3 - 1) / \log_2(3) = 7 / 1.584962500721156 = 4.416508275...$
   - Rank 3 (`doc-D`, grade 0): $(2^0 - 1) / \log_2(4) = 0 / 2 = 0.0$
   - Rank 4 (`doc-C`, grade 1): $(2^1 - 1) / \log_2(5) = 1 / 2.321928094887362 = 0.430676558...$
   - **Total DCG@4:** $3.0 + 4.416508275 + 0.0 + 0.430676558 = 7.847184833...$

2. **IDCG@4:**
   - Ideal Order: `[doc-A (3), doc-B (2), doc-C (1), doc-D (0)]`
   - Rank 1: $(2^3 - 1) / \log_2(2) = 7.0$
   - Rank 2: $(2^2 - 1) / \log_2(3) = 3 / 1.584962500721156 = 1.892789260...$
   - Rank 3: $(2^1 - 1) / \log_2(4) = 1 / 2 = 0.5$
   - Rank 4: $(2^0 - 1) / \log_2(5) = 0.0$
   - **Total IDCG@4:** $7.0 + 1.892789260 + 0.5 + 0.0 = 9.392789260...$

3. **nDCG@4:**
   - $7.847184833 / 9.392789260 = \mathbf{0.83544778...}$

4. **Precision & Recall:**
   - **P@2:** $2 / 2 = \mathbf{1.0}$
   - **P@4:** $3 / 4 = \mathbf{0.75}$
   - **R@2:** $2 / 3 = \mathbf{0.66666666...}$
   - **R@4:** $3 / 3 = \mathbf{1.0}$

5. **Reciprocal Rank:**
   - First relevant is at rank 1 (`doc-B`) $\to \text{RR} = 1 / 1 = \mathbf{1.0}$.

6. **Average Precision (AP@4):**
   - Rank 1 (`doc-B`, rel): $P@1 = 1/1 = 1.0$
   - Rank 2 (`doc-A`, rel): $P@2 = 2/2 = 1.0$
   - Rank 3 (`doc-D`, not rel): $0$
   - Rank 4 (`doc-C`, rel): $P@4 = 3/4 = 0.75$
   - Sum $= 1.0 + 1.0 + 0.75 = 2.75$
   - $\text{AP}@4 = 2.75 / \min(3, 4) = 2.75 / 3 = \mathbf{0.91666666...}$
