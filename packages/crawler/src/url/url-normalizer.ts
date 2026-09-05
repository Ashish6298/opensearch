/**
 * @opensearch/crawler — URL Normalizer (Phase 4)
 *
 * Produces a canonical, deterministic URL string from any valid http/https URL.
 * Two URLs that refer to the same resource will produce the same normalized output.
 *
 * Normalization rules (applied in order):
 *
 *  1. WHATWG URL parse — reject malformed input
 *  2. Lowercase scheme and hostname (WHATWG URL does this automatically)
 *  3. Remove default ports: :80 for http, :443 for https
 *  4. Fragment removal — always strip #fragment (fragments are client-side,
 *     do not identify distinct resources from the server's perspective)
 *  5. Path normalization:
 *     a. Resolve . and .. segments (WHATWG URL does this)
 *     b. Collapse multiple consecutive slashes → single slash
 *     c. Ensure path starts with /
 *     d. Remove trailing slash on non-root paths (/ is kept for root)
 *  6. Query string:
 *     a. Sort query parameters alphabetically by key (stable sort)
 *     b. Within same key, preserve original value order
 *     c. Empty query string (?=) is removed
 *     d. Query parameter *values* are preserved exactly — we do NOT
 *        collapse or deduplicate values, as they materially affect resources
 *  7. Percent-encoding: We rely on the WHATWG URL parser's normalization
 *     rather than custom encode/decode, to avoid double-encoding edge cases
 *
 * What is deliberately NOT done:
 *  - DNS resolution or CNAME following
 *  - Stripping tracking parameters (utm_*, fbclid, etc.) — would be a future option
 *  - Session IDs or CSRF tokens — cannot safely distinguish from content params
 *  - Forcing www/non-www canonicalization — requires domain-level configuration
 *  - Converting HTTP→HTTPS — requires fetch; done at crawl time, not here
 */

export type NormalizeResult = { ok: true; normalized: string } | { ok: false; reason: string };

/**
 * Normalizes a raw URL string into its canonical form.
 * Input must be a non-empty string. Does NOT require http/https (caller should
 * filter scheme before calling, but normalizer handles all schemes gracefully).
 */
export function normalizeUrl(rawUrl: string): NormalizeResult {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { ok: false, reason: `Cannot parse URL: "${rawUrl.slice(0, 120)}"` };
  }

  // 1. Scheme + hostname are already lowercased by WHATWG URL.

  // 2. Remove default port
  const defaultPort =
    parsed.protocol === 'http:' ? '80' : parsed.protocol === 'https:' ? '443' : null;
  if (defaultPort !== null && parsed.port === defaultPort) {
    parsed.port = '';
  }

  // 3. Fragment removal — always
  parsed.hash = '';

  // 4. Path normalization
  let pathname = parsed.pathname;

  // 4a. Collapse consecutive slashes (WHATWG already resolved . and ..)
  pathname = pathname.replace(/\/+/g, '/');

  // 4b. Ensure starts with /
  if (!pathname.startsWith('/')) {
    pathname = '/' + pathname;
  }

  // 4c. Remove trailing slash on non-root paths
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }

  parsed.pathname = pathname;

  // 5. Query string normalization — sort params by key alphabetically
  if (parsed.search.length > 1) {
    // URLSearchParams preserves duplicate keys
    const entries = [...parsed.searchParams.entries()];

    // Sort by key (stable: same-key entries preserve original order)
    entries.sort(([a], [b]) => a.localeCompare(b, 'und', { sensitivity: 'case' }));

    const sortedParams = new URLSearchParams();
    for (const [k, v] of entries) {
      sortedParams.append(k, v);
    }
    parsed.search = sortedParams.toString() ? '?' + sortedParams.toString() : '';
  } else {
    // Remove bare '?' with empty query string
    parsed.search = '';
  }

  return { ok: true, normalized: parsed.toString() };
}
