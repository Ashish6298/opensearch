/**
 * @opensearch/storage — Storage Validation
 * Validates domain model inputs at the storage boundary.
 */

import {
  ConflictError,
  StorageError,
  ValidationError,
  isNonEmptyString,
  sanitizeUrl,
} from '@opensearch/shared';

import {
  CRAWL_STATUS,
  CreateCrawlRecordInput,
  CreateDocumentInput,
  CreateIndexMetadataInput,
  CreateUrlRecordInput,
} from './models.js';

// Operational limits for storage
export const STORAGE_LIMITS = {
  MAX_URL_LENGTH: 2_048,
  MAX_TITLE_LENGTH: 512,
  MAX_DESCRIPTION_LENGTH: 1_024,
  MAX_BODY_TEXT_BYTES: 5 * 1024 * 1024, // 5MB
  MAX_HEADINGS_LENGTH: 4_096,
  MAX_OUTBOUND_LINKS: 5_000,
  MAX_LANGUAGE_CODE_LENGTH: 16,
  MAX_CONTENT_TYPE_LENGTH: 256,
  MAX_ERROR_MESSAGE_LENGTH: 2_048,
} as const;

// ============================================================
// URL validation helper (shared across validators)
// ============================================================

function requireValidUrl(url: string, field: string): void {
  if (!isNonEmptyString(url)) {
    throw new ValidationError(`${field} must be a non-empty string`, {
      code: 'INVALID_URL',
      context: { field },
    });
  }
  if (url.length > STORAGE_LIMITS.MAX_URL_LENGTH) {
    throw new ValidationError(`${field} exceeds maximum length of ${STORAGE_LIMITS.MAX_URL_LENGTH}`, {
      code: 'URL_TOO_LONG',
      context: { field, length: url.length },
    });
  }
  const sanitized = sanitizeUrl(url);
  if (sanitized === null) {
    throw new ValidationError(
      `${field} is not a valid HTTP/HTTPS URL: "${url.slice(0, 100)}"`,
      { code: 'INVALID_URL_SCHEME', context: { field } },
    );
  }
}

function requireNonEmpty(value: string, field: string, maxLength?: number): void {
  if (!isNonEmptyString(value)) {
    throw new ValidationError(`${field} must be a non-empty string`, {
      code: 'REQUIRED_FIELD_EMPTY',
      context: { field },
    });
  }
  if (maxLength !== undefined && value.length > maxLength) {
    throw new ValidationError(`${field} exceeds maximum length of ${maxLength}`, {
      code: 'FIELD_TOO_LONG',
      context: { field, length: value.length, maxLength },
    });
  }
}

// ============================================================
// Document Validation
// ============================================================

export function validateCreateDocumentInput(input: CreateDocumentInput): void {
  if (!input || typeof input !== 'object') {
    throw new ValidationError('Document input must be a non-null object', {
      code: 'INVALID_INPUT',
    });
  }

  requireValidUrl(input.url, 'url');
  requireNonEmpty(input.urlHash, 'urlHash');

  if (typeof input.title !== 'string') {
    throw new ValidationError('title must be a string', { code: 'INVALID_FIELD', context: { field: 'title' } });
  }
  if (input.title.length > STORAGE_LIMITS.MAX_TITLE_LENGTH) {
    throw new ValidationError(`title exceeds maximum length of ${STORAGE_LIMITS.MAX_TITLE_LENGTH}`, {
      code: 'FIELD_TOO_LONG',
      context: { field: 'title' },
    });
  }

  if (typeof input.description !== 'string') {
    throw new ValidationError('description must be a string', { code: 'INVALID_FIELD', context: { field: 'description' } });
  }
  if (input.description.length > STORAGE_LIMITS.MAX_DESCRIPTION_LENGTH) {
    throw new ValidationError(`description exceeds maximum length`, {
      code: 'FIELD_TOO_LONG',
      context: { field: 'description' },
    });
  }

  if (typeof input.bodyText !== 'string') {
    throw new ValidationError('bodyText must be a string', { code: 'INVALID_FIELD', context: { field: 'bodyText' } });
  }
  if (Buffer.byteLength(input.bodyText, 'utf8') > STORAGE_LIMITS.MAX_BODY_TEXT_BYTES) {
    throw new StorageError('bodyText exceeds maximum size limit', {
      code: 'BODY_TEXT_TOO_LARGE',
    });
  }

  if (typeof input.headings !== 'string') {
    throw new ValidationError('headings must be a string', { code: 'INVALID_FIELD', context: { field: 'headings' } });
  }

  if (typeof input.contentType !== 'string' || !isNonEmptyString(input.contentType)) {
    throw new ValidationError('contentType must be a non-empty string', {
      code: 'INVALID_FIELD',
      context: { field: 'contentType' },
    });
  }

  if (typeof input.contentLength !== 'number' || input.contentLength < 0) {
    throw new ValidationError('contentLength must be a non-negative number', {
      code: 'INVALID_FIELD',
      context: { field: 'contentLength' },
    });
  }

  if (typeof input.httpStatus !== 'number' || input.httpStatus < 100 || input.httpStatus > 599) {
    throw new ValidationError('httpStatus must be a valid HTTP status code (100-599)', {
      code: 'INVALID_HTTP_STATUS',
      context: { field: 'httpStatus' },
    });
  }

  if (!Array.isArray(input.outboundLinks)) {
    throw new ValidationError('outboundLinks must be an array', {
      code: 'INVALID_FIELD',
      context: { field: 'outboundLinks' },
    });
  }
  if (input.outboundLinks.length > STORAGE_LIMITS.MAX_OUTBOUND_LINKS) {
    throw new ValidationError(`outboundLinks exceeds maximum count of ${STORAGE_LIMITS.MAX_OUTBOUND_LINKS}`, {
      code: 'TOO_MANY_LINKS',
    });
  }
}

// ============================================================
// URL Record Validation
// ============================================================

export function validateCreateUrlRecordInput(input: CreateUrlRecordInput): void {
  if (!input || typeof input !== 'object') {
    throw new ValidationError('UrlRecord input must be a non-null object', {
      code: 'INVALID_INPUT',
    });
  }
  requireValidUrl(input.url, 'url');
  requireNonEmpty(input.urlHash, 'urlHash');
  requireNonEmpty(input.domain, 'domain');

  if (input.scheme !== 'http' && input.scheme !== 'https') {
    throw new ValidationError('scheme must be either "http" or "https"', {
      code: 'INVALID_SCHEME',
      context: { scheme: input.scheme },
    });
  }

  const validStatuses = Object.values(CRAWL_STATUS) as string[];
  if (!validStatuses.includes(input.crawlStatus)) {
    throw new ValidationError(`crawlStatus must be one of: ${validStatuses.join(', ')}`, {
      code: 'INVALID_CRAWL_STATUS',
      context: { crawlStatus: input.crawlStatus },
    });
  }

  if (typeof input.depth !== 'number' || input.depth < 0) {
    throw new ValidationError('depth must be a non-negative integer', {
      code: 'INVALID_DEPTH',
      context: { depth: input.depth },
    });
  }
}

// ============================================================
// Crawl Record Validation
// ============================================================

export function validateCreateCrawlRecordInput(input: CreateCrawlRecordInput): void {
  if (!input || typeof input !== 'object') {
    throw new ValidationError('CrawlRecord input must be a non-null object', {
      code: 'INVALID_INPUT',
    });
  }
  requireValidUrl(input.url, 'url');
  requireNonEmpty(input.urlHash, 'urlHash');
  requireNonEmpty(input.startedAt, 'startedAt');

  const validStatuses = Object.values(CRAWL_STATUS) as string[];
  if (!validStatuses.includes(input.status)) {
    throw new ValidationError(`Crawl status must be one of: ${validStatuses.join(', ')}`, {
      code: 'INVALID_CRAWL_STATUS',
    });
  }

  if (!Array.isArray(input.redirectChain)) {
    throw new ValidationError('redirectChain must be an array', {
      code: 'INVALID_FIELD',
      context: { field: 'redirectChain' },
    });
  }
}

// ============================================================
// Index Metadata Validation
// ============================================================

export function validateCreateIndexMetadataInput(input: CreateIndexMetadataInput): void {
  if (!input || typeof input !== 'object') {
    throw new ValidationError('IndexMetadata input must be a non-null object', {
      code: 'INVALID_INPUT',
    });
  }
  requireNonEmpty(input.version, 'version');
  requireNonEmpty(input.indexPath, 'indexPath');

  const validStatuses = ['building', 'ready', 'failed', 'stale'] as const;
  if (!validStatuses.includes(input.status as (typeof validStatuses)[number])) {
    throw new ValidationError(`Index status must be one of: ${validStatuses.join(', ')}`, {
      code: 'INVALID_INDEX_STATUS',
    });
  }

  if (typeof input.documentCount !== 'number' || input.documentCount < 0) {
    throw new ValidationError('documentCount must be a non-negative integer', {
      code: 'INVALID_FIELD',
    });
  }
}

// ============================================================
// Duplicate check error helper
// ============================================================

export function throwDuplicateError(entity: string, key: string, value: string): never {
  throw new ConflictError(`${entity} with ${key} "${value}" already exists`, {
    code: 'DUPLICATE_ENTRY',
    context: { entity, key, value },
  });
}
