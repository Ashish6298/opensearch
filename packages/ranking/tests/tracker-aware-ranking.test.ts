import { describe, it, expect, beforeEach } from 'vitest';
import { createDocumentProcessor, createInvertedIndex, InvertedIndex } from '@opensearch/indexer';
import type { TrackerClassificationResult } from '@opensearch/crawler';
import {
  createQueryParser,
  createCandidateRetriever,
  DefaultRankingEngine,
  DefaultResultGenerator,
  evaluateTrackerSignal,
  createTrackerIndicator,
  TrackerQualityEvaluator,
  runTrackerQualityBenchmark,
  TRACKER_DETECTION_DISCLAIMER,
  DEFAULT_TRACKER_RANKING_OPTIONS,
  resolveClassificationFromSource,
  TrackerRankingOptions,
} from '../src/index.js';

describe('Phase 100 — Tracker-Aware Ranking & Evidence-Based Privacy Indicators', () => {
  let index: InvertedIndex;
  let rankingEngine: DefaultRankingEngine;
  const processor = createDocumentProcessor();
  const parser = createQueryParser();

  const mockCleanClassification: TrackerClassificationResult = {
    documentUrl: 'https://clean-site.org/docs',
    documentOrigin: 'https://clean-site.org',
    documentRegistrableDomain: 'clean-site.org',
    status: 'no_trackers_detected',
    confidence: 'high',
    totalResources: 6,
    firstPartyCount: 6,
    thirdPartyCount: 0,
    trackerCount: 0,
    trackers: [],
    thirdPartyOrigins: [],
    firstPartyOrigins: ['https://clean-site.org'],
    categoriesDetected: [],
    evidence: {
      htmlLength: 5000,
      hasHead: true,
      hasBody: true,
      hasValidStructure: true,
      analyzedTagCounts: { script: 3, link: 2, img: 1 },
      beaconCount: 0,
      rationale: 'All 6 subresource(s) originate from first-party origins; zero third-party telemetry detected.',
    },
    classifiedAt: new Date().toISOString(),
  };

  const mockStandardTrackingClassification: TrackerClassificationResult = {
    documentUrl: 'https://standard-site.com/docs',
    documentOrigin: 'https://standard-site.com',
    documentRegistrableDomain: 'standard-site.com',
    status: 'trackers_detected',
    confidence: 'high',
    totalResources: 10,
    firstPartyCount: 8,
    thirdPartyCount: 2,
    trackerCount: 2,
    trackers: [
      {
        matchedDomain: 'google-analytics.com',
        trackerName: 'Google Analytics',
        category: 'analytics',
        owner: 'Google LLC',
        provenance: 'EasyPrivacy',
        license: 'CC BY-SA 4.0',
        updatedAt: '2026-10-27',
        resource: {
          rawUrl: 'https://www.google-analytics.com/analytics.js',
          resolvedUrl: 'https://www.google-analytics.com/analytics.js',
          origin: 'https://www.google-analytics.com',
          hostname: 'www.google-analytics.com',
          registrableDomain: 'google-analytics.com',
          resourceType: 'script',
          originCategory: 'third-party',
          tagName: 'script',
          isPixelBeacon: false,
        },
      },
    ],
    thirdPartyOrigins: ['https://www.google-analytics.com'],
    firstPartyOrigins: ['https://standard-site.com'],
    categoriesDetected: ['analytics'],
    evidence: {
      htmlLength: 8000,
      hasHead: true,
      hasBody: true,
      hasValidStructure: true,
      analyzedTagCounts: { script: 5, link: 3, img: 2 },
      beaconCount: 0,
      rationale: 'Identified 2 tracker(s) across 2 third-party subresources.',
    },
    classifiedAt: new Date().toISOString(),
  };

  const mockHeavyTrackingClassification: TrackerClassificationResult = {
    documentUrl: 'https://ad-heavy.com/docs',
    documentOrigin: 'https://ad-heavy.com',
    documentRegistrableDomain: 'ad-heavy.com',
    status: 'trackers_detected',
    confidence: 'high',
    totalResources: 20,
    firstPartyCount: 4,
    thirdPartyCount: 16,
    trackerCount: 5,
    trackers: [
      {
        matchedDomain: 'fullstory.com',
        trackerName: 'FullStory Replay',
        category: 'session-recording',
        owner: 'FullStory Inc',
        provenance: 'EasyPrivacy',
        license: 'CC BY-SA 4.0',
        updatedAt: '2026-10-27',
        resource: {
          rawUrl: 'https://edge.fullstory.com/s/fs.js',
          resolvedUrl: 'https://edge.fullstory.com/s/fs.js',
          origin: 'https://edge.fullstory.com',
          hostname: 'edge.fullstory.com',
          registrableDomain: 'fullstory.com',
          resourceType: 'script',
          originCategory: 'third-party',
          tagName: 'script',
          isPixelBeacon: false,
        },
      },
    ],
    thirdPartyOrigins: ['https://edge.fullstory.com'],
    firstPartyOrigins: ['https://ad-heavy.com'],
    categoriesDetected: ['advertising', 'session-recording'],
    evidence: {
      htmlLength: 15000,
      hasHead: true,
      hasBody: true,
      hasValidStructure: true,
      analyzedTagCounts: { script: 12, link: 4, img: 4 },
      beaconCount: 3,
      rationale: 'Identified 5 tracker(s) including intrusive categories session-recording.',
    },
    classifiedAt: new Date().toISOString(),
  };

  const mockUnverifiedClassification: TrackerClassificationResult = {
    documentUrl: 'https://unverified.org/page',
    documentOrigin: 'https://unverified.org',
    documentRegistrableDomain: 'unverified.org',
    status: 'unverified',
    confidence: 'low',
    totalResources: 0,
    firstPartyCount: 0,
    thirdPartyCount: 0,
    trackerCount: 0,
    trackers: [],
    thirdPartyOrigins: [],
    firstPartyOrigins: ['https://unverified.org'],
    categoriesDetected: [],
    evidence: {
      htmlLength: 300,
      hasHead: false,
      hasBody: false,
      hasValidStructure: false,
      analyzedTagCounts: {},
      beaconCount: 0,
      rationale: 'Markup lacked standard document structure.',
    },
    classifiedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    index = createInvertedIndex();

    index.addDocument(
      processor.process({
        id: 'doc-clean',
        url: 'https://clean-site.org/docs',
        title: 'Open Source Search Documentation',
        headings: 'Search Engine Architecture',
        description: 'Comprehensive docs for search engines.',
        bodyText: 'Open source search architecture and retrieval pipelines with fast BM25 algorithms.',
        language: 'en',
      }),
    );

    index.addDocument(
      processor.process({
        id: 'doc-standard',
        url: 'https://standard-site.com/docs',
        title: 'Search Documentation with Analytics',
        headings: 'Search Engine Guide',
        description: 'Search documentation overview.',
        bodyText: 'Open source search architecture and retrieval pipelines with fast BM25 algorithms.',
        language: 'en',
      }),
    );

    index.addDocument(
      processor.process({
        id: 'doc-heavy',
        url: 'https://ad-heavy.com/docs',
        title: 'Ad Supported Search Documentation',
        headings: 'Search Engine Directory',
        description: 'Search directory with ads.',
        bodyText: 'Open source search architecture and retrieval pipelines with fast BM25 algorithms.',
        language: 'en',
      }),
    );

    index.addDocument(
      processor.process({
        id: 'doc-unverified',
        url: 'https://unverified.org/page',
        title: 'Unverified Search Notes',
        headings: 'Notes',
        description: 'Rough notes.',
        bodyText: 'Open source search architecture notes.',
        language: 'en',
      }),
    );

    rankingEngine = new DefaultRankingEngine({ index });
  });

  describe('Signal Evaluation & Multipliers (evaluateTrackerSignal)', () => {
    it('returns strict neutral 1.00x multiplier when signal is disabled', () => {
      const evalResult = evaluateTrackerSignal(
        'https://clean-site.org/docs',
        mockCleanClassification,
        { enabled: false },
      );

      expect(evalResult.multiplier).toBe(1.0);
      expect(evalResult.explanation.enabled).toBe(false);
      expect(evalResult.explanation.multiplier).toBe(1.0);
      expect(evalResult.explanation.isSecurityGuarantee).toBe(false);
      expect(evalResult.explanation.disclaimer).toBe(TRACKER_DETECTION_DISCLAIMER);
      expect(evalResult.explanation.explanation).toContain('disabled');
    });

    it('returns neutral 1.00x multiplier when classification is null or unknown', () => {
      const evalResult = evaluateTrackerSignal('https://unknown.com', null, { enabled: true });
      expect(evalResult.multiplier).toBe(1.0);
      expect(evalResult.explanation.status).toBe('unknown');
      expect(evalResult.explanation.confidence).toBe('none');
      expect(evalResult.explanation.isSecurityGuarantee).toBe(false);
    });

    it('returns neutral 1.00x multiplier when classification is unverified without speculation', () => {
      const evalResult = evaluateTrackerSignal(
        'https://unverified.org/page',
        mockUnverifiedClassification,
        { enabled: true },
      );
      expect(evalResult.multiplier).toBe(1.0);
      expect(evalResult.explanation.status).toBe('unverified');
      expect(evalResult.explanation.isSecurityGuarantee).toBe(false);
      expect(evalResult.explanation.explanation).toContain('without speculation');
    });

    it('applies clean site boost when zero trackers are detected with high confidence', () => {
      const evalResult = evaluateTrackerSignal(
        'https://clean-site.org/docs',
        mockCleanClassification,
        {
          enabled: true,
          weight: 0.20,
          cleanSiteBoost: 1.10,
        },
      );

      // Expected blended boost: 1.0 + 0.20 * (1.10 - 1.0) = 1.02
      expect(evalResult.multiplier).toBeGreaterThan(1.0);
      expect(evalResult.multiplier).toBeCloseTo(1.02, 3);
      expect(evalResult.explanation.status).toBe('no_trackers_detected');
      expect(evalResult.explanation.trackerCount).toBe(0);
      expect(evalResult.explanation.isSecurityGuarantee).toBe(false);
    });

    it('applies moderate penalty for standard analytics trackers', () => {
      const evalResult = evaluateTrackerSignal(
        'https://standard-site.com/docs',
        mockStandardTrackingClassification,
        {
          enabled: true,
          weight: 0.20,
          trackingPenalty: 0.85,
        },
      );

      // Expected blended penalty: 1.0 - 0.20 * (1.0 - 0.85) = 0.97
      expect(evalResult.multiplier).toBeLessThan(1.0);
      expect(evalResult.multiplier).toBeCloseTo(0.97, 3);
      expect(evalResult.explanation.status).toBe('trackers_detected');
      expect(evalResult.explanation.trackerCount).toBe(2);
    });

    it('applies heavy penalty for intrusive session-recording and high-density tracking', () => {
      const evalResult = evaluateTrackerSignal(
        'https://ad-heavy.com/docs',
        mockHeavyTrackingClassification,
        {
          enabled: true,
          weight: 0.20,
          heavyTrackingPenalty: 0.70,
        },
      );

      // Expected blended penalty: 1.0 - 0.20 * (1.0 - 0.70) = 0.94
      expect(evalResult.multiplier).toBeLessThan(0.96);
      expect(evalResult.multiplier).toBeCloseTo(0.94, 3);
      expect(evalResult.explanation.explanation).toContain('session-recording');
    });

    it('never guarantees absolute privacy or security across any output', () => {
      const clean = evaluateTrackerSignal('https://clean.org', mockCleanClassification, { enabled: true });
      const heavy = evaluateTrackerSignal('https://ad.org', mockHeavyTrackingClassification, { enabled: true });

      expect(clean.explanation.isSecurityGuarantee).toBe(false);
      expect(heavy.explanation.isSecurityGuarantee).toBe(false);
      expect(clean.explanation.disclaimer).toBe(TRACKER_DETECTION_DISCLAIMER);
      expect(heavy.explanation.disclaimer).toBe(TRACKER_DETECTION_DISCLAIMER);
    });
  });

  describe('Evidence-Based Privacy Indicators (createTrackerIndicator)', () => {
    it('creates clean badge for verified 0 tracker sites', () => {
      const indicator = createTrackerIndicator(mockCleanClassification);
      expect(indicator.status).toBe('no_trackers_detected');
      expect(indicator.badgeText).toBe('No Trackers Detected');
      expect(indicator.severity).toBe('clean');
      expect(indicator.trackerCount).toBe(0);
      expect(indicator.disclaimer).toBe(TRACKER_DETECTION_DISCLAIMER);
    });

    it('creates warning badge for sites with standard telemetry', () => {
      const indicator = createTrackerIndicator(mockStandardTrackingClassification);
      expect(indicator.status).toBe('trackers_detected');
      expect(indicator.badgeText).toBe('2 Trackers Detected');
      expect(indicator.severity).toBe('warning');
      expect(indicator.trackerCount).toBe(2);
      expect(indicator.tooltip).toContain('Google Analytics');
    });

    it('creates alert badge for sites with intrusive or heavy tracking', () => {
      const indicator = createTrackerIndicator(mockHeavyTrackingClassification);
      expect(indicator.status).toBe('trackers_detected');
      expect(indicator.badgeText).toBe('5 Trackers Detected');
      expect(indicator.severity).toBe('alert');
      expect(indicator.categories).toContain('session-recording');
    });

    it('creates neutral badge for unverified sites with explanatory evidence note', () => {
      const indicator = createTrackerIndicator(mockUnverifiedClassification);
      expect(indicator.status).toBe('unverified');
      expect(indicator.badgeText).toBe('Telemetry: Unverified');
      expect(indicator.severity).toBe('neutral');
      expect(indicator.evidenceNote).toBe('Markup lacked standard document structure.');
    });

    it('creates neutral badge for unknown sites without data', () => {
      const indicator = createTrackerIndicator(null);
      expect(indicator.status).toBe('unknown');
      expect(indicator.badgeText).toBe('Telemetry: Unknown');
      expect(indicator.severity).toBe('neutral');
    });
  });

  describe('Ranking Engine Integration & Configurable Toggling', () => {
    it('produces 100% identical scores when tracker signal is disabled vs default', () => {
      const query = parser.parse('open source search architecture');
      const retriever = createCandidateRetriever(index);
      const candidates = retriever.retrieve(query, { mode: 'union' }).candidates;

      const source = new Map<string, TrackerClassificationResult>([
        ['doc-clean', mockCleanClassification],
        ['doc-standard', mockStandardTrackingClassification],
        ['doc-heavy', mockHeavyTrackingClassification],
      ]);

      const resDefault = rankingEngine.rank(query, candidates);
      const resDisabled = rankingEngine.rank(query, candidates, {
        enableTrackerSignal: false,
        trackerClassificationSource: source,
      });

      expect(resDefault.hits.length).toBe(resDisabled.hits.length);
      for (let i = 0; i < resDefault.hits.length; i++) {
        expect(resDefault.hits[i]!.documentId).toBe(resDisabled.hits[i]!.documentId);
        expect(resDefault.hits[i]!.score).toBe(resDisabled.hits[i]!.score);
      }
    });

    it('adjusts scores and elevates clean documents when tracker signal is enabled', () => {
      const query = parser.parse('search documentation');
      const retriever = createCandidateRetriever(index);
      const candidates = retriever.retrieve(query, { mode: 'union' }).candidates;

      const source = new Map<string, TrackerClassificationResult>([
        ['doc-clean', mockCleanClassification],
        ['doc-standard', mockStandardTrackingClassification],
        ['doc-heavy', mockHeavyTrackingClassification],
        ['doc-unverified', mockUnverifiedClassification],
      ]);

      const baseline = rankingEngine.rank(query, candidates, {
        enableTrackerSignal: false,
        trackerClassificationSource: source,
      });

      const trackerRanked = rankingEngine.rank(query, candidates, {
        enableTrackerSignal: true,
        trackerOptions: {
          weight: 0.30,
          cleanSiteBoost: 1.20,
          trackingPenalty: 0.80,
          heavyTrackingPenalty: 0.60,
        },
        trackerClassificationSource: source,
      });

      const cleanBase = baseline.hits.find(h => h.documentId === 'doc-clean')!;
      const cleanCand = trackerRanked.hits.find(h => h.documentId === 'doc-clean')!;

      const heavyBase = baseline.hits.find(h => h.documentId === 'doc-heavy')!;
      const heavyCand = trackerRanked.hits.find(h => h.documentId === 'doc-heavy')!;

      expect(cleanCand.score).toBeGreaterThan(cleanBase.score);
      expect(heavyCand.score).toBeLessThan(heavyBase.score);

      expect(cleanCand.explanation?.trackerExplain?.status).toBe('no_trackers_detected');
      expect(heavyCand.explanation?.trackerExplain?.status).toBe('trackers_detected');
    });

    it('allows users to disable signal dynamically and restore baseline', () => {
      const query = parser.parse('search documentation');
      const retriever = createCandidateRetriever(index);
      const candidates = retriever.retrieve(query, { mode: 'union' }).candidates;

      const source = new Map<string, TrackerClassificationResult>([
        ['doc-clean', mockCleanClassification],
        ['doc-heavy', mockHeavyTrackingClassification],
      ]);

      const onRes = rankingEngine.rank(query, candidates, {
        enableTrackerSignal: true,
        trackerClassificationSource: source,
      });

      const offRes = rankingEngine.rank(query, candidates, {
        enableTrackerSignal: false,
        trackerClassificationSource: source,
      });

      const onClean = onRes.hits.find(h => h.documentId === 'doc-clean')!;
      const offClean = offRes.hits.find(h => h.documentId === 'doc-clean')!;

      expect(onClean.score).not.toBe(offClean.score);
      expect(offClean.explanation?.trackerMultiplier).toBeUndefined();
    });
  });

  describe('Search Result Generation & Indicator Attachment', () => {
    it('attaches tracker indicators to search result items', () => {
      const query = parser.parse('search documentation');
      const retriever = createCandidateRetriever(index);
      const candidates = retriever.retrieve(query, { mode: 'union' }).candidates;

      const source = new Map<string, TrackerClassificationResult>([
        ['doc-clean', mockCleanClassification],
        ['doc-heavy', mockHeavyTrackingClassification],
      ]);

      const ranked = rankingEngine.rank(query, candidates, {
        enableTrackerSignal: true,
        trackerClassificationSource: source,
      });

      const generator = new DefaultResultGenerator();
      const results = generator.generateResults(query, ranked.hits, {
        trackerClassificationSource: source,
      });

      const cleanItem = results.items.find(i => i.documentId === 'doc-clean');
      const heavyItem = results.items.find(i => i.documentId === 'doc-heavy');

      expect(cleanItem?.trackerIndicator).toBeDefined();
      expect(cleanItem?.trackerIndicator?.badgeText).toBe('No Trackers Detected');
      expect(cleanItem?.trackerIndicator?.severity).toBe('clean');

      expect(heavyItem?.trackerIndicator).toBeDefined();
      expect(heavyItem?.trackerIndicator?.badgeText).toBe('5 Trackers Detected');
      expect(heavyItem?.trackerIndicator?.severity).toBe('alert');
    });
  });

  describe('Quality Comparison & Tradeoff Analysis (TrackerQualityEvaluator)', () => {
    it('executes quality comparison benchmark and produces transparent trade-off metrics', async () => {
      const report = await runTrackerQualityBenchmark({
        trackerWeight: 0.20,
      });

      expect(report).toBeDefined();
      expect(report.queryCount).toBeGreaterThan(0);
      expect(report.baselineMetrics).toBeDefined();
      expect(report.candidateMetrics).toBeDefined();
      expect(report.rankShifts).toBeDefined();
      expect(report.tradeoffAnalysis).toContain('Quality Trade-Off Analysis:');
      expect(report.productionSafeguard).toContain('NOT guarantee security or privacy certification');

      // Verify Markdown formatting
      const markdown = TrackerQualityEvaluator.formatMarkdown(report);
      expect(markdown).toContain('# Tracker-Aware Ranking Quality Evaluation Report');
      expect(markdown).toContain('Aggregate Quality Metrics Comparison');
      expect(markdown).toContain('Trade-Off Analysis');
      expect(markdown).toContain('Production Safeguard');
    });
  });
});
