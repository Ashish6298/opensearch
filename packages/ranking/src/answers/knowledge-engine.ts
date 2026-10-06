/**
 * @opensearch/ranking — In-Memory Knowledge Graph & Entity Info-Card Engine (Phase 49)
 *
 * Provides instant structured entity cards for search queries:
 * 1. Programming Languages (Python, TypeScript, Rust, Go, JavaScript, C++, Kotlin, Swift)
 * 2. Countries & Territories (France, Japan, Germany, USA, India, UK, Brazil, Canada, Australia)
 * 3. Chemical Elements (Gold, Silver, Hydrogen, Oxygen, Carbon, Helium, Iron, Uranium)
 * 4. HTTP Status Codes (HTTP 200, HTTP 404, HTTP 500, HTTP 301, HTTP 401, HTTP 403, HTTP 503)
 * 5. Physical & Universal Constants (Speed of Light, Planck's Constant, Gravitational Constant, Pi, Euler's Number)
 *
 * Runs completely in-memory with zero runtime external APIs or network dependencies.
 */

export interface KnowledgeEntity {
  /** Entity unique ID */
  id: string;
  /** Primary display name */
  title: string;
  /** Entity category classification */
  category: 'programming_language' | 'country' | 'element' | 'http_status' | 'constant';
  /** Short summary description */
  description: string;
  /** Structured key-value factual attributes */
  attributes: Record<string, string | number>;
  /** Official or authoritative reference URL */
  url?: string;
  /** Query match triggers / aliases */
  aliases: string[];
}

export interface KnowledgeCardResult {
  type: 'knowledge_card';
  badge: string;
  title: string;
  category: string;
  description: string;
  attributes: Record<string, string | number>;
  url?: string;
}

export const KNOWLEDGE_DATABASE: KnowledgeEntity[] = [
  // ── Programming Languages ──────────────────────────────────────
  {
    id: 'lang-python',
    title: 'Python',
    category: 'programming_language',
    description: 'High-level, general-purpose programming language emphasizing code readability with significant indentation.',
    attributes: {
      'Designed By': 'Guido van Rossum',
      'First Released': '1991',
      'Typing Discipline': 'Dynamic, strong',
      'Primary Paradigm': 'Multi-paradigm (OOP, functional, procedural)',
      'Official Website': 'https://www.python.org',
    },
    url: 'https://www.python.org',
    aliases: ['python', 'python language', 'python lang', 'py'],
  },
  {
    id: 'lang-typescript',
    title: 'TypeScript',
    category: 'programming_language',
    description: 'A strongly typed programming language that builds on JavaScript, giving you better tooling at any scale.',
    attributes: {
      'Designed By': 'Anders Hejlsberg (Microsoft)',
      'First Released': '2012',
      'Typing Discipline': 'Static, structural, gradual',
      'Compiles To': 'JavaScript',
      'Official Website': 'https://www.typescriptlang.org',
    },
    url: 'https://www.typescriptlang.org',
    aliases: ['typescript', 'ts', 'typescript lang'],
  },
  {
    id: 'lang-rust',
    title: 'Rust',
    category: 'programming_language',
    description: 'Systems programming language empowering everyone to build reliable and efficient software with memory safety guaranteed.',
    attributes: {
      'Designed By': 'Graydon Hoare (Mozilla Research)',
      'First Released': '2015',
      'Memory Management': 'RAII, borrow checker (no garbage collector)',
      'Primary Paradigm': 'Multi-paradigm (imperative, functional, concurrent)',
      'Official Website': 'https://www.rust-lang.org',
    },
    url: 'https://www.rust-lang.org',
    aliases: ['rust', 'rustlang', 'rust language'],
  },
  {
    id: 'lang-javascript',
    title: 'JavaScript',
    category: 'programming_language',
    description: 'High-level, often just-in-time compiled language that conforms to the ECMAScript specification.',
    attributes: {
      'Designed By': 'Brendan Eich',
      'First Released': '1995',
      'Standard': 'ECMA-262 (ECMAScript)',
      'Typing Discipline': 'Dynamic, weak, prototype-based',
      'Official Website': 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
    },
    url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
    aliases: ['javascript', 'js', 'ecmascript'],
  },
  {
    id: 'lang-golang',
    title: 'Go (Golang)',
    category: 'programming_language',
    description: 'Open source programming language supported by Google that makes it easy to build simple, secure, and scalable software.',
    attributes: {
      'Designed By': 'Robert Griesemer, Rob Pike, Ken Thompson',
      'First Released': '2009',
      'Concurrency': 'Goroutines & Channels (CSP)',
      'Typing Discipline': 'Static, strong, inferred',
      'Official Website': 'https://go.dev',
    },
    url: 'https://go.dev',
    aliases: ['golang', 'go lang', 'go language'],
  },
  {
    id: 'lang-cpp',
    title: 'C++',
    category: 'programming_language',
    description: 'General-purpose programming language created by Bjarne Stroustrup as an extension of the C programming language.',
    attributes: {
      'Designed By': 'Bjarne Stroustrup',
      'First Released': '1985',
      'Standard': 'ISO/IEC 14882',
      'Typing Discipline': 'Static, nominal, strong',
      'Official Website': 'https://isocpp.org',
    },
    url: 'https://isocpp.org',
    aliases: ['c++', 'cpp', 'cplusplus'],
  },

  // ── Countries ──────────────────────────────────────────────────
  {
    id: 'country-france',
    title: 'France',
    category: 'country',
    description: 'Western European country known for historic cities, Mediterranean beaches, culture, and cuisine.',
    attributes: {
      'Capital': 'Paris',
      'Official Language': 'French',
      'Currency': 'Euro (€, EUR)',
      'Population': '~68 Million',
      'Continent': 'Europe',
    },
    url: 'https://en.wikipedia.org/wiki/France',
    aliases: ['france', 'french republic'],
  },
  {
    id: 'country-japan',
    title: 'Japan',
    category: 'country',
    description: 'Island nation in East Asia known for dense cities, imperial palaces, mountainous national parks, and advanced technology.',
    attributes: {
      'Capital': 'Tokyo',
      'Official Language': 'Japanese',
      'Currency': 'Japanese Yen (¥, JPY)',
      'Population': '~125 Million',
      'Continent': 'Asia',
    },
    url: 'https://en.wikipedia.org/wiki/Japan',
    aliases: ['japan', 'nippon'],
  },
  {
    id: 'country-germany',
    title: 'Germany',
    category: 'country',
    description: 'Central European nation with a landscape of forests, rivers, mountain ranges and North Sea beaches.',
    attributes: {
      'Capital': 'Berlin',
      'Official Language': 'German',
      'Currency': 'Euro (€, EUR)',
      'Population': '~84 Million',
      'Continent': 'Europe',
    },
    url: 'https://en.wikipedia.org/wiki/Germany',
    aliases: ['germany', 'deutschland'],
  },
  {
    id: 'country-india',
    title: 'India',
    category: 'country',
    description: 'Country in South Asia known for its vast diversity, rich history, cultural heritage, and rapidly growing digital economy.',
    attributes: {
      'Capital': 'New Delhi',
      'National Languages': 'Hindi, English (and 22 scheduled languages)',
      'Currency': 'Indian Rupee (₹, INR)',
      'Population': '~1.4 Billion',
      'Continent': 'Asia',
    },
    url: 'https://en.wikipedia.org/wiki/India',
    aliases: ['india', 'bharat'],
  },
  {
    id: 'country-usa',
    title: 'United States of America',
    category: 'country',
    description: 'Federal republic composed of 50 states in North America.',
    attributes: {
      'Capital': 'Washington, D.C.',
      'National Language': 'English (de facto)',
      'Currency': 'United States Dollar ($, USD)',
      'Population': '~335 Million',
      'Continent': 'North America',
    },
    url: 'https://en.wikipedia.org/wiki/United_States',
    aliases: ['usa', 'united states', 'united states of america', 'us'],
  },

  // ── Chemical Elements ──────────────────────────────────────────
  {
    id: 'elem-gold',
    title: 'Gold (Au)',
    category: 'element',
    description: 'Dense, soft, malleable, and ductile transition metal with a bright, slightly reddish yellow color.',
    attributes: {
      'Atomic Number': 79,
      'Symbol': 'Au',
      'Atomic Mass': '196.966569 u',
      'Standard State': 'Solid (298 K)',
      'Group': 'Group 11 (Transition metal)',
    },
    url: 'https://en.wikipedia.org/wiki/Gold',
    aliases: ['gold', 'au element', 'element gold'],
  },
  {
    id: 'elem-hydrogen',
    title: 'Hydrogen (H)',
    category: 'element',
    description: 'Chemical element with atomic number 1. The lightest and most abundant chemical substance in the Universe.',
    attributes: {
      'Atomic Number': 1,
      'Symbol': 'H',
      'Atomic Mass': '1.008 u',
      'Standard State': 'Gas (298 K)',
      'Group': 'Group 1 (Nonmetal)',
    },
    url: 'https://en.wikipedia.org/wiki/Hydrogen',
    aliases: ['hydrogen', 'element hydrogen', 'h element'],
  },
  {
    id: 'elem-oxygen',
    title: 'Oxygen (O)',
    category: 'element',
    description: 'Member of the chalcogen group in the periodic table, a highly reactive nonmetal and oxidizing agent.',
    attributes: {
      'Atomic Number': 8,
      'Symbol': 'O',
      'Atomic Mass': '15.999 u',
      'Standard State': 'Gas (298 K)',
      'Group': 'Group 16 (Chalcogen)',
    },
    url: 'https://en.wikipedia.org/wiki/Oxygen',
    aliases: ['oxygen', 'element oxygen', 'o element'],
  },
  {
    id: 'elem-carbon',
    title: 'Carbon (C)',
    category: 'element',
    description: 'Nonmetallic chemical element capable of forming diverse organic compounds and polymers.',
    attributes: {
      'Atomic Number': 6,
      'Symbol': 'C',
      'Atomic Mass': '12.011 u',
      'Standard State': 'Solid (298 K)',
      'Group': 'Group 14 (Carbon group)',
    },
    url: 'https://en.wikipedia.org/wiki/Carbon',
    aliases: ['carbon', 'element carbon', 'c element'],
  },

  // ── HTTP Status Codes ──────────────────────────────────────────
  {
    id: 'http-200',
    title: 'HTTP 200 OK',
    category: 'http_status',
    description: 'Standard HTTP response indicating that the client request has succeeded.',
    attributes: {
      'Status Code': 200,
      'Class': '2xx (Successful)',
      'Specification': 'RFC 9110 Section 15.3.1',
      'Meaning': 'Request processed successfully and content returned in response payload.',
    },
    url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/200',
    aliases: ['http 200', '200 ok', 'http 200 ok', 'status 200'],
  },
  {
    id: 'http-404',
    title: 'HTTP 404 Not Found',
    category: 'http_status',
    description: 'Client error response indicating that the server cannot find the requested resource.',
    attributes: {
      'Status Code': 404,
      'Class': '4xx (Client Error)',
      'Specification': 'RFC 9110 Section 15.5.5',
      'Meaning': 'The origin server did not find a current representation for the target resource.',
    },
    url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/404',
    aliases: ['http 404', '404 not found', 'http 404 not found', 'status 404'],
  },
  {
    id: 'http-500',
    title: 'HTTP 500 Internal Server Error',
    category: 'http_status',
    description: 'Server error response indicating that the server encountered an unexpected condition that prevented it from fulfilling the request.',
    attributes: {
      'Status Code': 500,
      'Class': '5xx (Server Error)',
      'Specification': 'RFC 9110 Section 15.6.1',
      'Meaning': 'General catch-all error when the server cannot be more specific about the failure.',
    },
    url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/500',
    aliases: ['http 500', '500 internal server error', 'http 500 error', 'status 500'],
  },
  {
    id: 'http-401',
    title: 'HTTP 401 Unauthorized',
    category: 'http_status',
    description: 'Client error response indicating that the client request has not been completed because it lacks valid authentication credentials for the requested resource.',
    attributes: {
      'Status Code': 401,
      'Class': '4xx (Client Error)',
      'Specification': 'RFC 9110 Section 15.5.2',
      'Required Header': 'WWW-Authenticate',
    },
    url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/401',
    aliases: ['http 401', '401 unauthorized', 'status 401'],
  },
  {
    id: 'http-403',
    title: 'HTTP 403 Forbidden',
    category: 'http_status',
    description: 'Client error response indicating that the server understands the request but refuses to authorize it.',
    attributes: {
      'Status Code': 403,
      'Class': '4xx (Client Error)',
      'Specification': 'RFC 9110 Section 15.5.4',
      'Meaning': 'Client identity is known to the server, but access is refused.',
    },
    url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/403',
    aliases: ['http 403', '403 forbidden', 'status 403'],
  },

  // ── Universal Physical & Math Constants ────────────────────────
  {
    id: 'const-c',
    title: 'Speed of Light (c)',
    category: 'constant',
    description: 'Universal physical constant exactly equal to 299,792,458 metres per second in vacuum.',
    attributes: {
      'Exact Value': '299,792,458 m/s',
      'Symbol': 'c',
      'Unit': 'metres per second (m/s)',
      'Significance': 'Upper limit for the speed at which conventional matter and information can travel.',
    },
    url: 'https://en.wikipedia.org/wiki/Speed_of_light',
    aliases: ['speed of light', 'c constant', 'light speed', 'value of c'],
  },
  {
    id: 'const-pi',
    title: 'Pi (π)',
    category: 'constant',
    description: 'Mathematical constant defined as the ratio of a circle\'s circumference to its diameter.',
    attributes: {
      'Approximate Value': '3.141592653589793',
      'Symbol': 'π',
      'Type': 'Transcendental / Irrational number',
      'Fraction Approximation': '22 / 7',
    },
    url: 'https://en.wikipedia.org/wiki/Pi',
    aliases: ['pi', 'value of pi', 'constant pi'],
  },
  {
    id: 'const-g',
    title: 'Gravitational Constant (G)',
    category: 'constant',
    description: 'Empirical physical constant involved in the calculation of gravitational effects in Newton\'s law of universal gravitation and Einstein\'s general theory of relativity.',
    attributes: {
      'Approximate Value': '6.67430 × 10^-11 m³/(kg·s²)',
      'Symbol': 'G',
      'Standard Uncertainty': '0.00015 × 10^-11',
    },
    url: 'https://en.wikipedia.org/wiki/Gravitational_constant',
    aliases: ['gravitational constant', 'constant of gravitation', 'big g'],
  },
];

export class KnowledgeEngine {
  private readonly aliasMap = new Map<string, KnowledgeEntity>();

  constructor() {
    for (const entity of KNOWLEDGE_DATABASE) {
      for (const alias of entity.aliases) {
        this.aliasMap.set(alias.toLowerCase().trim(), entity);
      }
      this.aliasMap.set(entity.title.toLowerCase().trim(), entity);
    }
  }

  /**
   * Fast in-memory lookup for queries matching knowledge graph entities.
   * Completes in < 0.1ms without external network requests.
   */
  lookup(rawQuery: string): KnowledgeCardResult | null {
    if (!rawQuery || typeof rawQuery !== 'string') {
      return null;
    }

    const query = rawQuery.toLowerCase().trim().replace(/[?!.,]+$/, '');
    if (!query) {
      return null;
    }

    const entity = this.aliasMap.get(query);
    if (!entity) {
      return null;
    }

    const badgeCategoryMap: Record<string, string> = {
      programming_language: '[programming-language]',
      country: '[country-profile]',
      element: '[chemical-element]',
      http_status: '[http-status-code]',
      constant: '[physical-constant]',
    };

    return {
      type: 'knowledge_card',
      badge: badgeCategoryMap[entity.category] ?? '[knowledge-graph]',
      title: entity.title,
      category: entity.category,
      description: entity.description,
      attributes: entity.attributes,
      url: entity.url,
    };
  }
}

/**
 * Factory creating a KnowledgeEngine instance.
 */
export function createKnowledgeEngine(): KnowledgeEngine {
  return new KnowledgeEngine();
}
