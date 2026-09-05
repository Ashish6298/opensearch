/**
 * @opensearch/crawler — URL Fingerprint (Phase 4)
 *
 * Provides stable, collision-resistant identity hashes for normalized URLs.
 * The hash is used as the primary key in the UrlRecord storage layer (Phase 3)
 * and as the deduplication key in the crawl queue.
 *
 * Algorithm: SHA-256 of the UTF-8 encoded normalized URL string, hex-encoded.
 *
 * Why SHA-256?
 *  - Deterministic: same input always produces same output
 *  - Collision resistance: suitable for dedup at crawler scale
 *  - No external dependency: available in Node.js crypto built-in
 *  - Matches the UrlRecord.urlHash field format used in Phase 3 storage
 *
 * Important: hash is computed on the NORMALIZED URL, not the raw input.
 * Always normalize before hashing to ensure semantic equivalents map to
 * the same hash.
 */

import crypto from 'node:crypto';

/**
 * Computes a SHA-256 hex fingerprint of the given normalized URL string.
 * The caller is responsible for normalizing the URL before calling this.
 *
 * @param normalizedUrl - The canonical URL string (output of normalizeUrl)
 * @returns 64-character lowercase hex string (SHA-256 digest)
 */
export function computeUrlHash(normalizedUrl: string): string {
  return crypto.createHash('sha256').update(normalizedUrl, 'utf8').digest('hex');
}

/**
 * Computes a fingerprint for a raw URL by first normalizing it.
 * Returns null if the URL cannot be normalized.
 * Prefer this over calling normalizeUrl + computeUrlHash separately when
 * you just need a hash and don't need the ParsedCrawlUrl object.
 */
export function computeRawUrlHash(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl.trim());
    // Apply minimal normalization: lowercase, no fragment
    parsed.hash = '';
    const defaultPort =
      parsed.protocol === 'http:' ? '80' : parsed.protocol === 'https:' ? '443' : null;
    if (defaultPort !== null && parsed.port === defaultPort) parsed.port = '';
    return computeUrlHash(parsed.toString());
  } catch {
    return null;
  }
}
