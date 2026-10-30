/**
 * @opensearch/shared — Demo Data & Representative Query Subsystem (Phase 116)
 *
 * Provides:
 * 1. Curated, zero-dependency offline demo corpus covering everyday and developer domains.
 * 2. Representative queries for evaluators, students, and developers.
 * 3. Honest provenance tagging (source: 'demo', isDemo: true).
 * 4. Zero external provider dependencies, ensuring 100% offline demo execution.
 */

export interface DemoDocument {
  id: string;
  title: string;
  url: string;
  displayUrl: string;
  domain: string;
  snippet: string;
  bodyText: string;
  tags: string[];
  category: 'everyday' | 'developer' | 'science' | 'reference';
  contentType: string;
  publishedAt: string;
  isDemo: true;
}

export const REPRESENTATIVE_DEMO_QUERIES = {
  everyday: [
    {
      query: 'weather',
      label: 'Weather & Climate',
      description: 'Local meteorological forecast, atmospheric humidity, and radar observations.',
    },
    {
      query: 'healthy recipe',
      label: 'Healthy Recipes',
      description: 'Nutritious Mediterranean vegetable quinoa bowl with fresh herbs and olive oil.',
    },
    {
      query: 'solar system',
      label: 'Solar System Science',
      description: 'Planetary astronomy, terrestrial and gas giant orbital parameters from NASA.',
    },
    {
      query: 'world news',
      label: 'Global News & Events',
      description: 'Global breaking events, independent journalism, cultural and economic developments.',
    },
    {
      query: 'unit converter',
      label: 'Unit Converter Tool',
      description: 'SI metric and imperial measurement conversion ratios for length, mass, and temperature.',
    },
  ],
  developer: [
    {
      query: 'typescript compiler',
      label: 'TypeScript Architecture',
      description: 'TypeScript architectural reference, type inference, compiler flags, and strict checking.',
    },
    {
      query: 'bm25 ranking algorithm',
      label: 'BM25 Scoring Function',
      description: 'Okapi BM25 probabilistic ranking function, k1 term saturation, and b length normalization.',
    },
    {
      query: 'inverted index postings',
      label: 'Inverted Index Structure',
      description: 'Information retrieval indexing, inverted lists, skip pointers, and vocabulary compression.',
    },
    {
      query: 'rest api cors headers',
      label: 'REST API & CORS Security',
      description: 'Cross-Origin Resource Sharing headers, preflight OPTIONS requests, and origin policies.',
    },
    {
      query: 'git rebase interactive',
      label: 'Git Interactive Rebase',
      description: 'Git commit history manipulation, interactive squash, fixup, and linear tree workflows.',
    },
  ],
} as const;

export const DEMO_CORPUS_DOCUMENTS: DemoDocument[] = [
  // Everyday Queries
  {
    id: 'demo-weather-01',
    title: 'National Weather Service — Atmospheric Observations & Forecast Models',
    url: 'https://forecast.weather.gov/observations/reference',
    displayUrl: 'weather.gov › observations › reference',
    domain: 'weather.gov',
    snippet:
      'Official weather forecasts, radar imagery, atmospheric pressure charts, and severe storm warnings based on global numerical weather prediction models.',
    bodyText:
      'Weather forecasts and meteorological atmospheric observation data. Real-time temperature, dew point, relative humidity, wind speed, precipitation radar, and severe weather warnings for local regions.',
    tags: ['weather', 'forecast', 'meteorology', 'climate', 'temperature', 'radar', 'rain'],
    category: 'everyday',
    contentType: 'text/html',
    publishedAt: '2026-06-15T08:00:00Z',
    isDemo: true,
  },
  {
    id: 'demo-recipe-01',
    title: 'Mediterranean Vegetable Quinoa Bowl — Nutrition & Culinary Guide',
    url: 'https://recipes.openfood.org/mediterranean-quinoa-bowl',
    displayUrl: 'recipes.openfood.org › mediterranean-quinoa-bowl',
    domain: 'recipes.openfood.org',
    snippet:
      'A healthy recipe featuring roasted bell peppers, cucumbers, kalamata olives, crisp chickpeas, and fluffy quinoa tossed in lemon oregano vinaigrette.',
    bodyText:
      'Healthy recipe for wholesome weeknight meals. Learn how to cook perfect fluffy quinoa paired with fresh vegetables, extra virgin olive oil, protein-rich chickpeas, and Mediterranean herbs.',
    tags: ['healthy', 'recipe', 'food', 'cooking', 'quinoa', 'mediterranean', 'nutrition', 'vegetable'],
    category: 'everyday',
    contentType: 'text/html',
    publishedAt: '2026-05-20T12:00:00Z',
    isDemo: true,
  },
  {
    id: 'demo-solar-01',
    title: 'NASA Solar System Exploration — Planets, Moons & Deep Space Missions',
    url: 'https://science.nasa.gov/solar-system/planets',
    displayUrl: 'science.nasa.gov › solar-system › planets',
    domain: 'science.nasa.gov',
    snippet:
      'Comprehensive exploration of the eight planets in our solar system, dwarf planets, the asteroid belt, and Kuiper belt objects compiled from NASA robotic space missions.',
    bodyText:
      'Our solar system consists of the Sun and eight primary planets: Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, and Neptune. Planetary orbits, orbital mechanics, magnetic fields, and cosmic history.',
    tags: ['solar', 'system', 'planets', 'space', 'astronomy', 'nasa', 'jupiter', 'mars', 'earth'],
    category: 'everyday',
    contentType: 'text/html',
    publishedAt: '2026-04-10T15:30:00Z',
    isDemo: true,
  },
  {
    id: 'demo-news-01',
    title: 'Global Open News — Independent Worldwide Journalism & Analysis',
    url: 'https://news.openpress.org/global-perspectives-2026',
    displayUrl: 'news.openpress.org › global-perspectives-2026',
    domain: 'news.openpress.org',
    snippet:
      'In-depth global news reporting on technological innovation, public health initiatives, climate agreements, and international economic developments.',
    bodyText:
      'World news analysis and non-partisan journalism. Comprehensive coverage of emerging technological trends, renewable energy investments, and cross-border research collaborations.',
    tags: ['world', 'news', 'journalism', 'global', 'events', 'international', 'reporting'],
    category: 'everyday',
    contentType: 'article',
    publishedAt: '2026-10-28T09:00:00Z',
    isDemo: true,
  },
  {
    id: 'demo-unit-01',
    title: 'Universal Metric & Imperial Unit Converter — SI Measurement Standards',
    url: 'https://units.nist.reference.org/converter-tool',
    displayUrl: 'units.nist.reference.org › converter-tool',
    domain: 'units.nist.reference.org',
    snippet:
      'Instant conversion calculator for length, temperature (Celsius, Fahrenheit, Kelvin), mass, volume, pressure, and digital information storage units.',
    bodyText:
      'Unit converter reference tool. Convert meters to feet, kilograms to pounds, Celsius to Fahrenheit, and gigabytes to tebibytes with high-precision scientific decimal factors.',
    tags: ['unit', 'converter', 'metric', 'imperial', 'celsius', 'fahrenheit', 'meters', 'measurement'],
    category: 'everyday',
    contentType: 'text/html',
    publishedAt: '2026-01-05T00:00:00Z',
    isDemo: true,
  },

  // Developer Queries
  {
    id: 'demo-ts-01',
    title: 'TypeScript Compiler Architecture & Type Checking Guide',
    url: 'https://www.typescriptlang.org/docs/handbook/compiler-architecture.html',
    displayUrl: 'typescriptlang.org › docs › compiler-architecture',
    domain: 'typescriptlang.org',
    snippet:
      'An architectural overview of the TypeScript compiler: the scanner, parser, binder, type checker, and emitter stages transforming TypeScript ASTs into clean JavaScript.',
    bodyText:
      'The TypeScript compiler pipeline consists of core components: Parser produces an Abstract Syntax Tree (AST), Binder generates symbols, TypeChecker enforces static type semantics, and Emitter produces JavaScript outputs.',
    tags: ['typescript', 'compiler', 'javascript', 'ast', 'types', 'typechecker', 'parser', 'programming'],
    category: 'developer',
    contentType: 'text/html',
    publishedAt: '2026-07-01T10:00:00Z',
    isDemo: true,
  },
  {
    id: 'demo-bm25-01',
    title: 'The Okapi BM25 Probabilistic Ranking Algorithm Explained',
    url: 'https://nlp.stanford.edu/IR-book/html/htmledition/okapi-bm25-1.html',
    displayUrl: 'nlp.stanford.edu › IR-book › okapi-bm25',
    domain: 'nlp.stanford.edu',
    snippet:
      'Mathematical formulation of Okapi BM25 ranking: term frequency saturation with parameter k1, document length normalization via parameter b, and inverse document frequency (IDF).',
    bodyText:
      'BM25 is a non-linear term frequency ranking function used in information retrieval. Unlike raw TF-IDF, BM25 bounds term saturation with k1=1.2 and normalizes document length with b=0.75 against average document length.',
    tags: ['bm25', 'ranking', 'algorithm', 'ir', 'search', 'scoring', 'idf', 'information', 'retrieval'],
    category: 'developer',
    contentType: 'text/html',
    publishedAt: '2026-02-14T14:00:00Z',
    isDemo: true,
  },
  {
    id: 'demo-index-01',
    title: 'Inverted Index Data Structures & Fast Posting Lists Traversal',
    url: 'https://cs.princeton.edu/courses/archive/ir/inverted-index.pdf',
    displayUrl: 'cs.princeton.edu › courses › inverted-index',
    domain: 'cs.princeton.edu',
    snippet:
      'Engineering inverted indexes for search engines: term dictionaries, memory-mapped posting lists, delta-gap encoding, and WAND heuristic query optimization.',
    bodyText:
      'An inverted index maps vocabulary terms to posting lists containing document IDs, term frequencies, and positional offsets. Techniques like variable-byte compression and skip pointers enable millisecond conjunctive lookups.',
    tags: ['inverted', 'index', 'postings', 'dictionary', 'data', 'structures', 'search', 'engine'],
    category: 'developer',
    contentType: 'text/html',
    publishedAt: '2026-03-22T11:00:00Z',
    isDemo: true,
  },
  {
    id: 'demo-cors-01',
    title: 'Cross-Origin Resource Sharing (CORS) Security & HTTP Headers',
    url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS',
    displayUrl: 'developer.mozilla.org › Web › HTTP › CORS',
    domain: 'developer.mozilla.org',
    snippet:
      'Complete guide to CORS headers: Access-Control-Allow-Origin, Access-Control-Allow-Methods, credentialed requests, and handling preflight OPTIONS requests securely.',
    bodyText:
      'Cross-Origin Resource Sharing (CORS) is an HTTP-header based mechanism that allows a server to indicate any origins other than its own from which a browser should permit loading resources. Security risks and preflight rules.',
    tags: ['rest', 'api', 'cors', 'headers', 'http', 'security', 'web', 'preflight', 'origin'],
    category: 'developer',
    contentType: 'text/html',
    publishedAt: '2026-08-19T16:45:00Z',
    isDemo: true,
  },
  {
    id: 'demo-git-01',
    title: 'Git Interactive Rebase — Rewriting, Squashing & Cleaning History',
    url: 'https://git-scm.com/book/en/v2/Git-Tools-Rewriting-History',
    displayUrl: 'git-scm.com › book › Git-Tools-Rewriting-History',
    domain: 'git-scm.com',
    snippet:
      'Master git rebase -i to squash multiple WIP commits into clean logical commits, reword commit messages, split changes, and resolve merge conflicts cleanly.',
    bodyText:
      'Git interactive rebase allows developers to edit, reword, squash, and reorder commits before merging feature branches into main. Best practices for collaborative Git hygiene and preserving clean commit logs.',
    tags: ['git', 'rebase', 'interactive', 'squash', 'commits', 'history', 'version', 'control'],
    category: 'developer',
    contentType: 'text/html',
    publishedAt: '2026-05-11T09:15:00Z',
    isDemo: true,
  },
];

/**
 * Searches the offline demo corpus for matching documents.
 * Guarantees zero network calls and deterministic offline execution.
 */
export function searchDemoCorpus(query: string, options: { limit?: number; category?: string } = {}): {
  documents: DemoDocument[];
  matchedTerms: string[];
} {
  const normalized = query.toLowerCase().trim();
  const queryTokens = normalized.split(/\s+/).filter(t => t.length > 0);
  const limit = options.limit ?? 10;

  if (queryTokens.length === 0) {
    return { documents: DEMO_CORPUS_DOCUMENTS.slice(0, limit), matchedTerms: [] };
  }

  // Score each demo document based on token matches in title, tags, and body
  const scored = DEMO_CORPUS_DOCUMENTS.map(doc => {
    let score = 0;
    const docTags = doc.tags.map(t => t.toLowerCase());
    const titleLower = doc.title.toLowerCase();
    const bodyLower = doc.bodyText.toLowerCase();

    // Check category filter if provided
    if (options.category && options.category !== 'all' && options.category !== doc.category) {
      return { doc, score: 0 };
    }

    for (const token of queryTokens) {
      if (titleLower.includes(token)) score += 10;
      if (docTags.includes(token)) score += 8;
      if (bodyLower.includes(token)) score += 2;
    }

    return { doc, score };
  })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // If no exact matches found, return representative documents so the demo never leaves a blank page
  if (scored.length === 0) {
    return {
      documents: DEMO_CORPUS_DOCUMENTS.slice(0, limit),
      matchedTerms: queryTokens,
    };
  }

  return {
    documents: scored.map(s => s.doc),
    matchedTerms: queryTokens,
  };
}
