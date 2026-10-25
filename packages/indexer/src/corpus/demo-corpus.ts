/**
 * @opensearch/indexer — Curated Offline Demo Corpus (Phase 75)
 *
 * Self-contained, high-quality reference corpus for offline development,
 * deterministic CI testing, and immediate bootstrap without network access.
 * Contains full provenance, open licenses (CC BY-SA 4.0 / Public Domain),
 * canonical URLs, and deduplication hashes.
 */

import { createHash } from 'node:crypto';
import { CorpusDocument, CorpusSourceMetadata } from './corpus-types.js';

export const PERMITTED_CORPUS_SOURCES: Record<string, CorpusSourceMetadata> = {
  'wikimedia-open': {
    id: 'wikimedia-open',
    name: 'Wikimedia Open Knowledge Foundation',
    license: 'CC BY-SA 4.0',
    termsUrl: 'https://wikimediafoundation.org/wiki/Terms_of_Use',
    attribution: 'Text available under Creative Commons Attribution-ShareAlike 4.0 International.',
    permittedUse: 'Permitted for commercial and non-commercial redistribution with attribution.',
  },
  'ietf-rfc': {
    id: 'ietf-rfc',
    name: 'IETF RFC Editor & Standards',
    license: 'Public Domain / IETF Trust',
    termsUrl: 'https://www.rfc-editor.org/copyright/',
    attribution: 'IETF Trust Legal Provisions Relating to IETF Documents.',
    permittedUse: 'Freely redistributable open standards specifications.',
  },
  'mdn-open-docs': {
    id: 'mdn-open-docs',
    name: 'MDN Web Docs Open Repository',
    license: 'CC BY-SA 2.5+',
    termsUrl: 'https://developer.mozilla.org/en-US/docs/MDN/Community/Open_source_licenses',
    attribution: 'Content by Mozilla Contributors, licensed under CC BY-SA 2.5 or later.',
    permittedUse: 'Permitted documentation reuse and indexing with source attribution.',
  },
  'arxiv-open-metadata': {
    id: 'arxiv-open-metadata',
    name: 'arXiv Open Access Metadata',
    license: 'CC0 1.0 Public Domain',
    termsUrl: 'https://info.arxiv.org/help/api/tou.html',
    attribution: 'Metadata provided by Cornell University arXiv repository under CC0.',
    permittedUse: 'Permitted for scholarly indexing and retrieval.',
  },
};

function computeSha256(text: string): string {
  return createHash('sha256').update(text.trim(), 'utf-8').digest('hex');
}

interface RawDemoEntry {
  id: string;
  url: string;
  title: string;
  description: string;
  headings: string;
  bodyText: string;
  source: string;
  tags: string[];
  outboundLinks: string[];
}

const RAW_DEMO_ENTRIES: RawDemoEntry[] = [
  {
    id: 'demo-doc-001',
    url: 'https://en.wikipedia.org/wiki/Inverted_index',
    title: 'Inverted Index Architecture and Design',
    description: 'An inverted index is a database index storing a mapping from words to their locations in a document collection.',
    headings: 'Overview\nData Structure\nCompression Techniques\nApplications in Web Search',
    bodyText: 'In computer science, an inverted index is an essential database index storing a mapping from words or terms to their locations in a document or set of documents. Inverted indexes are the core data structure used in information retrieval systems and modern web search engines. In an inverted index, each unique vocabulary term maps to a postings list containing document identifiers and term frequencies. Postings lists may also encode term positions for phrase queries and proximity scoring. Index compression algorithms like variable-byte encoding and Elias delta coding substantially reduce disk footprint and accelerate posting list intersection during multi-term query evaluation.',
    source: 'wikimedia-open',
    tags: ['search', 'indexing', 'computer-science', 'algorithms'],
    outboundLinks: ['https://en.wikipedia.org/wiki/Search_engine', 'https://en.wikipedia.org/wiki/Information_retrieval'],
  },
  {
    id: 'demo-doc-002',
    url: 'https://en.wikipedia.org/wiki/Okapi_BM25',
    title: 'Okapi BM25 Ranking Function in Information Retrieval',
    description: 'Okapi BM25 is a ranking function used by search engines to estimate the relevance of documents to a given search query.',
    headings: 'The Ranking Function\nTerm Frequency Saturation\nDocument Length Normalization\nComparison with TF-IDF',
    bodyText: 'In information retrieval, Okapi BM25 is a non-linear ranking function used by search engines to score and rank matching documents based on query terms. BM25 is derived from the probabilistic relevance framework developed in the 1970s and 1980s by Stephen Robertson and Karen Spärck Jones. Unlike standard TF-IDF which scales monotonically with term frequency, BM25 incorporates non-linear term frequency saturation controlled by parameter k1, ensuring that repeated occurrences of a keyword provide diminishing marginal relevance returns. Furthermore, parameter b governs document length normalization, penalizing overly long documents to prevent bias towards verbose text while rewarding concise, highly focused answers.',
    source: 'wikimedia-open',
    tags: ['search', 'bm25', 'ranking', 'algorithms', 'relevance'],
    outboundLinks: ['https://en.wikipedia.org/wiki/Tf%E2%80%93idf', 'https://en.wikipedia.org/wiki/Information_retrieval'],
  },
  {
    id: 'demo-doc-003',
    url: 'https://www.rfc-editor.org/rfc/rfc9113',
    title: 'RFC 9113: HTTP/2 Protocol Specification',
    description: 'RFC 9113 describes an optimized expression of the semantics of the Hypertext Transfer Protocol (HTTP) using binary framing.',
    headings: 'Status of This Memo\nBinary Framing Layer\nMultiplexing and Streams\nFlow Control and Prioritization',
    bodyText: 'This specification describes an optimized binary framing mechanism for the Hypertext Transfer Protocol (HTTP). HTTP/2 enables a more efficient use of network resources and a reduced perception of latency by introducing header field compression via HPACK and allowing multiple concurrent exchanges on the same TCP connection. Specifically, it allows interleaving of request and response messages across independent streams without blocking head-of-line at the application layer. Streams are prioritized and flow-controlled independently, allowing clients and servers to allocate bandwidth according to application requirements while preserving standard HTTP semantics and verbs.',
    source: 'ietf-rfc',
    tags: ['networking', 'http', 'standards', 'protocols', 'ietf'],
    outboundLinks: ['https://www.rfc-editor.org/rfc/rfc9110', 'https://www.rfc-editor.org/rfc/rfc7540'],
  },
  {
    id: 'demo-doc-004',
    url: 'https://www.rfc-editor.org/rfc/rfc8446',
    title: 'RFC 8446: The Transport Layer Security (TLS) Protocol Version 1.3',
    description: 'RFC 8446 specifies Version 1.3 of the Transport Layer Security (TLS) protocol providing cryptographic privacy and data integrity.',
    headings: 'Introduction\nProtocol Overview\nCryptographic Handshake\n0-RTT Early Data Security',
    bodyText: 'The Transport Layer Security (TLS) protocol version 1.3 provides secure communications over the Internet. The protocol allows client-server applications to communicate across an untrusted network in a way that prevents eavesdropping, tampering, and message forgery. TLS 1.3 redesigns the cryptographic handshake to achieve 1-RTT connection establishment, reducing round-trips compared to TLS 1.2. Legacy cipher suites with known weaknesses such as RC4, CBC-mode ciphers, and RSA key exchange have been deprecated in favor of authenticated encryption with associated data (AEAD) schemes and ephemeral Diffie-Hellman key agreement for forward secrecy.',
    source: 'ietf-rfc',
    tags: ['security', 'cryptography', 'tls', 'networking', 'privacy'],
    outboundLinks: ['https://www.rfc-editor.org/rfc/rfc5246', 'https://www.rfc-editor.org/rfc/rfc793'],
  },
  {
    id: 'demo-doc-005',
    url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching',
    title: 'HTTP Caching Mechanisms and Freshness Lifetimes',
    description: 'A comprehensive guide to HTTP caching headers, cache-control directives, conditional requests, and validation strategies.',
    headings: 'Overview of Web Caching\nCache-Control Directives\nValidation with ETags\nPrivate versus Public Caches',
    bodyText: 'HTTP caching stores copies of web responses close to the user to reduce network latency and server load. When a web client requests a cached resource, the cache determines whether the stored response is fresh or stale based on max-age, s-maxage, and expires headers. Once a response expires, clients perform conditional revalidation using the If-None-Match header with an ETag validator or the If-Modified-Since header with a timestamp. If the server verifies that the underlying resource has not changed, it returns HTTP 304 Not Modified without a message body, dramatically saving bandwidth and response time for repeat visits.',
    source: 'mdn-open-docs',
    tags: ['web', 'caching', 'http', 'performance', 'developer'],
    outboundLinks: ['https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control'],
  },
  {
    id: 'demo-doc-006',
    url: 'https://developer.mozilla.org/en-US/docs/Web/Security/Same-origin_policy',
    title: 'The Same-Origin Policy and Web Application Security',
    description: 'The same-origin policy is a critical security mechanism that restricts how a document or script loaded by one origin can interact with a resource from another origin.',
    headings: 'Definition of an Origin\nCross-Origin Data Access\nMitigating Risks with CORS\nContent Security Policy Integration',
    bodyText: 'The same-origin policy is a foundational security mechanism enforced by web browsers. It restricts scripts running on one web page from reading sensitive data or interacting with documents hosted on a different origin. Two URLs have the same origin if the protocol, port, and host are completely identical. Cross-Origin Resource Sharing (CORS) provides a controlled mechanism for servers to relax this restriction using HTTP response headers such as Access-Control-Allow-Origin, enabling legitimate API consumption across distinct hostnames while blocking unauthorized cross-site data theft.',
    source: 'mdn-open-docs',
    tags: ['security', 'web', 'browser', 'cors', 'privacy'],
    outboundLinks: ['https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS'],
  },
  {
    id: 'demo-doc-007',
    url: 'https://en.wikipedia.org/wiki/PageRank',
    title: 'PageRank Link Analysis and Graph Authority Scoring',
    description: 'PageRank is an algorithm used by Google Search to rank web pages in their search engine results based on hyperlink structures.',
    headings: 'Description\nMathematical Formulation\nDamping Factor and Random Surfer\nEigenvector Centrality',
    bodyText: 'PageRank is an algorithm named after Larry Page that measures the relative importance of hyperlinked web documents. PageRank models the behavior of an imaginary random surfer who clicks on hyperlinks with probability d (the damping factor, typically set to 0.85) or jumps to a completely random web page with probability 1-d. The link structure of the web is modeled as a directed graph where incoming links represent votes of confidence from other domains. The stationary probability distribution of this Markov chain yields the PageRank score, where links from authoritative pages contribute higher authority weight than links from obscure pages.',
    source: 'wikimedia-open',
    tags: ['pagerank', 'graphs', 'ranking', 'search', 'algorithms'],
    outboundLinks: ['https://en.wikipedia.org/wiki/Markov_chain', 'https://en.wikipedia.org/wiki/Eigenvalues_and_eigenvectors'],
  },
  {
    id: 'demo-doc-008',
    url: 'https://en.wikipedia.org/wiki/Raft_(algorithm)',
    title: 'Raft Consensus Algorithm for Fault-Tolerant Distributed Systems',
    description: 'Raft is a consensus algorithm designed as an alternative to Paxos, intended to be more understandable through formal decomposition.',
    headings: 'Consensus Basics\nLeader Election\nLog Replication\nSafety Invariants',
    bodyText: 'Raft is a consensus algorithm designed by Diego Ongaro and John Ousterhout to achieve fault tolerance and state machine replication across a distributed cluster of nodes. Raft achieves equivalent safety and performance to Multi-Paxos while being significantly easier to understand and implement. In Raft, a cluster elects a single distinguished leader responsible for receiving client commands, appending log entries to local disk, and replicating entries to a quorum of follower nodes before committing. Leader election relies on randomized election timers to avoid split-vote scenarios, ensuring resilient consensus even in the presence of network partitions and node crashes.',
    source: 'wikimedia-open',
    tags: ['distributed-systems', 'consensus', 'raft', 'databases', 'algorithms'],
    outboundLinks: ['https://en.wikipedia.org/wiki/Paxos_(computer_science)', 'https://en.wikipedia.org/wiki/State_machine_replication'],
  },
  {
    id: 'demo-doc-009',
    url: 'https://www.rfc-editor.org/rfc/rfc9309',
    title: 'RFC 9309: Robots Exclusion Protocol Standard',
    description: 'RFC 9309 standardizes the Robots Exclusion Protocol (robots.txt) for web crawlers, search engines, and automated clients.',
    headings: 'Protocol Overview\nSyntax and Record Structure\nUser-Agent Matching Rules\nPath Precedence and Crawl-Delay',
    bodyText: 'The Robots Exclusion Protocol specified in RFC 9309 provides a mechanism for website operators to instruct automated web crawlers and search indexers which parts of an HTTP server should not be accessed. The protocol standardizes the format of the robots.txt file located at the site root. Crawlers inspect User-agent, Allow, and Disallow directives to determine crawl boundaries. The specification defines explicit parsing rules, pattern matching syntax with wildcards and end-of-string anchors, and deterministic precedence rules when conflicting allow and disallow rules match the same resource path.',
    source: 'ietf-rfc',
    tags: ['crawling', 'robots-txt', 'standards', 'search', 'privacy'],
    outboundLinks: ['https://www.rfc-editor.org/rfc/rfc3986', 'https://en.wikipedia.org/wiki/Robots_exclusion_standard'],
  },
  {
    id: 'demo-doc-010',
    url: 'https://en.wikipedia.org/wiki/Privacy_by_design',
    title: 'Privacy by Design Principles and System Engineering',
    description: 'Privacy by Design is a systems engineering framework that seeks to embed privacy proactively into the architecture of IT systems.',
    headings: 'Core Principles\nProactive Not Reactive\nPrivacy as the Default Setting\nEnd-to-End Security and Transparency',
    bodyText: 'Privacy by Design (PbD) is a systems engineering and governance philosophy developed by Ann Cavoukian. Rather than treating privacy as a compliance afterthought or an optional user toggle, PbD mandates that data protection and user privacy be built directly into the foundational architecture of information systems. Key principles include proactive rather than reactive prevention of privacy harms, privacy as the default operating state without requiring active user configuration, full functionality with zero-sum trade-offs, end-to-end security throughout the entire data lifecycle, and verifiable transparency for users.',
    source: 'wikimedia-open',
    tags: ['privacy', 'architecture', 'security', 'governance', 'engineering'],
    outboundLinks: ['https://en.wikipedia.org/wiki/General_Data_Protection_Regulation'],
  },
  {
    id: 'demo-doc-011',
    url: 'https://en.wikipedia.org/wiki/UTF-8',
    title: 'UTF-8 Variable-Width Character Encoding Standard',
    description: 'UTF-8 is an efficient variable-width character encoding capable of encoding all 1,112,064 valid character code points in Unicode.',
    headings: 'Design and History\nByte Structure and Encoding Scheme\nBackward Compatibility with ASCII\nSelf-Synchronization and Resilience',
    bodyText: 'UTF-8 is the dominant character encoding of the World Wide Web, accounting for over 98% of all web pages. Designed by Ken Thompson and Rob Pike in 1992, UTF-8 encodes Unicode code points into one to four 8-bit bytes. ASCII characters are represented as single bytes identical to standard 7-bit ASCII, ensuring flawless backward compatibility. Non-ASCII code points are encoded using multi-byte sequences where leading bits signal byte counts and continuation bytes begin with the bit pattern 10. UTF-8 is self-synchronizing: if bytes are corrupted or lost, a decoder can immediately recover alignment at the next valid start byte.',
    source: 'wikimedia-open',
    tags: ['unicode', 'encoding', 'utf-8', 'standards', 'text-processing'],
    outboundLinks: ['https://en.wikipedia.org/wiki/Unicode', 'https://en.wikipedia.org/wiki/ASCII'],
  },
  {
    id: 'demo-doc-012',
    url: 'https://en.wikipedia.org/wiki/Log-structured_merge-tree',
    title: 'Log-Structured Merge-Tree (LSM-Tree) Storage Engines',
    description: 'The Log-Structured Merge-tree is a data structure with great performance characteristics for write-heavy key-value workloads.',
    headings: 'Architecture Overview\nMemTable and Write-Ahead Log\nSSTables and Level Compaction\nRead Amplification and Bloom Filters',
    bodyText: 'A Log-Structured Merge-tree (LSM-tree) is a storage data structure optimized for write-intensive database applications. Writes are first appended sequentially to an on-disk Write-Ahead Log (WAL) for durability and inserted into an in-memory sorted structure called a MemTable. When the MemTable exceeds a threshold, it is flushed to disk as an immutable Sorted String Table (SSTable). Background compaction processes merge overlapping SSTables across hierarchical levels, purging deleted keys and duplicate records. To counteract read amplification, LSM-tree engines utilize Bloom filters to test whether a key exists in an SSTable before performing expensive disk reads.',
    source: 'wikimedia-open',
    tags: ['databases', 'storage', 'lsm-tree', 'performance', 'data-structures'],
    outboundLinks: ['https://en.wikipedia.org/wiki/Bloom_filter', 'https://en.wikipedia.org/wiki/Write-ahead_logging'],
  },
];

/**
 * Builds the fully qualified, verified CorpusDocument objects for the demo corpus.
 */
export function getDemoCorpus(limit?: number): CorpusDocument[] {
  const entries = limit ? RAW_DEMO_ENTRIES.slice(0, limit) : RAW_DEMO_ENTRIES;

  const defaultSource = PERMITTED_CORPUS_SOURCES['wikimedia-open']!;
  return entries.map(entry => {
    const sourceMeta = PERMITTED_CORPUS_SOURCES[entry.source] ?? defaultSource;
    const normalizedBody = entry.bodyText.toLowerCase().replace(/\s+/g, ' ').trim();
    const contentHash = computeSha256(normalizedBody);
    const urlHash = computeSha256(entry.url);
    const words = entry.bodyText.trim().split(/\s+/).filter(Boolean);

    return {
      id: entry.id,
      canonicalUrl: entry.url,
      urlHash,
      title: entry.title,
      description: entry.description,
      headings: entry.headings,
      bodyText: entry.bodyText,
      source: sourceMeta.id,
      license: sourceMeta.license,
      licenseUrl: sourceMeta.termsUrl,
      acquiredAt: '2026-10-25T00:00:00.000Z',
      contentHash,
      language: 'en',
      tags: entry.tags,
      wordCount: words.length,
      contentLength: Buffer.byteLength(entry.bodyText, 'utf-8'),
      outboundLinks: entry.outboundLinks,
    };
  });
}
