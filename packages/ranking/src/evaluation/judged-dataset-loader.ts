/**
 * @opensearch/ranking — Judged Dataset Loader & Privacy Validator (Phase 90)
 *
 * Implements validation, privacy inspection, filtering, and split extraction
 * for search quality evaluation datasets:
 * - 100% Offline execution without external dependencies
 * - Privacy Scanner ensuring zero PII, raw query logs, or session tokens
 * - Rigorous schema integrity validation (grades, categories, splits, counts)
 * - Filtering by partition (tuning vs held-out) and category
 */

import {
  DatasetSplit,
  JudgedDataset,
  JudgedDatasetFilterOptions,
  JudgedQuery,
  JudgedQueryCategory,
  RelevanceGrade,
} from './judged-dataset-types.js';
import { CI_JUDGED_DATASET } from './datasets/ci-judged-dataset.js';

// Common PII and credential patterns for privacy assurance
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b/;
const IPV4_REGEX = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;
const SESSION_COOKIE_REGEX = /\b(?:session_id|jwt|bearer|auth_token|cookie_id)=[a-zA-Z0-9_\-.]+/i;
const PHONE_REGEX = /\b(?:\+?1[-.]?)?\(?[2-9]\d{2}\)?[-.]?\d{3}[-.]?\d{4}\b/;

/**
 * Validates dataset structural integrity and schema conformity.
 */
export function validateJudgedDataset(dataset: JudgedDataset): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!dataset) {
    return { valid: false, errors: ['Dataset is null or undefined'] };
  }

  if (dataset.schemaVersion !== '1.0.0') {
    errors.push(`Invalid schemaVersion "${dataset.schemaVersion}" — expected "1.0.0"`);
  }

  if (!dataset.name || typeof dataset.name !== 'string') {
    errors.push('Dataset name is required');
  }

  if (!dataset.provenance) {
    errors.push('Provenance metadata is required');
  } else {
    if (!dataset.provenance.license) errors.push('Provenance license is required');
    if (!dataset.provenance.methodology) errors.push('Provenance methodology is required');
    if (!dataset.provenance.privacyAssurance) errors.push('Provenance privacyAssurance is required');
  }

  if (!Array.isArray(dataset.queries)) {
    errors.push('Queries array is missing or invalid');
    return { valid: false, errors };
  }

  const allowedCategories = new Set<JudgedQueryCategory>([
    'everyday',
    'education',
    'programming',
    'research',
    'ambiguous',
  ]);
  const allowedSplits = new Set<DatasetSplit>(['tuning', 'held_out']);

  let totalJudgments = 0;
  const observedCategoryCounts: Record<JudgedQueryCategory, number> = {
    everyday: 0,
    education: 0,
    programming: 0,
    research: 0,
    ambiguous: 0,
  };
  const observedSplitCounts: Record<DatasetSplit, number> = {
    tuning: 0,
    held_out: 0,
  };
  const seenIds = new Set<string>();

  for (let i = 0; i < dataset.queries.length; i++) {
    const q = dataset.queries[i]!;
    const prefix = `Query[${i}] (id: ${q.id || 'unknown'})`;

    if (!q.id) errors.push(`${prefix}: missing id`);
    if (seenIds.has(q.id)) errors.push(`${prefix}: duplicate query id "${q.id}"`);
    seenIds.add(q.id);

    if (!q.query || typeof q.query !== 'string') errors.push(`${prefix}: missing query text`);
    if (!allowedCategories.has(q.category)) errors.push(`${prefix}: invalid category "${q.category}"`);
    if (!allowedSplits.has(q.split)) errors.push(`${prefix}: invalid split "${q.split}"`);
    if (!q.intent) errors.push(`${prefix}: missing intent description`);

    if (allowedCategories.has(q.category)) observedCategoryCounts[q.category]++;
    if (allowedSplits.has(q.split)) observedSplitCounts[q.split]++;

    if (!Array.isArray(q.judgments) || q.judgments.length === 0) {
      errors.push(`${prefix}: judgments array must contain at least one graded document`);
    } else {
      totalJudgments += q.judgments.length;
      for (let j = 0; j < q.judgments.length; j++) {
        const doc = q.judgments[j]!;
        const docPrefix = `${prefix}.judgment[${j}] (doc: ${doc.documentId || 'unknown'})`;

        if (!doc.documentId) errors.push(`${docPrefix}: missing documentId`);
        if (!doc.url) errors.push(`${docPrefix}: missing url`);
        if (!doc.title) errors.push(`${docPrefix}: missing title`);
        if (![0, 1, 2, 3].includes(doc.grade)) {
          errors.push(`${docPrefix}: grade must be an integer in 0..3, got ${doc.grade}`);
        }
        if (!doc.rationale) errors.push(`${docPrefix}: missing rationale`);
      }
    }
  }

  // Count consistency checks
  if (dataset.queryCount !== dataset.queries.length) {
    errors.push(`queryCount metadata (${dataset.queryCount}) does not match queries.length (${dataset.queries.length})`);
  }
  if (dataset.totalJudgments !== totalJudgments) {
    errors.push(`totalJudgments metadata (${dataset.totalJudgments}) does not match actual count (${totalJudgments})`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Scans all queries, intents, and rationales to ensure zero personal information is present.
 */
export function scanDatasetForPrivacyViolations(dataset: JudgedDataset): {
  clean: boolean;
  findings: string[];
} {
  const findings: string[] = [];

  for (const q of dataset.queries) {
    const textPool = [q.query, q.intent, q.ambiguityNotes ?? ''];
    for (const doc of q.judgments) {
      textPool.push(doc.title);
      textPool.push(doc.rationale);
      if (doc.snippet) textPool.push(doc.snippet);
    }

    const combined = textPool.join(' ');

    if (EMAIL_REGEX.test(combined)) {
      findings.push(`Query "${q.id}": potential email address detected`);
    }
    if (IPV4_REGEX.test(combined)) {
      // Allow RFC-1918 loopback in tests only if documented, otherwise reject
      findings.push(`Query "${q.id}": potential IP address detected`);
    }
    if (SESSION_COOKIE_REGEX.test(combined)) {
      findings.push(`Query "${q.id}": potential session identifier or cookie detected`);
    }
    if (PHONE_REGEX.test(combined)) {
      findings.push(`Query "${q.id}": potential telephone number detected`);
    }
  }

  return {
    clean: findings.length === 0,
    findings,
  };
}

/**
 * Retrieves the tuning subset of queries for parameter estimation.
 */
export function getTuningQueries(dataset: JudgedDataset = CI_JUDGED_DATASET): JudgedQuery[] {
  return dataset.queries.filter(q => q.split === 'tuning');
}

/**
 * Retrieves the held-out validation subset of queries for unbiased evaluation.
 */
export function getHeldOutQueries(dataset: JudgedDataset = CI_JUDGED_DATASET): JudgedQuery[] {
  return dataset.queries.filter(q => q.split === 'held_out');
}

/**
 * Retrieves queries for a specific category.
 */
export function getQueriesByCategory(
  category: JudgedQueryCategory,
  dataset: JudgedDataset = CI_JUDGED_DATASET,
): JudgedQuery[] {
  return dataset.queries.filter(q => q.category === category);
}

/**
 * Flexible query filter by category, split, and search term.
 */
export function filterJudgedDataset(
  dataset: JudgedDataset = CI_JUDGED_DATASET,
  options: JudgedDatasetFilterOptions = {},
): JudgedQuery[] {
  return dataset.queries.filter(q => {
    if (options.split && q.split !== options.split) {
      return false;
    }
    if (options.category) {
      if (Array.isArray(options.category)) {
        if (!options.category.includes(q.category)) return false;
      } else if (q.category !== options.category) {
        return false;
      }
    }
    if (options.minJudgments && q.judgments.length < options.minJudgments) {
      return false;
    }
    if (options.search) {
      const s = options.search.toLowerCase();
      if (!q.query.toLowerCase().includes(s) && !q.intent.toLowerCase().includes(s)) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Converts a JudgedQuery into a fast lookup Map of documentId -> RelevanceGrade.
 */
export function getIdealQrels(query: JudgedQuery): Map<string, RelevanceGrade> {
  const map = new Map<string, RelevanceGrade>();
  for (const doc of query.judgments) {
    map.set(doc.documentId, doc.grade);
  }
  return map;
}
