/**
 * @opensearch/crawler — Crawler Security Engine & Policy (Phase 25)
 *
 * Provides comprehensive security validation for the web crawler:
 * 1. Scheme Validation: Only http: and https: allowed (blocks file:, ftp:, gopher:, javascript:, data:)
 * 2. SSRF & Private Network Protection: Syntactic and DNS-based IP validation
 * 3. Response-Size Limit Enforcement: Prevents memory exhaustion from decompression or payload bombs
 * 4. Redirect Limits & Circular Loop Detection: Prevents infinite redirect chains
 * 5. Request Timeout Enforcement: Ensures non-responsive hosts do not block crawler workers
 * 6. Content-Type Restrictions: Rejects binary, media, and executable MIME types
 * 7. Malformed Input Resilience: Sanitizes broken HTML, invalid encodings, and control characters
 */

import { ALLOWED_CONTENT_TYPE_PREFIXES, CRAWLER_LIMITS } from '@opensearch/shared';
import { validateUrl } from '../url/url-validator.js';
import { ssrfCheck } from '../fetcher/ssrf-guard.js';

export interface CrawlerSecurityPolicy {
  allowedSchemes: string[];
  maxPageBytes: number;
  maxRedirects: number;
  timeoutMs: number;
  allowedContentTypes: string[];
  blockPrivateNetworks: boolean;
}

export const DEFAULT_CRAWLER_SECURITY_POLICY: CrawlerSecurityPolicy = {
  allowedSchemes: ['http:', 'https:'],
  maxPageBytes: CRAWLER_LIMITS.DEFAULT_MAX_PAGE_BYTES,
  maxRedirects: CRAWLER_LIMITS.DEFAULT_MAX_REDIRECTS,
  timeoutMs: CRAWLER_LIMITS.DEFAULT_TIMEOUT_MS,
  allowedContentTypes: [...ALLOWED_CONTENT_TYPE_PREFIXES],
  blockPrivateNetworks: true,
};

export interface SecurityCheckResult {
  allowed: boolean;
  code?: string;
  reason?: string;
  normalizedUrl?: string;
}

export class CrawlerSecurityValidator {
  private readonly policy: CrawlerSecurityPolicy;

  constructor(policy: Partial<CrawlerSecurityPolicy> = {}) {
    this.policy = {
      ...DEFAULT_CRAWLER_SECURITY_POLICY,
      ...policy,
      allowedSchemes: policy.allowedSchemes ?? DEFAULT_CRAWLER_SECURITY_POLICY.allowedSchemes,
      allowedContentTypes: policy.allowedContentTypes ?? DEFAULT_CRAWLER_SECURITY_POLICY.allowedContentTypes,
    };
  }

  /**
   * Validates target URL against scheme, syntax, and private network rules.
   */
  async validateTargetUrl(rawUrl: string): Promise<SecurityCheckResult> {
    if (!rawUrl || typeof rawUrl !== 'string') {
      return {
        allowed: false,
        code: 'INVALID_URL',
        reason: 'URL must be a non-empty string',
      };
    }

    // 1. Basic URL syntax & scheme validation
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return {
        allowed: false,
        code: 'INVALID_SYNTAX',
        reason: `Failed to parse URL: "${rawUrl.slice(0, 60)}"`,
      };
    }

    if (!this.policy.allowedSchemes.includes(parsed.protocol)) {
      return {
        allowed: false,
        code: 'DISALLOWED_SCHEME',
        reason: `Scheme "${parsed.protocol}" is not permitted for crawling (allowed: ${this.policy.allowedSchemes.join(', ')})`,
      };
    }

    // 2. Validate using standard url-validator
    const validation = validateUrl(rawUrl);
    if (!validation.ok) {
      const isPrivate = validation.reason.toLowerCase().includes('private/loopback');
      return {
        allowed: false,
        code: isPrivate ? 'SSRF_REJECTED' : 'INVALID_TARGET',
        reason: validation.reason,
      };
    }

    // 3. SSRF & Private Network DNS Check
    if (this.policy.blockPrivateNetworks) {
      const ssrf = await ssrfCheck(rawUrl);
      if (!ssrf.safe) {
        return {
          allowed: false,
          code: 'SSRF_REJECTED',
          reason: ssrf.reason ?? 'Target resolves to a private or internal network address',
        };
      }
    }

    return {
      allowed: true,
      normalizedUrl: parsed.href,
    };
  }

  /**
   * Validates HTTP response Content-Type against accepted text/HTML MIME types.
   */
  validateContentType(rawContentType: string | null | undefined): SecurityCheckResult {
    if (!rawContentType || rawContentType.trim().length === 0) {
      return {
        allowed: false,
        code: 'MISSING_CONTENT_TYPE',
        reason: 'HTTP response is missing a Content-Type header',
      };
    }

    const mime = rawContentType.split(';')[0]?.trim().toLowerCase() ?? '';
    const isAllowed = this.policy.allowedContentTypes.some(prefix => mime.startsWith(prefix));

    if (!isAllowed) {
      return {
        allowed: false,
        code: 'UNSUPPORTED_CONTENT_TYPE',
        reason: `MIME type "${mime}" is not an accepted crawlable content type`,
      };
    }

    return { allowed: true };
  }

  /**
   * Checks if response body byte length exceeds safe resource bounds.
   */
  validateContentLength(contentLengthBytes: number): SecurityCheckResult {
    if (contentLengthBytes > this.policy.maxPageBytes) {
      return {
        allowed: false,
        code: 'CONTENT_SIZE_EXCEEDED',
        reason: `Content length (${contentLengthBytes} bytes) exceeds maximum limit of ${this.policy.maxPageBytes} bytes`,
      };
    }
    return { allowed: true };
  }

  /**
   * Validates a redirect chain to prevent infinite loops and limit depth.
   */
  validateRedirectChain(redirectChain: string[], nextUrl: string): SecurityCheckResult {
    if (redirectChain.length >= this.policy.maxRedirects) {
      return {
        allowed: false,
        code: 'MAX_REDIRECTS_EXCEEDED',
        reason: `Redirect chain exceeded limit of ${this.policy.maxRedirects} redirects`,
      };
    }

    // Detect circular redirect loops
    if (redirectChain.includes(nextUrl)) {
      return {
        allowed: false,
        code: 'CIRCULAR_REDIRECT_DETECTED',
        reason: `Circular redirect loop detected: "${nextUrl}" already visited in chain`,
      };
    }

    return { allowed: true };
  }

  /**
   * Sanitizes malformed or non-UTF8 input, removing control characters and decoding broken strings.
   */
  sanitizeMalformedText(text: string): string {
    if (!text || typeof text !== 'string') return '';
    return text
      // Remove null bytes and dangerous control characters except standard whitespace
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      // Normalize replacement characters
      .replace(/\uFFFD/g, ' ')
      .trim();
  }
}

export function createCrawlerSecurityValidator(
  policy?: Partial<CrawlerSecurityPolicy>
): CrawlerSecurityValidator {
  return new CrawlerSecurityValidator(policy);
}
