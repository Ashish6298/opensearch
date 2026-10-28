/**
 * @opensearch/ranking — Fixed Benchmark Query Set (Phase 94)
 *
 * Standardized, versioned query suite for reproducible latency and throughput benchmarking.
 * Contains 30 representative queries spanning single terms, multi-terms, phrases,
 * technical concepts, educational topics, and polysemous entities.
 */

export const BENCHMARK_QUERY_SET_VERSION = 'v1.0.0-standard-30';

export const REPEATABLE_BENCHMARK_QUERIES: readonly string[] = [
  // 1. Single Term / Keyword Queries
  'search',
  'indexer',
  'crawler',
  'database',
  'algorithm',
  'privacy',

  // 2. Technical & Programming Queries
  'typescript async await',
  'bm25 ranking algorithm',
  'inverted index posting list',
  'react hooks lifecycle',
  'rust memory safety ownership',
  'docker container virtualization',
  'distributed systems consensus',

  // 3. Educational & Scientific Queries
  'photosynthesis cellular respiration biology',
  'quantum computing superposition qubits',
  'calculus differential equations',
  'general relativity gravitational waves',
  'crispr cas9 genome engineering',
  'machine learning transformer attention',

  // 4. Multi-Word Factual & Everyday Queries
  'public transit schedule route planning',
  'open source software licensing mit',
  'http protocol headers status codes',
  'cryptographic hashing sha256',
  'web performance latency optimization',

  // 5. Polysemous & Ambiguous Terms
  'mercury',
  'python',
  'apple',
  'java',
  'ruby',
  'amazon',
];
