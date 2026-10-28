/**
 * @opensearch/crawler — Registrable Domain & Origin Utilities (Phase 99)
 *
 * Implements deterministic origin classification and eTLD+1 registrable domain extraction
 * with zero network lookups or external dependencies.
 */

// Common two-level and multi-level public suffixes
const MULTI_LEVEL_TLDS: ReadonlySet<string> = new Set([
  'co.uk',
  'org.uk',
  'me.uk',
  'gov.uk',
  'ac.uk',
  'net.uk',
  'com.au',
  'net.au',
  'org.au',
  'edu.au',
  'gov.au',
  'co.nz',
  'org.nz',
  'net.nz',
  'govt.nz',
  'co.jp',
  'ne.jp',
  'or.jp',
  'ac.jp',
  'go.jp',
  'co.in',
  'net.in',
  'org.in',
  'gov.in',
  'ac.in',
  'com.br',
  'org.br',
  'net.br',
  'gov.br',
  'com.cn',
  'net.cn',
  'org.cn',
  'gov.cn',
  'com.sg',
  'org.sg',
  'edu.sg',
  'gov.sg',
  'co.za',
  'org.za',
  'web.za',
  'gov.za',
  'co.kr',
  'ne.kr',
  'or.kr',
  're.kr',
  'com.mx',
  'org.mx',
  'gob.mx',
  'com.tr',
  'org.tr',
  'gov.tr',
  'com.ru',
  'net.ru',
  'org.ru',
]);

/**
 * Extracts the registrable domain (effective TLD + 1) from a hostname.
 * Examples:
 *   'analytics.google.com' -> 'google.com'
 *   'sub.news.bbc.co.uk'   -> 'bbc.co.uk'
 *   'localhost'            -> 'localhost'
 *   '127.0.0.1'            -> '127.0.0.1'
 */
export function extractRegistrableDomain(hostname: string): string {
  if (!hostname || typeof hostname !== 'string') return '';

  const cleanHost = hostname.trim().toLowerCase().replace(/\.+$/, '');
  if (!cleanHost) return '';

  // Handle IP addresses (IPv4 or IPv6)
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(cleanHost) || cleanHost.includes(':')) {
    return cleanHost;
  }

  // Handle single-label hosts (e.g. 'localhost', 'internal')
  const parts = cleanHost.split('.');
  if (parts.length <= 1) {
    return cleanHost;
  }

  // Check two-level suffix (e.g. bbc.co.uk)
  if (parts.length >= 3) {
    const twoLevelSuffix = `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
    if (MULTI_LEVEL_TLDS.has(twoLevelSuffix)) {
      return `${parts[parts.length - 3]}.${twoLevelSuffix}`;
    }
  }

  // Standard single-level TLD (e.g. example.com)
  return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
}

/**
 * Extracts normalized origin from a URL string.
 * Example: 'https://example.com:8080/path?q=1' -> 'https://example.com:8080'
 */
export function extractOrigin(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    return parsed.origin;
  } catch {
    return '';
  }
}

/**
 * Determines whether a resource URL belongs to the first-party document origin
 * by comparing registrable domains (eTLD+1).
 */
export function isFirstPartyResource(resourceUrl: string, documentUrl: string): boolean {
  try {
    const resParsed = new URL(resourceUrl);
    const docParsed = new URL(documentUrl);

    // If exact hostnames match, it's definitely first-party
    if (resParsed.hostname.toLowerCase() === docParsed.hostname.toLowerCase()) {
      return true;
    }

    // Compare registrable domains
    const resRegDomain = extractRegistrableDomain(resParsed.hostname);
    const docRegDomain = extractRegistrableDomain(docParsed.hostname);

    return Boolean(resRegDomain && docRegDomain && resRegDomain === docRegDomain);
  } catch {
    return false;
  }
}
