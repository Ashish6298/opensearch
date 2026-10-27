/**
 * @opensearch/ranking — Phase 90: Judged Query Dataset Test Suite
 *
 * Comprehensive tests for:
 * 1. Structural Schema & Integrity Validation (CI & Full datasets)
 * 2. 5-Category Coverage (Everyday, Education, Programming, Research, Ambiguous)
 * 3. Partitioning: Strict separation of Tuning vs Held-out evaluation splits
 * 4. Graded Relevance Labels: 4-level scale (0..3) with valid rationales and ideal orderings
 * 5. Privacy & Zero-Telemetry: Automated scan for zero personal data, IPs, emails, or session tokens
 * 6. Offline JSON Loading: Validates disk artifacts match runtime definitions
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  CI_JUDGED_DATASET,
  FULL_JUDGED_DATASET,
  validateJudgedDataset,
  scanDatasetForPrivacyViolations,
  getTuningQueries,
  getHeldOutQueries,
  getQueriesByCategory,
  filterJudgedDataset,
  getIdealQrels,
  JudgedDataset,
} from '../src/index.js';

describe('Phase 90 — Judged Query Dataset & Quality Lab Suite', () => {
  describe('1. Schema & Structural Integrity Validation', () => {
    it('validates CI_JUDGED_DATASET with zero schema errors', () => {
      const validation = validateJudgedDataset(CI_JUDGED_DATASET);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);

      expect(CI_JUDGED_DATASET.schemaVersion).toBe('1.0.0');
      expect(CI_JUDGED_DATASET.queryCount).toBe(20);
      expect(CI_JUDGED_DATASET.totalJudgments).toBe(63);
    });

    it('validates FULL_JUDGED_DATASET with zero schema errors', () => {
      const validation = validateJudgedDataset(FULL_JUDGED_DATASET);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);

      expect(FULL_JUDGED_DATASET.schemaVersion).toBe('1.0.0');
      expect(FULL_JUDGED_DATASET.queryCount).toBe(40);
      expect(FULL_JUDGED_DATASET.totalJudgments).toBe(106);
    });

    it('detects and flags malformed datasets', () => {
      const malformed: any = {
        schemaVersion: '2.0.0', // invalid version
        name: 'bad-dataset',
        provenance: {}, // missing fields
        queryCount: 1,
        totalJudgments: 1,
        queries: [
          {
            id: 'bad-q1',
            query: 'bad query',
            category: 'unsupported-cat',
            split: 'invalid-split',
            intent: 'test',
            judgments: [
              {
                documentId: 'd1',
                url: 'http://example.com',
                title: 'title',
                grade: 99, // invalid grade
                rationale: '',
              },
            ],
          },
        ],
      };

      const result = validateJudgedDataset(malformed);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(4);
      expect(result.errors.some(e => e.includes('schemaVersion'))).toBe(true);
      expect(result.errors.some(e => e.includes('category'))).toBe(true);
      expect(result.errors.some(e => e.includes('grade'))).toBe(true);
    });
  });

  describe('2. 5-Category Taxonomy & Representation', () => {
    it('covers all five required query categories in both datasets', () => {
      const expectedCategories = ['everyday', 'education', 'programming', 'research', 'ambiguous'] as const;

      for (const cat of expectedCategories) {
        const ciQueries = getQueriesByCategory(cat, CI_JUDGED_DATASET);
        expect(ciQueries.length).toBeGreaterThanOrEqual(4);

        const fullQueries = getQueriesByCategory(cat, FULL_JUDGED_DATASET);
        expect(fullQueries.length).toBeGreaterThanOrEqual(8);
      }
    });

    it('ensures ambiguous queries document multi-intent disambiguation notes', () => {
      const ambiguousQueries = getQueriesByCategory('ambiguous', CI_JUDGED_DATASET);
      expect(ambiguousQueries.length).toBe(4);

      for (const q of ambiguousQueries) {
        expect(q.ambiguityNotes).toBeDefined();
        expect(q.ambiguityNotes!.length).toBeGreaterThan(10);

        // Ambiguous queries must contain at least 2 distinct documents with grade >= 2 representing different senses
        const relevantDocs = q.judgments.filter(j => j.grade >= 2);
        expect(relevantDocs.length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe('3. Partition Separation (Tuning vs Held-Out)', () => {
    it('maintains mutually exclusive and exhaustive splits', () => {
      const tuning = getTuningQueries(CI_JUDGED_DATASET);
      const heldOut = getHeldOutQueries(CI_JUDGED_DATASET);

      expect(tuning.length).toBe(10);
      expect(heldOut.length).toBe(10);
      expect(tuning.length + heldOut.length).toBe(CI_JUDGED_DATASET.queries.length);

      const tuningIds = new Set(tuning.map(q => q.id));
      for (const h of heldOut) {
        expect(tuningIds.has(h.id)).toBe(false);
      }
    });

    it('filters dataset by split and category flexibly', () => {
      const progTuning = filterJudgedDataset(CI_JUDGED_DATASET, {
        category: 'programming',
        split: 'tuning',
      });
      expect(progTuning.length).toBe(2);
      expect(progTuning.every(q => q.category === 'programming' && q.split === 'tuning')).toBe(true);

      const researchHeldOut = filterJudgedDataset(FULL_JUDGED_DATASET, {
        category: 'research',
        split: 'held_out',
      });
      expect(researchHeldOut.length).toBe(4);
    });
  });

  describe('4. Graded Relevance Labels & Annotations', () => {
    it('ensures every query has at least one perfect (grade 3) document', () => {
      for (const q of CI_JUDGED_DATASET.queries) {
        const perfectDocs = q.judgments.filter(j => j.grade === 3);
        expect(perfectDocs.length).toBeGreaterThanOrEqual(1);

        for (const doc of q.judgments) {
          expect([0, 1, 2, 3]).toContain(doc.grade);
          expect(doc.rationale.length).toBeGreaterThan(15);
        }
      }
    });

    it('generates fast Qrels lookup mapping and respects ideal order', () => {
      const q = CI_JUDGED_DATASET.queries.find(item => item.id === 'q-prog-01')!;
      const qrels = getIdealQrels(q);

      expect(qrels.get('doc-ts-generic-constraints')).toBe(3);
      expect(qrels.get('doc-ts-mapped-types')).toBe(2);
      expect(qrels.get('doc-javascript-prototype-chain')).toBe(0);

      // Verify idealOrder matches descending grades
      expect(q.idealOrder).toEqual([
        'doc-ts-generic-constraints',
        'doc-ts-mapped-types',
        'doc-javascript-prototype-chain',
      ]);
    });
  });

  describe('5. Privacy & Zero-Telemetry Audit', () => {
    it('guarantees zero PII, raw query logs, IPs, or cookies across all queries and rationales', () => {
      const ciScan = scanDatasetForPrivacyViolations(CI_JUDGED_DATASET);
      expect(ciScan.clean).toBe(true);
      expect(ciScan.findings).toEqual([]);

      const fullScan = scanDatasetForPrivacyViolations(FULL_JUDGED_DATASET);
      expect(fullScan.clean).toBe(true);
      expect(fullScan.findings).toEqual([]);
    });

    it('verifies explicit provenance, licensing, and privacy assurance metadata', () => {
      const prov = CI_JUDGED_DATASET.provenance;
      expect(prov.license).toContain('CC0-1.0');
      expect(prov.privacyAssurance).toContain('No real-world search histories');
      expect(prov.annotationRubricVersion).toBe('v1.0.0-graded-4level');
    });
  });

  describe('6. Offline Filesystem JSON Artifacts', () => {
    it('verifies data/quality/ci-judged-dataset.json matches runtime dataset', () => {
      const filePath = path.resolve('data/quality/ci-judged-dataset.json');
      expect(fs.existsSync(filePath)).toBe(true);

      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed: JudgedDataset = JSON.parse(raw);

      const validation = validateJudgedDataset(parsed);
      expect(validation.valid).toBe(true);
      expect(parsed.name).toBe(CI_JUDGED_DATASET.name);
      expect(parsed.queryCount).toBe(CI_JUDGED_DATASET.queryCount);
    });

    it('verifies data/quality/full-judged-dataset.json matches runtime dataset', () => {
      const filePath = path.resolve('data/quality/full-judged-dataset.json');
      expect(fs.existsSync(filePath)).toBe(true);

      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed: JudgedDataset = JSON.parse(raw);

      const validation = validateJudgedDataset(parsed);
      expect(validation.valid).toBe(true);
      expect(parsed.name).toBe(FULL_JUDGED_DATASET.name);
      expect(parsed.queryCount).toBe(FULL_JUDGED_DATASET.queryCount);
    });
  });
});
