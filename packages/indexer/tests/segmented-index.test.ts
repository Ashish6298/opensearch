import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  computeManifestChecksum,
  createDocumentProcessor,
  exportSegmentBenchmarkMarkdown,
  getDemoCorpus,
  loadSegmentManifest,
  mergeSegments,
  recoverOrCleanDanglingSegments,
  runSegmentJustificationBenchmark,
  saveSegmentManifestAtomic,
  SegmentedInvertedIndex,
} from '../src/index.js';

describe('Phase 97 — Segment-Based Indexing & Compaction', () => {
  const tempDirs: string[] = [];

  function makeTempDir(prefix: string = 'opensearch-seg-test-'): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tempDirs) {
      if (fs.existsSync(dir)) {
        try {
          fs.rmSync(dir, { recursive: true, force: true });
        } catch {
          // ignore cleanup failures
        }
      }
    }
    tempDirs.length = 0;
  });

  const processor = createDocumentProcessor();
  const demoDocs = getDemoCorpus();

  describe('1. Segment Manifest Controller & Atomic Publication', () => {
    it('saves and loads manifest atomically with valid checksum', () => {
      const indexDir = makeTempDir();

      const manifest = saveSegmentManifestAtomic(indexDir, {
        schemaVersion: 1,
        generation: 1,
        activeSegments: [],
        stats: {
          totalDocuments: 0,
          totalTerms: 0,
          totalPostings: 0,
          avgDocumentLength: 0,
          avgFieldLengths: {},
          lastUpdatedAt: new Date().toISOString(),
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      expect(manifest.checksum).toBeDefined();
      expect(manifest.generation).toBe(1);

      const loaded = loadSegmentManifest(indexDir);
      expect(loaded).toBeDefined();
      expect(loaded?.checksum).toBe(manifest.checksum);
      expect(loaded?.generation).toBe(1);
    });

    it('detects and rejects tampered manifest with checksum error', () => {
      const indexDir = makeTempDir();

      saveSegmentManifestAtomic(indexDir, {
        schemaVersion: 1,
        generation: 1,
        activeSegments: [],
        stats: {
          totalDocuments: 0,
          totalTerms: 0,
          totalPostings: 0,
          avgDocumentLength: 0,
          avgFieldLengths: {},
          lastUpdatedAt: new Date().toISOString(),
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Tamper with manifest file
      const manifestPath = path.join(indexDir, 'manifest.json');
      const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      raw.generation = 999; // Tampered without updating checksum
      fs.writeFileSync(manifestPath, JSON.stringify(raw), 'utf-8');

      expect(() => loadSegmentManifest(indexDir)).toThrow(/checksum mismatch/);
    });
  });

  describe('2. Segment Creation & Multi-Segment Querying', () => {
    it('flushes in-memory documents to immutable segments and queries across them', async () => {
      const indexDir = makeTempDir();
      const index = new SegmentedInvertedIndex({ indexDir });

      // Ingest Batch 1 (Docs 1 & 2)
      index.addDocument(
        processor.process({
          id: 'doc-1',
          url: 'https://example.com/doc-1',
          title: 'Search Engine Architecture',
          description: 'Overview of inverted index structures and query processing.',
          headings: 'Architecture Components',
          bodyText: 'High performance term lookups and posting list retrieval.',
          language: 'en',
        }),
      );
      index.addDocument(
        processor.process({
          id: 'doc-2',
          url: 'https://example.com/doc-2',
          title: 'Distributed Systems Consensus',
          description: 'Raft consensus algorithm for reliable replicated state machines.',
          headings: 'Consensus Quorum',
          bodyText: 'Leader election and log replication algorithms.',
          language: 'en',
        }),
      );

      const seg1 = await index.flushSegment();
      expect(seg1).toBeDefined();
      expect(seg1?.documentCount).toBe(2);
      expect(index.getActiveSegmentCount()).toBe(1);

      // Ingest Batch 2 (Doc 3)
      index.addDocument(
        processor.process({
          id: 'doc-3',
          url: 'https://example.com/doc-3',
          title: 'Database Storage Performance',
          description: 'LSM tree and B-tree storage engines compared.',
          headings: 'LSM Tree B-tree',
          bodyText: 'Search engine postings compression and retrieval performance.',
          language: 'en',
        }),
      );

      const seg2 = await index.flushSegment();
      expect(seg2).toBeDefined();
      expect(seg2?.documentCount).toBe(1);
      expect(index.getActiveSegmentCount()).toBe(2);

      // Query postings across both segments
      const searchPostings = index.getPostings('search');
      expect(searchPostings).toBeDefined();
      expect(searchPostings?.length).toBe(2);
      expect(searchPostings?.map(p => p.documentId)).toContain('doc-1');
      expect(searchPostings?.map(p => p.documentId)).toContain('doc-3');

      // Verify metadata lookup across segments
      const doc2Meta = index.getDocumentMeta('doc-2');
      expect(doc2Meta?.title).toBe('Distributed Systems Consensus');

      // Verify stats
      const stats = index.getStats();
      expect(stats.totalDocuments).toBe(3);
      expect(stats.totalTerms).toBeGreaterThan(10);
    });

    it('persists and rehydrates segmented index from disk', async () => {
      const indexDir = makeTempDir();
      const index1 = new SegmentedInvertedIndex({ indexDir });

      for (let i = 0; i < 3; i++) {
        const template = demoDocs[i]!;
        index1.addDocument(
          processor.process({
            id: `rehydrate-doc-${i + 1}`,
            url: template.canonicalUrl,
            title: template.title,
            description: template.description || '',
            headings: template.headings || '',
            bodyText: template.bodyText || '',
            language: 'en',
          }),
        );
      }
      await index1.save();

      // Create new instance and load from disk
      const index2 = new SegmentedInvertedIndex({ indexDir });
      await index2.load();

      expect(index2.getActiveSegmentCount()).toBe(1);
      const stats = index2.getStats();
      expect(stats.totalDocuments).toBe(3);
      expect(index2.getPostings('the') || index2.getPostings('and')).toBeDefined();
    });
  });

  describe('3. Deterministic Segment Merge & Compaction', () => {
    it('merges multiple segments into a single consolidated segment and deletes obsolete files', async () => {
      const indexDir = makeTempDir();
      const index = new SegmentedInvertedIndex({ indexDir });

      // Create 3 separate segments
      for (let s = 1; s <= 3; s++) {
        index.addDocument(
          processor.process({
            id: `merge-doc-${s}`,
            url: `https://example.com/doc-${s}`,
            title: `Document ${s} for Merge Testing`,
            description: `Description ${s}`,
            headings: `Heading ${s}`,
            bodyText: `Common shared term search performance segment ${s}.`,
            language: 'en',
          }),
        );
        await index.flushSegment();
      }

      expect(index.getActiveSegmentCount()).toBe(3);

      // Run compaction
      const mergeResult = await index.compact();
      expect(mergeResult).toBeDefined();
      expect(mergeResult?.inputSegmentIds.length).toBe(3);
      expect(mergeResult?.documentsMerged).toBe(3);
      expect(mergeResult?.obsoleteSegmentsDeleted.length).toBe(3);

      // Verify active segments count consolidated to 1
      expect(index.getActiveSegmentCount()).toBe(1);

      // Verify queryability post-merge
      const postings = index.getPostings('search');
      expect(postings?.length).toBe(3);
      expect(postings?.map(p => p.documentId).sort()).toEqual(['merge-doc-1', 'merge-doc-2', 'merge-doc-3']);

      // Verify manifest was incremented
      const manifest = loadSegmentManifest(indexDir);
      expect(manifest?.activeSegments.length).toBe(1);
      expect(manifest?.activeSegments[0]?.segmentId).toBe(mergeResult?.mergedSegmentId);
    });
  });

  describe('4. Crash Recovery & Interrupted Merge Invariant', () => {
    it('preserves the previous valid index state when a merge is interrupted before activation', async () => {
      const indexDir = makeTempDir();
      const index = new SegmentedInvertedIndex({ indexDir });

      // Create 2 segments
      index.addDocument(
        processor.process({
          id: 'crash-doc-1',
          url: 'https://example.com/1',
          title: 'First Document',
          bodyText: 'Valid first segment.',
          language: 'en',
        }),
      );
      await index.flushSegment();

      index.addDocument(
        processor.process({
          id: 'crash-doc-2',
          url: 'https://example.com/2',
          title: 'Second Document',
          bodyText: 'Valid second segment.',
          language: 'en',
        }),
      );
      await index.flushSegment();

      const manifestBefore = loadSegmentManifest(indexDir);
      expect(manifestBefore?.activeSegments.length).toBe(2);

      // Attempt merge with simulated crash prior to manifest activation
      const segIds = manifestBefore!.activeSegments.map(s => s.segmentId);
      await expect(
        mergeSegments(indexDir, segIds, { simulateCrashBeforeActivation: true }),
      ).rejects.toThrow(/SIMULATED_CRASH/);

      // 1. Assert previous manifest is STILL completely valid and untouched
      const manifestAfterCrash = loadSegmentManifest(indexDir);
      expect(manifestAfterCrash?.generation).toBe(manifestBefore?.generation);
      expect(manifestAfterCrash?.activeSegments.length).toBe(2);

      // 2. Assert index reboots and queries both original segments with zero data loss
      const reloadedIndex = new SegmentedInvertedIndex({ indexDir });
      await reloadedIndex.load();
      expect(reloadedIndex.getStats().totalDocuments).toBe(2);
      expect(reloadedIndex.hasDocument('crash-doc-1')).toBe(true);
      expect(reloadedIndex.hasDocument('crash-doc-2')).toBe(true);

      // 3. Run recovery to clean dangling files left by the interrupted merge
      const recoveryReport = reloadedIndex.recover();
      expect(recoveryReport.recovered).toBe(true);
      expect(recoveryReport.danglingFilesPurged.length).toBeGreaterThanOrEqual(1);

      // Cleaned index remains fully functional
      expect(reloadedIndex.getStats().totalDocuments).toBe(2);
    });
  });

  describe('5. Empirical Justification Benchmark', () => {
    it('demonstrates write amplification reduction and verifies determinism', async () => {
      const report = await runSegmentJustificationBenchmark({
        batchCount: 3,
        docsPerBatch: 3,
      });

      expect(report.totalBatches).toBe(3);
      expect(report.totalDocuments).toBe(9);
      expect(report.monolithicTotalBytes).toBeGreaterThan(report.segmentedTotalBytes);
      expect(report.ioReductionFactor).toBeGreaterThan(1.0);
      expect(report.deterministicEquivalenceVerified).toBe(true);
      expect(report.crashRecoveryVerified).toBe(true);

      // Verify Markdown export
      const md = exportSegmentBenchmarkMarkdown(report);
      expect(md).toContain('# OpenSearch Segment-Based Indexing Justification Report');
      expect(md).toContain('I/O Write Amplification Reduction');
      expect(md).toContain('VERIFIED (100% Match)');
      expect(md).toContain('VERIFIED (Zero Corruption)');
    });
  });
});
