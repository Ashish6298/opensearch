/**
 * @opensearch/crawler — Curated Seed Corpus Definitions (Phase 23)
 *
 * Provides a structured, categorised, high-quality collection of seed URLs
 * representing useful public web domains, technical documentation, open source,
 * reference resources, and knowledge repositories suitable for V1.0.0.
 */

export interface SeedCategory {
  id: string;
  name: string;
  description: string;
  seeds: SeedEntry[];
}

export interface SeedEntry {
  url: string;
  title: string;
  description: string;
  priority: number;
  tags: string[];
}

export const CURATED_SEED_CORPUS: SeedCategory[] = [
  {
    id: 'tech-docs',
    name: 'Technical Documentation & Standards',
    description: 'Core web specifications, MDN web docs, TypeScript, and open source guides.',
    seeds: [
      {
        url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP',
        title: 'MDN HTTP Documentation',
        description: 'Comprehensive guides on HTTP protocols, status codes, headers, and caching.',
        priority: 1,
        tags: ['web', 'http', 'standards', 'docs'],
      },
      {
        url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
        title: 'MDN JavaScript Reference',
        description: 'Standard documentation for ECMAScript, JavaScript syntax, and Web APIs.',
        priority: 1,
        tags: ['javascript', 'programming', 'docs'],
      },
      {
        url: 'https://www.typescriptlang.org/docs/',
        title: 'TypeScript Official Documentation',
        description: 'Handbook and reference for typed JavaScript and TypeScript compiler.',
        priority: 2,
        tags: ['typescript', 'programming', 'compiler'],
      },
      {
        url: 'https://nodejs.org/en/docs',
        title: 'Node.js Documentation',
        description: 'Server-side JavaScript runtime documentation, standard libraries, and APIs.',
        priority: 2,
        tags: ['nodejs', 'javascript', 'backend'],
      },
    ],
  },
  {
    id: 'open-knowledge',
    name: 'Open Knowledge & Reference',
    description: 'Free public knowledge repositories, encyclopedias, and archives.',
    seeds: [
      {
        url: 'https://en.wikipedia.org/wiki/Search_engine',
        title: 'Wikipedia — Search Engine',
        description: 'Information retrieval, web crawlers, inverted indices, and search history.',
        priority: 1,
        tags: ['search', 'information-retrieval', 'encyclopedia'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Inverted_index',
        title: 'Wikipedia — Inverted Index',
        description: 'Data structure explanation for term dictionaries and document postings.',
        priority: 1,
        tags: ['indexer', 'algorithms', 'computer-science'],
      },
      {
        url: 'https://en.wikipedia.org/wiki/Okapi_BM25',
        title: 'Wikipedia — Okapi BM25',
        description: 'Probabilistic relevance ranking function used in information retrieval.',
        priority: 1,
        tags: ['ranking', 'bm25', 'math'],
      },
    ],
  },
  {
    id: 'privacy-security',
    name: 'Privacy, Security & Open Web',
    description: 'Foundational organizations advocating for privacy, open source, and security.',
    seeds: [
      {
        url: 'https://www.eff.org/about',
        title: 'Electronic Frontier Foundation (EFF)',
        description: 'Defending digital privacy, free expression, and innovation online.',
        priority: 2,
        tags: ['privacy', 'civil-liberties', 'open-web'],
      },
      {
        url: 'https://owasp.org/www-project-top-ten/',
        title: 'OWASP Top 10 Security Risks',
        description: 'Standard security awareness document for developers and web application security.',
        priority: 2,
        tags: ['security', 'owasp', 'appsec'],
      },
    ],
  },
];

/**
 * Returns a flat array of all curated seed URLs sorted by priority.
 */
export function getCuratedSeedUrls(): string[] {
  const allSeeds = CURATED_SEED_CORPUS.flatMap(cat => cat.seeds);
  return allSeeds
    .sort((a, b) => a.priority - b.priority)
    .map(s => s.url);
}

/**
 * Returns all seed entries across all categories.
 */
export function getAllCuratedSeeds(): SeedEntry[] {
  return CURATED_SEED_CORPUS.flatMap(cat => cat.seeds);
}
