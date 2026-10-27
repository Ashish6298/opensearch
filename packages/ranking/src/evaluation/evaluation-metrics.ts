/**
 * @opensearch/ranking — Evaluation Metrics Implementation (Phase 91)
 *
 * Implements standard, deterministic Information Retrieval (IR) evaluation metrics:
 * - nDCG@k: Normalized Discounted Cumulative Gain
 * - MRR: Mean Reciprocal Rank
 * - Precision@k: Relevant retrieved / k
 * - Recall@k: Relevant retrieved / total relevant in ground truth
 * - MAP@k: Mean Average Precision
 *
 * Features:
 * - Full support for missing judgment policies ('zero', 'ignore', 'defaultGrade')
 * - Explicit policies for queries with zero relevant documents ('zero', 'one', 'ignore')
 * - Deterministic tie-breaking (scores descending, document IDs ascending)
 * - Exponential (2^g - 1) and Linear (g) DCG gain formulations
 */

import { JudgedQueryCategory, RelevanceGrade } from './judged-dataset-types.js';
import {
  AggregateMetricsResult,
  CategoryMetricSummary,
  EvaluationMetricOptions,
  GainMethod,
  NoRelevantDocsPolicy,
  QueryMetricsResult,
  TieBreakingRule,
  UnjudgedDocPolicy,
} from './metrics-types.js';

// Default options adhering to IR and TREC standards
const DEFAULT_K = 10;
const DEFAULT_RELEVANCE_THRESHOLD: RelevanceGrade = 1;
const DEFAULT_GAIN_METHOD: GainMethod = 'exponential';
const DEFAULT_UNJUDGED_POLICY: UnjudgedDocPolicy = 'zero';
const DEFAULT_DEFAULT_GRADE: RelevanceGrade = 0;
const DEFAULT_NO_RELEVANT_POLICY: NoRelevantDocsPolicy = 'zero';
const DEFAULT_TIE_BREAKING: TieBreakingRule = 'docIdAsc';

/**
 * Calculates Discounted Cumulative Gain (DCG@k).
 *
 * Standard logarithmic discount: 1 / log2(rank + 1)
 * - Exponential gain: (2^g - 1) / log2(i + 1)  [Standard TREC]
 * - Linear gain: g / log2(i + 1)
 */
export function computeDCG(
  grades: number[],
  k: number = DEFAULT_K,
  gainMethod: GainMethod = DEFAULT_GAIN_METHOD,
): number {
  if (k <= 0 || grades.length === 0) {
    return 0.0;
  }

  const limit = Math.min(grades.length, k);
  let dcg = 0.0;

  for (let i = 0; i < limit; i++) {
    const grade = grades[i];
    if (grade === undefined || grade <= 0) {
      continue;
    }

    const rank = i + 1; // 1-based rank
    const gain = gainMethod === 'exponential' ? Math.pow(2, grade) - 1 : grade;
    const discount = Math.log2(rank + 1);

    dcg += gain / discount;
  }

  return dcg;
}

/**
 * Calculates Ideal Discounted Cumulative Gain (IDCG@k) by sorting known
 * ground truth judgments in descending order of grade.
 */
export function computeIDCG(
  judgedGrades: number[],
  k: number = DEFAULT_K,
  gainMethod: GainMethod = DEFAULT_GAIN_METHOD,
): number {
  if (k <= 0 || judgedGrades.length === 0) {
    return 0.0;
  }

  // Sort descending
  const sorted = [...judgedGrades].sort((a, b) => b - a);
  return computeDCG(sorted, k, gainMethod);
}

/**
 * Calculates Normalized Discounted Cumulative Gain (nDCG@k).
 *
 * nDCG@k = DCG@k / IDCG@k
 * Returns 0.0 if IDCG@k === 0 (no relevant items exist in ground truth).
 */
export function computeNDCG(
  retrievedGrades: number[],
  allJudgedGrades: number[],
  k: number = DEFAULT_K,
  gainMethod: GainMethod = DEFAULT_GAIN_METHOD,
): number {
  const idcg = computeIDCG(allJudgedGrades, k, gainMethod);
  if (idcg === 0.0) {
    return 0.0;
  }

  const dcg = computeDCG(retrievedGrades, k, gainMethod);
  const ndcg = dcg / idcg;

  // Bound within [0.0, 1.0] to prevent floating point overshoot
  return Math.max(0.0, Math.min(1.0, ndcg));
}

/**
 * Calculates Precision@k: fraction of retrieved documents within top-k that are relevant.
 *
 * P@k = (|retrieved relevant up to k|) / k
 */
export function computePrecisionAtK(
  retrievedIsRelevant: boolean[],
  k: number = DEFAULT_K,
): number {
  if (k <= 0) {
    return 0.0;
  }

  const limit = Math.min(retrievedIsRelevant.length, k);
  let relevantCount = 0;

  for (let i = 0; i < limit; i++) {
    if (retrievedIsRelevant[i]) {
      relevantCount++;
    }
  }

  return relevantCount / k;
}

/**
 * Calculates Recall@k: fraction of total relevant documents retrieved within top-k.
 *
 * R@k = (|retrieved relevant up to k|) / (|total relevant in ground truth|)
 */
export function computeRecallAtK(
  retrievedIsRelevant: boolean[],
  totalRelevantInPool: number,
  k: number = DEFAULT_K,
  noRelevantPolicy: NoRelevantDocsPolicy = DEFAULT_NO_RELEVANT_POLICY,
): number {
  if (totalRelevantInPool <= 0) {
    return noRelevantPolicy === 'one' ? 1.0 : 0.0;
  }

  if (k <= 0) {
    return 0.0;
  }

  const limit = Math.min(retrievedIsRelevant.length, k);
  let relevantCount = 0;

  for (let i = 0; i < limit; i++) {
    if (retrievedIsRelevant[i]) {
      relevantCount++;
    }
  }

  const recall = relevantCount / totalRelevantInPool;
  return Math.min(1.0, recall);
}

/**
 * Calculates Reciprocal Rank (RR): reciprocal of the 1-based rank of the first relevant document.
 *
 * RR = 1 / rank_first_relevant (or 0.0 if none retrieved within top-k)
 */
export function computeReciprocalRank(
  retrievedIsRelevant: boolean[],
  k?: number,
): number {
  const limit = k !== undefined ? Math.min(retrievedIsRelevant.length, k) : retrievedIsRelevant.length;

  for (let i = 0; i < limit; i++) {
    if (retrievedIsRelevant[i]) {
      return 1.0 / (i + 1);
    }
  }

  return 0.0;
}

/**
 * Calculates Average Precision (AP@k).
 *
 * AP@k = (1 / min(T_rel, k)) * SUM_{i=1..k} (P@i * rel(i))
 */
export function computeAveragePrecision(
  retrievedIsRelevant: boolean[],
  totalRelevantInPool: number,
  k: number = DEFAULT_K,
  noRelevantPolicy: NoRelevantDocsPolicy = DEFAULT_NO_RELEVANT_POLICY,
): number {
  if (totalRelevantInPool <= 0) {
    return noRelevantPolicy === 'one' ? 1.0 : 0.0;
  }

  if (k <= 0) {
    return 0.0;
  }

  const limit = Math.min(retrievedIsRelevant.length, k);
  const denominator = Math.min(totalRelevantInPool, k);
  if (denominator === 0) {
    return 0.0;
  }

  let cumulativeRelevant = 0;
  let sumPrecision = 0.0;

  for (let i = 0; i < limit; i++) {
    if (retrievedIsRelevant[i]) {
      cumulativeRelevant++;
      const precisionAtI = cumulativeRelevant / (i + 1);
      sumPrecision += precisionAtI;
    }
  }

  return sumPrecision / denominator;
}

/**
 * Evaluates a single retrieved ranked list against ground-truth qrels.
 */
export function evaluateRankedList(
  queryId: string,
  retrieved: Array<string | { id: string; score?: number }>,
  qrels: Map<string, RelevanceGrade> | Record<string, RelevanceGrade>,
  options: EvaluationMetricOptions = {},
): QueryMetricsResult {
  const k = options.k ?? DEFAULT_K;
  const relThreshold = options.relevanceThreshold ?? DEFAULT_RELEVANCE_THRESHOLD;
  const gainMethod = options.gainMethod ?? DEFAULT_GAIN_METHOD;
  const unjudgedPolicy = options.unjudgedPolicy ?? DEFAULT_UNJUDGED_POLICY;
  const defaultGrade = options.defaultGrade ?? DEFAULT_DEFAULT_GRADE;
  const noRelevantPolicy = options.noRelevantDocsPolicy ?? DEFAULT_NO_RELEVANT_POLICY;
  const tieBreaking = options.tieBreaking ?? DEFAULT_TIE_BREAKING;

  const notes: string[] = [];

  // Normalize qrels to a Map
  const qrelMap =
    qrels instanceof Map
      ? qrels
      : new Map<string, RelevanceGrade>(Object.entries(qrels) as [string, RelevanceGrade][]);

  // Normalize retrieved candidates
  let normalizedRetrieved: Array<{ id: string; score?: number }> = retrieved.map(item =>
    typeof item === 'string' ? { id: item } : item,
  );

  // Deterministic sorting if scores provided
  if (normalizedRetrieved.some(item => item.score !== undefined)) {
    normalizedRetrieved = [...normalizedRetrieved].sort((a, b) => {
      const scoreA = a.score ?? 0;
      const scoreB = b.score ?? 0;
      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }
      if (tieBreaking === 'docIdAsc') {
        return a.id.localeCompare(b.id);
      }
      return 0;
    });
  }

  // Handle unjudged documents
  let unjudgedCount = 0;
  const evaluatedCandidates: Array<{ id: string; grade: RelevanceGrade }> = [];

  for (const item of normalizedRetrieved) {
    if (qrelMap.has(item.id)) {
      evaluatedCandidates.push({ id: item.id, grade: qrelMap.get(item.id)! });
    } else {
      unjudgedCount++;
      if (unjudgedPolicy === 'zero') {
        evaluatedCandidates.push({ id: item.id, grade: 0 });
      } else if (unjudgedPolicy === 'defaultGrade') {
        evaluatedCandidates.push({ id: item.id, grade: defaultGrade });
      } else if (unjudgedPolicy === 'ignore') {
        // Skip unjudged document
        continue;
      }
    }
  }

  if (unjudgedCount > 0) {
    notes.push(`Encountered ${unjudgedCount} unjudged document(s) handled with policy '${unjudgedPolicy}'`);
  }

  // Extract arrays for metric computation
  const retrievedGrades = evaluatedCandidates.map(c => c.grade);
  const retrievedIsRelevant = retrievedGrades.map(g => g >= relThreshold);

  // Collect all ground truth grades for IDCG calculation
  const allJudgedEntries: Array<{ id: string; grade: RelevanceGrade }> = Array.from(qrelMap.entries()).map(
    ([id, grade]) => ({ id, grade }),
  );

  if (tieBreaking === 'docIdAsc') {
    allJudgedEntries.sort((a, b) => {
      if (b.grade !== a.grade) {
        return b.grade - a.grade;
      }
      return a.id.localeCompare(b.id);
    });
  } else {
    allJudgedEntries.sort((a, b) => b.grade - a.grade);
  }

  const allJudgedGrades = allJudgedEntries.map(e => e.grade);
  const totalRelevantInPool = allJudgedGrades.filter(g => g >= relThreshold).length;

  if (totalRelevantInPool === 0) {
    notes.push('Query has 0 relevant documents in ground-truth pool');
  }

  const dcg = computeDCG(retrievedGrades, k, gainMethod);
  const idcg = computeIDCG(allJudgedGrades, k, gainMethod);
  const ndcg = computeNDCG(retrievedGrades, allJudgedGrades, k, gainMethod);
  const precision = computePrecisionAtK(retrievedIsRelevant, k);
  const recall = computeRecallAtK(retrievedIsRelevant, totalRelevantInPool, k, noRelevantPolicy);
  const reciprocalRank = computeReciprocalRank(retrievedIsRelevant, k);
  const averagePrecision = computeAveragePrecision(
    retrievedIsRelevant,
    totalRelevantInPool,
    k,
    noRelevantPolicy,
  );

  const topKItems = retrievedIsRelevant.slice(0, k);
  const relevantRetrievedCount = topKItems.filter(Boolean).length;

  return {
    queryId,
    k,
    dcg,
    idcg,
    ndcg,
    precision,
    recall,
    reciprocalRank,
    averagePrecision,
    retrievedCount: Math.min(evaluatedCandidates.length, k),
    relevantRetrievedCount,
    totalRelevantCount: totalRelevantInPool,
    unjudgedCount,
    notes,
  };
}

export interface EvaluableQuery {
  id: string;
  category?: JudgedQueryCategory;
  retrieved: Array<string | { id: string; score?: number }>;
  qrels: Map<string, RelevanceGrade> | Record<string, RelevanceGrade>;
}

/**
 * Evaluates an entire query set and aggregates macro-averaged metrics:
 * - Mean nDCG@k
 * - Mean Reciprocal Rank (MRR)
 * - Mean Average Precision (MAP)
 * - Macro-averaged Precision@k & Recall@k
 * - Per-category summaries
 */
export function evaluateQuerySet(
  queries: EvaluableQuery[],
  options: EvaluationMetricOptions = {},
): AggregateMetricsResult {
  const k = options.k ?? DEFAULT_K;
  const noRelevantPolicy = options.noRelevantDocsPolicy ?? DEFAULT_NO_RELEVANT_POLICY;

  const queryResults: QueryMetricsResult[] = [];
  const categoryGroups = new Map<JudgedQueryCategory, QueryMetricsResult[]>();

  let ignoredQueryCount = 0;

  for (const q of queries) {
    const result = evaluateRankedList(q.id, q.retrieved, q.qrels, options);

    // If query has 0 relevant docs and policy is 'ignore', skip from aggregates
    if (result.totalRelevantCount === 0 && noRelevantPolicy === 'ignore') {
      ignoredQueryCount++;
      result.notes.push('Excluded from aggregate mean averages due to noRelevantDocsPolicy: ignore');
      queryResults.push(result);
      continue;
    }

    queryResults.push(result);

    if (q.category) {
      if (!categoryGroups.has(q.category)) {
        categoryGroups.set(q.category, []);
      }
      categoryGroups.get(q.category)!.push(result);
    }
  }

  // Aggregation over included queries
  const includedResults = queryResults.filter(
    r => !(r.totalRelevantCount === 0 && noRelevantPolicy === 'ignore'),
  );

  const evaluatedCount = includedResults.length;

  const meanNDCG = evaluatedCount > 0 ? includedResults.reduce((acc, r) => acc + r.ndcg, 0) / evaluatedCount : 0.0;
  const meanReciprocalRank =
    evaluatedCount > 0 ? includedResults.reduce((acc, r) => acc + r.reciprocalRank, 0) / evaluatedCount : 0.0;
  const meanAveragePrecision =
    evaluatedCount > 0 ? includedResults.reduce((acc, r) => acc + r.averagePrecision, 0) / evaluatedCount : 0.0;
  const meanPrecision =
    evaluatedCount > 0 ? includedResults.reduce((acc, r) => acc + r.precision, 0) / evaluatedCount : 0.0;
  const meanRecall =
    evaluatedCount > 0 ? includedResults.reduce((acc, r) => acc + r.recall, 0) / evaluatedCount : 0.0;

  // Build per-category breakdowns
  const categoryBreakdown: Partial<Record<JudgedQueryCategory, CategoryMetricSummary>> = {};

  for (const [cat, results] of categoryGroups.entries()) {
    const catIncluded = results.filter(
      r => !(r.totalRelevantCount === 0 && noRelevantPolicy === 'ignore'),
    );
    const catCount = catIncluded.length;

    categoryBreakdown[cat] = {
      category: cat,
      queryCount: results.length,
      meanNDCG: catCount > 0 ? catIncluded.reduce((acc, r) => acc + r.ndcg, 0) / catCount : 0.0,
      meanReciprocalRank:
        catCount > 0 ? catIncluded.reduce((acc, r) => acc + r.reciprocalRank, 0) / catCount : 0.0,
      meanAveragePrecision:
        catCount > 0 ? catIncluded.reduce((acc, r) => acc + r.averagePrecision, 0) / catCount : 0.0,
      meanPrecision:
        catCount > 0 ? catIncluded.reduce((acc, r) => acc + r.precision, 0) / catCount : 0.0,
      meanRecall:
        catCount > 0 ? catIncluded.reduce((acc, r) => acc + r.recall, 0) / catCount : 0.0,
    };
  }

  return {
    queryCount: queries.length,
    evaluatedQueryCount: evaluatedCount,
    ignoredQueryCount,
    k,
    meanNDCG,
    meanReciprocalRank,
    meanAveragePrecision,
    meanPrecision,
    meanRecall,
    categoryBreakdown,
    queryResults,
  };
}
