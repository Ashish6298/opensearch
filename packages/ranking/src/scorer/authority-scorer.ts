/**
 * @opensearch/ranking — Temporal Freshness Decay & Domain Trust Authority Scorer (Phase 48)
 *
 * Implements:
 * 1. Exponential time decay function based on document `lastModified` / `lastCrawledAt` / `indexedAt`
 * 2. Domain authority tiering (boosting trusted TLDs like .edu, .gov, .org, curated developer doc domains,
 *    and penalizing low-quality spam patterns)
 * 3. Unified score blending formula: BM25 (60%) + PageRank (20%) + Freshness (10%) + Authority (10%)
 */

export interface AuthorityScorerOptions {
  /** Half-life in days for exponential freshness decay (default: 30 days) */
  freshnessHalfLifeDays?: number;
  /** Custom domain authority overrides (domain -> score from 0.0 to 1.0) */
  customDomainAuthorities?: Record<string, number>;
}

export interface BlendedScoreComponents {
  bm25Score: number;
  pageRankScore: number;
  freshnessScore: number;
  authorityScore: number;
  blendedScore: number;
}

/**
 * Curated domain authority seed dictionary mapping high-trust domains and TLD patterns.
 */
export const TRUSTED_DOMAIN_TIERS: Record<string, number> = {
  // Top developer docs & official registries
  'developer.mozilla.org': 0.98,
  'github.com': 0.95,
  'npmjs.com': 0.94,
  'nodejs.org': 0.95,
  'typescriptlang.org': 0.95,
  'rust-lang.org': 0.95,
  'python.org': 0.95,
  'golang.org': 0.95,
  'go.dev': 0.95,
  'w3.org': 0.96,
  'wikipedia.org': 0.92,
  'stackoverflow.com': 0.90,
  'docs.rs': 0.92,
  'pypi.org': 0.92,
  'crates.io': 0.92,
  'arxiv.org': 0.93,
};

export class AuthorityScorer {
  private readonly halfLifeDays: number;
  private readonly domainAuthorities: Map<string, number>;

  constructor(options: AuthorityScorerOptions = {}) {
    this.halfLifeDays = options.freshnessHalfLifeDays ?? 30;
    this.domainAuthorities = new Map<string, number>(Object.entries(TRUSTED_DOMAIN_TIERS));

    if (options.customDomainAuthorities) {
      for (const [dom, score] of Object.entries(options.customDomainAuthorities)) {
        this.domainAuthorities.set(dom.toLowerCase().trim(), Math.max(0, Math.min(1, score)));
      }
    }
  }

  /**
   * Computes exponential freshness decay score between 0.0 and 1.0 based on document timestamps.
   * Formula: e^(-lambda * daysElapsed) where lambda = ln(2) / halfLifeDays.
   */
  computeFreshnessScore(
    timestampStr: string | undefined,
    referenceTime: number = Date.now(),
  ): number {
    if (!timestampStr) {
      return 0.5; // Neutral default for undated documents
    }

    const timestamp = Date.parse(timestampStr);
    if (isNaN(timestamp)) {
      return 0.5;
    }

    const daysElapsed = Math.max(0, (referenceTime - timestamp) / (1000 * 60 * 60 * 24));
    const lambda = Math.LN2 / this.halfLifeDays;
    const freshness = Math.exp(-lambda * daysElapsed);

    return Math.max(0.05, Math.min(1.0, freshness));
  }

  /**
   * Computes domain trust / authority score between 0.0 and 1.0 based on hostname and TLD.
   */
  computeDomainAuthority(urlOrHost: string): number {
    if (!urlOrHost) {
      return 0.5;
    }

    let host = urlOrHost.toLowerCase().trim();
    try {
      if (host.includes('://')) {
        host = new URL(host).hostname.toLowerCase();
      }
    } catch {
      // Use raw input if URL parsing fails
    }

    // Direct domain lookup
    const directScore = this.domainAuthorities.get(host);
    if (directScore !== undefined) {
      return directScore;
    }

    // Check subdomain matching (e.g. docs.github.com -> github.com)
    for (const [domain, score] of this.domainAuthorities.entries()) {
      if (host.endsWith(`.${domain}`)) {
        return score;
      }
    }

    // TLD authority heuristics
    if (host.endsWith('.gov') || host.endsWith('.mil')) {
      return 0.95;
    }
    if (host.endsWith('.edu') || host.endsWith('.ac.uk')) {
      return 0.92;
    }
    if (host.endsWith('.org')) {
      return 0.75;
    }
    if (host.endsWith('.io') || host.endsWith('.dev') || host.endsWith('.app')) {
      return 0.70;
    }
    if (host.endsWith('.com') || host.endsWith('.net')) {
      return 0.60;
    }

    // Potential spam / low-quality TLD penalization
    if (
      host.endsWith('.xyz') ||
      host.endsWith('.top') ||
      host.endsWith('.click') ||
      host.endsWith('.link')
    ) {
      return 0.25;
    }

    return 0.50; // Neutral baseline
  }

  /**
   * Blends multi-signal relevance scores using standard weights:
   * Formula: BM25 (60%) + PageRank (20%) + Freshness (10%) + Authority (10%)
   */
  blendScores(
    bm25: number,
    pageRank: number = 0.5,
    freshness: number = 0.5,
    authority: number = 0.5,
  ): BlendedScoreComponents {
    const safeBm25 = Math.max(0, bm25);
    const safePageRank = Math.max(0, Math.min(1, pageRank));
    const safeFreshness = Math.max(0, Math.min(1, freshness));
    const safeAuthority = Math.max(0, Math.min(1, authority));

    // Blending weights
    const W_BM25 = 0.60;
    const W_PAGERANK = 0.20;
    const W_FRESHNESS = 0.10;
    const W_AUTHORITY = 0.10;

    // Normalize BM25 contribution with soft scaling while preserving relative distance
    const bm25Factor = safeBm25 / (1 + safeBm25);
    const blended =
      safeBm25 * W_BM25 +
      safeBm25 * (W_PAGERANK * safePageRank + W_FRESHNESS * safeFreshness + W_AUTHORITY * safeAuthority);

    return {
      bm25Score: Math.round(safeBm25 * 10000) / 10000,
      pageRankScore: Math.round(safePageRank * 10000) / 10000,
      freshnessScore: Math.round(safeFreshness * 10000) / 10000,
      authorityScore: Math.round(safeAuthority * 10000) / 10000,
      blendedScore: Math.round(blended * 10000) / 10000,
    };
  }
}

/**
 * Factory helper for AuthorityScorer.
 */
export function createAuthorityScorer(options?: AuthorityScorerOptions): AuthorityScorer {
  return new AuthorityScorer(options);
}
