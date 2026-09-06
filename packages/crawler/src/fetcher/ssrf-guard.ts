/**
 * @opensearch/crawler — SSRF Guard (Phase 5)
 *
 * Validates both initial fetch targets AND redirect targets against SSRF risks.
 * Checks that a resolved hostname/IP does not point to internal/private infrastructure.
 *
 * Two layers of protection:
 *  1. Syntactic: hostname pattern matching (fast, no network)
 *  2. DNS resolution: resolve hostname to IP and check again (catches DNS SSRF)
 *
 * This module is intentionally separate from Phase 4 url-validator so that
 * SSRF checks can be applied to redirect targets dynamically at fetch time.
 */

import dns from 'node:dns/promises';

// ============================================================
// Private IP pattern matchers (IPv4)
// ============================================================

const PRIVATE_IPV4: RegExp[] = [
  /^127\./, // Loopback (127.0.0.0/8)
  /^10\./, // RFC-1918 class A (10.0.0.0/8)
  /^192\.168\./, // RFC-1918 class C (192.168.0.0/16)
  /^172\.(1[6-9]|2\d|3[01])\./, // RFC-1918 class B (172.16.0.0/12)
  /^169\.254\./, // Link-local / APIPA / Cloud metadata (169.254.0.0/16)
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // CGNAT (100.64.0.0/10)
  /^0\./, // "This" network (0.0.0.0/8)
  /^255\./, // Broadcast
];

const LOOPBACK_NAMES = new Set(['localhost', 'localhost.localdomain', '::1', '[::1]']);

const DANGEROUS_TLDS_AND_SUFFIXES = [
  '.local',
  '.internal',
  '.lan',
  '.home.arpa',
  '.intranet',
  '.corp',
  '.private',
];

// Private/reserved IPv6 ranges
const PRIVATE_IPV6_PREFIXES = [
  '::1', // loopback
  '0:0:0:0:0:0:0:1',
  'fc', // Unique local (fc00::/7)
  'fd', // Unique local
  'fe8', // Link-local (fe80::/10)
  'fe9',
  'fea',
  'feb',
  '::', // Unspecified
];

export function isPrivateIpv4(ip: string): boolean {
  return PRIVATE_IPV4.some(p => p.test(ip));
}

export function isPrivateIpv6(ip: string): boolean {
  const clean = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (clean === '::') return true;
  if (clean.startsWith('::ffff:')) {
    const v4 = clean.slice('::ffff:'.length);
    return isPrivateIpv4(v4);
  }
  return PRIVATE_IPV6_PREFIXES.some(prefix => clean.startsWith(prefix));
}

export function isPrivateOrLoopbackIp(ip: string): boolean {
  return isPrivateIpv4(ip) || isPrivateIpv6(ip) || LOOPBACK_NAMES.has(ip.toLowerCase());
}

export function isPrivateHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (LOOPBACK_NAMES.has(h)) return true;
  if (isPrivateIpv4(h)) return true;
  if (isPrivateIpv6(h)) return true;
  if (DANGEROUS_TLDS_AND_SUFFIXES.some(suffix => h.endsWith(suffix))) {
    return true;
  }
  return false;
}

export function validateTargetHostSync(hostname: string): { allowed: boolean; reason?: string } {
  if (process.env.OPENSEARCH_ALLOW_PRIVATE_URLS === 'true') {
    return { allowed: true };
  }
  if (isPrivateHostname(hostname)) {
    return {
      allowed: false,
      reason: `Host "${hostname}" is blocked: private, loopback, or local infrastructure`,
    };
  }
  return { allowed: true };
}

// ============================================================
// DNS-based SSRF check
// ============================================================

export interface DnsCheckResult {
  safe: boolean;
  reason?: string;
  resolvedIps?: string[];
}

/**
 * Resolves the hostname and checks that all returned IPs are public.
 * Returns { safe: false, reason } if any IP is private/loopback.
 * Returns { safe: true } if all IPs are public or if DNS resolution is skipped for IPs.
 */
export async function dnsCheckHost(hostname: string): Promise<DnsCheckResult> {
  if (process.env.OPENSEARCH_ALLOW_PRIVATE_URLS === 'true') {
    return { safe: true };
  }

  // Check syntactic safety first
  const syncCheck = validateTargetHostSync(hostname);
  if (!syncCheck.allowed) {
    return { safe: false, reason: syncCheck.reason };
  }

  // Skip DNS resolution for literal IPv4 (already checked above and is public)
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    return { safe: true };
  }
  // Skip DNS resolution for literal IPv6 brackets
  if (hostname.startsWith('[')) {
    const raw = hostname.slice(1, -1);
    if (isPrivateIpv6(raw)) {
      return { safe: false, reason: `IPv6 address "${hostname}" is private or reserved` };
    }
    return { safe: true };
  }

  // Perform DNS resolution
  try {
    const addresses = await dns.lookup(hostname, { all: true });
    const ips = addresses.map(a => a.address);

    const privateIp = ips.find(ip => isPrivateOrLoopbackIp(ip));
    if (privateIp !== undefined) {
      // DO NOT include the full IP in external-facing messages to avoid info leak
      return {
        safe: false,
        reason: `Host "${hostname}" resolves to a private or internal address`,
        resolvedIps: ips,
      };
    }

    return { safe: true, resolvedIps: ips };
  } catch {
    // DNS resolution failed
    return { safe: false, reason: `DNS resolution failed for "${hostname}"` };
  }
}

export async function validateTargetHostDns(
  hostname: string,
): Promise<{ allowed: boolean; reason?: string }> {
  const res = await dnsCheckHost(hostname);
  return {
    allowed: res.safe,
    reason: res.reason,
  };
}

/**
 * Validates a URL string for SSRF risks (both syntactic and DNS-based).
 * Returns { safe: true } if the URL is safe to fetch.
 * Returns { safe: false, reason } if rejected.
 * Caller is responsible for ensuring url is a valid http/https URL before calling.
 */
export async function ssrfCheck(url: string): Promise<DnsCheckResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { safe: false, reason: `Malformed URL passed to SSRF check: "${url.slice(0, 80)}"` };
  }

  // Only http/https should reach here
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, reason: `Unsupported scheme: ${parsed.protocol}` };
  }

  return dnsCheckHost(parsed.hostname);
}
