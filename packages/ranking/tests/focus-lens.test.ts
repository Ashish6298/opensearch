import { describe, it, expect, beforeEach } from 'vitest';
import { createDocumentProcessor, createInvertedIndex, InvertedIndex } from '@opensearch/indexer';
import {
  createQueryParser,
  createCandidateRetriever,
  DefaultRankingEngine,
  DefaultResultGenerator,
  FocusLensRegistry,
  getDefaultLensRegistry,
  validateLensProfile,
  isValidDomainPattern,
  evaluateLensForDocument,
  GENERAL_LENS,
  STUDENT_LENS,
  DEVELOPER_LENS,
  RESEARCH_LENS,
  TRUSTED_HEALTH_LENS,
  NO_TRACKERS_LENS,
  BUILTIN_LENSES,
  getBuiltinLens,
  HEALTH_LENS_DISCLAIMER,
  NO_TRACKERS_LENS_DISCLAIMER,
  CURRENT_LENS_SCHEMA_VERSION,
  FocusLensProfile,
} from '../src/index.js';

describe('Phase 101 — Focus Lens Schema & Initial Profiles Suite', () => {
  let index: InvertedIndex;
  let rankingEngine: DefaultRankingEngine;
  const processor = createDocumentProcessor();
  const parser = createQueryParser();

  beforeEach(() => {
    index = createInvertedIndex();

    // 1. Add educational doc
    index.addDocument(
      processor.process({
        id: 'doc-mit-course',
        url: 'https://ocw.mit.edu/courses/computer-science/algorithms',
        title: 'MIT OpenCourseWare Algorithms',
        headings: 'Introduction to Algorithms Lecture Notes',
        description: 'Comprehensive college curriculum and textbook notes.',
        bodyText: 'Algorithms data structures graph traversal dynamic programming computational complexity.',
        language: 'en',
      }),
    );

    // 2. Add developer doc
    index.addDocument(
      processor.process({
        id: 'doc-mdn-async',
        url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Async',
        title: 'MDN Web Docs Asynchronous JavaScript',
        headings: 'Promises Async Await Patterns',
        description: 'Official web platform documentation for asynchronous programming.',
        bodyText: 'Asynchronous JavaScript execution promises microtasks event loop syntax patterns.',
        language: 'en',
      }),
    );

    // 3. Add health doc
    index.addDocument(
      processor.process({
        id: 'doc-cdc-guidance',
        url: 'https://www.cdc.gov/respiratory-viruses/guidance',
        title: 'CDC Respiratory Virus Prevention Guidance',
        headings: 'Clinical Guidance Public Health Prevention',
        description: 'Evidence-based prevention strategies and institutional protocols.',
        bodyText: 'Respiratory virus clinical infection prevention vaccination public health guidance evidence.',
        language: 'en',
      }),
    );

    // 4. Add commercial clickbait / homework solver
    index.addDocument(
      processor.process({
        id: 'doc-chegg-homework',
        url: 'https://www.chegg.com/homework-help/algorithms-solution-101',
        title: 'Algorithms Homework Solutions and Answers',
        headings: 'Exam Q&A Paywalled Help',
        description: 'Homework solutions with subscription.',
        bodyText: 'Algorithms homework answers and test bank solutions behind paywall.',
        language: 'en',
      }),
    );

    // 5. Add ad tracking domain
    index.addDocument(
      processor.process({
        id: 'doc-taboola-sponsored',
        url: 'https://sponsored.taboola.com/news/tech',
        title: 'Sponsored Tech Recommendations and Ad Widgets',
        headings: 'Promoted Content Feed',
        description: 'Content recommendation network widgets.',
        bodyText: 'Algorithms and search engine optimization promoted widget networks.',
        language: 'en',
      }),
    );

    rankingEngine = new DefaultRankingEngine({ index });
  });

  describe('1. Versioned JSON Schema & Strict Validation (validateLensProfile)', () => {
    it('accepts valid Focus Lens profile matching schemaVersion 1', () => {
      const validProfile = {
        schemaVersion: 1,
        id: 'custom-math',
        name: 'Mathematics Lens',
        description: 'Prioritizes mathematics research, OEIS, and university math departments.',
        boostDomains: [
          { pattern: 'oeis.org', multiplier: 1.8, reason: 'On-Line Encyclopedia of Integer Sequences' },
          { pattern: '*.edu', multiplier: 1.4 },
        ],
        demoteDomains: [
          { pattern: 'mathway.com', multiplier: 0.6 },
        ],
        excludeDomains: ['spam-math.com'],
        rankingWeights: {
          domainAuthorityWeight: 0.20,
        },
      };

      const result = validateLensProfile(validProfile);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.profile?.id).toBe('custom-math');
      expect(result.profile?.boostDomains).toHaveLength(2);
      expect(result.profile?.excludeDomains).toEqual(['spam-math.com']);
    });

    it('rejects unsupported schema versions', () => {
      const invalid = {
        schemaVersion: 99,
        id: 'future-lens',
        name: 'Future Lens',
        description: 'Invalid version profile.',
      };

      const result = validateLensProfile(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Unsupported or missing schemaVersion'))).toBe(true);
    });

    it('enforces bounds on boost multipliers [1.0 - 3.0]', () => {
      const excessiveBoost = {
        schemaVersion: 1,
        id: 'greedy-lens',
        name: 'Greedy Lens',
        description: 'Attempts an unbound 100x multiplier.',
        boostDomains: [{ pattern: 'my-site.com', multiplier: 100.0 }],
      };

      const result = validateLensProfile(excessiveBoost);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('between 1 and 3'))).toBe(true);
    });

    it('enforces bounds on demote multipliers [0.05 - 1.0]', () => {
      const excessiveDemote = {
        schemaVersion: 1,
        id: 'harsh-lens',
        name: 'Harsh Lens',
        description: 'Attempts a zero multiplier.',
        demoteDomains: [{ pattern: 'bad-site.com', multiplier: 0.001 }],
      };

      const result = validateLensProfile(excessiveDemote);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('between 0.05 and 1'))).toBe(true);
    });

    it('validates domain pattern syntax and rejects protocols, slashes, and scripts', () => {
      expect(isValidDomainPattern('github.com')).toBe(true);
      expect(isValidDomainPattern('*.edu')).toBe(true);
      expect(isValidDomainPattern('.gov')).toBe(true);
      expect(isValidDomainPattern('developer.mozilla.org')).toBe(true);

      // Rejections
      expect(isValidDomainPattern('https://github.com')).toBe(false);
      expect(isValidDomainPattern('github.com/path')).toBe(false);
      expect(isValidDomainPattern('bad domain with spaces')).toBe(false);
      expect(isValidDomainPattern('<script>alert(1)</script>')).toBe(false);
      expect(isValidDomainPattern('')).toBe(false);
    });

    it('blocks prototype pollution vectors defensively', () => {
      const maliciousPayload = JSON.parse('{"schemaVersion": 1, "id": "evil", "name": "Evil", "description": "Evil", "__proto__": {"polluted": true}}');
      const result = validateLensProfile(maliciousPayload);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('prototype pollution'))).toBe(true);
    });
  });

  describe('2. Required Initial Profiles Verification', () => {
    it('provides all 6 required builtin profiles', () => {
      expect(BUILTIN_LENSES).toHaveLength(6);
      const ids = BUILTIN_LENSES.map(l => l.id);
      expect(ids).toContain('general');
      expect(ids).toContain('student');
      expect(ids).toContain('developer');
      expect(ids).toContain('research');
      expect(ids).toContain('trusted-health');
      expect(ids).toContain('no-trackers');
    });

    it('verifies General profile is neutral baseline', () => {
      const general = getBuiltinLens('general')!;
      expect(general).toBeDefined();
      expect(general.boostDomains).toHaveLength(0);
      expect(general.demoteDomains).toHaveLength(0);
      expect(general.excludeDomains).toHaveLength(0);
    });

    it('verifies Student profile boosts educational sources and demotes homework mills', () => {
      const student = getBuiltinLens('student')!;
      expect(student).toBeDefined();
      const boostPatterns = student.boostDomains.map(b => b.pattern);
      expect(boostPatterns).toContain('*.edu');
      expect(boostPatterns).toContain('wikipedia.org');
      expect(boostPatterns).toContain('khanacademy.org');

      const demotePatterns = student.demoteDomains.map(d => d.pattern);
      expect(demotePatterns).toContain('chegg.com');
      expect(demotePatterns).toContain('coursehero.com');
    });

    it('verifies Developer profile boosts official documentation', () => {
      const dev = getBuiltinLens('developer')!;
      expect(dev).toBeDefined();
      const boostPatterns = dev.boostDomains.map(b => b.pattern);
      expect(boostPatterns).toContain('developer.mozilla.org');
      expect(boostPatterns).toContain('github.com');
      expect(boostPatterns).toContain('rust-lang.org');
      expect(boostPatterns).toContain('python.org');
    });

    it('verifies Research profile boosts preprints and journals', () => {
      const research = getBuiltinLens('research')!;
      expect(research).toBeDefined();
      const boostPatterns = research.boostDomains.map(b => b.pattern);
      expect(boostPatterns).toContain('arxiv.org');
      expect(boostPatterns).toContain('ncbi.nlm.nih.gov');
      expect(boostPatterns).toContain('nature.com');
    });

    it('verifies Trusted Health profile treats health as source preference, not medical endorsement', () => {
      const health = getBuiltinLens('trusted-health')!;
      expect(health).toBeDefined();

      // Invariant: MUST NOT be a medical endorsement
      expect(health.isMedicalEndorsement).toBe(false);
      expect(health.disclaimer).toBe(HEALTH_LENS_DISCLAIMER);
      expect(health.disclaimer).toContain('NOT medical advice');
      expect(health.disclaimer).toContain('informational source preference');

      const boostPatterns = health.boostDomains.map(b => b.pattern);
      expect(boostPatterns).toContain('cdc.gov');
      expect(boostPatterns).toContain('who.int');
      expect(boostPatterns).toContain('nih.gov');
      expect(boostPatterns).toContain('pubmed.ncbi.nlm.nih.gov');
    });

    it('verifies No-Trackers profile enables tracker signal and excludes ad platforms', () => {
      const noTrackers = getBuiltinLens('no-trackers')!;
      expect(noTrackers).toBeDefined();
      expect(noTrackers.disclaimer).toBe(NO_TRACKERS_LENS_DISCLAIMER);
      expect(noTrackers.rankingWeights?.enableTrackerSignal).toBe(true);
      expect(noTrackers.excludeDomains).toContain('outbrain.com');
      expect(noTrackers.excludeDomains).toContain('taboola.com');
    });
  });

  describe('3. Domain Matching & Evaluation (evaluateLensForDocument)', () => {
    it('applies domain exclusion with 0.0 multiplier', () => {
      const evalResult = evaluateLensForDocument('https://sponsored.taboola.com/news', NO_TRACKERS_LENS);
      expect(evalResult.action).toBe('exclude');
      expect(evalResult.multiplier).toBe(0.0);
      expect(evalResult.explanation.action).toBe('exclude');
      expect(evalResult.explanation.matchedPattern).toBe('taboola.com');
    });

    it('matches wildcard prefix *.edu for university subdomains', () => {
      const evalResult = evaluateLensForDocument('https://ocw.mit.edu/courses', STUDENT_LENS);
      expect(evalResult.action).toBe('boost');
      expect(evalResult.multiplier).toBeGreaterThanOrEqual(1.5);
    });

    it('matches exact and subdomain patterns for developer platforms', () => {
      const evalResult = evaluateLensForDocument('https://developer.mozilla.org/en-US/docs', DEVELOPER_LENS);
      expect(evalResult.action).toBe('boost');
      expect(evalResult.multiplier).toBe(1.8);
      expect(evalResult.explanation.action).toBe('boost');
    });

    it('matches demoted domains with bounded demote multiplier', () => {
      const evalResult = evaluateLensForDocument('https://www.chegg.com/homework-help', STUDENT_LENS);
      expect(evalResult.action).toBe('demote');
      expect(evalResult.multiplier).toBe(0.5);
      expect(evalResult.explanation.action).toBe('demote');
    });

    it('returns neutral action none when no rules match', () => {
      const evalResult = evaluateLensForDocument('https://random-unmatched-blog.com/page', DEVELOPER_LENS);
      expect(evalResult.action).toBe('none');
      expect(evalResult.multiplier).toBe(1.0);
    });
  });

  describe('4. Safe Registry & Robust Fallback (Invalid profiles cannot crash search)', () => {
    it('falls back safely to General lens when invalid or unknown profile is requested', () => {
      const registry = new FocusLensRegistry();

      // Passing non-existent string ID
      const resolvedUnknown = registry.resolveLens('non-existent-lens-xyz');
      expect(resolvedUnknown.id).toBe('general');

      // Passing null / undefined
      const resolvedNull = registry.resolveLens(null);
      expect(resolvedNull.id).toBe('general');

      // Passing malformed object
      const resolvedMalformed = registry.resolveLens({ garbage: true } as any);
      expect(resolvedMalformed.id).toBe('general');
    });

    it('prevents tampering with builtin profiles', () => {
      const registry = new FocusLensRegistry();
      const overrideAttempt = {
        schemaVersion: 1,
        id: 'developer', // Trying to overwrite builtin
        name: 'Malicious Dev Override',
        description: 'Tries to override developer lens',
      };

      const result = registry.registerProfile(overrideAttempt);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Cannot override system builtin lens'))).toBe(true);

      // Verify developer lens remained intact
      const devLens = registry.getLens('developer')!;
      expect(devLens.name).toBe('Developer');
      expect(devLens.isBuiltin).toBe(true);
    });

    it('allows registering and removing valid custom lenses', () => {
      const registry = new FocusLensRegistry();
      const custom = {
        schemaVersion: 1,
        id: 'local-history',
        name: 'History Lens',
        description: 'Prioritizes primary historical archives.',
        boostDomains: [{ pattern: 'archive.org', multiplier: 1.6 }],
      };

      const regResult = registry.registerProfile(custom);
      expect(regResult.valid).toBe(true);
      expect(registry.getLens('local-history')).toBeDefined();

      const removed = registry.removeProfile('local-history');
      expect(removed).toBe(true);
      expect(registry.getLens('local-history')).toBeUndefined();
    });
  });

  describe('5. Ranking Engine Integration, Reversibility & Explainability', () => {
    it('elevates boosted domains and excludes blocked domains under active lens', () => {
      const query = parser.parse('algorithms');
      const retriever = createCandidateRetriever(index);
      const candidates = retriever.retrieve(query, { mode: 'union' }).candidates;

      // 1. Baseline search under General
      const baselineRes = rankingEngine.rank(query, candidates, { lens: 'general' });
      const baselineIds = baselineRes.hits.map(h => h.documentId);
      expect(baselineIds).toContain('doc-taboola-sponsored');

      // 2. Search under No-Trackers lens (excludes taboola.com)
      const noTrackersRes = rankingEngine.rank(query, candidates, { lens: 'no-trackers' });
      const noTrackersIds = noTrackersRes.hits.map(h => h.documentId);
      expect(noTrackersIds).not.toContain('doc-taboola-sponsored');

      // 3. Search under Student lens (boosts mit.edu, demotes chegg.com)
      const studentRes = rankingEngine.rank(query, candidates, { lens: 'student' });
      const mitHit = studentRes.hits.find(h => h.documentId === 'doc-mit-course')!;
      const cheggHit = studentRes.hits.find(h => h.documentId === 'doc-chegg-homework')!;

      expect(mitHit.explanation?.lensExplain?.action).toBe('boost');
      expect(mitHit.explanation?.lensMultiplier).toBeGreaterThan(1.0);

      expect(cheggHit.explanation?.lensExplain?.action).toBe('demote');
      expect(cheggHit.explanation?.lensMultiplier).toBeLessThan(1.0);
    });

    it('ensures search is completely reversible: switching back to General restores baseline', () => {
      const query = parser.parse('algorithms');
      const retriever = createCandidateRetriever(index);
      const candidates = retriever.retrieve(query, { mode: 'union' }).candidates;

      const baseBefore = rankingEngine.rank(query, candidates);
      const studentRun = rankingEngine.rank(query, candidates, { lens: 'student' });
      const baseAfter = rankingEngine.rank(query, candidates, { lens: 'general' });

      expect(studentRun.hits[0]!.score).not.toBe(baseBefore.hits[0]!.score);

      // Verify exact reversibility
      expect(baseAfter.hits.length).toBe(baseBefore.hits.length);
      for (let i = 0; i < baseBefore.hits.length; i++) {
        expect(baseAfter.hits[i]!.documentId).toBe(baseBefore.hits[i]!.documentId);
        expect(baseAfter.hits[i]!.score).toBe(baseBefore.hits[i]!.score);
      }
    });

    it('never guarantees or implies medical endorsement for health lens', () => {
      const query = parser.parse('guidance');
      const retriever = createCandidateRetriever(index);
      const candidates = retriever.retrieve(query, { mode: 'union' }).candidates;

      const healthRes = rankingEngine.rank(query, candidates, { lens: 'trusted-health' });
      const cdcHit = healthRes.hits.find(h => h.documentId === 'doc-cdc-guidance')!;

      expect(cdcHit).toBeDefined();
      expect(cdcHit.explanation?.lensExplain?.isMedicalEndorsement).toBe(false);
      expect(cdcHit.explanation?.lensExplain?.disclaimer).toBe(HEALTH_LENS_DISCLAIMER);
    });

    it('handles corrupt/invalid lens inputs gracefully without crashing search', () => {
      const query = parser.parse('algorithms');
      const retriever = createCandidateRetriever(index);
      const candidates = retriever.retrieve(query, { mode: 'union' }).candidates;

      // Passing corrupt lens string
      expect(() => {
        rankingEngine.rank(query, candidates, { lens: 'corrupt-non-existent-name-123' });
      }).not.toThrow();

      // Passing corrupt object
      expect(() => {
        rankingEngine.rank(query, candidates, { lens: { invalid: true } as any });
      }).not.toThrow();

      const result = rankingEngine.rank(query, candidates, { lens: { invalid: true } as any });
      expect(result.hits.length).toBeGreaterThan(0);
    });

    it('attaches lens explanations and metadata in SearchResultGenerator', () => {
      const query = parser.parse('algorithms');
      const retriever = createCandidateRetriever(index);
      const candidates = retriever.retrieve(query, { mode: 'union' }).candidates;

      const ranked = rankingEngine.rank(query, candidates, { lens: 'student' });
      const generator = new DefaultResultGenerator();
      const results = generator.generateResults(query, ranked.hits, { lens: 'student' });

      expect(results.activeLensId).toBe('student');
      expect(results.activeLensName).toBe('Student');

      const mitItem = results.items.find(i => i.documentId === 'doc-mit-course');
      expect(mitItem?.lensExplain?.lensName).toBe('Student');
      expect(mitItem?.lensExplain?.action).toBe('boost');
    });
  });
});
