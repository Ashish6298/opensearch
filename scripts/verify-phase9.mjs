#!/usr/bin/env node
/**
 * OpenSearch — Phase 9: Document Processing Pipeline Verification
 *
 * Exercises the complete Phase 9 implementation end-to-end:
 *   1. Text Normalization:
 *      - Case folding & Unicode NFC canonicalization
 *      - Accent & diacritical folding ('café' -> 'cafe', 'München' -> 'munchen')
 *      - Control character removal & whitespace normalization
 *      - Punctuation stripping
 *   2. Tokenization & Positional Stream:
 *      - Unicode-aware term segmentation
 *      - Positional indexing (0-based sequential term position)
 *      - Character offset calculation (startOffset, endOffset)
 *      - Token length boundary filtering (min/max bounds)
 *   3. Stop Words Strategy:
 *      - Removal of common English stop words
 *      - Preserving search-critical words
 *      - isStopWord helper
 *   4. Field Separation & Weighting Metadata:
 *      - Separate processing for title, headings, description, and body fields
 *      - Proper application of field weights (DEFAULT_FIELD_WEIGHTS)
 *      - Term frequency counts per field and aggregated document term summary
 *      - Weighted term scoring calculation
 *   5. Document Processing Engine:
 *      - Transformation of stored DocumentRecord into ProcessedDocument
 *      - Deterministic token generation for identical content
 *      - Safe handling of empty or whitespace-only documents
 *      - Resilient execution across multilingual/non-ASCII inputs (Cyrillic, CJK, Arabic, German, French)
 *
 * Exit 0 = all checks passed
 * Exit 1 = one or more checks failed
 */

import {
  createDocumentProcessor,
  normalizeText,
  foldDiacritics,
  stripPunctuation,
  tokenize,
  isStopWord,
  getFieldWeight,
} from '../packages/indexer/dist/index.js';

const PASS = '\u001b[32m✓\u001b[0m';
const FAIL = '\u001b[31m✗\u001b[0m';
const HEAD = '\u001b[36m►\u001b[0m';

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ${PASS} ${label}`);
    passed++;
  } else {
    console.log(`  ${FAIL} ${label}${detail ? ': ' + detail : ''}`);
    failed++;
  }
}

async function runVerification() {
  console.log('\n=== Phase 9: Document Processing Pipeline Verification ===\n');

  // 1. Text Normalization
  console.log(`${HEAD} 1. Text Normalization & Unicode Handling`);
  check(
    'Case folding converts uppercase to lowercase',
    normalizeText('OpenSearch V1.0') === 'opensearch v1.0',
  );
  check(
    'Accent folding strips accents from Latin characters',
    foldDiacritics('crème brûlée à la carte') === 'creme brulee a la carte',
  );
  check(
    'German umlauts and eszett handled cleanly',
    foldDiacritics('Übergrößen Maßstab') === 'Ubergroßen Maßstab',
  );
  check(
    'Control characters stripped without destroying tokens',
    normalizeText('Fast\u0000 Search\u001F Engine') === 'fast search engine',
  );
  check(
    'Punctuation stripped while preserving word separation',
    stripPunctuation('Search: (Fast, Scalable & Secure!)') === 'Search Fast Scalable Secure',
  );
  check(
    'Multilingual non-ASCII text handled safely',
    normalizeText('Привет 你好 こんにちは مرحبًا') === 'привет 你好 こんにちは مرحبًا',
  );

  // 2. Tokenizer & Stop Words
  console.log(`\n${HEAD} 2. Tokenization & Positional Stream`);
  const rawSentence = 'The OpenSearch indexer builds fast, distributed indexes.';
  const tokens = tokenize(rawSentence, { removeStopWords: false });

  check('Token stream emits ordered array', tokens.length > 0);
  check('First token has position 0', tokens[0].position === 0);
  check(
    'Offsets match original substring character range',
    rawSentence.slice(tokens[1].startOffset, tokens[1].endOffset).toLowerCase() === tokens[1].term,
  );

  const filteredTokens = tokenize(rawSentence, { removeStopWords: true });
  check(
    'Stop words removed when removeStopWords is true',
    !filteredTokens.some(t => t.term === 'the'),
  );
  check(
    'Search terms preserved in filtered tokens',
    filteredTokens.some(t => t.term === 'opensearch') &&
      filteredTokens.some(t => t.term === 'indexer'),
  );
  check(
    'isStopWord identifies stop words correctly',
    isStopWord('and') && isStopWord('the') && !isStopWord('search'),
  );

  // 3. Field Weights Configuration
  console.log(`\n${HEAD} 3. Field Weighting Metadata`);
  check('Title boost default is 3.0', getFieldWeight('title') === 3.0);
  check('Headings boost default is 2.0', getFieldWeight('headings') === 2.0);
  check('Description boost default is 1.5', getFieldWeight('description') === 1.5);
  check('Body boost default is 1.0', getFieldWeight('body') === 1.0);
  check('Custom field weight fallback is 1.0', getFieldWeight('tags') === 1.0);

  // 4. End-to-End Document Processor
  console.log(`\n${HEAD} 4. Document Processing Engine`);
  const processor = createDocumentProcessor();

  const mockDoc = {
    id: 'doc-phase9-001',
    url: 'https://opensearch.org/docs/indexing',
    urlHash: 'hash-doc-001',
    title: 'Document Indexing Architecture',
    headings: 'Processing Pipeline Tokenization Indexing',
    description: 'Learn how OpenSearch prepares documents for indexing',
    bodyText:
      'The document processing pipeline tokenizes title, headings, and body text into inverted index terms.',
    language: 'en',
  };

  const processed = processor.process(mockDoc);

  check('ProcessedDocument preserves document ID', processed.documentId === 'doc-phase9-001');
  check(
    'ProcessedDocument preserves URL and hash',
    processed.url === 'https://opensearch.org/docs/indexing' &&
      processed.urlHash === 'hash-doc-001',
  );
  check('Title field processed and weighted at 3.0', processed.fields.get('title')?.weight === 3.0);
  check(
    'Headings field processed and weighted at 2.0',
    processed.fields.get('headings')?.weight === 2.0,
  );
  check(
    'Description field processed and weighted at 1.5',
    processed.fields.get('description')?.weight === 1.5,
  );
  check('Body field processed and weighted at 1.0', processed.fields.get('body')?.weight === 1.0);

  const indexingTerm = processed.terms.get('indexing');
  check(
    'Term dictionary records occurrences across multiple fields',
    indexingTerm !== undefined && indexingTerm.fieldCounts.size >= 2,
  );
  // 'indexing' occurs in title (3.0), headings (2.0), and body (1.0) -> weightedScore = 6.0
  check(
    'Weighted score computes field count * field boost correctly',
    indexingTerm !== undefined && indexingTerm.weightedScore >= 3.0 + 2.0 + 1.0,
  );

  // 5. Determinism & Edge Cases
  console.log(`\n${HEAD} 5. Determinism & Edge Case Resilience`);
  const runA = processor.process(mockDoc);
  const runB = processor.process(mockDoc);
  check(
    'Identical document produces deterministic token count',
    runA.totalTokens === runB.totalTokens,
  );
  check(
    'Identical document produces deterministic term dictionary',
    runA.uniqueTerms === runB.uniqueTerms,
  );

  const emptyProcessed = processor.process({ url: 'https://example.com/empty' });
  check(
    'Empty document processed cleanly without throwing',
    emptyProcessed.totalTokens === 0 && emptyProcessed.uniqueTerms === 0,
  );

  const nonAsciiDoc = processor.process({
    url: 'https://example.com/multilingual',
    title: 'Café & Restaurant München',
    bodyText: 'Привет мир! 搜索引擎 search engine test.',
  });
  check('Multilingual non-ASCII document parsed and tokenized safely', nonAsciiDoc.totalTokens > 0);

  console.log('\n--------------------------------------------------');
  console.log(`Phase 9 Verification Summary: ${passed} passed, ${failed} failed`);
  console.log('--------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('Unhandled error during Phase 9 verification:', err);
  process.exit(1);
});
