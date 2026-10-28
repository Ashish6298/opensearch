/**
 * @opensearch/ranking — Focus Lens Previewer & Invariant Verification (Phase 102)
 *
 * Implements previewing and impact evaluation of Focus Lens profiles against fixed sample queries:
 * - Fixed suite of repeatable sample queries representing diverse search domains
 * - Fixed candidate document corpus with known domain and authority classifications
 * - Computes baseline vs lens-adjusted scores, ranks, and relative shifts
 * - Explains transparently why every result was boosted, demoted, excluded, or untouched
 * - Verifies mathematical index immutability before and after preview evaluation
 */

import { evaluateLensForDocument } from './lens-evaluator.js';
import { FocusLensProfile } from './lens-types.js';

export interface SampleQueryDocument {
  id: string;
  title: string;
  url: string;
  domain: string;
  baseScore: number;
  tags: string[];
}

export interface PreviewResultHit {
  documentId: string;
  title: string;
  url: string;
  domain: string;
  baselineRank: number;
  baselineScore: number;
  lensRank?: number;
  lensScore?: number;
  action: 'boost' | 'demote' | 'exclude' | 'none';
  multiplier: number;
  scoreAdjustment: number;
  rankDelta?: number;
  matchedRule?: string;
  explanation: string;
}

export interface QueryPreviewSummary {
  query: string;
  category: string;
  totalBaselineHits: number;
  totalLensHits: number;
  boostedCount: number;
  demotedCount: number;
  excludedCount: number;
  rankShiftCount: number;
  results: PreviewResultHit[];
  excludedItems: PreviewResultHit[];
}

export interface LensPreviewReport {
  lensId: string;
  lensName: string;
  description: string;
  disclaimer?: string;
  isMedicalEndorsement: false;
  timestamp: string;
  indexImmutabilityVerified: boolean;
  queriesTested: number;
  totalBoostedAcrossQueries: number;
  totalDemotedAcrossQueries: number;
  totalExcludedAcrossQueries: number;
  summaries: QueryPreviewSummary[];
}

/**
 * Fixed deterministic benchmark corpus for Lens previewing.
 */
export const FIXED_PREVIEW_CORPUS: readonly SampleQueryDocument[] = [
  {
    id: 'doc-mit-algo',
    title: 'Introduction to Algorithms — MIT OpenCourseWare',
    url: 'https://ocw.mit.edu/courses/intro-algorithms',
    domain: 'ocw.mit.edu',
    baseScore: 0.88,
    tags: ['algorithms', 'data-structures', 'education'],
  },
  {
    id: 'doc-stanford-algo',
    title: 'CS161 Design and Analysis of Algorithms — Stanford University',
    url: 'https://cs.stanford.edu/people/algorithms.pdf',
    domain: 'cs.stanford.edu',
    baseScore: 0.84,
    tags: ['algorithms', 'data-structures', 'research'],
  },
  {
    id: 'doc-tokio-rs',
    title: 'Tokio — An asynchronous runtime for Rust',
    url: 'https://github.com/tokio-rs/tokio',
    domain: 'github.com',
    baseScore: 0.86,
    tags: ['programming', 'rust', 'async', 'developer'],
  },
  {
    id: 'doc-docs-rs',
    title: 'tokio crate documentation and API reference',
    url: 'https://docs.rs/tokio/latest/tokio/',
    domain: 'docs.rs',
    baseScore: 0.79,
    tags: ['programming', 'rust', 'async', 'developer'],
  },
  {
    id: 'doc-cdc-flu',
    title: 'CDC Influenza (Flu) Clinical Information & Symptoms',
    url: 'https://www.cdc.gov/flu/symptoms/index.html',
    domain: 'cdc.gov',
    baseScore: 0.90,
    tags: ['health', 'respiratory', 'flu', 'symptoms'],
  },
  {
    id: 'doc-pubmed-respiratory',
    title: 'PubMed — Respiratory Viral Pathogenesis and Epidemiology',
    url: 'https://pubmed.ncbi.nlm.nih.gov/31234567/',
    domain: 'pubmed.ncbi.nlm.nih.gov',
    baseScore: 0.83,
    tags: ['health', 'research', 'respiratory', 'symptoms'],
  },
  {
    id: 'doc-khan-calculus',
    title: 'Khan Academy — Limits and Continuity in AP Calculus',
    url: 'https://www.khanacademy.org/math/calculus-1',
    domain: 'khanacademy.org',
    baseScore: 0.82,
    tags: ['math', 'calculus', 'education', 'student'],
  },
  {
    id: 'doc-arxiv-dp',
    title: 'Differential Privacy in Machine Learning: A Survey',
    url: 'https://arxiv.org/abs/2103.00001',
    domain: 'arxiv.org',
    baseScore: 0.81,
    tags: ['research', 'privacy', 'machine-learning'],
  },
  {
    id: 'doc-wiki-search',
    title: 'Search engine technology — Wikipedia',
    url: 'https://en.wikipedia.org/wiki/Search_engine',
    domain: 'en.wikipedia.org',
    baseScore: 0.75,
    tags: ['general', 'search', 'algorithms'],
  },
  {
    id: 'doc-ad-tracker',
    title: 'AdMetrics Pixel and Behavioral Tracking Engine',
    url: 'https://tracker-analytics-adnetwork.com/event',
    domain: 'tracker-analytics-adnetwork.com',
    baseScore: 0.65,
    tags: ['tracker', 'adtech', 'commercial', 'privacy'],
  },
  {
    id: 'doc-content-farm',
    title: 'Top 10 Fast Tech Tricks to Know (Affiliate Blog)',
    url: 'https://untrusted-content-farm.com/articles/quick-tips',
    domain: 'untrusted-content-farm.com',
    baseScore: 0.58,
    tags: ['spam', 'content-farm', 'commercial', 'algorithms'],
  },
  {
    id: 'doc-doubleclick-ad',
    title: 'DoubleClick Ad Serving & Behavioral Tracking Portal',
    url: 'https://doubleclick.net/privacy-tracking',
    domain: 'doubleclick.net',
    baseScore: 0.62,
    tags: ['tracker', 'privacy', 'adtech', 'commercial'],
  },
  {
    id: 'doc-taboola-feed',
    title: 'Taboola Recommended Native Content Network',
    url: 'https://taboola.com/algorithms-feed',
    domain: 'taboola.com',
    baseScore: 0.55,
    tags: ['spam', 'content-farm', 'algorithms', 'commercial'],
  },
];

/**
 * Fixed sample queries covering diverse scenarios.
 */
export const FIXED_SAMPLE_QUERIES = [
  {
    query: 'algorithms data structures',
    category: 'Computer Science & Education',
    matchingTags: ['algorithms', 'data-structures', 'education', 'general'],
  },
  {
    query: 'rust async programming tokio',
    category: 'Software Engineering',
    matchingTags: ['programming', 'rust', 'async', 'developer'],
  },
  {
    query: 'respiratory symptoms influenza flu',
    category: 'Public Health',
    matchingTags: ['health', 'respiratory', 'flu', 'symptoms'],
  },
  {
    query: 'ap calculus limits math tutoring',
    category: 'Student Education',
    matchingTags: ['math', 'calculus', 'education', 'student'],
  },
  {
    query: 'differential privacy machine learning survey',
    category: 'Academic Research',
    matchingTags: ['research', 'privacy', 'machine-learning'],
  },
] as const;

export interface LensPreviewOptions {
  customQueries?: Array<{
    query: string;
    category: string;
    matchingTags: string[];
  }>;
  customCorpus?: SampleQueryDocument[];
}

/**
 * Helper to compute an immutability checksum of the corpus.
 */
function computeCorpusChecksum(corpus: readonly SampleQueryDocument[]): string {
  let hash = 0;
  for (const doc of corpus) {
    const str = `${doc.id}:${doc.url}:${doc.baseScore}:${doc.tags.join(',')}`;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    }
  }
  return hash.toString(16);
}

/**
 * Previews the effect of a Focus Lens against fixed sample queries.
 * Evaluates ranking shifts, score adjustments, exclusions, and explanations.
 * Proves that the underlying index/corpus remains completely unmodified.
 */
export function previewLensEffects(
  lens: FocusLensProfile,
  options: LensPreviewOptions = {},
): LensPreviewReport {
  const corpus = options.customCorpus ?? FIXED_PREVIEW_CORPUS;
  const queries = options.customQueries ?? [...FIXED_SAMPLE_QUERIES];

  // Invariant snapshot before preview execution
  const checksumBefore = computeCorpusChecksum(corpus);

  let totalBoosted = 0;
  let totalDemoted = 0;
  let totalExcluded = 0;

  const summaries: QueryPreviewSummary[] = [];

  for (const q of queries) {
    // 1. Identify matching candidate documents for this sample query
    const candidates = corpus.filter(doc =>
      doc.tags.some(t => (q.matchingTags as readonly string[]).includes(t)) ||
      q.query.toLowerCase().split(' ').some(term => doc.title.toLowerCase().includes(term)),
    );

    // 2. Baseline evaluation (General profile, unadjusted base scores)
    const baselineItems = candidates
      .map(doc => ({
        doc,
        score: doc.baseScore,
      }))
      .sort((a, b) => b.score - a.score);

    const baselineRankMap = new Map<string, { rank: number; score: number }>();
    baselineItems.forEach((item, idx) => {
      baselineRankMap.set(item.doc.id, { rank: idx + 1, score: item.score });
    });

    // 3. Lens evaluation
    const lensCandidateResults: Array<{
      doc: SampleQueryDocument;
      baselineRank: number;
      baselineScore: number;
      lensScore: number;
      action: 'boost' | 'demote' | 'exclude' | 'none';
      multiplier: number;
      scoreAdjustment: number;
      matchedRule?: string;
      explanation: string;
    }> = [];

    const excludedList: PreviewResultHit[] = [];

    for (const item of baselineItems) {
      const { doc } = item;
      const bInfo = baselineRankMap.get(doc.id)!;
      const evalResult = evaluateLensForDocument(doc.url, lens);

      if (evalResult.action === 'exclude') {
        totalExcluded++;
        const excludedHit: PreviewResultHit = {
          documentId: doc.id,
          title: doc.title,
          url: doc.url,
          domain: doc.domain,
          baselineRank: bInfo.rank,
          baselineScore: bInfo.score,
          action: 'exclude',
          multiplier: 0,
          scoreAdjustment: -bInfo.score,
          matchedRule: evalResult.explanation.matchedPattern,
          explanation: evalResult.explanation.explanation || `Excluded by lens rule: ${evalResult.explanation.matchedPattern}`,
        };
        excludedList.push(excludedHit);
        continue;
      }

      const multiplier = evalResult.multiplier;
      const lensScore = Math.round(bInfo.score * multiplier * 1000) / 1000;
      const scoreAdjustment = Math.round((lensScore - bInfo.score) * 1000) / 1000;

      if (evalResult.action === 'boost') totalBoosted++;
      if (evalResult.action === 'demote') totalDemoted++;

      lensCandidateResults.push({
        doc,
        baselineRank: bInfo.rank,
        baselineScore: bInfo.score,
        lensScore,
        action: evalResult.action,
        multiplier,
        scoreAdjustment,
        matchedRule: evalResult.explanation.matchedPattern,
        explanation: evalResult.explanation.explanation,
      });
    }

    // Sort surviving documents by lens score descending
    lensCandidateResults.sort((a, b) => b.lensScore - a.lensScore);

    let rankShiftCount = 0;
    const finalResults: PreviewResultHit[] = lensCandidateResults.map((item, idx) => {
      const lensRank = idx + 1;
      const rankDelta = item.baselineRank - lensRank; // Positive means moved up, negative down
      if (rankDelta !== 0) {
        rankShiftCount++;
      }

      return {
        documentId: item.doc.id,
        title: item.doc.title,
        url: item.doc.url,
        domain: item.doc.domain,
        baselineRank: item.baselineRank,
        baselineScore: item.baselineScore,
        lensRank,
        lensScore: item.lensScore,
        action: item.action,
        multiplier: item.multiplier,
        scoreAdjustment: item.scoreAdjustment,
        rankDelta,
        matchedRule: item.matchedRule,
        explanation: item.explanation,
      };
    });

    summaries.push({
      query: q.query,
      category: q.category,
      totalBaselineHits: baselineItems.length,
      totalLensHits: finalResults.length,
      boostedCount: finalResults.filter(r => r.action === 'boost').length,
      demotedCount: finalResults.filter(r => r.action === 'demote').length,
      excludedCount: excludedList.length,
      rankShiftCount,
      results: finalResults,
      excludedItems: excludedList,
    });
  }

  // Invariant snapshot verification after preview execution
  const checksumAfter = computeCorpusChecksum(corpus);
  const indexImmutabilityVerified = checksumBefore === checksumAfter;

  return {
    lensId: lens.id,
    lensName: lens.name,
    description: lens.description,
    disclaimer: lens.disclaimer,
    isMedicalEndorsement: false,
    timestamp: new Date().toISOString(),
    indexImmutabilityVerified,
    queriesTested: queries.length,
    totalBoostedAcrossQueries: totalBoosted,
    totalDemotedAcrossQueries: totalDemoted,
    totalExcludedAcrossQueries: totalExcluded,
    summaries,
  };
}
