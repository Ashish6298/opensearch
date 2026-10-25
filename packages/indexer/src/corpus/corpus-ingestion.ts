/**
 * @opensearch/indexer — Corpus Ingestion & Verification Pipeline (Phase 75)
 *
 * Provides a repeatable, audited ingestion workflow for loading permitted
 * datasets into the durable storage engine:
 * - Validates source provenance and dataset licensing compliance
 * - Deduplication via canonical URL hashes and content hashes
 * - Respects crawl permissions and zero-scraping compliance
 * - Seamless integration with StorageAdapter and IndexBuilder
 * - Records verified document metrics and execution timings
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { StorageAdapter, INDEX_STATUS } from '@opensearch/storage';
import {
  CorpusDocument,
  CorpusIngestionResult,
  CorpusManifest,
} from './corpus-types.js';
import { PERMITTED_CORPUS_SOURCES } from './demo-corpus.js';

export interface IngestionOptions {
  /** Skip documents that already exist in storage without throwing an error */
  skipDuplicates?: boolean;
  /** Storage batch size for insertions */
  batchSize?: number;
  /** Validate that each document belongs to a recognized permitted open license */
  enforceLicenseCompliance?: boolean;
}

function computeSha256(text: string): string {
  return createHash('sha256').update(text, 'utf-8').digest('hex');
}

/**
 * Validates document fields and open license compliance.
 */
export function validateCorpusDocument(
  doc: CorpusDocument,
  enforceLicense: boolean = true
): { valid: boolean; error?: string } {
  if (!doc.id || typeof doc.id !== 'string') {
    return { valid: false, error: 'Document missing valid id string' };
  }
  if (!doc.canonicalUrl || !doc.canonicalUrl.startsWith('http')) {
    return { valid: false, error: `Invalid canonical URL: ${doc.canonicalUrl}` };
  }
  if (!doc.title || doc.title.trim().length === 0) {
    return { valid: false, error: `Document ${doc.id} missing title` };
  }
  if (!doc.bodyText || doc.bodyText.trim().length === 0) {
    return { valid: false, error: `Document ${doc.id} missing bodyText` };
  }
  if (!doc.urlHash || doc.urlHash.length !== 64) {
    return { valid: false, error: `Document ${doc.id} has invalid 64-char SHA-256 urlHash` };
  }
  if (!doc.contentHash || doc.contentHash.length !== 64) {
    return { valid: false, error: `Document ${doc.id} has invalid 64-char SHA-256 contentHash` };
  }

  if (enforceLicense) {
    if (!doc.source || !PERMITTED_CORPUS_SOURCES[doc.source]) {
      return {
        valid: false,
        error: `Document ${doc.id} has unverified source: ${doc.source}. Permitted: ${Object.keys(PERMITTED_CORPUS_SOURCES).join(', ')}`,
      };
    }
    if (!doc.license || doc.license.trim().length === 0) {
      return { valid: false, error: `Document ${doc.id} missing license terms` };
    }
  }

  return { valid: true };
}

/**
 * Ingests a collection of CorpusDocument items into the storage engine.
 */
export async function ingestCorpus(
  documents: CorpusDocument[],
  storage: StorageAdapter,
  options: IngestionOptions = {}
): Promise<CorpusIngestionResult> {
  const startTime = Date.now();
  const skipDuplicates = options.skipDuplicates ?? true;
  const enforceLicense = options.enforceLicenseCompliance ?? true;

  let inserted = 0;
  let duplicatesSkipped = 0;
  const errors: string[] = [];

  const seenContentHashes = new Set<string>();

  for (const doc of documents) {
    // 1. Validation
    const validation = validateCorpusDocument(doc, enforceLicense);
    if (!validation.valid) {
      errors.push(validation.error || 'Validation error');
      continue;
    }

    // 2. In-batch content hash deduplication
    if (seenContentHashes.has(doc.contentHash)) {
      duplicatesSkipped++;
      continue;
    }

    try {
      // 3. Storage insertion
      await storage.documents.create({
        url: doc.canonicalUrl,
        urlHash: doc.urlHash,
        title: doc.title,
        description: doc.description || doc.title,
        headings: doc.headings || '',
        bodyText: doc.bodyText,
        language: doc.language || 'en',
        contentType: 'text/html; charset=UTF-8',
        contentLength: doc.contentLength || Buffer.byteLength(doc.bodyText, 'utf-8'),
        httpStatus: 200,
        contentHash: doc.contentHash,
        outboundLinks: doc.outboundLinks || [],
        indexStatus: INDEX_STATUS.NOT_INDEXED,
      });

      seenContentHashes.add(doc.contentHash);
      inserted++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (skipDuplicates && (msg.includes('already exists') || msg.includes('Duplicate'))) {
        duplicatesSkipped++;
      } else {
        errors.push(`Doc ${doc.id} insertion failed: ${msg}`);
      }
    }
  }

  // Calculate manifest summary
  let totalWords = 0;
  let totalBytes = 0;
  const sourceStats: Record<string, { count: number; license: string; termsUrl: string }> = {};

  for (const doc of documents) {
    totalWords += doc.wordCount;
    totalBytes += doc.contentLength;
    if (!sourceStats[doc.source]) {
      const meta = PERMITTED_CORPUS_SOURCES[doc.source];
      sourceStats[doc.source] = {
        count: 0,
        license: meta?.license || doc.license,
        termsUrl: meta?.termsUrl || doc.licenseUrl,
      };
    }
    sourceStats[doc.source]!.count++;
  }

  const sortedHashes = documents.map(d => d.contentHash).sort();
  const contentChecksum = computeSha256(sortedHashes.join(':'));

  const manifest: CorpusManifest = {
    tier: documents.length <= 1000 ? 'demo' : documents.length <= 10000 ? 'benchmark' : 'large',
    documentCount: documents.length,
    totalWords,
    totalBytes,
    averageDocumentLength: Math.round((totalWords / (documents.length || 1)) * 10) / 10,
    uniqueVocabularyCount: 0, // Ingestion skips vocabulary re-parse for performance
    generatedAt: new Date().toISOString(),
    reproducibleSeed: 'ingested-external',
    sources: sourceStats,
    contentChecksum,
  };

  return {
    totalProcessed: documents.length,
    inserted,
    duplicatesSkipped,
    durationMs: Date.now() - startTime,
    manifest,
    errors,
  };
}

/**
 * Loads a JSONL formatted corpus from disk.
 */
export function loadCorpusFromFile(filePath: string): CorpusDocument[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Corpus file not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim().length > 0);

  return lines.map((line, idx) => {
    try {
      return JSON.parse(line) as CorpusDocument;
    } catch (e) {
      throw new Error(`Failed to parse corpus JSON line ${idx + 1}: ${e}`);
    }
  });
}

/**
 * Verifies that an in-memory or loaded corpus matches its expected manifest checksum.
 */
export function verifyCorpusChecksum(documents: CorpusDocument[], expectedChecksum: string): boolean {
  const sortedHashes = documents.map(d => d.contentHash).sort();
  const actualChecksum = computeSha256(sortedHashes.join(':'));
  return actualChecksum === expectedChecksum;
}
