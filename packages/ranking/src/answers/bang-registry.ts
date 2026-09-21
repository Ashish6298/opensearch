/**
 * @opensearch/ranking — Bang Registry & Shortcut Evaluator (Phase 38)
 *
 * Provides a catalog of 60+ essential developer, documentation, package registry,
 * security, and general research bangs for zero-click direct redirection.
 */

export interface BangDefinition {
  /** The primary bang prefix without exclamation (e.g., 'gh') */
  key: string;
  /** Alternate aliases (e.g. ['github']) */
  aliases?: string[];
  /** Human-readable service name */
  name: string;
  /** Category of bang */
  category: 'developer' | 'docs' | 'packages' | 'security' | 'reference' | 'general';
  /** Target search URL template with {q} placeholder */
  urlTemplate: string;
}

export interface BangResult {
  isBang: true;
  bangKey: string;
  matchedTrigger: string;
  serviceName: string;
  category: string;
  searchQuery: string;
  redirectUrl: string;
}

export const BANG_CATALOG: BangDefinition[] = [
  // ── Developer & Repositories ──
  { key: 'gh', aliases: ['github'], name: 'GitHub', category: 'developer', urlTemplate: 'https://github.com/search?q={q}' },
  { key: 'ghr', aliases: ['repo'], name: 'GitHub Repositories', category: 'developer', urlTemplate: 'https://github.com/search?type=repositories&q={q}' },
  { key: 'gist', name: 'GitHub Gists', category: 'developer', urlTemplate: 'https://gist.github.com/search?q={q}' },
  { key: 'gl', aliases: ['gitlab'], name: 'GitLab', category: 'developer', urlTemplate: 'https://gitlab.com/search?search={q}' },
  { key: 'bb', aliases: ['bitbucket'], name: 'Bitbucket', category: 'developer', urlTemplate: 'https://bitbucket.org/repo/all?name={q}' },
  { key: 'so', aliases: ['stackoverflow'], name: 'Stack Overflow', category: 'developer', urlTemplate: 'https://stackoverflow.com/search?q={q}' },
  { key: 'hn', aliases: ['hackernews'], name: 'Hacker News', category: 'developer', urlTemplate: 'https://hn.algolia.com/?q={q}' },
  { key: 'r', aliases: ['reddit'], name: 'Reddit', category: 'developer', urlTemplate: 'https://www.reddit.com/search/?q={q}' },
  { key: 'devto', name: 'Dev.to', category: 'developer', urlTemplate: 'https://dev.to/search?q={q}' },
  { key: 'hashnode', name: 'Hashnode', category: 'developer', urlTemplate: 'https://hashnode.com/search?q={q}' },
  { key: 'hf', aliases: ['huggingface'], name: 'Hugging Face', category: 'developer', urlTemplate: 'https://huggingface.co/models?search={q}' },

  // ── Package Registries ──
  { key: 'npm', aliases: ['npmjs'], name: 'npm', category: 'packages', urlTemplate: 'https://www.npmjs.com/search?q={q}' },
  { key: 'pypi', aliases: ['pythonpkg'], name: 'PyPI', category: 'packages', urlTemplate: 'https://pypi.org/search/?q={q}' },
  { key: 'cargo', aliases: ['crates'], name: 'Crates.io', category: 'packages', urlTemplate: 'https://crates.io/search?q={q}' },
  { key: 'pkg', aliases: ['godoc'], name: 'Go Packages', category: 'packages', urlTemplate: 'https://pkg.go.dev/search?q={q}' },
  { key: 'rubygems', aliases: ['gem'], name: 'RubyGems', category: 'packages', urlTemplate: 'https://rubygems.org/search?query={q}' },
  { key: 'packagist', aliases: ['composer'], name: 'Packagist', category: 'packages', urlTemplate: 'https://packagist.org/?query={q}' },
  { key: 'nuget', name: 'NuGet', category: 'packages', urlTemplate: 'https://www.nuget.org/packages?q={q}' },
  { key: 'maven', name: 'Maven Central', category: 'packages', urlTemplate: 'https://search.maven.org/search?q={q}' },
  { key: 'dh', aliases: ['docker'], name: 'Docker Hub', category: 'packages', urlTemplate: 'https://hub.docker.com/search?q={q}' },

  // ── Documentation & Specs ──
  { key: 'mdn', name: 'MDN Web Docs', category: 'docs', urlTemplate: 'https://developer.mozilla.org/search?q={q}' },
  { key: 'caniuse', aliases: ['ciu'], name: 'Can I Use', category: 'docs', urlTemplate: 'https://caniuse.com/?search={q}' },
  { key: 'devdocs', name: 'DevDocs', category: 'docs', urlTemplate: 'https://devdocs.io/#q={q}' },
  { key: 'rust', aliases: ['std'], name: 'Rust Standard Library', category: 'docs', urlTemplate: 'https://doc.rust-lang.org/std/?search={q}' },
  { key: 'docsrs', name: 'Docs.rs', category: 'docs', urlTemplate: 'https://docs.rs/releases/search?query={q}' },
  { key: 'ts', aliases: ['typescript'], name: 'TypeScript Documentation', category: 'docs', urlTemplate: 'https://www.typescriptlang.org/search?q={q}' },
  { key: 'py', aliases: ['pydoc'], name: 'Python Docs', category: 'docs', urlTemplate: 'https://docs.python.org/3/search.html?q={q}' },
  { key: 'cpp', aliases: ['cppreference'], name: 'CppReference', category: 'docs', urlTemplate: 'https://en.cppreference.com/mwiki/index.php?search={q}' },
  { key: 'arch', aliases: ['archwiki'], name: 'ArchWiki', category: 'docs', urlTemplate: 'https://wiki.archlinux.org/index.php?search={q}' },
  { key: 'man', name: 'ManKier Linux Manuals', category: 'docs', urlTemplate: 'https://www.mankier.com/?q={q}' },
  { key: 'rfc', name: 'IETF RFCs', category: 'docs', urlTemplate: 'https://datatracker.ietf.org/doc/search/?name={q}' },
  { key: 'w3c', name: 'W3C Specifications', category: 'docs', urlTemplate: 'https://www.w3.org/TR/?title={q}' },

  // ── Security & Infrastructure ──
  { key: 'cve', name: 'NVD CVE Database', category: 'security', urlTemplate: 'https://nvd.nist.gov/vuln/search/results?form_type=Basic&results_type=overview&query={q}' },
  { key: 'exploit', aliases: ['edb'], name: 'Exploit-DB', category: 'security', urlTemplate: 'https://www.exploit-db.com/search?q={q}' },
  { key: 'crt', aliases: ['ct'], name: 'crt.sh Certificate Search', category: 'security', urlTemplate: 'https://crt.sh/?q={q}' },
  { key: 'whois', name: 'Whois Lookup', category: 'security', urlTemplate: 'https://www.whois.com/whois/{q}' },
  { key: 'dns', name: 'DNS Checker', category: 'security', urlTemplate: 'https://dnschecker.org/#A/{q}' },
  { key: 'shodan', name: 'Shodan Search', category: 'security', urlTemplate: 'https://www.shodan.io/search?query={q}' },

  // ── Reference & Research ──
  { key: 'w', aliases: ['wiki', 'wikipedia'], name: 'Wikipedia', category: 'reference', urlTemplate: 'https://en.wikipedia.org/wiki/Special:Search?search={q}' },
  { key: 'wikt', aliases: ['wiktionary'], name: 'Wiktionary', category: 'reference', urlTemplate: 'https://en.wiktionary.org/wiki/Special:Search?search={q}' },
  { key: 'arxiv', name: 'arXiv Papers', category: 'reference', urlTemplate: 'https://arxiv.org/search/?query={q}&searchtype=all' },
  { key: 'scholar', name: 'Google Scholar', category: 'reference', urlTemplate: 'https://scholar.google.com/scholar?q={q}' },
  { key: 'wa', aliases: ['wolfram'], name: 'Wolfram Alpha', category: 'reference', urlTemplate: 'https://www.wolframalpha.com/input?i={q}' },
  { key: 'archive', aliases: ['wb', 'wayback'], name: 'Wayback Machine', category: 'reference', urlTemplate: 'https://web.archive.org/web/*/{q}' },

  // ── General Engines ──
  { key: 'g', aliases: ['google'], name: 'Google', category: 'general', urlTemplate: 'https://www.google.com/search?q={q}' },
  { key: 'ddg', aliases: ['duckduckgo'], name: 'DuckDuckGo', category: 'general', urlTemplate: 'https://duckduckgo.com/?q={q}' },
  { key: 'yt', aliases: ['youtube'], name: 'YouTube', category: 'general', urlTemplate: 'https://www.youtube.com/results?search_query={q}' },
  { key: 'maps', aliases: ['gmaps'], name: 'Google Maps', category: 'general', urlTemplate: 'https://www.google.com/maps/search/{q}' },
  { key: 'osm', name: 'OpenStreetMap', category: 'general', urlTemplate: 'https://www.openstreetmap.org/search?query={q}' },
  { key: 'tw', aliases: ['twitter', 'x'], name: 'X / Twitter', category: 'general', urlTemplate: 'https://twitter.com/search?q={q}' },
];

/** Index bang lookup table for O(1) matching */
const BANG_MAP = new Map<string, BangDefinition>();

for (const bang of BANG_CATALOG) {
  BANG_MAP.set(bang.key.toLowerCase(), bang);
  if (bang.aliases) {
    for (const alias of bang.aliases) {
      BANG_MAP.set(alias.toLowerCase(), bang);
    }
  }
}

/**
 * Evaluates whether a query contains a leading or trailing !bang command.
 * Examples: `!gh opensearch`, `opensearch !npm`, `!w rust programming`
 */
export function evaluateBang(rawQuery: string): BangResult | null {
  if (!rawQuery || typeof rawQuery !== 'string') {
    return null;
  }

  const trimmed = rawQuery.trim();
  if (!trimmed) {
    return null;
  }

  // Check prefix bang: `!gh search query` or `!gh`
  const prefixMatch = /^!([a-z0-9_-]+)(?:\s+(.*))?$/i.exec(trimmed);
  if (prefixMatch && prefixMatch[1]) {
    const trigger = prefixMatch[1].toLowerCase();
    const query = (prefixMatch[2] || '').trim();
    const bangDef = BANG_MAP.get(trigger);

    if (bangDef) {
      const redirectUrl = bangDef.urlTemplate.replace('{q}', encodeURIComponent(query));
      return {
        isBang: true,
        bangKey: bangDef.key,
        matchedTrigger: trigger,
        serviceName: bangDef.name,
        category: bangDef.category,
        searchQuery: query,
        redirectUrl,
      };
    }
  }

  // Check suffix bang: `search query !gh`
  const suffixMatch = /^(.*?)\s+!([a-z0-9_-]+)$/i.exec(trimmed);
  if (suffixMatch && suffixMatch[1] && suffixMatch[2]) {
    const query = suffixMatch[1].trim();
    const trigger = suffixMatch[2].toLowerCase();
    const bangDef = BANG_MAP.get(trigger);

    if (bangDef) {
      const redirectUrl = bangDef.urlTemplate.replace('{q}', encodeURIComponent(query));
      return {
        isBang: true,
        bangKey: bangDef.key,
        matchedTrigger: trigger,
        serviceName: bangDef.name,
        category: bangDef.category,
        searchQuery: query,
        redirectUrl,
      };
    }
  }

  return null;
}
