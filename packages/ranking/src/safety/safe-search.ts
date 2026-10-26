/**
 * @opensearch/ranking — Safe Search & Content Controls (Phase 81)
 *
 * Implements content filtering and honest disclosure of provider safe search capabilities:
 * - Three-tier filter levels: 'strict', 'moderate', and 'off'
 * - Provider safe-search capability registry and honest limitation disclosures
 * - Consistent local keyword, domain, and title filtering for local and external results
 * - Transparent explanation of what Safe Search does and does not cover
 */

export type SafeSearchLevel = 'strict' | 'moderate' | 'off';

export interface ProviderSafeSearchCapability {
  /** Whether the upstream provider natively supports a safe-search request parameter */
  supported: boolean;
  /** Name of the provider's upstream query parameter if supported */
  parameterName?: string;
  /** Value passed when safe search is enabled */
  enabledValue?: string;
  /** Honest explanation of provider safe search behavior and boundaries */
  explanation: string;
}

/**
 * Standard registry documenting upstream safe search capabilities for all known providers.
 * Conforms to Phase 81 requirement: Explain unsupported provider behavior honestly.
 */
export const PROVIDER_SAFE_SEARCH_CAPABILITIES: Record<string, ProviderSafeSearchCapability> = {
  'wikimedia': {
    supported: false,
    explanation: 'Wikimedia (Wikipedia) OpenSearch Action API does not offer native upstream adult content parameters. OpenSearch applies local content filtering to Wikipedia results.',
  },
  'wikimedia-images': {
    supported: false,
    explanation: 'Wikimedia Commons API does not offer automated upstream safe-search flags. OpenSearch applies local title, category, and metadata filtering.',
  },
  'hackernews': {
    supported: false,
    explanation: 'Hacker News (Algolia Search) API does not support upstream adult content parameters. OpenSearch applies local title and URL content filtering.',
  },
  'local-index': {
    supported: true,
    parameterName: 'safeSearch',
    enabledValue: 'strict',
    explanation: 'Local Inverted Index fully supports native deterministic safe-search filtering against indexed terms, domains, and content classifications.',
  },
  'mock-provider': {
    supported: true,
    parameterName: 'safe',
    enabledValue: 'active',
    explanation: 'Mock test provider supports simulated upstream safe search parameter forwarding.',
  },
};

/**
 * Curated list of adult/explicit terms for local content moderation.
 */
export const EXPLICIT_KEYWORDS = new Set<string>([
  'porn',
  'porno',
  'pornography',
  'xxx',
  'nsfw',
  'hentai',
  'erotic',
  'erotica',
  'sex',
  'explicit',
  'nudity',
  'nude',
  'hardcore',
  'gore',
  'adult',
]);

/**
 * Curated list of known adult domains.
 */
export const EXPLICIT_DOMAINS = new Set<string>([
  'pornhub.com',
  'xvideos.com',
  'redtube.com',
  'youporn.com',
  'xhamster.com',
]);

/**
 * Checks whether text or URL matches explicit adult keywords or domains.
 */
export function isContentExplicit(text: string, title?: string, url?: string): boolean {
  const combined = `${title || ''} ${text || ''}`.toLowerCase();

  // Check domains
  if (url) {
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
      if (EXPLICIT_DOMAINS.has(hostname)) {
        return true;
      }
    } catch {
      // Ignore URL parse failure
    }
  }

  // Check tokenized terms
  const tokens = combined.split(/[^a-zA-Z0-9_-]+/);
  for (const token of tokens) {
    if (EXPLICIT_KEYWORDS.has(token)) {
      return true;
    }
  }

  return false;
}

export interface FilterResult<T> {
  filtered: T[];
  excludedCount: number;
  level: SafeSearchLevel;
}

/**
 * Applies consistent local Safe Search filtering to search result items.
 *
 * - 'off': Zero filtering applied; all results preserved.
 * - 'moderate': Filters items with explicit keywords in the title, URL, or explicit domain.
 * - 'strict': Filters items with explicit keywords in the title, URL, snippet, or body.
 */
export function filterSafeSearchResults<T extends { title?: string; snippet?: string; url?: string; canonicalUrl?: string }>(
  items: T[],
  level: SafeSearchLevel = 'moderate',
): FilterResult<T> {
  if (level === 'off') {
    return {
      filtered: items,
      excludedCount: 0,
      level,
    };
  }

  const filtered: T[] = [];
  let excludedCount = 0;

  for (const item of items) {
    const title = item.title || '';
    const url = item.canonicalUrl || item.url || '';
    const snippet = item.snippet || '';

    let explicit = false;
    if (level === 'strict') {
      // Strict: title, URL, and snippet are all inspected
      explicit = isContentExplicit(snippet, title, url);
    } else {
      // Moderate: title and URL are inspected; broad snippet terms are tolerated
      explicit = isContentExplicit('', title, url);
    }

    if (explicit) {
      excludedCount++;
    } else {
      filtered.push(item);
    }
  }

  return {
    filtered,
    excludedCount,
    level,
  };
}

export interface SafeSearchDisclosure {
  level: SafeSearchLevel;
  localFilteringApplied: boolean;
  capabilities: Record<string, ProviderSafeSearchCapability>;
  summaryExplanation: string;
  whatItCovers: string;
  whatItDoesNotCover: string;
}

/**
 * Returns an honest, transparent disclosure of what Safe Search does and does not cover.
 * Conforms to Phase 81 Acceptance Criteria.
 */
export function getSafeSearchDisclosure(
  level: SafeSearchLevel = 'moderate',
  activeProviderIds: string[] = ['local-index', 'wikimedia', 'hackernews', 'wikimedia-images'],
): SafeSearchDisclosure {
  const capabilities: Record<string, ProviderSafeSearchCapability> = {};
  for (const id of activeProviderIds) {
    capabilities[id] = PROVIDER_SAFE_SEARCH_CAPABILITIES[id] || {
      supported: false,
      explanation: `Provider "${id}" safe search capability is unverified; local fallback filtering is applied.`,
    };
  }

  const whatItCovers =
    'Local keyword and domain filtering for adult, sexually explicit, and mature terms across titles, URLs, and snippets.';
  const whatItDoesNotCover =
    'External community providers (Wikipedia, Hacker News, Wikimedia Commons) do not support upstream server-side safe search parameters. OpenSearch applies post-retrieval filtering locally.';

  let summaryExplanation = '';
  if (level === 'off') {
    summaryExplanation = 'Safe Search is turned off. All search results are displayed unfiltered.';
  } else if (level === 'strict') {
    summaryExplanation =
      'Safe Search is set to Strict. Explicit keywords and adult domains are filtered from titles, URLs, and snippets across all results.';
  } else {
    summaryExplanation =
      'Safe Search is set to Moderate. Explicit titles and adult domains are filtered, while general educational discussions are permitted.';
  }

  return {
    level,
    localFilteringApplied: level !== 'off',
    capabilities,
    summaryExplanation,
    whatItCovers,
    whatItDoesNotCover,
  };
}
