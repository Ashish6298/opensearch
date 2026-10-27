/**
 * @opensearch/ranking — Tracker-Aware Benchmark Suite (Phase 100)
 *
 * Provides a reproducible quality evaluation harness that measures the trade-offs
 * between baseline ranking and tracker-aware ranking on controlled fixtures.
 */

import { createDocumentProcessor, createInvertedIndex } from '@opensearch/indexer';
import type { TrackerClassificationResult } from '@opensearch/crawler';
import { createQueryParser } from '../query/query-parser.js';
import { createCandidateRetriever } from '../retrieval/candidate-retriever.js';
import { DefaultRankingEngine } from '../scorer/ranking-engine.js';
import { PreparedQueryTestItem, TrackerQualityEvaluator } from './tracker-quality-evaluator.js';
import { TrackerQualityComparisonReport, TrackerRankingOptions } from './tracker-signal-types.js';

export interface TrackerBenchmarkCliOptions {
  trackerWeight?: number;
  cleanSiteBoost?: number;
  trackingPenalty?: number;
  heavyTrackingPenalty?: number;
  k?: number;
}

export async function runTrackerQualityBenchmark(
  options: TrackerBenchmarkCliOptions = {},
): Promise<TrackerQualityComparisonReport> {
  const index = createInvertedIndex();
  const processor = createDocumentProcessor();
  const parser = createQueryParser();
  const retriever = createCandidateRetriever(index);

  // 1. Add fixture documents
  index.addDocument(
    processor.process({
      id: 'doc-clean-privacy',
      url: 'https://privacyguides.org/tools/search',
      title: 'Private Search Engine Guides and Tools',
      headings: 'Private Search Open Source',
      description: 'Privacy search tools with no trackers.',
      bodyText: 'Comprehensive private search engine guides and open source search tools with zero third party telemetry.',
      language: 'en',
    }),
  );

  index.addDocument(
    processor.process({
      id: 'doc-standard-telemetry',
      url: 'https://techblog.com/search-tools',
      title: 'Top Search Tools and Web Engines',
      headings: 'Top Search Tools Web Engines',
      description: 'Search tools overview with standard analytics.',
      bodyText: 'Guide to search engines and tools for searching the open web with standard analytics telemetry and web search tools.',
      language: 'en',
    }),
  );

  index.addDocument(
    processor.process({
      id: 'doc-heavy-tracking',
      url: 'https://adnetwork-portal.com/search-engines',
      title: 'Search Tools Directory and Ad Analytics',
      headings: 'Search Directory Ad Tools',
      description: 'Search directory with invasive ad telemetry.',
      bodyText: 'Search tools directory with heavy canvas fingerprinting, session recording replay scripts, and cross-site tracking tools.',
      language: 'en',
    }),
  );

  index.addDocument(
    processor.process({
      id: 'doc-unverified-wiki',
      url: 'https://en.wikipedia.org/wiki/Search_engine',
      title: 'Search Engine History and Mechanics',
      headings: 'Search Engine History Algorithms',
      description: 'Wikipedia search engine mechanics.',
      bodyText: 'Information retrieval search engine architecture, inverted indexes, BM25 ranking algorithms, and crawl spiders.',
      language: 'en',
    }),
  );

  // 2. Mock tracker classifications
  const classificationMap = new Map<string, TrackerClassificationResult>();

  classificationMap.set('doc-clean-privacy', {
    documentUrl: 'https://privacyguides.org/tools/search',
    documentOrigin: 'https://privacyguides.org',
    documentRegistrableDomain: 'privacyguides.org',
    status: 'no_trackers_detected',
    confidence: 'high',
    totalResources: 8,
    firstPartyCount: 8,
    thirdPartyCount: 0,
    trackerCount: 0,
    trackers: [],
    thirdPartyOrigins: [],
    firstPartyOrigins: ['https://privacyguides.org'],
    categoriesDetected: [],
    evidence: {
      htmlLength: 4200,
      hasHead: true,
      hasBody: true,
      hasValidStructure: true,
      analyzedTagCounts: { script: 4, link: 2, img: 2 },
      beaconCount: 0,
      rationale: 'All 8 subresource(s) originate from first-party origins; zero third-party telemetry detected.',
    },
    classifiedAt: new Date().toISOString(),
  });

  classificationMap.set('doc-standard-telemetry', {
    documentUrl: 'https://techblog.com/search-tools',
    documentOrigin: 'https://techblog.com',
    documentRegistrableDomain: 'techblog.com',
    status: 'trackers_detected',
    confidence: 'high',
    totalResources: 12,
    firstPartyCount: 10,
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
      {
        matchedDomain: 'hotjar.com',
        trackerName: 'Hotjar',
        category: 'analytics',
        owner: 'Hotjar Ltd',
        provenance: 'EasyPrivacy',
        license: 'CC BY-SA 4.0',
        updatedAt: '2026-10-27',
        resource: {
          rawUrl: 'https://static.hotjar.com/c/hotjar-123.js',
          resolvedUrl: 'https://static.hotjar.com/c/hotjar-123.js',
          origin: 'https://static.hotjar.com',
          hostname: 'static.hotjar.com',
          registrableDomain: 'hotjar.com',
          resourceType: 'script',
          originCategory: 'third-party',
          tagName: 'script',
          isPixelBeacon: false,
        },
      },
    ],
    thirdPartyOrigins: ['https://www.google-analytics.com', 'https://static.hotjar.com'],
    firstPartyOrigins: ['https://techblog.com'],
    categoriesDetected: ['analytics'],
    evidence: {
      htmlLength: 6800,
      hasHead: true,
      hasBody: true,
      hasValidStructure: true,
      analyzedTagCounts: { script: 6, link: 3, img: 3 },
      beaconCount: 0,
      rationale: 'Identified 2 known tracker(s) across 2 third-party subresource(s).',
    },
    classifiedAt: new Date().toISOString(),
  });

  classificationMap.set('doc-heavy-tracking', {
    documentUrl: 'https://adnetwork-portal.com/search-engines',
    documentOrigin: 'https://adnetwork-portal.com',
    documentRegistrableDomain: 'adnetwork-portal.com',
    status: 'trackers_detected',
    confidence: 'high',
    totalResources: 25,
    firstPartyCount: 5,
    thirdPartyCount: 20,
    trackerCount: 6,
    trackers: [
      {
        matchedDomain: 'doubleclick.net',
        trackerName: 'Google DoubleClick',
        category: 'advertising',
        owner: 'Google LLC',
        provenance: 'EasyPrivacy',
        license: 'CC BY-SA 4.0',
        updatedAt: '2026-10-27',
        resource: {
          rawUrl: 'https://securepubads.g.doubleclick.net/gampad/ads',
          resolvedUrl: 'https://securepubads.g.doubleclick.net/gampad/ads',
          origin: 'https://securepubads.g.doubleclick.net',
          hostname: 'securepubads.g.doubleclick.net',
          registrableDomain: 'doubleclick.net',
          resourceType: 'script',
          originCategory: 'third-party',
          tagName: 'script',
          isPixelBeacon: false,
        },
      },
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
    thirdPartyOrigins: ['https://securepubads.g.doubleclick.net', 'https://edge.fullstory.com'],
    firstPartyOrigins: ['https://adnetwork-portal.com'],
    categoriesDetected: ['advertising', 'session-recording'],
    evidence: {
      htmlLength: 12000,
      hasHead: true,
      hasBody: true,
      hasValidStructure: true,
      analyzedTagCounts: { script: 15, link: 4, img: 6 },
      beaconCount: 2,
      rationale: 'Identified 6 known tracker(s) including intrusive categories session-recording.',
    },
    classifiedAt: new Date().toISOString(),
  });

  // Wikipedia is unverified
  classificationMap.set('doc-unverified-wiki', {
    documentUrl: 'https://en.wikipedia.org/wiki/Search_engine',
    documentOrigin: 'https://en.wikipedia.org',
    documentRegistrableDomain: 'wikipedia.org',
    status: 'unverified',
    confidence: 'low',
    totalResources: 0,
    firstPartyCount: 0,
    thirdPartyCount: 0,
    trackerCount: 0,
    trackers: [],
    thirdPartyOrigins: [],
    firstPartyOrigins: ['https://en.wikipedia.org'],
    categoriesDetected: [],
    evidence: {
      htmlLength: 200,
      hasHead: false,
      hasBody: false,
      hasValidStructure: false,
      analyzedTagCounts: {},
      beaconCount: 0,
      rationale: 'Document lacked structural head/body tags for complete classification.',
    },
    classifiedAt: new Date().toISOString(),
  });

  const rankingEngine = new DefaultRankingEngine({ index });

  // 3. Prepare queries with authentic candidate retrieval
  const querySpecs: Array<{
    id: string;
    queryText: string;
    qrels: Record<string, 0 | 1 | 2 | 3>;
  }> = [
    {
      id: 'q1',
      queryText: 'search tools',
      qrels: {
        'doc-clean-privacy': 3,
        'doc-standard-telemetry': 2,
        'doc-heavy-tracking': 1,
      },
    },
    {
      id: 'q2',
      queryText: 'private search',
      qrels: {
        'doc-clean-privacy': 3,
        'doc-standard-telemetry': 1,
      },
    },
    {
      id: 'q3',
      queryText: 'search engine architecture',
      qrels: {
        'doc-unverified-wiki': 3,
        'doc-standard-telemetry': 1,
      },
    },
  ];

  const queries: PreparedQueryTestItem[] = querySpecs.map(spec => {
    const parsed = parser.parse(spec.queryText);
    const retrieval = retriever.retrieve(parsed, { mode: 'union' });
    return {
      id: spec.id,
      queryText: spec.queryText,
      candidates: retrieval.candidates,
      qrels: spec.qrels,
    };
  });

  const trackerOpts: Partial<TrackerRankingOptions> = {
    weight: options.trackerWeight ?? 0.20,
    cleanSiteBoost: options.cleanSiteBoost ?? 1.15,
    trackingPenalty: options.trackingPenalty ?? 0.85,
    heavyTrackingPenalty: options.heavyTrackingPenalty ?? 0.70,
  };

  return TrackerQualityEvaluator.compareQuality(
    rankingEngine,
    queries,
    classificationMap,
    {
      datasetName: 'controlled-tracker-corpus',
      split: 'benchmark',
      trackerOptions: trackerOpts,
      k: options.k ?? 10,
    },
  );
}
