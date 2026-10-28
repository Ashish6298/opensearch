/**
 * @opensearch/ranking — Builtin Focus Lenses (Phase 101)
 *
 * Implements the 6 required initial Focus Lens ranking profiles:
 * 1. General: Balanced neutral baseline.
 * 2. Student: Educational materials, encyclopedias, open textbooks.
 * 3. Developer: Official language docs, specs, code repositories.
 * 4. Research: Academic preprints, DOI registries, scientific publications.
 * 5. Trusted Health Sources: Public health agencies, medical libraries (source preference, non-endorsement).
 * 6. No-Trackers: Low telemetry, privacy-preserving origins with tracker penalties.
 */

import {
  CURRENT_LENS_SCHEMA_VERSION,
  FocusLensProfile,
  HEALTH_LENS_DISCLAIMER,
  NO_TRACKERS_LENS_DISCLAIMER,
} from './lens-types.js';

export const GENERAL_LENS: Readonly<FocusLensProfile> = {
  schemaVersion: CURRENT_LENS_SCHEMA_VERSION,
  id: 'general',
  name: 'General',
  description: 'Standard, balanced web search with neutral relevance scoring across all topics.',
  icon: '🌐',
  isBuiltin: true,
  boostDomains: [],
  demoteDomains: [],
  excludeDomains: [],
  metadata: {
    author: 'OpenSearch Core',
    version: '1.0.0',
    license: 'MIT',
    updatedAt: '2026-10-28',
    tags: ['general', 'default', 'balanced'],
  },
};

export const STUDENT_LENS: Readonly<FocusLensProfile> = {
  schemaVersion: CURRENT_LENS_SCHEMA_VERSION,
  id: 'student',
  name: 'Student',
  description: 'Prioritizes educational resources, open textbooks, accredited universities, and encyclopedic reference material.',
  icon: '🎓',
  isBuiltin: true,
  boostDomains: [
    { pattern: '*.edu', multiplier: 1.5, reason: 'Accredited university or educational institution' },
    { pattern: 'wikipedia.org', multiplier: 1.4, reason: 'Peer-edited encyclopedic overview' },
    { pattern: 'khanacademy.org', multiplier: 1.6, reason: 'Foundational course materials' },
    { pattern: 'openstax.org', multiplier: 1.6, reason: 'Peer-reviewed open educational textbooks' },
    { pattern: 'britannica.com', multiplier: 1.35, reason: 'Curated reference encyclopedia' },
    { pattern: 'mit.edu', multiplier: 1.5, reason: 'MIT OpenCourseWare and academic resources' },
    { pattern: 'stanford.edu', multiplier: 1.4, reason: 'Stanford academic curriculum and publications' },
    { pattern: 'coursera.org', multiplier: 1.25, reason: 'University course curricula' },
  ],
  demoteDomains: [
    { pattern: 'chegg.com', multiplier: 0.5, reason: 'Commercial paywalled homework solutions' },
    { pattern: 'coursehero.com', multiplier: 0.5, reason: 'Paywalled study guides and homework mirrors' },
    { pattern: 'buzzfeed.com', multiplier: 0.4, reason: 'Entertainment clickbait' },
  ],
  excludeDomains: [],
  rankingWeights: {
    domainAuthorityWeight: 0.20,
  },
  metadata: {
    author: 'OpenSearch Core',
    version: '1.0.0',
    license: 'MIT',
    updatedAt: '2026-10-28',
    tags: ['education', 'learning', 'academics'],
  },
};

export const DEVELOPER_LENS: Readonly<FocusLensProfile> = {
  schemaVersion: CURRENT_LENS_SCHEMA_VERSION,
  id: 'developer',
  name: 'Developer',
  description: 'Prioritizes official programming language documentations, technical standards, and open-source repositories.',
  icon: '💻',
  isBuiltin: true,
  boostDomains: [
    { pattern: 'github.com', multiplier: 1.5, reason: 'Open-source code repositories and issue discussions' },
    { pattern: 'stackoverflow.com', multiplier: 1.35, reason: 'Community technical Q&A' },
    { pattern: 'developer.mozilla.org', multiplier: 1.8, reason: 'Authoritative web platform documentation' },
    { pattern: 'rust-lang.org', multiplier: 1.6, reason: 'Official Rust language docs' },
    { pattern: 'python.org', multiplier: 1.6, reason: 'Official Python documentation' },
    { pattern: 'golang.org', multiplier: 1.6, reason: 'Official Go documentation' },
    { pattern: 'typescriptlang.org', multiplier: 1.6, reason: 'Official TypeScript documentation' },
    { pattern: 'w3.org', multiplier: 1.5, reason: 'Web standards specifications' },
    { pattern: 'docs.rs', multiplier: 1.5, reason: 'Rust crate documentation' },
    { pattern: 'kernel.org', multiplier: 1.5, reason: 'Linux kernel documentation and sources' },
  ],
  demoteDomains: [
    { pattern: 'w3schools.com', multiplier: 0.85, reason: 'Prioritize official MDN / W3C documentation over SEO summaries' },
    { pattern: 'geeksforgeeks.org', multiplier: 0.75, reason: 'SEO content farm summaries' },
  ],
  excludeDomains: [],
  rankingWeights: {
    freshnessWeight: 0.15,
  },
  metadata: {
    author: 'OpenSearch Core',
    version: '1.0.0',
    license: 'MIT',
    updatedAt: '2026-10-28',
    tags: ['coding', 'programming', 'software'],
  },
};

export const RESEARCH_LENS: Readonly<FocusLensProfile> = {
  schemaVersion: CURRENT_LENS_SCHEMA_VERSION,
  id: 'research',
  name: 'Research',
  description: 'Prioritizes academic preprints, scientific registries, and peer-reviewed journals.',
  icon: '🔬',
  isBuiltin: true,
  boostDomains: [
    { pattern: 'arxiv.org', multiplier: 1.8, reason: 'Open-access academic preprints' },
    { pattern: 'biorxiv.org', multiplier: 1.8, reason: 'Life sciences preprints' },
    { pattern: 'nature.com', multiplier: 1.6, reason: 'Peer-reviewed scientific journals' },
    { pattern: 'ncbi.nlm.nih.gov', multiplier: 1.7, reason: 'National Center for Biotechnology Information' },
    { pattern: 'ieee.org', multiplier: 1.6, reason: 'Technical computer science and engineering literature' },
    { pattern: 'acm.org', multiplier: 1.6, reason: 'Computing machinery research library' },
    { pattern: 'semanticscholar.org', multiplier: 1.5, reason: 'AI-assisted scholarly search' },
    { pattern: 'openalex.org', multiplier: 1.6, reason: 'Open scholarly citation catalog' },
    { pattern: 'crossref.org', multiplier: 1.4, reason: 'Scholarly DOI registry' },
  ],
  demoteDomains: [
    { pattern: 'quora.com', multiplier: 0.3, reason: 'Unverified user opinions' },
    { pattern: 'medium.com', multiplier: 0.5, reason: 'Informal blog essays' },
  ],
  excludeDomains: [],
  rankingWeights: {
    domainAuthorityWeight: 0.25,
    pageRankWeight: 0.20,
  },
  metadata: {
    author: 'OpenSearch Core',
    version: '1.0.0',
    license: 'MIT',
    updatedAt: '2026-10-28',
    tags: ['science', 'papers', 'academic'],
  },
};

export const TRUSTED_HEALTH_LENS: Readonly<FocusLensProfile> = {
  schemaVersion: CURRENT_LENS_SCHEMA_VERSION,
  id: 'trusted-health',
  name: 'Trusted Health Sources',
  description: 'Prioritizes established public health agencies, national libraries of medicine, and peer-reviewed clinical reference portals.',
  icon: '🏥',
  isBuiltin: true,
  disclaimer: HEALTH_LENS_DISCLAIMER,
  isMedicalEndorsement: false,
  boostDomains: [
    { pattern: 'cdc.gov', multiplier: 1.9, reason: 'Centers for Disease Control and Prevention' },
    { pattern: 'who.int', multiplier: 1.9, reason: 'World Health Organization official guidance' },
    { pattern: 'nih.gov', multiplier: 1.85, reason: 'National Institutes of Health' },
    { pattern: 'pubmed.ncbi.nlm.nih.gov', multiplier: 1.8, reason: 'PubMed peer-reviewed biomedical literature' },
    { pattern: 'nhs.uk', multiplier: 1.8, reason: 'UK National Health Service clinical guidelines' },
    { pattern: 'mayoclinic.org', multiplier: 1.6, reason: 'Non-profit academic medical center' },
    { pattern: 'cochranelibrary.com', multiplier: 1.8, reason: 'Cochrane systemic medical reviews' },
    { pattern: 'medlineplus.gov', multiplier: 1.8, reason: 'National Library of Medicine consumer health portal' },
  ],
  demoteDomains: [
    { pattern: 'naturalnews.com', multiplier: 0.1, reason: 'Unverified alternative medical claims' },
    { pattern: 'wellnessmama.com', multiplier: 0.2, reason: 'Commercial lifestyle blog' },
  ],
  excludeDomains: [],
  rankingWeights: {
    domainAuthorityWeight: 0.25,
  },
  metadata: {
    author: 'OpenSearch Core',
    version: '1.0.0',
    license: 'MIT',
    updatedAt: '2026-10-28',
    tags: ['health', 'medicine', 'reference'],
  },
};

export const NO_TRACKERS_LENS: Readonly<FocusLensProfile> = {
  schemaVersion: CURRENT_LENS_SCHEMA_VERSION,
  id: 'no-trackers',
  name: 'No-Trackers',
  description: 'Emphasizes privacy-preserving, zero-tracker web destinations and suppresses invasive tracking telemetry.',
  icon: '🛡️',
  isBuiltin: true,
  disclaimer: NO_TRACKERS_LENS_DISCLAIMER,
  isMedicalEndorsement: false,
  boostDomains: [
    { pattern: 'wikipedia.org', multiplier: 1.4, reason: 'Zero third-party commercial trackers' },
    { pattern: 'gnu.org', multiplier: 1.4, reason: 'Privacy-respecting free software portal' },
    { pattern: 'eff.org', multiplier: 1.5, reason: 'Digital rights and privacy advocacy' },
    { pattern: 'privacyguides.org', multiplier: 1.5, reason: 'Independent privacy recommendations' },
  ],
  demoteDomains: [
    { pattern: 'doubleclick.net', multiplier: 0.1, reason: 'Pervasive ad tracking network' },
    { pattern: 'adservice.google.com', multiplier: 0.1, reason: 'Ad tracking network' },
    { pattern: 'facebook.com', multiplier: 0.3, reason: 'Cross-site social tracking pixel network' },
  ],
  excludeDomains: [
    'outbrain.com',
    'taboola.com',
  ],
  rankingWeights: {
    trackerSignalWeight: 0.35,
    enableTrackerSignal: true,
  },
  metadata: {
    author: 'OpenSearch Core',
    version: '1.0.0',
    license: 'MIT',
    updatedAt: '2026-10-28',
    tags: ['privacy', 'anti-tracking', 'telemetry'],
  },
};

export const BUILTIN_LENSES: readonly FocusLensProfile[] = [
  GENERAL_LENS,
  STUDENT_LENS,
  DEVELOPER_LENS,
  RESEARCH_LENS,
  TRUSTED_HEALTH_LENS,
  NO_TRACKERS_LENS,
];

const BUILTIN_LENSES_MAP = new Map<string, FocusLensProfile>(
  BUILTIN_LENSES.map(lens => [lens.id, lens]),
);

export function getBuiltinLens(id: string): FocusLensProfile | undefined {
  if (!id) return undefined;
  return BUILTIN_LENSES_MAP.get(id.trim().toLowerCase());
}

export function isBuiltinLensId(id: string): boolean {
  if (!id) return false;
  return BUILTIN_LENSES_MAP.has(id.trim().toLowerCase());
}
