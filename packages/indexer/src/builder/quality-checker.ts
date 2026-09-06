/**
 * @opensearch/indexer — Corpus Quality & Duplicate Analysis (Phase 23)
 *
 * Evaluates document quality, checks for duplicate content (exact URL hash or near-duplicate body hash),
 * validates minimal content requirements, and calculates corpus summary metrics.
 */

import { DocumentRecord, INDEX_STATUS, StorageAdapter } from '@opensearch/storage';
import { createHash } from 'node:crypto';

export interface DocumentQualityReport {
  documentId: string;
  url: string;
  hasTitle: boolean;
  hasDescription: boolean;
  hasHeadings: boolean;
  hasBodyText: boolean;
  bodyWordCount: number;
  qualityScore: number; // 0.0 to 1.0
  isIndexed: boolean;
  isDuplicate: boolean;
  duplicateOfUrl?: string;
}

export interface CorpusQualitySummary {
  totalDocuments: number;
  validDocuments: number;
  thinDocuments: number;
  duplicateDocuments: number;
  averageWordCount: number;
  hasDescriptionRatio: number;
  hasTitleRatio: number;
  overallQualityScore: number;
  evaluatedAt: string;
}

/**
 * Computes a normalized content hash for detecting near-duplicate body text.
 */
export function computeContentHash(text: string): string {
  const normalized = text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  return createHash('sha256').update(normalized, 'utf-8').digest('hex');
}

/**
 * Evaluates the quality score of a single document record.
 * Criteria:
 * - Title present & meaningful: +0.3
 * - Body text >= 50 words: +0.4 (or scaled if < 50)
 * - Headings present: +0.15
 * - Description present: +0.15
 */
export function evaluateDocumentQuality(doc: DocumentRecord): DocumentQualityReport {
  const hasTitle = Boolean(doc.title && doc.title.trim().length > 0);
  const hasDescription = Boolean(doc.description && doc.description.trim().length > 0);
  const hasHeadings = Boolean(doc.headings && doc.headings.trim().length > 0);
  const bodyText = doc.bodyText?.trim() || '';
  const bodyWordCount = bodyText.length > 0 ? bodyText.split(/\s+/).length : 0;
  const hasBodyText = bodyWordCount > 0;

  let qualityScore = 0;
  if (hasTitle) qualityScore += 0.3;
  if (hasDescription) qualityScore += 0.15;
  if (hasHeadings) qualityScore += 0.15;

  if (bodyWordCount >= 50) {
    qualityScore += 0.4;
  } else if (bodyWordCount > 0) {
    qualityScore += (bodyWordCount / 50) * 0.4;
  }

  return {
    documentId: doc.id,
    url: doc.url,
    hasTitle,
    hasDescription,
    hasHeadings,
    hasBodyText,
    bodyWordCount,
    qualityScore: Math.round(qualityScore * 100) / 100,
    isIndexed: doc.indexStatus === INDEX_STATUS.INDEXED,
    isDuplicate: false,
  };
}

/**
 * Evaluates the quality and uniqueness of the entire document corpus in storage.
 */
export async function analyzeCorpusQuality(storage: StorageAdapter): Promise<{
  summary: CorpusQualitySummary;
  reports: DocumentQualityReport[];
}> {
  const allDocs = await storage.documents.list({ limit: 10000 });
  const contentHashMap = new Map<string, string>(); // contentHash -> original url
  const reports: DocumentQualityReport[] = [];

  let totalWords = 0;
  let titleCount = 0;
  let descCount = 0;
  let duplicateCount = 0;
  let thinCount = 0;
  let validCount = 0;
  let totalScore = 0;

  for (const doc of allDocs) {
    const report = evaluateDocumentQuality(doc);
    const textToHash = (doc.bodyText && doc.bodyText.trim().length > 0)
      ? doc.bodyText
      : (doc.title || '');
    const contentHash = computeContentHash(textToHash);

    if (contentHash && contentHashMap.has(contentHash)) {
      report.isDuplicate = true;
      report.duplicateOfUrl = contentHashMap.get(contentHash);
      duplicateCount++;
    } else if (contentHash) {
      contentHashMap.set(contentHash, doc.url);
    }

    if (report.bodyWordCount < 10 && !report.hasTitle) {
      thinCount++;
    } else {
      validCount++;
    }

    if (report.hasTitle) titleCount++;
    if (report.hasDescription) descCount++;
    totalWords += report.bodyWordCount;
    totalScore += report.qualityScore;

    reports.push(report);
  }

  const total = allDocs.length;
  const summary: CorpusQualitySummary = {
    totalDocuments: total,
    validDocuments: validCount,
    thinDocuments: thinCount,
    duplicateDocuments: duplicateCount,
    averageWordCount: total > 0 ? Math.round(totalWords / total) : 0,
    hasTitleRatio: total > 0 ? Math.round((titleCount / total) * 100) / 100 : 0,
    hasDescriptionRatio: total > 0 ? Math.round((descCount / total) * 100) / 100 : 0,
    overallQualityScore: total > 0 ? Math.round((totalScore / total) * 100) / 100 : 0,
    evaluatedAt: new Date().toISOString(),
  };

  return { summary, reports };
}
