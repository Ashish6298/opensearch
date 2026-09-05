/**
 * Phase 6 Tests — Robots.txt Parser
 *
 * Tests RFC 9309 compliance:
 * - Line-by-line parsing & comment stripping
 * - Case-insensitivity of directives
 * - Multiple User-agent groups
 * - Empty Disallow (allow all)
 * - Path matching with prefix, wildcard '*', and end anchor '$'
 * - Longest match precedence
 * - Allow over Disallow on equal length
 * - Crawl-delay parsing & invalid handling
 * - Sitemap extraction
 */

import { describe, it, expect } from 'vitest';
import {
  parseRobotsTxt,
  matchPathPattern,
  findMatchingUserAgentGroup,
  evaluatePathRules,
} from '../src/index.js';

describe('Robots.txt Parser — Basic Parsing', () => {
  it('parses standard robots.txt with multiple user-agents, disallow, allow, crawl-delay, and sitemap', () => {
    const robotsTxt = `
# Sample robots.txt file
User-agent: Googlebot
Disallow: /private/
Allow: /private/public-preview/

User-agent: OpenSearchBot
User-agent: OtherBot
Disallow: /admin/
Disallow: /tmp/
Allow: /tmp/public/
Crawl-delay: 2.5

User-agent: *
Disallow: /
Allow: /public/
Sitemap: https://example.com/sitemap.xml
Sitemap: https://example.com/sitemap2.xml
`;

    const parsed = parseRobotsTxt(robotsTxt);
    expect(parsed.groups).toHaveLength(3);
    expect(parsed.sitemaps).toEqual([
      'https://example.com/sitemap.xml',
      'https://example.com/sitemap2.xml',
    ]);

    // Group 1: Googlebot
    expect(parsed.groups[0].userAgents).toEqual(['googlebot']);
    expect(parsed.groups[0].rules).toHaveLength(2);
    expect(parsed.groups[0].rules[0]).toEqual({
      type: 'disallow',
      pattern: '/private/',
      patternLength: 9,
    });
    expect(parsed.groups[0].rules[1]).toEqual({
      type: 'allow',
      pattern: '/private/public-preview/',
      patternLength: 24,
    });

    // Group 2: OpenSearchBot and OtherBot
    expect(parsed.groups[1].userAgents).toEqual(['opensearchbot', 'otherbot']);
    expect(parsed.groups[1].crawlDelaySeconds).toBe(2.5);
    expect(parsed.groups[1].rules).toHaveLength(3);

    // Group 3: Wildcard *
    expect(parsed.groups[2].userAgents).toEqual(['*']);
    expect(parsed.groups[2].rules).toHaveLength(2);
  });

  it('handles empty disallow as allow-all (resets restrictions)', () => {
    const robotsTxt = `
User-agent: *
Disallow:
`;
    const parsed = parseRobotsTxt(robotsTxt);
    expect(parsed.groups[0].rules).toHaveLength(1);
    expect(parsed.groups[0].rules[0].type).toBe('allow');
    expect(parsed.groups[0].rules[0].pattern).toBe('');
  });

  it('gracefully handles comments, extra whitespace, and unrecognized lines', () => {
    const robotsTxt = `
# Comment at top
User-Agent:  OpenSearchBot   # inline comment
Unknown-Directive: value
Disallow:   /secret/
`;
    const parsed = parseRobotsTxt(robotsTxt);
    expect(parsed.groups).toHaveLength(1);
    expect(parsed.groups[0].userAgents).toEqual(['opensearchbot']);
    expect(parsed.groups[0].rules[0].pattern).toBe('/secret/');
  });
});

describe('Robots.txt Parser — Path Pattern Matching', () => {
  it('matches exact prefixes', () => {
    expect(matchPathPattern('/foo', '/foo')).toBe(true);
    expect(matchPathPattern('/foo/bar', '/foo')).toBe(true);
    expect(matchPathPattern('/foobar', '/foo')).toBe(true);
    expect(matchPathPattern('/bar', '/foo')).toBe(false);
  });

  it('handles wildcard *', () => {
    expect(matchPathPattern('/articles/2026/09/post', '/articles/*/post')).toBe(true);
    expect(matchPathPattern('/articles/news/post', '/articles/*/post')).toBe(true);
    expect(matchPathPattern('/search?q=test&p=1', '/*?*p=1')).toBe(true);
    expect(matchPathPattern('/news/today', '/news/*.php')).toBe(false);
  });

  it('handles end-of-path anchor $', () => {
    expect(matchPathPattern('/file.pdf', '/*.pdf$')).toBe(true);
    expect(matchPathPattern('/file.pdf.exe', '/*.pdf$')).toBe(false);
    expect(matchPathPattern('/page.html', '/page.html$')).toBe(true);
    expect(matchPathPattern('/page.html?ref=1', '/page.html$')).toBe(false);
  });
});

describe('Robots.txt Parser — User-Agent Group Matching', () => {
  const groups = [
    { userAgents: ['googlebot'], rules: [] },
    { userAgents: ['opensearchbot'], rules: [] },
    { userAgents: ['*'], rules: [] },
  ];

  it('matches specific crawler identity over wildcard', () => {
    const matched = findMatchingUserAgentGroup(groups, 'OpenSearchBot/1.0 (+https://...)');
    expect(matched.group).toBe(groups[1]);
    expect(matched.matchedAgent).toBe('opensearchbot');
  });

  it('falls back to wildcard when specific crawler not present', () => {
    const matched = findMatchingUserAgentGroup(groups, 'CustomBot/1.0');
    expect(matched.group).toBe(groups[2]);
    expect(matched.matchedAgent).toBe('*');
  });

  it('returns undefined when no wildcard and no matching agent', () => {
    const matched = findMatchingUserAgentGroup(
      [{ userAgents: ['otherbot'], rules: [] }],
      'OpenSearchBot/1.0',
    );
    expect(matched.group).toBeUndefined();
  });
});

describe('Robots.txt Parser — Rule Precedence & Longest Match', () => {
  it('prefers the longest matching pattern (RFC 9309)', () => {
    const rules = [
      { type: 'disallow' as const, pattern: '/private/', patternLength: 9 },
      { type: 'allow' as const, pattern: '/private/public-preview/', patternLength: 24 },
    ];

    // /private/secret -> matches /private/ (len 9) -> disallowed
    expect(evaluatePathRules(rules, '/private/secret').allowed).toBe(false);

    // /private/public-preview/doc.html -> matches /private/public-preview/ (len 24) -> allowed
    expect(evaluatePathRules(rules, '/private/public-preview/doc.html').allowed).toBe(true);
  });

  it('prefers Allow when Allow and Disallow have the exact same match length', () => {
    const rules = [
      { type: 'disallow' as const, pattern: '/page', patternLength: 5 },
      { type: 'allow' as const, pattern: '/page', patternLength: 5 },
    ];

    expect(evaluatePathRules(rules, '/page').allowed).toBe(true);
  });

  it('allows everything when no rules match', () => {
    const rules = [{ type: 'disallow' as const, pattern: '/admin/', patternLength: 7 }];

    expect(evaluatePathRules(rules, '/public/page').allowed).toBe(true);
  });
});
