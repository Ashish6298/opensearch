/**
 * @opensearch/crawler — Robots.txt Parser (Phase 6)
 *
 * Implements RFC 9309 (Robots Exclusion Protocol) compliant parsing:
 * - Line-by-line parsing with comment stripping (# ...)
 * - Case-insensitive field keys ('user-agent', 'disallow', 'allow', 'crawl-delay', 'sitemap')
 * - User-agent record grouping (multiple user-agents share subsequent rules)
 * - Empty Disallow: resets/allows all
 * - RFC 9309 Path matching:
 *   - Prefix matching: /foo matches /foo, /foo/bar, /foobar
 *   - Wildcard '*': matches 0 or more characters
 *   - End-of-path '$': matches end of path
 *   - Longest matching pattern wins
 *   - If lengths are equal, Allow takes precedence over Disallow
 * - Crawl-delay parsing with numeric bounds checking
 */

import { ParsedRobotsTxt, RobotsRule, RobotsUserAgentGroup } from './robots-types.js';

export function parseRobotsTxt(content: string): ParsedRobotsTxt {
  const lines = content.split(/\r?\n/);
  const groups: RobotsUserAgentGroup[] = [];
  const sitemaps: string[] = [];

  let currentUserAgents: string[] = [];
  let currentRules: RobotsRule[] = [];
  let currentCrawlDelay: number | undefined = undefined;
  let hasSyntaxWarnings = false;

  function flushGroup() {
    if (currentUserAgents.length > 0) {
      groups.push({
        userAgents: [...currentUserAgents],
        rules: [...currentRules],
        crawlDelaySeconds: currentCrawlDelay,
      });
    }
    currentUserAgents = [];
    currentRules = [];
    currentCrawlDelay = undefined;
  }

  for (const rawLine of lines) {
    // Strip comments
    const commentIdx = rawLine.indexOf('#');
    const line = (commentIdx !== -1 ? rawLine.slice(0, commentIdx) : rawLine).trim();

    if (!line) {
      continue;
    }

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) {
      hasSyntaxWarnings = true;
      continue;
    }

    const directive = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();

    if (directive === 'user-agent') {
      // If we previously had rules in this group and now see a new User-agent, flush the previous group
      if (currentRules.length > 0 || currentCrawlDelay !== undefined) {
        flushGroup();
      }
      if (value) {
        currentUserAgents.push(value.toLowerCase());
      }
    } else if (directive === 'disallow') {
      if (currentUserAgents.length === 0) {
        // Disallow outside of a user-agent block is ignored
        hasSyntaxWarnings = true;
        continue;
      }
      if (!value || value === '') {
        // Empty Disallow means "allow all" — represents an empty path or allow rule
        currentRules.push({
          type: 'allow',
          pattern: '',
          patternLength: 0,
        });
      } else {
        const pattern = normalizeRobotsPattern(value);
        currentRules.push({
          type: 'disallow',
          pattern,
          patternLength: pattern.length,
        });
      }
    } else if (directive === 'allow') {
      if (currentUserAgents.length === 0) {
        hasSyntaxWarnings = true;
        continue;
      }
      if (value) {
        const pattern = normalizeRobotsPattern(value);
        currentRules.push({
          type: 'allow',
          pattern,
          patternLength: pattern.length,
        });
      }
    } else if (directive === 'crawl-delay') {
      if (currentUserAgents.length === 0) {
        hasSyntaxWarnings = true;
        continue;
      }
      const parsedDelay = Number.parseFloat(value);
      if (!Number.isNaN(parsedDelay) && Number.isFinite(parsedDelay) && parsedDelay >= 0) {
        currentCrawlDelay = parsedDelay;
      } else {
        hasSyntaxWarnings = true;
      }
    } else if (directive === 'sitemap') {
      if (value) {
        sitemaps.push(value);
      }
    }
  }

  // Flush remaining group
  flushGroup();

  return {
    groups,
    sitemaps,
    rawLengthBytes: Buffer.byteLength(content, 'utf8'),
    hasSyntaxWarnings,
  };
}

/**
 * Normalizes pattern to ensure leading slash if path-based
 */
function normalizeRobotsPattern(pattern: string): string {
  if (pattern.startsWith('/') || pattern.startsWith('*')) {
    return pattern;
  }
  return '/' + pattern;
}

/**
 * Checks if a given path/query matches a robots.txt rule pattern according to RFC 9309.
 *
 * Rules:
 * - '*' matches 0 or more characters
 * - '$' at end of pattern matches the end of the path
 * - Without '$', it's a prefix match
 */
export function matchPathPattern(pathAndQuery: string, pattern: string): boolean {
  if (pattern === '') {
    return true;
  }

  // Escape regex special characters except '*' and '$'
  let regexStr = '^';
  let hasEndAnchor = false;

  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*') {
      regexStr += '.*';
    } else if (ch === '$' && i === pattern.length - 1) {
      hasEndAnchor = true;
      regexStr += '$';
    } else if (
      ch === '.' ||
      ch === '+' ||
      ch === '?' ||
      ch === '^' ||
      ch === '$' ||
      ch === '(' ||
      ch === ')' ||
      ch === '[' ||
      ch === ']' ||
      ch === '{' ||
      ch === '}' ||
      ch === '|' ||
      ch === '\\'
    ) {
      regexStr += '\\' + ch;
    } else {
      regexStr += ch;
    }
  }

  if (!hasEndAnchor) {
    // Prefix match
    regexStr += '.*';
  }

  try {
    const re = new RegExp(regexStr);
    return re.test(pathAndQuery);
  } catch {
    return false;
  }
}

/**
 * Selects the most specific user-agent group matching the crawler's user-agent token.
 * Preference:
 * 1. Exact or prefix token match (e.g. 'opensearchbot')
 * 2. Wildcard '*' group
 * 3. None (meaning everything is allowed by default)
 */
export function findMatchingUserAgentGroup(
  groups: RobotsUserAgentGroup[],
  userAgent: string,
): { group?: RobotsUserAgentGroup; matchedAgent?: string } {
  const agentLower = userAgent.toLowerCase().trim();
  // Extract token from full User-Agent (e.g. "OpenSearchBot/1.0" -> "opensearchbot")
  const agentToken = agentLower.split(/[/;\s]/)[0] ?? agentLower;

  let exactMatchGroup: RobotsUserAgentGroup | undefined = undefined;
  let exactMatchedAgent = '';
  let wildcardGroup: RobotsUserAgentGroup | undefined = undefined;

  for (const g of groups) {
    for (const ua of g.userAgents) {
      if (ua === agentToken || agentToken.startsWith(ua)) {
        if (!exactMatchGroup) {
          exactMatchGroup = g;
          exactMatchedAgent = ua;
        }
      } else if (ua === '*') {
        if (!wildcardGroup) {
          wildcardGroup = g;
        }
      }
    }
  }

  if (exactMatchGroup) {
    return { group: exactMatchGroup, matchedAgent: exactMatchedAgent };
  }

  if (wildcardGroup) {
    return { group: wildcardGroup, matchedAgent: '*' };
  }

  return {};
}

/**
 * Evaluates whether a given URL path is allowed by a group's rules.
 * According to RFC 9309 Section 2.2.2:
 * 1. The most specific match (longest matching pattern) wins.
 * 2. If allow and disallow have the exact same match length, Allow wins.
 * 3. If no rules match, Allow is the default.
 */
export function evaluatePathRules(
  rules: RobotsRule[],
  pathAndQuery: string,
): { allowed: boolean; matchedRule?: RobotsRule } {
  let longestMatch: RobotsRule | undefined = undefined;
  let longestLength = -1;

  for (const rule of rules) {
    if (matchPathPattern(pathAndQuery, rule.pattern)) {
      const matchLen = rule.patternLength;
      if (matchLen > longestLength) {
        longestLength = matchLen;
        longestMatch = rule;
      } else if (matchLen === longestLength && longestMatch) {
        // Equal length: Allow takes precedence over Disallow
        if (rule.type === 'allow' && longestMatch.type === 'disallow') {
          longestMatch = rule;
        }
      }
    }
  }

  if (!longestMatch) {
    return { allowed: true };
  }

  return {
    allowed: longestMatch.type === 'allow',
    matchedRule: longestMatch,
  };
}
