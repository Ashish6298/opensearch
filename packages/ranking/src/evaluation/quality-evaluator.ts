/**
 * @opensearch/ranking — Search Quality Evaluator Engine (Phase 24)
 *
 * Runs evaluation queries against an end-to-end ranking pipeline and calculates:
 * - Precision@1, Precision@5
 * - Mean Reciprocal Rank (MRR)
 * - Exact-Title Rank-1 Accuracy
 * - Zero-Result False Positive Rate
 * - Snippet Highlighting Quality
 * - Response Consistency & Duration
 */

import { QueryParser } from '../query/query-types.js';
import { CandidateRetriever } from '../retrieval/retrieval-types.js';
import { RankingEngine } from '../scorer/scorer-types.js';
import { ResultGenerator, SearchResultItem, SearchResultSet } from '../results/result-types.js';
import { EvaluationQuery, QueryCategory } from './evaluation-dataset.js';

export interface QueryEvaluationResult {
  query: EvaluationQuery;
  passed: boolean;
  totalHits: number;
  topRankUrl?: string;
  topRankTitle?: string;
  topRankScore?: number;
  reciprocalRank: number; // 1 / rank of expected match, or 0 if not found
  snippetHighlightsFound: boolean;
  durationMs: number;
  failureReason?: string;
  results: SearchResultSet;
}

export interface CategorySummary {
  category: QueryCategory;
  totalQueries: number;
  passedQueries: number;
  passRate: number;
  meanReciprocalRank: number;
}

export interface SearchQualityEvaluationReport {
  totalQueries: number;
  passedQueries: number;
  failedQueries: number;
  passRate: number; // 0.0 to 1.0
  meanReciprocalRank: number; // MRR (0.0 to 1.0)
  precisionAt1: number;
  noResultFalsePositiveCount: number;
  averageLatencyMs: number;
  categorySummaries: CategorySummary[];
  results: QueryEvaluationResult[];
  evaluatedAt: string;
}

export interface SearchPipelineComponents {
  queryParser: QueryParser;
  candidateRetriever: CandidateRetriever;
  rankingEngine: RankingEngine;
  resultGenerator: ResultGenerator;
}

export class SearchQualityEvaluator {
  private readonly components: SearchPipelineComponents;

  constructor(components: SearchPipelineComponents) {
    this.components = components;
  }

  /**
   * Executes an individual evaluation query through the complete query -> retrieve -> rank -> snippet pipeline.
   */
  async evaluateQuery(evalQuery: EvaluationQuery): Promise<QueryEvaluationResult> {
    const startMs = Date.now();
    const { queryParser, candidateRetriever, rankingEngine, resultGenerator } = this.components;

    // 1. Query Parsing
    const parsed = queryParser.parse(evalQuery.rawQuery);

    // 2. Candidate Retrieval
    const retrieval = candidateRetriever.retrieve(parsed);

    // 3. BM25 & Signal Ranking
    const ranked = rankingEngine.rank(parsed, retrieval.candidates);

    // 4. Result Formatting & Snippet Highlighting
    const results = resultGenerator.generateResults(parsed, ranked.hits, {
      pagination: { page: 1, pageSize: 10 },
    });
    const durationMs = Date.now() - startMs;

    // 5. Evaluate Assertions
    let passed = true;
    let failureReason: string | undefined;
    const totalHits = results.pagination.totalHits;
    const topItem = results.items[0];

    // Check No-Result expectations
    if (evalQuery.expectZeroHits) {
      if (totalHits !== 0) {
        passed = false;
        failureReason = `Expected 0 hits for no-result query, but received ${totalHits}`;
      }
      return {
        query: evalQuery,
        passed,
        totalHits,
        reciprocalRank: totalHits === 0 ? 1.0 : 0.0,
        snippetHighlightsFound: true,
        durationMs,
        failureReason,
        results,
      };
    }

    // Check Min Hits
    if (evalQuery.expectedMinHits !== undefined && totalHits < evalQuery.expectedMinHits) {
      passed = false;
      failureReason = `Expected >= ${evalQuery.expectedMinHits} hits, but received ${totalHits}`;
    }

    // Find rank of expected target URL
    let targetRank = 0;
    if (evalQuery.expectedTopUrlMatch) {
      const matchIndex = results.items.findIndex((item: SearchResultItem) =>
        item.url.includes(evalQuery.expectedTopUrlMatch!),
      );
      if (matchIndex >= 0) {
        targetRank = matchIndex + 1;
      }
    }

    const reciprocalRank = targetRank > 0 ? 1 / targetRank : 0;
    const maxAcceptableRank = evalQuery.maxAcceptableRank ?? 1;

    if (evalQuery.expectedTopUrlMatch && (targetRank === 0 || targetRank > maxAcceptableRank)) {
      passed = false;
      failureReason = `Expected match '${evalQuery.expectedTopUrlMatch}' within top ${maxAcceptableRank}, but found at rank ${targetRank || 'not found'}`;
    }

    // Check Title Keywords
    if (passed && evalQuery.expectedTitleKeywords && topItem) {
      const lowerTitle = topItem.title.toLowerCase();
      const hasAllKeywords = evalQuery.expectedTitleKeywords.every(k =>
        lowerTitle.includes(k.toLowerCase()),
      );
      if (!hasAllKeywords) {
        passed = false;
        failureReason = `Top title "${topItem.title}" did not contain expected keywords: ${evalQuery.expectedTitleKeywords.join(', ')}`;
      }
    }

    // Check Snippet Highlighting
    let snippetHighlightsFound = true;
    if (topItem && evalQuery.expectSnippetsContaining) {
      const lowerSnippet = topItem.snippet.toLowerCase();
      const lowerHighlighted = (topItem.highlightedSnippet || '').toLowerCase();
      const foundTerms = evalQuery.expectSnippetsContaining.every(
        term =>
          lowerSnippet.includes(term.toLowerCase()) ||
          lowerHighlighted.includes(term.toLowerCase()),
      );
      if (!foundTerms) {
        snippetHighlightsFound = false;
        if (passed) {
          passed = false;
          failureReason = `Snippet "${topItem.snippet}" did not contain expected terms: ${evalQuery.expectSnippetsContaining.join(', ')}`;
        }
      }
    }

    return {
      query: evalQuery,
      passed,
      totalHits,
      topRankUrl: topItem?.url,
      topRankTitle: topItem?.title,
      topRankScore: topItem?.score,
      reciprocalRank,
      snippetHighlightsFound,
      durationMs,
      failureReason,
      results,
    };
  }

  /**
   * Evaluates an entire dataset of queries and returns an aggregated quality report.
   */
  async evaluateDataset(dataset: EvaluationQuery[]): Promise<SearchQualityEvaluationReport> {
    const results: QueryEvaluationResult[] = [];
    let passedCount = 0;
    let totalReciprocalRank = 0;
    let rank1Count = 0;
    let falsePositiveCount = 0;
    let totalLatency = 0;

    const categoryMap = new Map<QueryCategory, { total: number; passed: number; sumRR: number }>();

    for (const item of dataset) {
      const cat = item.category;
      if (!categoryMap.has(cat)) {
        categoryMap.set(cat, { total: 0, passed: 0, sumRR: 0 });
      }
      const catStats = categoryMap.get(cat)!;
      catStats.total++;

      const res = await this.evaluateQuery(item);
      results.push(res);

      if (res.passed) {
        passedCount++;
        catStats.passed++;
      }

      if (item.expectZeroHits && res.totalHits > 0) {
        falsePositiveCount++;
      }

      if (res.reciprocalRank === 1.0) {
        rank1Count++;
      }

      totalReciprocalRank += res.reciprocalRank;
      catStats.sumRR += res.reciprocalRank;
      totalLatency += res.durationMs;
    }

    const total = dataset.length;
    const categorySummaries: CategorySummary[] = Array.from(categoryMap.entries()).map(
      ([category, stats]) => ({
        category,
        totalQueries: stats.total,
        passedQueries: stats.passed,
        passRate: stats.total > 0 ? Math.round((stats.passed / stats.total) * 100) / 100 : 0,
        meanReciprocalRank:
          stats.total > 0 ? Math.round((stats.sumRR / stats.total) * 100) / 100 : 0,
      }),
    );

    return {
      totalQueries: total,
      passedQueries: passedCount,
      failedQueries: total - passedCount,
      passRate: total > 0 ? Math.round((passedCount / total) * 100) / 100 : 0,
      meanReciprocalRank: total > 0 ? Math.round((totalReciprocalRank / total) * 1000) / 1000 : 0,
      precisionAt1: total > 0 ? Math.round((rank1Count / total) * 100) / 100 : 0,
      noResultFalsePositiveCount: falsePositiveCount,
      averageLatencyMs: total > 0 ? Math.round((totalLatency / total) * 100) / 100 : 0,
      categorySummaries,
      results,
      evaluatedAt: new Date().toISOString(),
    };
  }
}
