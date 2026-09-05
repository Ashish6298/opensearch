/**
 * Phase 7 Tests — HTML Parser & Content Extraction
 *
 * Tests:
 * - Title extraction with fallbacks (<title> -> og:title -> <h1>)
 * - Meta description extraction (<meta name="description"> -> og:description)
 * - Headings extraction (h1–h6 hierarchical and space-separated concatenation)
 * - Canonical URL resolution (<link rel="canonical"> with relative/absolute resolution)
 * - Language extraction (<html lang="..."> -> meta tag -> HTTP header)
 * - Clean visible text extraction (strips script, style, nav, footer, comments, decodes entities)
 * - Outbound link extraction (relative resolution, base tag support, Phase 4 normalizer/dedup)
 * - Malformed HTML resilience (never throws, returns empty/graceful structures)
 * - Empty document handling
 */

import { describe, it, expect } from 'vitest';
import {
  createHtmlParser,
  DefaultHtmlParser,
  decodeHtmlEntities,
  stripHtmlNoiseTags,
  cleanVisibleText,
} from '../src/index.js';

describe('HTML Text Cleaner & Entity Decoder', () => {
  it('decodes standard and numeric HTML entities', () => {
    expect(decodeHtmlEntities('Hello &amp; World &lt;3')).toBe('Hello & World <3');
    expect(decodeHtmlEntities('&quot;OpenSearch&quot; &#39;v1&#39;')).toBe('"OpenSearch" \'v1\'');
    expect(decodeHtmlEntities('Copyright &copy; 2026 &#169;')).toBe('Copyright © 2026 ©');
  });

  it('strips noise elements (scripts, styles, nav, footer, header, comments)', () => {
    const dirty = `
      <!-- Top comment -->
      <header><nav><a href="/">Home</a></nav></header>
      <h1>Main Content</h1>
      <script>console.log("secret code");</script>
      <style>body { color: red; }</style>
      <noscript>Please enable JS</noscript>
      <svg><circle cx="50" cy="50" r="40" /></svg>
      <p>Readable text here.</p>
      <footer>Privacy Policy</footer>
    `;

    const cleaned = stripHtmlNoiseTags(dirty, true);
    expect(cleaned).not.toContain('console.log');
    expect(cleaned).not.toContain('color: red');
    expect(cleaned).not.toContain('Please enable JS');
    expect(cleaned).not.toContain('Privacy Policy');
    expect(cleaned).not.toContain('Top comment');
    expect(cleaned).toContain('Main Content');
    expect(cleaned).toContain('Readable text here.');
  });

  it('extracts clean text without extra whitespaces and preserved newlines', () => {
    const html = `
      <p>Paragraph 1 with &amp; entity.</p>
      <div>Paragraph 2 with   multiple    spaces.</div>
      <br/>
      <p>Paragraph 3.</p>
    `;
    const text = cleanVisibleText(html);
    expect(text).toContain('Paragraph 1 with & entity.');
    expect(text).toContain('Paragraph 2 with multiple spaces.');
    expect(text).toContain('Paragraph 3.');
  });
});

describe('HTML Parser — Content Extraction', () => {
  const parser = createHtmlParser();

  it('extracts complete document metadata from rich HTML fixture', () => {
    const html = `
      <!DOCTYPE html>
      <html lang="en-US">
      <head>
        <title>OpenSearch — Fast &amp; Privacy-First Search</title>
        <meta name="description" content="A modern, open search engine built from scratch.">
        <link rel="canonical" href="https://opensearch.org/about">
      </head>
      <body>
        <nav><a href="/">Home</a></nav>
        <h1>About OpenSearch</h1>
        <p>OpenSearch is designed with a privacy-first mindset.</p>
        <h2>Core Architecture</h2>
        <p>Built with TypeScript and Node.js.</p>
        <h3>Storage &amp; Indexing</h3>
        <p>High performance BM25 indexing.</p>
        <a href="/docs/guide.html">User Guide</a>
        <a href="https://github.com/Ashish6298/opensearch">GitHub Repo</a>
        <a href="mailto:contact@opensearch.org">Email Us</a> <!-- rejected scheme -->
        <a href="#section">Jump Section</a> <!-- skipped fragment -->
      </body>
      </html>
    `;

    const doc = parser.parse(html, 'https://opensearch.org/about.html');

    expect(doc.title).toBe('OpenSearch — Fast & Privacy-First Search');
    expect(doc.description).toBe('A modern, open search engine built from scratch.');
    expect(doc.canonicalUrl).toBe('https://opensearch.org/about');
    expect(doc.language).toBe('en');
    expect(doc.headings).toBe('About OpenSearch Core Architecture Storage & Indexing');
    expect(doc.headingItems).toHaveLength(3);
    expect(doc.headingItems[0]).toEqual({ level: 1, text: 'About OpenSearch' });
    expect(doc.headingItems[1]).toEqual({ level: 2, text: 'Core Architecture' });
    expect(doc.headingItems[2]).toEqual({ level: 3, text: 'Storage & Indexing' });

    expect(doc.bodyText).toContain('OpenSearch is designed with a privacy-first mindset.');
    expect(doc.bodyText).toContain('Built with TypeScript and Node.js.');

    // Outbound links: should resolve /, /docs/guide.html and GitHub repo, ignore mailto and #
    expect(doc.discoveredUrls).toHaveLength(3);
    expect(doc.discoveredUrls).toContain('https://opensearch.org/');
    expect(doc.discoveredUrls).toContain('https://opensearch.org/docs/guide.html');
    expect(doc.discoveredUrls).toContain('https://github.com/Ashish6298/opensearch');
  });

  it('falls back to og:title and h1 when <title> is missing', () => {
    const htmlWithOg = `
      <html>
      <head><meta property="og:title" content="OpenGraph Title"></head>
      <body><p>Text</p></body>
      </html>
    `;
    const docOg = parser.parse(htmlWithOg, 'https://example.com');
    expect(docOg.title).toBe('OpenGraph Title');

    const htmlWithH1 = `
      <html>
      <body><h1>Heading as Title</h1><p>Text</p></body>
      </html>
    `;
    const docH1 = parser.parse(htmlWithH1, 'https://example.com');
    expect(docH1.title).toBe('Heading as Title');
  });

  it('handles <base href="..."> for relative link and canonical resolution', () => {
    const html = `
      <html>
      <head>
        <base href="https://cdn.example.com/assets/">
        <link rel="canonical" href="../canonical-page">
      </head>
      <body>
        <a href="doc.html">Relative Link</a>
      </body>
      </html>
    `;

    const doc = parser.parse(html, 'https://example.com/root.html');
    expect(doc.canonicalUrl).toBe('https://cdn.example.com/canonical-page');
    expect(doc.discoveredUrls).toContain('https://cdn.example.com/assets/doc.html');
  });

  it('handles empty and malformed HTML gracefully without throwing', () => {
    const emptyDoc = parser.parse('', 'https://example.com');
    expect(emptyDoc.title).toBe('');
    expect(emptyDoc.bodyText).toBe('');
    expect(emptyDoc.discoveredUrls).toEqual([]);

    const malformedHtml = `
      <<<<<<title>>Broken Title<<<</title>
      <div unclosed tags<p>Broken structure<a href="broken
      <h1>Unclosed Heading
      <script>Unclosed script
    `;
    const malformedDoc = parser.parse(malformedHtml, 'https://example.com');
    expect(malformedDoc).toBeDefined();
    expect(typeof malformedDoc.bodyText).toBe('string');
  });
});
