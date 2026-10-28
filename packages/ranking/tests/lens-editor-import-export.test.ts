/**
 * @opensearch/ranking — Phase 102 Focus Lens Editor, Import/Export, and Previewer Tests
 *
 * Covers all Phase 102 tasks and acceptance criteria:
 * 1. Invalid imports fail safely (no throws, structured error feedback, size bounds, prototype pollution guards).
 * 2. Changes do not modify the underlying index (mathematical checksum validation before & after evaluation).
 * 3. Users can restore the default profile (transactional editor rollback and restore to General baseline).
 * 4. Granular rule editor operations (boosts, demotes, exclusions, weights, domain syntax validation).
 * 5. Preview effects against fixed sample queries with hit-level explainability.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createDocumentProcessor, createInvertedIndex, InvertedIndex } from '@opensearch/indexer';
import {
  exportLensToJson,
  importLensFromJson,
  FocusLensEditor,
  previewLensEffects,
  FIXED_PREVIEW_CORPUS,
  FIXED_SAMPLE_QUERIES,
  GENERAL_LENS,
  DEVELOPER_LENS,
  TRUSTED_HEALTH_LENS,
  STUDENT_LENS,
  NO_TRACKERS_LENS,
  FocusLensProfile,
  MAX_LENS_FILE_SIZE_BYTES,
  HEALTH_LENS_DISCLAIMER,
  DefaultRankingEngine,
  createQueryParser,
  createCandidateRetriever,
  DefaultResultGenerator,
} from '../src/index.js';

describe('Phase 102 — Focus Lens Editor, Import/Export, and Previewer Suite', () => {
  describe('Task & Acceptance Criterion 1: Safe JSON Import and Export', () => {
    it('successfully exports a valid profile to clean formatted JSON', () => {
      const jsonStr = exportLensToJson(DEVELOPER_LENS, { pretty: true });
      expect(typeof jsonStr).toBe('string');
      expect(jsonStr).toContain('"id": "developer"');
      expect(jsonStr).toContain('"github.com"');

      // Round-trip parse
      const parsed = JSON.parse(jsonStr);
      expect(parsed.schemaVersion).toBe(1);
      expect(parsed.name).toBe('Developer');
    });

    it('successfully imports a valid schema-compliant profile', () => {
      const customProfile: FocusLensProfile = {
        schemaVersion: 1,
        id: 'math-academy',
        name: 'Math Academy Lens',
        description: 'Prioritizes mathematics resources and courseware.',
        isBuiltin: false,
        isMedicalEndorsement: false,
        boostDomains: [
          { pattern: 'khanacademy.org', multiplier: 2.2, reason: 'Math portal' },
          { pattern: 'wolframalpha.com', multiplier: 2.0 },
        ],
        demoteDomains: [
          { pattern: 'content-farm-math.com', multiplier: 0.2 },
        ],
        excludeDomains: ['spam-math.com'],
      };

      const jsonStr = JSON.stringify(customProfile);
      const result = importLensFromJson(jsonStr);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.profile).toBeDefined();
      expect(result.profile?.id).toBe('math-academy');
      expect(result.profile?.boostDomains).toHaveLength(2);
      expect(result.profile?.excludeDomains).toContain('spam-math.com');
    });

    it('fails safely without throwing when given malformed JSON syntax', () => {
      const malformedJson = '{ "id": "broken", "schemaVersion": 1, unquotedKey: ...';
      const result = importLensFromJson(malformedJson);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Malformed JSON syntax');
      expect(result.profile).toBeUndefined();
    });

    it('fails safely when given non-string or empty input', () => {
      expect(importLensFromJson(null).valid).toBe(false);
      expect(importLensFromJson(12345).valid).toBe(false);
      expect(importLensFromJson('').valid).toBe(false);
      expect(importLensFromJson('   ').valid).toBe(false);
    });

    it('fails safely when payload exceeds the maximum 256 KB limit (DoS guard)', () => {
      // Create a payload larger than 256 KB
      const oversizedProfile = {
        schemaVersion: 1,
        id: 'oversized-lens',
        name: 'Oversized',
        description: 'x'.repeat(MAX_LENS_FILE_SIZE_BYTES + 5000),
      };

      const oversizedJson = JSON.stringify(oversizedProfile);
      const result = importLensFromJson(oversizedJson);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('exceeds maximum allowed limit'))).toBe(true);
    });

    it('fails safely and rejects prototype pollution vectors', () => {
      const pollutionJson = `{
        "__proto__": { "polluted": true },
        "schemaVersion": 1,
        "id": "polluted-lens",
        "name": "Pollution Vector",
        "description": "Exploit attempt"
      }`;

      const result = importLensFromJson(pollutionJson);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('prototype pollution'))).toBe(true);
    });

    it('fails safely when domain patterns contain protocols, paths, or spaces', () => {
      const badDomainJson = JSON.stringify({
        schemaVersion: 1,
        id: 'bad-domains',
        name: 'Bad Domains',
        description: 'Contains invalid domain pattern syntax',
        boostDomains: [
          { pattern: 'https://badsite.com/path', multiplier: 1.5 },
          { pattern: 'invalid domain name.org', multiplier: 2.0 },
        ],
        excludeDomains: ['ftp://malicious.com'],
      });

      const result = importLensFromJson(badDomainJson);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('not a valid domain pattern'))).toBe(true);
    });

    it('fails safely when multipliers or weights are out of bounded range', () => {
      const outOfBoundsJson = JSON.stringify({
        schemaVersion: 1,
        id: 'out-of-bounds',
        name: 'Out of bounds multipliers',
        description: 'Tests multiplier bounds',
        boostDomains: [
          { pattern: 'example.com', multiplier: 10.5 }, // Max is 3.0
        ],
        demoteDomains: [
          { pattern: 'spam.com', multiplier: 0.001 }, // Min is 0.05
        ],
        rankingWeights: {
          freshnessWeight: 1.8, // Max is 1.0
        },
      });

      const result = importLensFromJson(outOfBoundsJson);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('boostDomains[0].multiplier'))).toBe(true);
      expect(result.errors.some(e => e.includes('demoteDomains[0].multiplier'))).toBe(true);
      expect(result.errors.some(e => e.includes('rankingWeights.freshnessWeight'))).toBe(true);
    });
  });

  describe('Task & Acceptance Criterion 3: Focus Lens Rule Editor & Restore Default', () => {
    let editor: FocusLensEditor;

    beforeEach(() => {
      editor = new FocusLensEditor(DEVELOPER_LENS);
    });

    it('initializes with a deep copy of the profile without mutating the original', () => {
      const profile = editor.getProfile();
      expect(profile.id).toBe('developer');
      expect(editor.isDirty()).toBe(false);

      // Mutating returned profile does not affect editor internal state
      (profile as any).name = 'Corrupted Name';
      expect(editor.getProfile().name).toBe('Developer');
    });

    it('adds, updates, and removes boost domain rules with immediate validation', () => {
      const addRes = editor.addBoostDomain('crates.io', 2.5, 'Official Rust package registry');
      expect(addRes.valid).toBe(true);
      expect(editor.isDirty()).toBe(true);

      const profile = editor.getProfile();
      const rule = profile.boostDomains.find(r => r.pattern === 'crates.io');
      expect(rule).toBeDefined();
      expect(rule?.multiplier).toBe(2.5);
      expect(rule?.reason).toBe('Official Rust package registry');

      // Update multiplier
      const updateRes = editor.updateBoostMultiplier('crates.io', 2.8);
      expect(updateRes.valid).toBe(true);
      expect(editor.getProfile().boostDomains.find(r => r.pattern === 'crates.io')?.multiplier).toBe(2.8);

      // Remove boost rule
      const removed = editor.removeBoostDomain('crates.io');
      expect(removed).toBe(true);
      expect(editor.getProfile().boostDomains.find(r => r.pattern === 'crates.io')).toBeUndefined();
    });

    it('rejects invalid boost multipliers or domain patterns', () => {
      const badMult = editor.addBoostDomain('example.org', 4.5);
      expect(badMult.valid).toBe(false);
      expect(badMult.errors[0]).toContain('Boost multiplier must be a number between 1 and 3');

      const badDomain = editor.addBoostDomain('https://example.org/path', 2.0);
      expect(badDomain.valid).toBe(false);
      expect(badDomain.errors[0]).toContain('Invalid domain pattern syntax');
    });

    it('adds, updates, and removes demote domain rules with immediate validation', () => {
      const addRes = editor.addDemoteDomain('w3schools.com', 0.6, 'Deprioritize SEO-heavy references');
      expect(addRes.valid).toBe(true);

      const profile = editor.getProfile();
      const rule = profile.demoteDomains.find(r => r.pattern === 'w3schools.com');
      expect(rule).toBeDefined();
      expect(rule?.multiplier).toBe(0.6);

      // Update demote
      const updateRes = editor.updateDemoteMultiplier('w3schools.com', 0.4);
      expect(updateRes.valid).toBe(true);
      expect(editor.getProfile().demoteDomains.find(r => r.pattern === 'w3schools.com')?.multiplier).toBe(0.4);

      // Remove demote
      const removed = editor.removeDemoteDomain('w3schools.com');
      expect(removed).toBe(true);
      expect(editor.getProfile().demoteDomains.find(r => r.pattern === 'w3schools.com')).toBeUndefined();
    });

    it('prevents conflicting rules between boost, demote, and exclusions', () => {
      // Exclude a domain
      editor.addExcludeDomain('spam-forum.org');
      expect(editor.getProfile().excludeDomains).toContain('spam-forum.org');

      // Attempting to boost an excluded domain is rejected
      const conflictBoost = editor.addBoostDomain('spam-forum.org', 2.0);
      expect(conflictBoost.valid).toBe(false);
      expect(conflictBoost.errors[0]).toContain('already present in excluded domains');

      // Adding to exclude automatically purges from boost and demote lists
      editor.addBoostDomain('temp-domain.com', 1.8);
      expect(editor.getProfile().boostDomains.some(r => r.pattern === 'temp-domain.com')).toBe(true);

      editor.addExcludeDomain('temp-domain.com');
      expect(editor.getProfile().boostDomains.some(r => r.pattern === 'temp-domain.com')).toBe(false);
      expect(editor.getProfile().excludeDomains).toContain('temp-domain.com');
    });

    it('configures custom ranking weights with strict bound checking', () => {
      const validWeights = editor.setRankingWeights({
        freshnessWeight: 0.25,
        domainAuthorityWeight: 0.4,
        pageRankWeight: 0.35,
        enableTrackerSignal: true,
      });
      expect(validWeights.valid).toBe(true);
      expect(editor.getProfile().rankingWeights?.domainAuthorityWeight).toBe(0.4);

      // Invalid weight (< 0 or > 1)
      const invalidWeight = editor.setRankingWeights({
        freshnessWeight: 1.5,
      });
      expect(invalidWeight.valid).toBe(false);
      expect(invalidWeight.errors[0]).toContain('Weight "freshnessWeight" must be between 0 and 1');

      editor.clearRankingWeights();
      expect(editor.getProfile().rankingWeights).toBeUndefined();
    });

    it('fulfills Acceptance Criterion 3: Users can restore the default profile', () => {
      // Make heavy customizations
      editor.addBoostDomain('my-custom-portal.org', 2.5);
      editor.addDemoteDomain('annoying-ads.com', 0.2);
      editor.addExcludeDomain('banned-tracker.com');
      editor.setRankingWeights({ domainAuthorityWeight: 0.8 });

      expect(editor.isDirty()).toBe(true);
      expect(editor.getProfile().boostDomains.length).toBeGreaterThan(DEVELOPER_LENS.boostDomains.length);

      // Restore to default profile (General Lens baseline)
      const restored = editor.restoreDefault();

      expect(restored.id).toBe('general');
      expect(restored.name).toBe('General');
      expect(restored.boostDomains).toHaveLength(0);
      expect(restored.demoteDomains).toHaveLength(0);
      expect(restored.excludeDomains).toHaveLength(0);
      expect(restored.rankingWeights).toBeUndefined();
      expect(editor.getProfile().id).toBe('general');
    });

    it('supports resetToInitial to discard draft changes without losing active lens profile', () => {
      editor.addBoostDomain('testing-site.dev', 1.9);
      expect(editor.isDirty()).toBe(true);

      const reverted = editor.resetToInitial();
      expect(reverted.id).toBe('developer');
      expect(reverted.boostDomains.some(r => r.pattern === 'testing-site.dev')).toBe(false);
      expect(editor.isDirty()).toBe(false);
    });

    it('enforces medical non-endorsement disclaimer when profile name or id references health', () => {
      const res = editor.setMetadata({
        id: 'community-health',
        name: 'Community Health Portal',
        description: 'Health information sources',
      });

      expect(res.valid).toBe(true);
      const profile = editor.getProfile();
      expect(profile.isMedicalEndorsement).toBe(false);
      expect(profile.disclaimer).toBe(HEALTH_LENS_DISCLAIMER);
    });
  });

  describe('Task & Acceptance Criterion 2: Previewer & Underlying Index Immutability', () => {
    it('previews lens effects across fixed sample queries and generates explanations', () => {
      const report = previewLensEffects(DEVELOPER_LENS);

      expect(report.lensId).toBe('developer');
      expect(report.lensName).toBe('Developer');
      expect(report.isMedicalEndorsement).toBe(false);
      expect(report.queriesTested).toBe(FIXED_SAMPLE_QUERIES.length);
      expect(report.summaries.length).toBeGreaterThan(0);

      // Developer lens should have boosted developer sites like github.com or docs.rs
      expect(report.totalBoostedAcrossQueries).toBeGreaterThan(0);

      // Check rust async query
      const rustQuerySummary = report.summaries.find(s => s.query.includes('rust'));
      expect(rustQuerySummary).toBeDefined();

      const boostedItem = rustQuerySummary?.results.find(r => r.action === 'boost');
      expect(boostedItem).toBeDefined();
      expect(boostedItem?.multiplier).toBeGreaterThan(1.0);
      expect(boostedItem?.explanation).toMatch(/boost/i);
      expect(boostedItem?.matchedRule).toBeDefined();
    });

    it('correctly reports exclusions with detailed explanations', () => {
      // Create a lens with an explicit exclusion
      const lensWithExclusion: FocusLensProfile = {
        ...DEVELOPER_LENS,
        id: 'dev-clean',
        excludeDomains: ['tracker-analytics-adnetwork.com', 'untrusted-content-farm.com'],
      };

      const report = previewLensEffects(lensWithExclusion);
      expect(report.totalExcludedAcrossQueries).toBeGreaterThan(0);

      const queryWithExclusions = report.summaries.find(s => s.excludedCount > 0);
      expect(queryWithExclusions).toBeDefined();
      expect(queryWithExclusions?.excludedItems.length).toBeGreaterThan(0);

      const excludedHit = queryWithExclusions?.excludedItems[0];
      expect(excludedHit?.action).toBe('exclude');
      expect(excludedHit?.explanation).toMatch(/excluded/i);
      expect(excludedHit?.matchedRule).toBeDefined();
    });

    it('proves Acceptance Criterion 2: Underlying corpus/index remains 100% immutable', () => {
      // Take snapshot of FIXED_PREVIEW_CORPUS before preview
      const corpusSnapshotBefore = JSON.stringify(FIXED_PREVIEW_CORPUS);

      const report = previewLensEffects(TRUSTED_HEALTH_LENS);

      // Report itself mathematically asserts immutability
      expect(report.indexImmutabilityVerified).toBe(true);

      // Independent assertion: corpus snapshot before and after is bit-for-bit identical
      const corpusSnapshotAfter = JSON.stringify(FIXED_PREVIEW_CORPUS);
      expect(corpusSnapshotBefore).toBe(corpusSnapshotAfter);
    });

    it('verifies index immutability on a real InvertedIndex instance with candidate retrieval', () => {
      const testIndex = createInvertedIndex();
      const processor = createDocumentProcessor();
      const parser = createQueryParser();

      testIndex.addDocument(
        processor.process({
          id: 'idx-1',
          url: 'https://github.com/tokio-rs/tokio',
          title: 'Tokio Async',
          bodyText: 'Asynchronous rust network runtime framework.',
        }),
      );

      testIndex.addDocument(
        processor.process({
          id: 'idx-2',
          url: 'https://tracker-analytics.com/bad',
          title: 'Tracker Bad Site',
          bodyText: 'Asynchronous network analytics.',
        }),
      );

      const statsBefore = testIndex.getStats();

      const retriever = createCandidateRetriever(testIndex);
      const parsed = parser.parse('asynchronous network');
      const retrieved = retriever.retrieve(parsed);

      const engine = new DefaultRankingEngine({ index: testIndex });
      const result = engine.rank(parsed, retrieved.candidates, {
        lens: DEVELOPER_LENS,
      });

      // Assert ranking behavior
      expect(result.hits.length).toBeGreaterThan(0);
      const topHit = result.hits[0];
      expect(topHit?.explanation.lensMultiplier).toBeGreaterThan(1.0);

      // Assert index immutability
      const statsAfter = testIndex.getStats();
      expect(statsAfter.totalDocuments).toBe(statsBefore.totalDocuments);
      expect(statsAfter.totalTerms).toBe(statsBefore.totalTerms);
      expect(statsAfter.totalPostings).toBe(statsBefore.totalPostings);
    });
  });

  describe('Health and Privacy Lens Safety Invariants', () => {
    it('preserves non-medical endorsement invariant on preview and exports', () => {
      const report = previewLensEffects(TRUSTED_HEALTH_LENS);
      expect(report.isMedicalEndorsement).toBe(false);
      expect(report.disclaimer).toBe(HEALTH_LENS_DISCLAIMER);

      const exported = exportLensToJson(TRUSTED_HEALTH_LENS);
      expect(exported).toContain('"isMedicalEndorsement": false');
      expect(exported).toContain('Notice: This Focus Lens prioritizes established public health institutions');
    });

    it('evaluates No-Trackers lens prioritizing tracker-free resources', () => {
      const report = previewLensEffects(NO_TRACKERS_LENS);
      expect(report.lensId).toBe('no-trackers');
      expect(report.isMedicalEndorsement).toBe(false);
      expect(report.totalDemotedAcrossQueries).toBeGreaterThan(0);
    });
  });
});
