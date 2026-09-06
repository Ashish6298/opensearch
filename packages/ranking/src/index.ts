/**
 * @opensearch/ranking — Ranking & Query Engine Root (Milestone 4 / Phase 12 & 13)
 */

// ── Phase 12: Query Processing ──────────────────────────────────────────
export type {
  ParsedPhrase,
  ParsedQuery,
  QueryParserOptions,
  QueryParser,
} from './query/query-types.js';

export {
  normalizeQueryText,
  foldDiacritics as foldQueryDiacritics,
} from './query/query-normalizer.js';
export type { QueryNormalizerOptions } from './query/query-normalizer.js';

export { DefaultQueryParser, createQueryParser } from './query/query-parser.js';

// ── Phase 13: Candidate Retrieval ───────────────────────────────────────
export type {
  RetrievalMode,
  TermPostingMatch,
  CandidateDocument,
  RetrievalOptions,
  RetrievalStats,
  RetrievalResult,
  CandidateRetriever,
} from './retrieval/retrieval-types.js';

export {
  IndexCandidateRetriever,
  createCandidateRetriever,
} from './retrieval/candidate-retriever.js';
export type { IndexCandidateRetrieverOptions } from './retrieval/candidate-retriever.js';
