#!/usr/bin/env node
/**
 * OpenSearch — Phase 12: Query Processing Verification
 *
 * Exercises the complete Phase 12 implementation end-to-end:
 *   1. Normal & Multi-Term Query Parsing:
 *      - Validation and structured query extraction
 *      - Token breakdown, deduplication, and sequential positions
 *   2. Length Limits & Boundary Clamping:
 *      - Queries exceeding max length clamped safely (SEARCH_LIMITS.MAX_QUERY_LENGTH = 200)
 *      - Individual token length limits enforced (min 1, max 64)
 *   3. Normalization & Unicode / Non-ASCII Resilience:
 *      - Unicode NFC normalization, case folding, accent/diacritic folding
 *      - Control characters, null bytes, and non-printables stripped without crashing
 *      - Non-Latin script support (Cyrillic, CJK, Arabic)
 *   4. Quoted Phrase Extraction:
 *      - Double and single quoted exact match phrases parsed cleanly
 *      - Phrase terms and free terms extracted accurately
 *      - Unclosed quotes handled gracefully without errors
 *   5. Negation Handling:
 *      - Minus-prefixed (`-keyword`) and NOT keyword (`NOT keyword`) negation extracted
 *      - Negated terms excluded from positive searchable terms
 *   6. Empty & Malformed Query Safety:
 *      - Null, undefined, numbers, booleans, objects, arrays handled safely
 *      - Whitespace-only and punctuation-only queries return safe empty structures
 *
 * Exit 0 = all checks passed
 * Exit 1 = one or more checks failed
 */

import {
  createQueryParser,
  normalizeQueryText,
  foldQueryDiacritics,
} from '../packages/ranking/dist/index.js';

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
  console.log('\n=== Phase 12: Query Processing Verification ===\n');

  const parser = createQueryParser();

  // 1. Normal & Multi-Term Query Parsing
  console.log(`${HEAD} 1. Normal & Multi-Term Query Parsing`);
  const q1 = parser.parse('opensearch high performance search engine');
  check('Normal multi-term query parsed successfully', !q1.isEmpty);
  check('Query terms extracted accurately', q1.terms.length === 5);
  check(
    'Search terms match expected array',
    JSON.stringify(q1.terms) ===
      JSON.stringify(['opensearch', 'high', 'performance', 'search', 'engine']),
  );
  check('Unique terms deduplicated', q1.uniqueTerms.length === 5);
  check('termCount property accurate', q1.termCount === 5);

  // 2. Length Limits & Boundary Clamping
  console.log(`\n${HEAD} 2. Length Limits & Boundary Clamping`);
  const longQuery = 'open search '.repeat(30); // 360 chars > 200
  const qLong = parser.parse(longQuery);
  check('Query exceeding limit is marked as clamped', qLong.isClamped === true);
  check('Normalized query length clamped within 200 chars', qLong.normalizedQuery.length <= 200);
  check('Clamped query still produces usable tokens', qLong.terms.length > 0);

  const tokenLimitParser = createQueryParser({ minTokenLength: 2, maxTokenLength: 8 });
  const qTokenLimit = tokenLimitParser.parse('a tiny enormousword term');
  check('Under-min token length filtered out', !qTokenLimit.terms.includes('a'));
  check('Over-max token length filtered out', !qTokenLimit.terms.includes('enormousword'));
  check(
    'Valid tokens preserved',
    qTokenLimit.terms.includes('tiny') && qTokenLimit.terms.includes('term'),
  );

  // 3. Normalization & Unicode / Non-ASCII Resilience
  console.log(`\n${HEAD} 3. Normalization & Unicode / Non-ASCII Resilience`);
  const qAccents = parser.parse('  Crème   BRÛLÉE   München  ');
  check(
    'Case folding and accent stripping applied',
    JSON.stringify(qAccents.terms) === JSON.stringify(['creme', 'brulee', 'munchen']),
  );

  const qDirty = parser.parse('search\u0000term\u001Fwith\u007Fcontrol');
  check(
    'Null bytes and control characters stripped safely',
    qDirty.terms.includes('search') && qDirty.terms.includes('term'),
  );

  const qCyrillic = parser.parse('Привет мир');
  check(
    'Cyrillic text parsed without error',
    qCyrillic.terms.length === 2 && qCyrillic.terms[0] === 'привет',
  );

  const qCJK = parser.parse('搜索引擎');
  check('CJK text parsed without error', qCJK.terms.length === 1 && qCJK.terms[0] === '搜索引擎');

  const qArabic = parser.parse('محرك بحث');
  check('Arabic text parsed without error', qArabic.terms.length === 2);

  // 4. Quoted Phrase Extraction
  console.log(`\n${HEAD} 4. Quoted Phrase Extraction`);
  const qPhrase = parser.parse('opensearch "open source search" guide');
  check('Exact phrase extracted into phrases list', qPhrase.phrases.length === 1);
  check('Raw phrase preserved', qPhrase.phrases[0]?.rawPhrase === 'open source search');
  check(
    'Phrase constituent terms tokenized',
    JSON.stringify(qPhrase.phrases[0]?.terms) === JSON.stringify(['open', 'source', 'search']),
  );
  check(
    'Free query terms preserved',
    qPhrase.terms.includes('opensearch') && qPhrase.terms.includes('guide'),
  );

  const qSingleQuote = parser.parse("'machine learning' neural");
  check(
    'Single quoted phrase extracted',
    qSingleQuote.phrases.length === 1 && qSingleQuote.phrases[0]?.rawPhrase === 'machine learning',
  );

  const qUnclosed = parser.parse('search "unclosed quote tutorial');
  check('Unclosed quote handled safely without crash', qUnclosed.terms.length >= 3);

  // 5. Negation Handling
  console.log(`\n${HEAD} 5. Negation Handling (-term and NOT term)`);
  const qNegMinus = parser.parse('typescript web framework -angular -react');
  check(
    'Minus-prefixed terms extracted into negatedTerms',
    qNegMinus.negatedTerms.includes('angular') && qNegMinus.negatedTerms.includes('react'),
  );
  check(
    'Minus-prefixed terms excluded from positive terms',
    !qNegMinus.terms.includes('angular') && !qNegMinus.terms.includes('react'),
  );
  check(
    'Positive search terms preserved',
    qNegMinus.terms.includes('typescript') && qNegMinus.terms.includes('framework'),
  );

  const qNegNot = parser.parse('database NOT sql nosql');
  check('NOT keyword terms extracted into negatedTerms', qNegNot.negatedTerms.includes('sql'));
  check('NOT keyword terms excluded from positive terms', !qNegNot.terms.includes('sql'));
  check(
    'Positive terms around NOT preserved',
    qNegNot.terms.includes('database') && qNegNot.terms.includes('nosql'),
  );

  // 6. Empty & Malformed Query Safety
  console.log(`\n${HEAD} 6. Empty & Malformed Query Safety`);
  const qEmptyStr = parser.parse('');
  check(
    'Empty string query returns isEmpty=true',
    qEmptyStr.isEmpty === true && qEmptyStr.terms.length === 0,
  );

  const qWhitespace = parser.parse('   \t\n  ');
  check(
    'Whitespace query returns isEmpty=true',
    qWhitespace.isEmpty === true && qWhitespace.terms.length === 0,
  );

  const qPunct = parser.parse('!@#$%^&*()_+{}[]:;"\',.<>?/`~');
  check(
    'Punctuation-only query returns isEmpty=true without error',
    qPunct.isEmpty === true && qPunct.terms.length === 0,
  );

  const qNull = parser.parse(null);
  check('Null query handled safely', qNull.isEmpty === true);

  const qUndefined = parser.parse(undefined);
  check('Undefined query handled safely', qUndefined.isEmpty === true);

  const qObj = parser.parse({ query: 'attack' });
  check('Object input handled safely without throwing', qObj.isEmpty === true);

  // 7. Utility Functions
  console.log(`\n${HEAD} 7. Utility Functions`);
  check(
    'normalizeQueryText utility operates standalone',
    normalizeQueryText('  FOO   BAR  ') === 'foo bar',
  );
  check(
    'foldQueryDiacritics utility operates standalone',
    foldQueryDiacritics('résumé') === 'resume',
  );

  console.log('\n--------------------------------------------------');
  console.log(`Phase 12 Verification Summary: ${passed} passed, ${failed} failed`);
  console.log('--------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('Unhandled error during Phase 12 verification:', err);
  process.exit(1);
});
