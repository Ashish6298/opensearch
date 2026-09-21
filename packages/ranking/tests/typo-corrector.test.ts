import { describe, it, expect, beforeEach } from 'vitest';
import { createDocumentProcessor, createInvertedIndex, InvertedIndex } from '@opensearch/indexer';
import {
  damerauLevenshteinDistance,
  createTypoToleranceEngine,
  TypoToleranceEngine,
} from '../src/index.js';

describe('Typo Tolerance & "Did You Mean?" Engine (Phase 36)', () => {
  let index: InvertedIndex;
  let engine: TypoToleranceEngine;
  const processor = createDocumentProcessor();

  beforeEach(() => {
    index = createInvertedIndex();

    index.addDocument(
      processor.process({
        id: 'doc-py',
        url: 'https://python.org',
        title: 'Python Programming Language',
        bodyText: 'Python is a high-level programming language with dynamic semantics.',
      }),
    );

    index.addDocument(
      processor.process({
        id: 'doc-ts',
        url: 'https://typescriptlang.org',
        title: 'TypeScript Language Reference',
        bodyText: 'TypeScript adds optional static typing to JavaScript.',
      }),
    );

    index.addDocument(
      processor.process({
        id: 'doc-search',
        url: 'https://opensearch.dev',
        title: 'OpenSearch Inverted Index Engine',
        bodyText: 'Inverted index retrieval algorithms and ranking engine benchmarks.',
      }),
    );

    engine = createTypoToleranceEngine(index);
  });

  describe('Damerau-Levenshtein Distance Algorithm', () => {
    it('computes exact match as distance 0', () => {
      expect(damerauLevenshteinDistance('python', 'python')).toBe(0);
      expect(damerauLevenshteinDistance('', '')).toBe(0);
    });

    it('handles single character insertion, deletion, substitution', () => {
      expect(damerauLevenshteinDistance('pythn', 'python')).toBe(1); // insertion
      expect(damerauLevenshteinDistance('pythons', 'python')).toBe(1); // deletion
      expect(damerauLevenshteinDistance('pythan', 'python')).toBe(1); // substitution
    });

    it('correctly handles adjacent character transpositions as 1 edit', () => {
      expect(damerauLevenshteinDistance('pyhton', 'python')).toBe(1); // transposition
      expect(damerauLevenshteinDistance('tyepscript', 'typescript')).toBe(1);
    });

    it('computes 2 edits for multi-error typos', () => {
      expect(damerauLevenshteinDistance('typescrt', 'typescript')).toBe(2);
      expect(damerauLevenshteinDistance('opensrch', 'opensearch')).toBe(2);
    });
  });

  describe('Did You Mean Query Correction', () => {
    it('detects single-word typos and suggests exact dictionary match', () => {
      const res = engine.suggestCorrection('pythn');
      expect(res).not.toBeNull();
      expect(res?.suggestedQuery).toBe('python');
      expect(res?.originalQuery).toBe('pythn');
      expect(res?.confidence).toBeGreaterThan(0.6);
    });

    it('detects typos in multi-word query strings', () => {
      const res = engine.suggestCorrection('typescrt tutorial');
      expect(res).not.toBeNull();
      expect(res?.suggestedQuery).toBe('typescript tutorial');
      expect(res?.correctedTerms[0]?.original).toBe('typescrt');
      expect(res?.correctedTerms[0]?.corrected).toBe('typescript');
    });

    it('returns null when query already has exact valid terms', () => {
      const res = engine.suggestCorrection('python programming');
      expect(res).toBeNull();
    });

    it('safely handles empty or excessively short queries', () => {
      expect(engine.suggestCorrection('')).toBeNull();
      expect(engine.suggestCorrection('a')).toBeNull();
      expect(engine.suggestCorrection('   ')).toBeNull();
    });

    it('executes typo correction with sub-5ms latency', () => {
      const start = performance.now();
      for (let i = 0; i < 50; i++) {
        engine.suggestCorrection('pythn languge');
      }
      const avgMs = (performance.now() - start) / 50;
      expect(avgMs).toBeLessThan(5.0);
    });
  });
});
