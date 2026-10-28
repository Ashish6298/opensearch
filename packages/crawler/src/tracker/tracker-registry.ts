/**
 * @opensearch/crawler — Reviewable Tracker Domain Registry (Phase 99)
 *
 * Provides a versioned, licensed, reviewable directory of known third-party
 * tracking, advertising, behavioral telemetry, and fingerprinting domains.
 *
 * Requirements satisfied:
 * - Reviewable tracker-domain list
 * - Explicit provenance for each rule
 * - CC BY-SA 4.0 license attribution
 * - Update timestamp tracking
 * - Fast deterministic matching (exact + subdomain/suffix matching)
 */

import { extractRegistrableDomain } from './domain-utils.js';
import {
  TrackerRegistryEntry,
  TrackerRegistryMetadata,
} from './tracker-types.js';

export const REVIEWABLE_TRACKER_REGISTRY_METADATA: TrackerRegistryMetadata = {
  version: '1.0.0-2026-10-28',
  name: 'OpenSearch Reviewable Privacy & Tracker Registry',
  provenance:
    'Curated and verified from EasyPrivacy, DuckDuckGo Tracker Radar, and Disconnect.me public blocklists',
  license: 'CC BY-SA 4.0 (Creative Commons Attribution-ShareAlike 4.0 International)',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  updatedAt: '2026-10-28T00:00:00.000Z',
  totalDomains: 35,
  maintainer: 'OpenSearch Search Quality & Privacy Working Group',
};

export const REVIEWABLE_TRACKER_ENTRIES: readonly TrackerRegistryEntry[] = [
  // ── 1. Web Analytics & Behavioral Tracking ────────────────────────────────
  {
    domain: 'google-analytics.com',
    name: 'Google Analytics',
    category: 'analytics',
    owner: 'Google LLC',
    provenance: 'DuckDuckGo Tracker Radar & EasyPrivacy',
    license: 'CC BY-SA 4.0',
    updatedAt: '2026-10-28',
    description: 'Cross-site visitor metrics, session tracking, and behavioral analytics',
  },
  {
    domain: 'googletagmanager.com',
    name: 'Google Tag Manager',
    category: 'analytics',
    owner: 'Google LLC',
    provenance: 'DuckDuckGo Tracker Radar & EasyPrivacy',
    license: 'CC BY-SA 4.0',
    updatedAt: '2026-10-28',
    description: 'Dynamic script container used for third-party tag injection and telemetry',
  },
  {
    domain: 'hotjar.com',
    name: 'Hotjar',
    category: 'session-recording',
    owner: 'Hotjar Ltd (Contentsquare)',
    provenance: 'Disconnect.me & EasyPrivacy',
    license: 'CC BY-SA 4.0',
    updatedAt: '2026-10-28',
    description: 'Heatmaps, session replays, and visitor keystroke tracking',
  },
  {
    domain: 'fullstory.com',
    name: 'FullStory',
    category: 'session-recording',
    owner: 'FullStory, Inc.',
    provenance: 'Disconnect.me & EasyPrivacy',
    license: 'CC BY-SA 4.0',
    updatedAt: '2026-10-28',
    description: 'High-fidelity session replay and behavioral telemetry',
  },
  {
    domain: 'segment.com',
    name: 'Segment',
    category: 'analytics',
    owner: 'Twilio Inc.',
    provenance: 'DuckDuckGo Tracker Radar',
    license: 'CC BY-SA 4.0',
    updatedAt: '2026-10-28',
    description: 'Customer data platform aggregating behavioral events for ad targeting',
  },
  {
    domain: 'segment.io',
    name: 'Segment API',
    category: 'analytics',
    owner: 'Twilio Inc.',
    provenance: 'DuckDuckGo Tracker Radar',
    license: 'CC BY-SA 4.0',
    updatedAt: '2026-10-28',
    description: 'API endpoint for streaming event data and telemetry',
  },
  {
    domain: 'mixpanel.com',
    name: 'Mixpanel',
    category: 'analytics',
    owner: 'Mixpanel, Inc.',
    provenance: 'DuckDuckGo Tracker Radar & EasyPrivacy',
    license: 'CC BY-SA 4.0',
    updatedAt: '2026-10-28',
    description: 'User-level event tracking and funnel profiling',
  },
  {
    domain: 'yandex.ru',
    name: 'Yandex Metrika',
    category: 'analytics',
    owner: 'Yandex N.V.',
    provenance: 'EasyPrivacy',
    license: 'CC BY-SA 4.0',
    updatedAt: '2026-10-28',
    description: 'Web analytics, session recording, and scroll map tracking',
  },
  {
    domain: 'clarity.ms',
    name: 'Microsoft Clarity',
    category: 'session-recording',
    owner: 'Microsoft Corporation',
    provenance: 'DuckDuckGo Tracker Radar',
    license: 'CC BY-SA 4.0',
    updatedAt: '2026-10-28',
    description: 'Behavioral session recording and click tracking',
  },
  {
    domain: 'chartbeat.com',
    name: 'Chartbeat',
    category: 'analytics',
    owner: 'Chartbeat Inc.',
    provenance: 'Disconnect.me',
    license: 'CC BY-SA 4.0',
    updatedAt: '2026-10-28',
    description: 'Real-time audience monitoring and engagement tracking',
  },

  // ── 2. Advertising & Retargeting Networks ─────────────────────────────────
  {
    domain: 'doubleclick.net',
    name: 'Google DoubleClick',
    category: 'advertising',
    owner: 'Google LLC',
    provenance: 'EasyPrivacy & Disconnect.me',
    license: 'CC BY-SA 4.0',
    updatedAt: '2026-10-28',
    description: 'Targeted programmatic advertising exchange and conversion tracking',
  },
  {
    domain: 'googlesyndication.com',
    name: 'Google AdSense / Syndication',
    category: 'advertising',
    owner: 'Google LLC',
    provenance: 'EasyPrivacy & Disconnect.me',
    license: 'CC BY-SA 4.0',
    updatedAt: '2026-10-28',
    description: 'Ad network serving personalized behavioral ads',
  },
  {
    domain: 'criteo.com',
    name: 'Criteo',
    category: 'advertising',
    owner: 'Criteo S.A.',
    provenance: 'DuckDuckGo Tracker Radar & EasyPrivacy',
    license: 'CC BY-SA 4.0',
    updatedAt: '2026-10-28',
    description: 'Cross-site retargeting and commercial profile tracking',
  },
  {
    domain: 'criteo.net',
    name: 'Criteo CDN',
    category: 'advertising',
    owner: 'Criteo S.A.',
    provenance: 'DuckDuckGo Tracker Radar & EasyPrivacy',
    license: 'CC BY-SA 4.0',
    updatedAt: '2026-10-28',
    description: 'Ad asset delivery and cross-domain tracking beacons',
  },
  {
    domain: 'taboola.com',
    name: 'Taboola',
    category: 'advertising',
    owner: 'Taboola, Inc.',
    provenance: 'DuckDuckGo Tracker Radar & EasyPrivacy',
    license: 'CC BY-SA 4.0',
    updatedAt: '2026-10-28',
    description: 'Sponsored content network and user interest profiling',
  },
  {
    domain: 'outbrain.com',
    name: 'Outbrain',
    category: 'advertising',
    owner: 'Outbrain Inc.',
    provenance: 'DuckDuckGo Tracker Radar & EasyPrivacy',
    license: 'CC BY-SA 4.0',
    updatedAt: '2026-10-28',
    description: 'Content recommendation and behavioral retargeting',
  },
  {
    domain: 'adnxs.com',
    name: 'AppNexus / Xandr',
    category: 'advertising',
    owner: 'Microsoft Corporation (Xandr)',
    provenance: 'DuckDuckGo Tracker Radar & EasyPrivacy',
    license: 'CC BY-SA 4.0',
    updatedAt: '2026-10-28',
    description: 'Real-time bidding ad exchange with audience profiling',
  },
  {
    domain: 'adsrvr.org',
    name: 'The Trade Desk',
    category: 'advertising',
    owner: 'The Trade Desk, Inc.',
    provenance: 'DuckDuckGo Tracker Radar',
    license: 'CC BY-SA 4.0',
    updatedAt: '2026-10-28',
    description: 'Cross-device unified identifier ad platform',
  },
  {
    domain: 'amazon-adsystem.com',
    name: 'Amazon Advertising',
    category: 'advertising',
    owner: 'Amazon.com, Inc.',
    provenance: 'DuckDuckGo Tracker Radar & EasyPrivacy',
    license: 'CC BY-SA 4.0',
    updatedAt: '2026-10-28',
    description: 'Targeted e-commerce advertising and conversion attribution',
  },
  {
    domain: 'rubiconproject.com',
    name: 'Magnite (Rubicon Project)',
    category: 'advertising',
    owner: 'Magnite, Inc.',
    provenance: 'EasyPrivacy',
    license: 'CC BY-SA 4.0',
    updatedAt: '2026-10-28',
    description: 'Automated advertising marketplace tracking impressions',
  },
  {
    domain: 'pubmatic.com',
    name: 'PubMatic',
    category: 'advertising',
    owner: 'PubMatic, Inc.',
    provenance: 'EasyPrivacy',
    license: 'CC BY-SA 4.0',
    updatedAt: '2026-10-28',
    description: 'Digital advertising publisher platform with user matching',
  },
  {
    domain: 'openx.net',
    name: 'OpenX',
    category: 'advertising',
    owner: 'OpenX Software Ltd.',
    provenance: 'EasyPrivacy',
    license: 'CC BY-SA 4.0',
    updatedAt: '2026-10-28',
    description: 'Programmatic ad server and cookie sync exchange',
  },

  // ── 3. Social Media Beacons & Graph Tracking ──────────────────────────────
  {
    domain: 'facebook.net',
    name: 'Meta / Facebook Pixel',
    category: 'social',
    owner: 'Meta Platforms, Inc.',
    provenance: 'DuckDuckGo Tracker Radar & EasyPrivacy',
    license: 'CC BY-SA 4.0',
    updatedAt: '2026-10-28',
    description: 'Conversion tracking pixel and Facebook social graph integration',
  },
  {
    domain: 'facebook.com',
    name: 'Facebook Social Plugin',
    category: 'social',
    owner: 'Meta Platforms, Inc.',
    provenance: 'Disconnect.me & EasyPrivacy',
    license: 'CC BY-SA 4.0',
    updatedAt: '2026-10-28',
    description: 'Social widgets tracking browsing behavior across partner sites',
  },
  {
    domain: 'tiktok.com',
    name: 'TikTok Pixel',
    category: 'social',
    owner: 'ByteDance Ltd.',
    provenance: 'DuckDuckGo Tracker Radar',
    license: 'CC BY-SA 4.0',
    updatedAt: '2026-10-28',
    description: 'Event monitoring and audience building for TikTok campaigns',
  },
  {
    domain: 'twitter.com',
    name: 'X (Twitter) Advertising',
    category: 'social',
    owner: 'X Corp.',
    provenance: 'Disconnect.me',
    license: 'CC BY-SA 4.0',
    updatedAt: '2026-10-28',
    description: 'Website tag and social share tracking',
  },
  {
    domain: 'ads-twitter.com',
    name: 'Twitter Ad Beacon',
    category: 'advertising',
    owner: 'X Corp.',
    provenance: 'EasyPrivacy',
    license: 'CC BY-SA 4.0',
    updatedAt: '2026-10-28',
    description: 'Static ad tracking scripts for X conversion measurement',
  },

  // ── 4. Audience Measurement & Fingerprinting ──────────────────────────────
  {
    domain: 'scorecardresearch.com',
    name: 'Scorecard Research (Comscore)',
    category: 'fingerprinting',
    owner: 'Comscore, Inc.',
    provenance: 'Disconnect.me & EasyPrivacy',
    license: 'CC BY-SA 4.0',
    updatedAt: '2026-10-28',
    description: 'Digital market census, browser fingerprinting, and behavioral indexing',
  },
  {
    domain: 'quantserve.com',
    name: 'Quantcast',
    category: 'analytics',
    owner: 'Quantcast Corporation',
    provenance: 'Disconnect.me & EasyPrivacy',
    license: 'CC BY-SA 4.0',
    updatedAt: '2026-10-28',
    description: 'Audience demographic measurement and tracking beacons',
  },
  {
    domain: 'voicefive.com',
    name: 'VoiceFive (Comscore)',
    category: 'fingerprinting',
    owner: 'Comscore, Inc.',
    provenance: 'EasyPrivacy',
    license: 'CC BY-SA 4.0',
    updatedAt: '2026-10-28',
    description: 'Survey beacon and audience profiling network',
  },

  // ── 5. Telemetry & Mobile Attribution ────────────────────────────────────
  {
    domain: 'nr-data.net',
    name: 'New Relic RUM Telemetry',
    category: 'telemetry',
    owner: 'New Relic, Inc.',
    provenance: 'EasyPrivacy',
    license: 'CC BY-SA 4.0',
    updatedAt: '2026-10-28',
    description: 'Real User Monitoring (RUM) beacon harvesting browser performance data',
  },
  {
    domain: 'appsflyer.com',
    name: 'AppsFlyer',
    category: 'analytics',
    owner: 'AppsFlyer Ltd.',
    provenance: 'DuckDuckGo Tracker Radar',
    license: 'CC BY-SA 4.0',
    updatedAt: '2026-10-28',
    description: 'Marketing measurement and deep link attribution tracking',
  },
  {
    domain: 'adjust.com',
    name: 'Adjust',
    category: 'analytics',
    owner: 'Adjust GmbH',
    provenance: 'DuckDuckGo Tracker Radar',
    license: 'CC BY-SA 4.0',
    updatedAt: '2026-10-28',
    description: 'Mobile attribution and analytics beacon',
  },
  {
    domain: 'browser-intake-datadoghq.com',
    name: 'Datadog RUM',
    category: 'telemetry',
    owner: 'Datadog, Inc.',
    provenance: 'EasyPrivacy',
    license: 'CC BY-SA 4.0',
    updatedAt: '2026-10-28',
    description: 'Session replay and client-side error telemetry reporting',
  },
  {
    domain: 'sentry-cdn.com',
    name: 'Sentry Replay Telemetry',
    category: 'telemetry',
    owner: 'Functional Software, Inc. (Sentry)',
    provenance: 'DuckDuckGo Tracker Radar',
    license: 'CC BY-SA 4.0',
    updatedAt: '2026-10-28',
    description: 'Session replay and client telemetry script bundle',
  },
];

/**
 * Registry controller managing reviewable tracker lists with fast index lookups.
 */
export class TrackerRegistry {
  private readonly domainMap = new Map<string, TrackerRegistryEntry>();
  public readonly metadata: TrackerRegistryMetadata;

  constructor(
    customEntries?: TrackerRegistryEntry[],
    customMetadata?: TrackerRegistryMetadata,
  ) {
    this.metadata = customMetadata || {
      ...REVIEWABLE_TRACKER_REGISTRY_METADATA,
      totalDomains: (customEntries || REVIEWABLE_TRACKER_ENTRIES).length,
    };

    const entries = customEntries || REVIEWABLE_TRACKER_ENTRIES;
    for (const entry of entries) {
      this.domainMap.set(entry.domain.toLowerCase(), entry);
    }
  }

  /**
   * Matches a hostname or resource URL against the tracker database.
   * Checks exact match first, then subdomain/suffix match.
   */
  matchDomain(hostname: string): TrackerRegistryEntry | null {
    if (!hostname) return null;
    const cleanHost = hostname.trim().toLowerCase().replace(/\.+$/, '');

    // 1. Exact match
    if (this.domainMap.has(cleanHost)) {
      return this.domainMap.get(cleanHost)!;
    }

    // 2. Check registrable domain (eTLD+1)
    const regDomain = extractRegistrableDomain(cleanHost);
    if (regDomain && this.domainMap.has(regDomain)) {
      return this.domainMap.get(regDomain)!;
    }

    // 3. Suffix match (e.g. 'stats.doubleclick.net' -> matches 'doubleclick.net')
    for (const [domain, entry] of this.domainMap.entries()) {
      if (cleanHost.endsWith(`.${domain}`)) {
        return entry;
      }
    }

    return null;
  }

  /**
   * Returns all entries in the registry for operator review and audit.
   */
  getAllEntries(): readonly TrackerRegistryEntry[] {
    return Array.from(this.domainMap.values());
  }

  /**
   * Returns total count of tracked domains.
   */
  get size(): number {
    return this.domainMap.size;
  }
}

let defaultRegistryInstance: TrackerRegistry | null = null;

export function getDefaultTrackerRegistry(): TrackerRegistry {
  if (!defaultRegistryInstance) {
    defaultRegistryInstance = new TrackerRegistry();
  }
  return defaultRegistryInstance;
}
