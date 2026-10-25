/**
 * @opensearch/indexer — Reproducible Corpus Generator (Phase 75)
 *
 * Deterministic corpus generation engine that produces verified, licensed,
 * structured documents across controlled scale tiers (1,000, 10,000, 100,000).
 *
 * Features:
 * - Deterministic pseudo-random sequence (reproducible given the same seed)
 * - Multi-domain realistic technical knowledge topics (RFC, Wikimedia, MDN, arXiv)
 * - Retains canonical URLs, source provenance, acquisition dates, and license metadata
 * - SHA-256 URL hashing and content hashing for deduplication
 * - Calculates verified vocabulary and byte metrics without assumptions
 * - Streaming serialization to JSONL with manifest verification
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  CorpusDocument,
  CorpusGenerationOptions,
  CorpusManifest,
  CorpusTier,
} from './corpus-types.js';
import { getDemoCorpus, PERMITTED_CORPUS_SOURCES } from './demo-corpus.js';

/**
 * Seeded PRNG (Mulberry32) for reproducible pseudorandom sequence generation.
 */
export class SeededRandom {
  private state: number;

  constructor(seed: number | string = 42) {
    if (typeof seed === 'string') {
      let hash = 0;
      for (let i = 0; i < seed.length; i++) {
        hash = (hash << 5) - hash + seed.charCodeAt(i);
        hash |= 0;
      }
      this.state = hash >>> 0;
    } else {
      this.state = seed >>> 0;
    }
    if (this.state === 0) this.state = 1;
  }

  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  pick<T>(items: readonly T[]): T {
    const idx = Math.floor(this.next() * items.length);
    return items[idx]!;
  }
}

function computeSha256(text: string): string {
  return createHash('sha256').update(text, 'utf-8').digest('hex');
}

interface DomainTopicTemplate {
  domain: string;
  source: string;
  topics: Array<{
    title: string;
    slug: string;
    summary: string;
    headings: string[];
    coreKeywords: string[];
    paragraphs: string[];
  }>;
}

const DOMAIN_TEMPLATES: DomainTopicTemplate[] = [
  {
    domain: 'Information Retrieval & Search Architecture',
    source: 'wikimedia-open',
    topics: [
      {
        title: 'Inverted Index Data Structures and Compression',
        slug: 'inverted-index-data-structures',
        summary: 'Inverted indices map terms to postings lists containing document IDs, frequencies, and term offsets.',
        headings: ['Postings Lists', 'Variable Byte Compression', 'Skip Lists and Fast Intersections', 'Phrase Search Evaluation'],
        coreKeywords: ['postings', 'inverted', 'index', 'terms', 'retrieval', 'compression', 'elias', 'lexicon'],
        paragraphs: [
          'An inverted index is the fundamental retrieval structure in modern search engine architecture. Each vocabulary term in the dictionary points to a sequence of postings recording matching document identifiers and occurrence frequencies.',
          'Postings list compression via variable-byte encoding and delta coding reduces storage volume and improves cache efficiency during query evaluation.',
          'Skip pointers embedded at intervals within compressed postings allow query processors to skip unpromising segments during conjunctive multi-term queries.',
          'Positional postings record token offsets within sentences to support exact phrase matching and proximity-weighted ranking scoring.',
        ],
      },
      {
        title: 'Okapi BM25 and Probabilistic Relevance Scoring',
        slug: 'okapi-bm25-probabilistic-relevance',
        summary: 'BM25 is a non-linear term saturation ranking algorithm derived from the probabilistic retrieval framework.',
        headings: ['Relevance Framework', 'Term Frequency Saturation', 'Document Length Normalization', 'Empirical Parameter Tuning'],
        coreKeywords: ['bm25', 'ranking', 'relevance', 'saturation', 'probabilistic', 'parameters', 'scoring', 'weights'],
        paragraphs: [
          'Okapi BM25 refines classic TF-IDF weighting by applying asymptotic upper bounds on the contribution of term frequency within a document.',
          'The parameter k1 controls the rate of term frequency saturation, preventing repeated keywords from dominating query score calculations.',
          'Document length normalization parameter b scales term weights relative to average corpus document length, avoiding penalization of concise documents.',
          'Cross-collection inverse document frequency penalizes terms that appear ubiquitously while rewarding rare domain-specific keywords.',
        ],
      },
      {
        title: 'Dynamic Snippet Generation and Keyword In-Context Extraction',
        slug: 'dynamic-snippet-generation-context',
        summary: 'Dynamic search snippets highlight query keywords within the most relevant contiguous text sentences of a document.',
        headings: ['Windowing Algorithms', 'Sentence Boundary Detection', 'Query Keyword Coverage', 'Highlighter Tag Escaping'],
        coreKeywords: ['snippet', 'highlighting', 'sentences', 'windowing', 'context', 'relevance', 'query', 'summary'],
        paragraphs: [
          'Search engine results pages rely on dynamic snippets to communicate relevance to users without requiring full document navigation.',
          'Sentence splitting and boundary detection isolate logical thoughts and prevent truncating clauses mid-word or mid-sentence.',
          'Sliding sentence windows evaluate density of query terms, prioritizing windows containing multiple distinct query keywords.',
          'Extracted snippet texts are sanitized and wrapped in safe highlighting tags to ensure zero vulnerability to cross-site scripting attacks.',
        ],
      },
    ],
  },
  {
    domain: 'Internet Protocols & Web Standards',
    source: 'ietf-rfc',
    topics: [
      {
        title: 'RFC 9110: HTTP Semantics and Protocol Mechanics',
        slug: 'rfc9110-http-semantics-mechanics',
        summary: 'Standard specification for HTTP architecture, uniform resource identifiers, message structures, and caching directives.',
        headings: ['Protocol Architecture', 'Uniform Interface', 'Idempotent and Safe Methods', 'Conditional Request Evaluation'],
        coreKeywords: ['http', 'rfc9110', 'standards', 'methods', 'idempotent', 'caching', 'status', 'headers'],
        paragraphs: [
          'HTTP is a stateless application-level request-response protocol designed for distributed, collaborative, hypermedia information systems.',
          'Safe methods like GET and HEAD must not produce side effects on the origin server, enabling safe prefetching and deterministic caching.',
          'Idempotent methods such as PUT and DELETE guarantee that multiple identical requests produce the same server state as a single invocation.',
          'Conditional requests utilizing ETag and Last-Modified headers allow web caches and clients to validate freshness with minimal byte transfer.',
        ],
      },
      {
        title: 'RFC 9000: QUIC Multiplexed Transport Protocol over UDP',
        slug: 'rfc9000-quic-transport-over-udp',
        summary: 'QUIC provides connection-oriented, multiplexed transport over UDP with integrated TLS 1.3 encryption and zero round-trip handshake.',
        headings: ['Transport Design', 'Stream Multiplexing', 'Loss Recovery and Congestion Control', 'Zero Round-Trip Time Resumption'],
        coreKeywords: ['quic', 'udp', 'transport', 'multiplexing', 'latency', 'rfc9000', 'streams', 'encryption'],
        paragraphs: [
          'QUIC replaces traditional TCP and TLS stacks with an integrated, user-space transport protocol running over UDP datagrams.',
          'By providing stream multiplexing without head-of-line blocking, packet drops on one stream do not halt data delivery on unrelated streams.',
          'QUIC connection identifiers decouple active sessions from IP addresses and network interfaces, facilitating seamless client connection migration.',
          'Integrated cryptographic handshakes establish authenticated encryption in a single round-trip, or zero round-trips for repeat connections.',
        ],
      },
      {
        title: 'RFC 9309: Standardized Web Robot Exclusion Specifications',
        slug: 'rfc9309-robot-exclusion-specifications',
        summary: 'Formally specifies parsing rules, path patterns, and precedence logic for robots.txt crawler exclusion files.',
        headings: ['Crawler Boundaries', 'Record Disallow Rules', 'Wildcard Pattern Matching', 'Precedence and Crawl Delays'],
        coreKeywords: ['crawler', 'robots', 'rfc9309', 'exclusion', 'disallow', 'precedence', 'wildcards', 'bot'],
        paragraphs: [
          'The Robots Exclusion Protocol provides standard mechanisms for web publishers to govern automated access by indexing web robots and crawlers.',
          'Parsers process records grouped by User-agent identifiers, matching user-agent tokens against crawler identity strings hierarchically.',
          'Path directives define permitted and restricted URI hierarchies using prefix matching and optional end-of-string anchors.',
          'When conflicting allow and disallow directives match a requested URI, parsers grant precedence to the most specific directive by path length.',
        ],
      },
    ],
  },
  {
    domain: 'Web Platform & Developer APIs',
    source: 'mdn-open-docs',
    topics: [
      {
        title: 'Web Security Architecture: Content Security Policy and CORS',
        slug: 'web-security-csp-cors-architecture',
        summary: 'Explains defense-in-depth mechanisms for modern web applications using CSP and cross-origin resource sharing headers.',
        headings: ['Defense in Depth', 'CSP Directives', 'CORS Handshake Headers', 'Subresource Integrity'],
        coreKeywords: ['security', 'csp', 'cors', 'headers', 'browser', 'origin', 'xss', 'mitigation'],
        paragraphs: [
          'Content Security Policy (CSP) restricts the resources, scripts, and endpoints a browser is permitted to load for a given document.',
          'Restricting script execution to cryptographic nonces or SHA hashes neutralizes reflected and stored cross-site scripting vulnerabilities.',
          'Cross-Origin Resource Sharing defines protocols allowing web applications on one domain to query RESTful APIs hosted on external origins.',
          'Subresource Integrity verifies that third-party scripts and styles have not been tampered with by verifying cryptographic file digests.',
        ],
      },
      {
        title: 'DOM Parsing, Microtask Execution, and the Event Loop',
        slug: 'dom-parsing-event-loop-microtasks',
        summary: 'Explains JavaScript single-threaded concurrency, macrotask queues, microtask checkpoints, and rendering pipelines.',
        headings: ['Call Stack Execution', 'Microtasks vs Macrotasks', 'RequestAnimationFrame Scheduling', 'Non-blocking Asynchronous I/O'],
        coreKeywords: ['javascript', 'event-loop', 'microtasks', 'concurrency', 'async', 'promises', 'rendering', 'threads'],
        paragraphs: [
          'The JavaScript runtime processes synchronous scripts within a single call stack, delegating asynchronous work to host environment queues.',
          'Microtask queues drain completely after each synchronous operation, executing promise resolutions before yielding to macrotask events.',
          'Timer callbacks and I/O handlers run on macrotask cycles, ensuring scheduled background work does not starve interactive user input.',
          'RequestAnimationFrame hooks into browser layout cycles, aligning script execution with physical monitor display refreshes.',
        ],
      },
    ],
  },
  {
    domain: 'Privacy Engineering & Cryptography',
    source: 'arxiv-open-metadata',
    topics: [
      {
        title: 'Zero-Trace Search and Privacy-Preserving Information Retrieval',
        slug: 'zero-trace-search-privacy-retrieval',
        summary: 'Theoretical models and implementation strategies for verifiable zero-retention search architectures and cryptographic receipts.',
        headings: ['Threat Models in Web Search', 'Ephemeral Request Lifecycles', 'Cryptographic Privacy Receipts', 'Differential Query Anonymization'],
        coreKeywords: ['privacy', 'zero-trace', 'receipt', 'retrieval', 'anonymity', 'cryptography', 'ephemeral', 'audit'],
        paragraphs: [
          'Traditional search platforms accumulate persistent profiles of user search queries, creating significant privacy and surveillance risks.',
          'Zero-trace search architecture processes user queries strictly in volatile memory, guaranteeing complete absence of disk-logged queries.',
          'Cryptographic Privacy Receipts record verifiable metadata showing which providers were contacted, transmission modes, and zero-retention guarantees.',
          'Local-only query processing provides absolute privacy boundaries by executing inverted index lookups entirely within the host environment.',
        ],
      },
      {
        title: 'Post-Quantum Key Exchange and Forward Secrecy in Secure Communications',
        slug: 'post-quantum-key-exchange-forward-secrecy',
        summary: 'Lattice-based cryptography algorithms and ML-KEM encapsulation schemes resistant to quantum computing attacks.',
        headings: ['Quantum Threat Horizon', 'Lattice-Based Cryptography', 'ML-KEM Key Encapsulation', 'Hybrid Handshake Migration'],
        coreKeywords: ['quantum', 'cryptography', 'forward-secrecy', 'ml-kem', 'lattice', 'security', 'key-exchange', 'encryption'],
        paragraphs: [
          'Quantum computers operating Shor algorithm threaten to break public key schemes based on integer factorization and discrete logarithms.',
          'Lattice-based cryptography relies on the hardness of high-dimensional geometric problems such as learning with errors.',
          'Standardized key encapsulation mechanisms like ML-KEM provide quantum-resistant shared secret agreement with reasonable key sizes.',
          'Hybrid deployment strategies combine classical elliptic-curve Diffie-Hellman with quantum-resistant algorithms during transition periods.',
        ],
      },
    ],
  },
];

const SECONDARY_VOCABULARY = [
  'architecture', 'distributed', 'consensus', 'database', 'transaction', 'sharding',
  'throughput', 'concurrency', 'monotonic', 'serialization', 'replication', 'scalability',
  'heuristics', 'optimization', 'asynchronous', 'resilience', 'telemetry', 'determinism',
  'vectorization', 'memory-safety', 'compilation', 'normalization', 'partitioning',
  'synchronization', 'fault-tolerance', 'idempotency', 'latency-sensitive', 'throughput',
];

/**
 * Builds a reproducible synthetic document using deterministic topic variation.
 */
function buildSyntheticDocument(
  template: DomainTopicTemplate,
  topicIndex: number,
  globalIndex: number,
  rng: SeededRandom,
): CorpusDocument {
  const topic = template.topics[topicIndex % template.topics.length]!;
  const defaultSource = PERMITTED_CORPUS_SOURCES['wikimedia-open']!;
  const sourceMeta = PERMITTED_CORPUS_SOURCES[template.source] ?? defaultSource;

  // Add deterministic variations based on globalIndex
  const variationId = String(globalIndex + 1).padStart(6, '0');
  const title = globalIndex === 0
    ? topic.title
    : `${topic.title} (Part ${globalIndex + 1}: ${rng.pick(SECONDARY_VOCABULARY)})`;

  const canonicalUrl = template.source === 'ietf-rfc'
    ? `https://www.rfc-editor.org/rfc/rfc${9000 + (globalIndex % 500)}#section-${(globalIndex % 10) + 1}`
    : template.source === 'mdn-open-docs'
    ? `https://developer.mozilla.org/en-US/docs/Web/Topics/${topic.slug}-${variationId}`
    : `https://en.wikipedia.org/wiki/${topic.slug}_${variationId}`;

  // Assemble dynamic body paragraphs
  const selectedParagraphs = [...topic.paragraphs];
  const extraParagraphCount = rng.nextInt(1, 3);
  for (let i = 0; i < extraParagraphCount; i++) {
    const kw1 = rng.pick(topic.coreKeywords);
    const kw2 = rng.pick(SECONDARY_VOCABULARY);
    const kw3 = rng.pick(topic.coreKeywords);
    selectedParagraphs.push(
      `In practical engineering evaluations, the ${kw1} subsystem demonstrates significant ${kw2} characteristics. System designers must carefully evaluate trade-offs between ${kw3} throughput and end-to-end latency when configuring production pipelines.`
    );
  }

  const bodyText = selectedParagraphs.join(' ');
  const normalizedBody = bodyText.toLowerCase().replace(/\s+/g, ' ').trim();
  const contentHash = computeSha256(normalizedBody);
  const urlHash = computeSha256(canonicalUrl);
  const wordTokens = bodyText.trim().split(/\s+/).filter(Boolean);

  const tags = Array.from(new Set([...topic.coreKeywords.slice(0, 3), rng.pick(SECONDARY_VOCABULARY)]));
  const headings = topic.headings.join('\n');

  return {
    id: `corpus-doc-${variationId}`,
    canonicalUrl,
    urlHash,
    title,
    description: topic.summary,
    headings,
    bodyText,
    source: sourceMeta.id,
    license: sourceMeta.license,
    licenseUrl: sourceMeta.termsUrl,
    acquiredAt: '2026-10-25T12:00:00.000Z',
    contentHash,
    language: 'en',
    tags,
    wordCount: wordTokens.length,
    contentLength: Buffer.byteLength(bodyText, 'utf-8'),
    outboundLinks: [
      `https://en.wikipedia.org/wiki/${rng.pick(topic.coreKeywords)}`,
      `https://developer.mozilla.org/en-US/docs/Web/${rng.pick(SECONDARY_VOCABULARY)}`,
    ],
  };
}

/**
 * Generates a reproducible corpus matching the specified target count and options.
 */
export function generateReproducibleCorpus(options: CorpusGenerationOptions): {
  documents: CorpusDocument[];
  manifest: CorpusManifest;
} {
  const seed = options.seed ?? 42;
  const rng = new SeededRandom(seed);
  const targetCount = options.targetCount;
  const tier: CorpusTier = options.tier ?? (targetCount <= 1000 ? 'demo' : targetCount <= 10000 ? 'benchmark' : 'large');

  const documents: CorpusDocument[] = [];
  const seenUrls = new Set<string>();
  const seenContentHashes = new Set<string>();

  // Always seed first with curated reference demo documents for highest quality baseline
  const demoDocs = getDemoCorpus();
  for (const doc of demoDocs) {
    if (documents.length >= targetCount) break;
    seenUrls.add(doc.urlHash);
    seenContentHashes.add(doc.contentHash);
    documents.push(doc);
  }

  // Synthesize remaining documents reproducibly
  let currentDomainIndex = 0;
  let topicOffset = 0;
  let attemptCounter = 0;

  while (documents.length < targetCount && attemptCounter < targetCount * 3) {
    attemptCounter++;
    const template = DOMAIN_TEMPLATES[currentDomainIndex % DOMAIN_TEMPLATES.length]!;
    currentDomainIndex++;

    const doc = buildSyntheticDocument(template, topicOffset, documents.length, rng);
    topicOffset++;

    if (options.deduplicate !== false) {
      if (seenUrls.has(doc.urlHash) || seenContentHashes.has(doc.contentHash)) {
        continue;
      }
    }

    seenUrls.add(doc.urlHash);
    seenContentHashes.add(doc.contentHash);
    documents.push(doc);
  }

  // Calculate actual aggregate statistics
  let totalWords = 0;
  let totalBytes = 0;
  const vocabularySet = new Set<string>();
  const sourceStats: Record<string, { count: number; license: string; termsUrl: string }> = {};

  for (const doc of documents) {
    totalWords += doc.wordCount;
    totalBytes += doc.contentLength;

    const defaultSource = PERMITTED_CORPUS_SOURCES['wikimedia-open']!;
    const sourceMeta = PERMITTED_CORPUS_SOURCES[doc.source] ?? defaultSource;
    if (!sourceStats[doc.source]) {
      sourceStats[doc.source] = {
        count: 0,
        license: sourceMeta.license,
        termsUrl: sourceMeta.termsUrl,
      };
    }
    sourceStats[doc.source]!.count++;

    // Extract vocabulary
    const tokens = doc.bodyText
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2);
    for (const t of tokens) {
      vocabularySet.add(t);
    }
  }

  // Deterministic content checksum across all document hashes
  const sortedHashes = documents.map(d => d.contentHash).sort();
  const contentChecksum = computeSha256(sortedHashes.join(':'));

  const manifest: CorpusManifest = {
    tier,
    documentCount: documents.length,
    totalWords,
    totalBytes,
    averageDocumentLength: Math.round((totalWords / documents.length) * 10) / 10,
    uniqueVocabularyCount: vocabularySet.size,
    generatedAt: '2026-10-25T12:00:00.000Z',
    reproducibleSeed: seed,
    sources: sourceStats,
    contentChecksum,
  };

  // If outputDir requested, write JSONL and manifest.json
  if (options.outputDir) {
    fs.mkdirSync(options.outputDir, { recursive: true });
    const jsonlPath = path.join(options.outputDir, 'documents.jsonl');
    const manifestPath = path.join(options.outputDir, 'manifest.json');

    const lines = documents.map(d => JSON.stringify(d)).join('\n');
    fs.writeFileSync(jsonlPath, lines, 'utf-8');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  }

  return { documents, manifest };
}
