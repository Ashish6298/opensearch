/**
 * @opensearch/indexer — Index Lifecycle Validator & Integrity Auditor (Phase 73)
 *
 * Provides comprehensive schema validation, corruption detection, and integrity checks:
 * 1. Validates schema version compatibility and format signatures.
 * 2. Detects truncated, empty (0-byte), or syntactically invalid JSON files.
 * 3. Detects dangling temporary files (*.tmp) left by crashed or interrupted build processes.
 * 4. Audits statistical consistency (totalDocuments vs document array count).
 * 5. Audits referential integrity (ensuring posting references match indexed document IDs).
 * 6. Generates diagnostic metrics and actionable recovery instructions for operators.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  INDEX_FILE_NAME,
  INDEX_FORMAT_IDENTIFIER,
  INDEX_TMP_FILE_NAME,
  SUPPORTED_INDEX_SCHEMA_VERSIONS,
  SerializedIndexPayload,
} from './index-types.js';

export interface IndexValidationResult {
  /** Whether the index is valid and safe to load */
  valid: boolean;
  /** Schema version detected in payload */
  schemaVersion: number | null;
  /** Whether the failure is due to an incompatible schema version */
  incompatibleSchema?: boolean;
  /** List of fatal errors that prevent index loading */
  errors: string[];
  /** Non-fatal warnings */
  warnings: string[];
  /** Actionable recovery or rebuild advice */
  recoverySuggestion?: string;
  /** Diagnostic metadata for logs and support */
  diagnostics?: {
    filePath: string;
    fileSizeBytes: number;
    documentCount: number;
    termCount: number;
    hasDanglingTmpFile: boolean;
    checksum?: string;
  };
}

/**
 * Computes deterministic SHA-256 checksum over sorted document IDs and dictionary terms.
 */
export function computeIndexChecksum(
  payload: Pick<SerializedIndexPayload, 'documents' | 'dictionary'>,
): string {
  const hash = crypto.createHash('sha256');

  // Hash sorted document IDs
  const docIds = (payload.documents || [])
    .map(d => d.documentId)
    .sort()
    .join('|');
  hash.update(`docs:${docIds}`);

  // Hash sorted dictionary terms with doc frequencies
  const terms = (payload.dictionary || [])
    .map(item => `${item.term}:${item.documentFrequency}`)
    .sort()
    .join('|');
  hash.update(`terms:${terms}`);

  return hash.digest('hex');
}

/**
 * Validates an in-memory or parsed index payload object.
 */
export function validateIndexPayload(
  payload: any,
  filePath = '',
  fileSizeBytes = 0,
): IndexValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!payload || typeof payload !== 'object') {
    return {
      valid: false,
      schemaVersion: null,
      errors: ['Index payload is null or not a valid JSON object'],
      warnings: [],
      recoverySuggestion:
        "Index payload is corrupt. Run 'opensearch index --rebuild' or call indexBuilder.build({ mode: 'full' }) to reconstruct.",
    };
  }

  // 1. Schema version check
  const version = payload.schemaVersion ?? payload.version;
  const isNumber = typeof version === 'number';

  if (!isNumber) {
    errors.push('Missing explicit schema version in index payload');
  } else if (!SUPPORTED_INDEX_SCHEMA_VERSIONS.includes(version)) {
    return {
      valid: false,
      schemaVersion: version,
      incompatibleSchema: true,
      errors: [
        `Index schema version ${version} is incompatible with engine version (supported: [${SUPPORTED_INDEX_SCHEMA_VERSIONS.join(', ')}])`,
      ],
      warnings: [],
      recoverySuggestion:
        "Perform a full index rebuild to upgrade the index data to the current schema version.",
      diagnostics: {
        filePath,
        fileSizeBytes,
        documentCount: Array.isArray(payload.documents) ? payload.documents.length : 0,
        termCount: Array.isArray(payload.dictionary) ? payload.dictionary.length : 0,
        hasDanglingTmpFile: false,
      },
    };
  }

  // 2. Format signature check
  if (payload.format && payload.format !== INDEX_FORMAT_IDENTIFIER) {
    warnings.push(
      `Index format identifier "${payload.format}" differs from standard "${INDEX_FORMAT_IDENTIFIER}"`,
    );
  }

  // 3. Structural section checks
  if (!Array.isArray(payload.documents)) {
    errors.push('Missing or invalid "documents" collection (expected array)');
  }
  if (!Array.isArray(payload.dictionary)) {
    errors.push('Missing or invalid "dictionary" collection (expected array)');
  }
  if (!payload.stats || typeof payload.stats !== 'object') {
    errors.push('Missing or invalid "stats" metadata section');
  }

  if (errors.length > 0) {
    return {
      valid: false,
      schemaVersion: isNumber ? version : null,
      errors,
      warnings,
      recoverySuggestion:
        "Index data structure is malformed. Execute a full re-index via CLI or indexBuilder.build({ mode: 'full' }).",
    };
  }

  // 4. Statistical and referential consistency
  const docCount = payload.documents.length;
  const termCount = payload.dictionary.length;

  if (typeof payload.stats.totalDocuments === 'number' && payload.stats.totalDocuments !== docCount) {
    errors.push(
      `Statistical inconsistency: stats.totalDocuments (${payload.stats.totalDocuments}) does not match documents array length (${docCount})`,
    );
  }

  if (typeof payload.stats.totalTerms === 'number' && payload.stats.totalTerms !== termCount) {
    warnings.push(
      `Statistical variance: stats.totalTerms (${payload.stats.totalTerms}) does not match dictionary array length (${termCount})`,
    );
  }

  // Verify unique document IDs
  const docIdSet = new Set<string>();
  for (let i = 0; i < payload.documents.length; i++) {
    const doc = payload.documents[i];
    if (!doc || !doc.documentId) {
      errors.push(`Document at index ${i} is missing required "documentId"`);
    } else if (docIdSet.has(doc.documentId)) {
      errors.push(`Duplicate documentId detected: "${doc.documentId}"`);
    } else {
      docIdSet.add(doc.documentId);
    }
  }

  // Audit dictionary terms and check for orphaned postings
  let orphanedPostingsCount = 0;
  for (const item of payload.dictionary) {
    if (!item || typeof item.term !== 'string' || !item.term.trim()) {
      errors.push('Dictionary contains entry with missing or empty term');
      continue;
    }

    if (!Array.isArray(item.postings)) {
      errors.push(`Postings for term "${item.term}" is not an array`);
      continue;
    }

    for (const posting of item.postings) {
      if (!posting || !posting.documentId || !docIdSet.has(posting.documentId)) {
        orphanedPostingsCount++;
      }
    }
  }

  if (orphanedPostingsCount > 0) {
    errors.push(
      `Referential integrity violation: detected ${orphanedPostingsCount} orphaned posting reference(s) to nonexistent documents`,
    );
  }

  // Checksum verification if present
  if (payload.checksum) {
    const expected = computeIndexChecksum(payload);
    if (payload.checksum !== expected) {
      warnings.push(
        `Index checksum mismatch (stored: ${payload.checksum.slice(0, 8)}..., calculated: ${expected.slice(0, 8)}...)`,
      );
    }
  }

  const valid = errors.length === 0;

  return {
    valid,
    schemaVersion: version,
    errors,
    warnings,
    recoverySuggestion: valid
      ? undefined
      : "Index integrity validation failed. Rebuild the index from corpus storage via indexBuilder.build({ mode: 'full' }).",
    diagnostics: {
      filePath,
      fileSizeBytes,
      documentCount: docCount,
      termCount,
      hasDanglingTmpFile: false,
      checksum: payload.checksum,
    },
  };
}

/**
 * Inspects, audits, and validates an index file or directory on disk.
 */
export function validateIndexFile(filePathOrDir: string): IndexValidationResult {
  const cleanPath = path.resolve(filePathOrDir);

  if (!fs.existsSync(cleanPath)) {
    return {
      valid: false,
      schemaVersion: null,
      errors: [`Index path does not exist: "${cleanPath}"`],
      warnings: [],
      recoverySuggestion:
        "Index directory or file missing. Initialize index using indexBuilder.build({ mode: 'full' }).",
    };
  }

  let targetFile = cleanPath;
  let targetDir = cleanPath;
  const isDir = fs.statSync(cleanPath).isDirectory();

  if (isDir) {
    targetDir = cleanPath;
    targetFile = path.join(cleanPath, INDEX_FILE_NAME);
  } else {
    targetDir = path.dirname(cleanPath);
  }

  // Detect dangling .tmp files indicating an interrupted atomic write
  const tmpFile = path.join(targetDir, INDEX_TMP_FILE_NAME);
  const hasDanglingTmp = fs.existsSync(tmpFile);

  if (!fs.existsSync(targetFile)) {
    if (hasDanglingTmp) {
      return {
        valid: false,
        schemaVersion: null,
        errors: [
          `Index file "${INDEX_FILE_NAME}" is missing, but a dangling temporary build file "${INDEX_TMP_FILE_NAME}" was found, indicating a crashed or interrupted write`,
        ],
        warnings: [],
        recoverySuggestion:
          "An index build was interrupted before atomic promotion. Clean up temporary files and execute a full rebuild.",
        diagnostics: {
          filePath: targetFile,
          fileSizeBytes: 0,
          documentCount: 0,
          termCount: 0,
          hasDanglingTmpFile: true,
        },
      };
    }

    return {
      valid: false,
      schemaVersion: null,
      errors: [`Index file not found at: "${targetFile}"`],
      warnings: [],
      recoverySuggestion:
        "Index file missing. Initialize a new index by executing a full build.",
    };
  }

  const stats = fs.statSync(targetFile);

  // Check for 0-byte or truncated file
  if (stats.size === 0) {
    return {
      valid: false,
      schemaVersion: null,
      errors: [`Index file at "${targetFile}" is empty (0 bytes)`],
      warnings: hasDanglingTmp ? ['Dangling .tmp file detected in index directory'] : [],
      recoverySuggestion:
        "Index file was truncated or prematurely created. Delete the empty file and run a full rebuild.",
      diagnostics: {
        filePath: targetFile,
        fileSizeBytes: 0,
        documentCount: 0,
        termCount: 0,
        hasDanglingTmpFile: hasDanglingTmp,
      },
    };
  }

  let rawContent: string;
  try {
    rawContent = fs.readFileSync(targetFile, 'utf-8');
  } catch (err: any) {
    return {
      valid: false,
      schemaVersion: null,
      errors: [`Failed to read index file: ${err.message}`],
      warnings: [],
      recoverySuggestion:
        "Check file system permissions and accessibility on the index directory.",
    };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(rawContent);
  } catch (err: any) {
    return {
      valid: false,
      schemaVersion: null,
      errors: [`Index file contains corrupted or invalid JSON: ${err.message}`],
      warnings: hasDanglingTmp ? ['Dangling .tmp file detected in index directory'] : [],
      recoverySuggestion:
        "The index file is corrupt. Reconstruct the index by running 'opensearch index --rebuild' or indexBuilder.build({ mode: 'full' }).",
      diagnostics: {
        filePath: targetFile,
        fileSizeBytes: stats.size,
        documentCount: 0,
        termCount: 0,
        hasDanglingTmpFile: hasDanglingTmp,
      },
    };
  }

  const result = validateIndexPayload(parsed, targetFile, stats.size);
  if (hasDanglingTmp) {
    result.warnings.push(
      `Dangling temporary file "${INDEX_TMP_FILE_NAME}" detected in directory; recommended to purge stale build artifacts.`,
    );
    if (result.diagnostics) {
      result.diagnostics.hasDanglingTmpFile = true;
    }
  }

  return result;
}
