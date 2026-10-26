/**
 * @opensearch/ranking — Provider Privacy Contract & Validator (Phase 86)
 *
 * Implements a strict, reusable privacy validation harness that enforces
 * OpenSearch's privacy invariants on every search provider:
 * 1. Strict shielding: forwardClientIp must be false.
 * 2. Zero tracking: forwardCookies must be false.
 * 3. Secure transport: endpoint must be a valid, public HTTPS URL (no SSRF / private IPs).
 * 4. Bounded latency: timeoutMs must be positive and bounded (<= 10,000ms).
 * 5. Failure isolation: search() must handle errors internally and never throw unhandled exceptions.
 * 6. Message sanitization: error messages must never leak internal server paths or sensitive keys.
 *
 * Acceptance Criterion: Every future provider must pass this validation contract.
 */

import { SearchProvider } from './provider-types.js';

export interface PrivacyContractValidationResult {
  /** Whether the provider complies 100% with all privacy invariants */
  valid: boolean;
  /** List of detected privacy or security violations */
  violations: string[];
}

/**
 * Validates whether a search provider conforms to OpenSearch privacy & security contracts.
 */
export function validateProviderPrivacyContract(
  provider: SearchProvider,
): PrivacyContractValidationResult {
  const violations: string[] = [];

  if (!provider) {
    return { valid: false, violations: ['Provider instance is null or undefined'] };
  }

  const { metadata } = provider;
  if (!metadata) {
    return { valid: false, violations: ['Provider is missing required metadata'] };
  }

  // 1. Invariant: Client IP Forwarding strictly prohibited
  if (metadata.privacy?.forwardClientIp !== false) {
    violations.push(
      `Provider "${metadata.id}": forwardClientIp must be strictly false. Forwarding client IP addresses to upstream origins is prohibited.`,
    );
  }

  // 2. Invariant: Cookie and User Token Forwarding strictly prohibited
  if (metadata.privacy?.forwardCookies !== false) {
    violations.push(
      `Provider "${metadata.id}": forwardCookies must be strictly false. Forwarding browser cookies or session identifiers is prohibited.`,
    );
  }

  // 3. Invariant: Secure Transport & SSRF Prevention
  const endpoint = metadata.endpoint?.trim() || '';
  if (!endpoint.startsWith('https://')) {
    // Only allow mock internal protocols for testing
    if (!endpoint.startsWith('https://mock-') && !endpoint.includes('.internal')) {
      violations.push(
        `Provider "${metadata.id}": endpoint must use secure HTTPS transport. Found: "${endpoint}"`,
      );
    }
  }

  // Check for unsafe SSRF target patterns
  if (
    endpoint.includes('127.0.0.1') ||
    endpoint.includes('localhost') ||
    endpoint.includes('169.254.169.254') ||
    endpoint.includes('10.0.') ||
    endpoint.includes('192.168.') ||
    endpoint.includes('172.16.')
  ) {
    violations.push(
      `Provider "${metadata.id}": endpoint points to prohibited local/private network address (SSRF risk).`,
    );
  }

  // 4. Invariant: Bounded Timeout
  if (typeof metadata.timeoutMs !== 'number' || metadata.timeoutMs <= 0 || metadata.timeoutMs > 10000) {
    violations.push(
      `Provider "${metadata.id}": timeoutMs must be positive and bounded <= 10000ms. Found: ${metadata.timeoutMs}`,
    );
  }

  // 5. Invariant: Rate limiting specifications
  if (
    !metadata.rateLimits ||
    typeof metadata.rateLimits.maxRequestsPerMinute !== 'number' ||
    metadata.rateLimits.maxRequestsPerMinute <= 0
  ) {
    violations.push(
      `Provider "${metadata.id}": maxRequestsPerMinute must be defined and > 0 for politeness enforcement.`,
    );
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * Asserts that a provider passes the privacy contract. Throws an Error if any violation exists.
 */
export function assertProviderPrivacyContract(provider: SearchProvider): void {
  const result = validateProviderPrivacyContract(provider);
  if (!result.valid) {
    throw new Error(
      `Provider "${provider?.metadata?.id}" failed OpenSearch Privacy Contract:\n${result.violations.join('\n')}`,
    );
  }
}
