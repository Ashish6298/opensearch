/**
 * @opensearch/crawler — Link Graph Extraction & Safeguards Test Suite (Phase 87)
 *
 * Verifies that:
 * 1. Safe Link Extraction: Extracts outbound links, resolves relative URLs, parses rel="nofollow" and page-level meta robots.
 * 2. URL Canonicalization: Normalizes URLs, applies canonical tags, and maps redirects deterministically.
 * 3. Duplicate Edge Elimination: Collapses repeated links between identical source/target pairs into single directed edges.
 * 4. Safety & SSRF Safeguards: Rejects non-HTTP schemes (javascript, file, data, ftp, mailto) and private/loopback/cloud-metadata targets.
 * 5. Memory & Size Bounds: Strictly enforces maxNodes and maxOutboundEdgesPerNode limits.
 * 6. Reproducibility & Serialization: Verifies 100% reproducible graph rebuild from crawl data and JSON snapshot round-tripping.
 */

import { describe, it, expect } from 'vitest';
import {
  LinkGraph,
  DefaultHtmlParser,
  extractOutboundLinks,
} from '../src/index.js';

describe('Phase 87 — Link Graph Extraction & Representation', () => {
  describe('1. Safe Outbound Link & Metadata Extraction', () => {
    it('extracts links, resolves relative paths against document URL, and captures anchor text', () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <body>
            <a href="/about">About Us</a>
            <a href="https://example.com/docs/guide">Documentation</a>
            <a href="https://external.org/resource">External Resource</a>
          </body>
        </html>
      `;

      const links = extractOutboundLinks(html, 'https://example.com/home');

      expect(links).toHaveLength(3);
      expect(links[0].normalizedUrl).toBe('https://example.com/about');
      expect(links[0].anchorText).toBe('About Us');
      expect(links[0].isInternal).toBe(true);

      expect(links[1].normalizedUrl).toBe('https://example.com/docs/guide');
      expect(links[1].isInternal).toBe(true);

      expect(links[2].normalizedUrl).toBe('https://external.org/resource');
      expect(links[2].isInternal).toBe(false);
    });

    it('extracts and marks rel="nofollow", rel="ugc", and rel="sponsored" attributes', () => {
      const html = `
        <a href="https://example.com/sponsor" rel="sponsored nofollow">Sponsored Link</a>
        <a href="https://example.com/comment" rel="ugc">User Comment</a>
        <a href="https://example.com/trusted">Trusted Link</a>
      `;

      const links = extractOutboundLinks(html, 'https://example.com/');
      expect(links).toHaveLength(3);

      expect(links[0].isNofollow).toBe(true);
      expect(links[0].relAttributes).toContain('nofollow');
      expect(links[0].relAttributes).toContain('sponsored');

      expect(links[1].isNofollow).toBe(false);
      expect(links[1].relAttributes).toContain('ugc');

      expect(links[2].isNofollow).toBe(false);
      expect(links[2].relAttributes).toBeUndefined();
    });

    it('marks all outbound links as isNofollow when page specifies meta robots nofollow', () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta name="robots" content="index, nofollow" />
          </head>
          <body>
            <a href="https://example.com/page1">Page 1</a>
            <a href="https://example.com/page2">Page 2</a>
          </body>
        </html>
      `;

      const parser = new DefaultHtmlParser();
      const doc = parser.parse(html, 'https://example.com/');

      expect(doc.outboundLinks).toHaveLength(2);
      expect(doc.outboundLinks[0].isNofollow).toBe(true);
      expect(doc.outboundLinks[1].isNofollow).toBe(true);
    });
  });

  describe('2. Unsafe Scheme & SSRF Rejection', () => {
    it('strictly rejects non-HTTP schemes and pseudo-protocols', () => {
      const html = `
        <a href="javascript:alert(1)">Exploit</a>
        <a href="data:text/html,<b>Payload</b>">Data URI</a>
        <a href="file:///etc/passwd">File Scheme</a>
        <a href="ftp://ftp.example.com/files">FTP</a>
        <a href="mailto:admin@example.com">Email</a>
        <a href="tel:+1234567890">Phone</a>
        <a href="about:blank">About</a>
        <a href="#section-top">Fragment</a>
        <a href="https://valid.com/page">Valid Link</a>
      `;

      const links = extractOutboundLinks(html, 'https://example.com/');
      expect(links).toHaveLength(1);
      expect(links[0].normalizedUrl).toBe('https://valid.com/page');
    });

    it('strictly blocks private/loopback/cloud-metadata targets (SSRF protection)', () => {
      const graph = new LinkGraph();

      // Prohibited SSRF destinations
      expect(graph.addEdge('https://example.com/', 'http://127.0.0.1/admin')).toBe(false);
      expect(graph.addEdge('https://example.com/', 'http://localhost:8080/')).toBe(false);
      expect(graph.addEdge('https://example.com/', 'http://169.254.169.254/latest/meta-data')).toBe(false);
      expect(graph.addEdge('https://example.com/', 'http://10.0.0.1/internal')).toBe(false);
      expect(graph.addEdge('https://example.com/', 'http://192.168.1.1/router')).toBe(false);
      expect(graph.addEdge('https://example.com/', 'http://service.local/api')).toBe(false);
      expect(graph.addEdge('https://example.com/', 'http://database.internal:5432')).toBe(false);

      expect(graph.getNodeUrls()).toHaveLength(0);
      expect(graph.toJSON().metadata.droppedUnsafeUrls).toBe(7);
    });

    it('rejects malformed or oversized URLs', () => {
      const graph = new LinkGraph();

      expect(graph.addEdge('https://example.com/', 'https://')).toBe(false);
      expect(graph.addEdge('https://example.com/', 'http://[invalid-ipv6/')).toBe(false);
      expect(graph.addEdge('https://example.com/', 'https://example.com/' + 'a'.repeat(2500))).toBe(false);

      expect(graph.getNodeUrls()).toHaveLength(0);
    });
  });

  describe('3. Canonicalization, Redirects & Duplicate Edge Elimination', () => {
    it('collapses duplicate edges between the same source and target deterministically', () => {
      const graph = new LinkGraph();

      // Ingest multiple duplicate links on the same page (varying fragments, host casing, default ports)
      graph.addEdge('https://example.com/page-a', 'https://example.com/page-b', { anchorText: 'Link 1' });
      graph.addEdge('https://example.com/page-a#section', 'https://example.com/page-b#comments', { anchorText: 'Link 2' });
      graph.addEdge('https://EXAMPLE.COM:443/page-a/', 'https://EXAMPLE.COM:443/page-b/', { anchorText: 'Link 3' });

      expect(graph.hasEdge('https://example.com/page-a', 'https://example.com/page-b')).toBe(true);
      expect(graph.getOutbound('https://example.com/page-a')).toEqual(['https://example.com/page-b']);
      expect(graph.getInbound('https://example.com/page-b')).toEqual(['https://example.com/page-a']);

      // Degrees must accurately reflect single collapsed edge
      expect(graph.getOutDegree('https://example.com/page-a')).toBe(1);
      expect(graph.getInDegree('https://example.com/page-b')).toBe(1);

      const edge = graph.getEdge('https://example.com/page-a', 'https://example.com/page-b');
      expect(edge?.count).toBe(3);
      expect(graph.toJSON().metadata.droppedDuplicates).toBe(2);
    });

    it('drops self-referential loops by default to prevent PageRank self-inflation', () => {
      const graph = new LinkGraph({ allowSelfLoops: false });

      const added = graph.addEdge('https://example.com/page-a', 'https://example.com/page-a');
      expect(added).toBe(false);
      expect(graph.hasEdge('https://example.com/page-a', 'https://example.com/page-a')).toBe(false);
      expect(graph.toJSON().metadata.droppedSelfLoops).toBe(1);
    });

    it('resolves redirects and canonical URLs to target destination nodes', () => {
      const graph = new LinkGraph();

      // Register redirect: /old-slug -> /new-slug
      graph.registerRedirect('https://example.com/old-slug', 'https://example.com/new-slug');

      // Add edge pointing to the old slug
      graph.addEdge('https://example.com/referrer', 'https://example.com/old-slug');

      // Target should be resolved to /new-slug
      expect(graph.hasEdge('https://example.com/referrer', 'https://example.com/new-slug')).toBe(true);
      expect(graph.hasEdge('https://example.com/referrer', 'https://example.com/old-slug')).toBe(false);
      expect(graph.getInbound('https://example.com/new-slug')).toEqual(['https://example.com/referrer']);
    });

    it('respects canonicalUrl declared in document input', () => {
      const graph = new LinkGraph();

      graph.addDocument({
        url: 'https://example.com/article?utm_source=twitter',
        canonicalUrl: 'https://example.com/article',
        title: 'Canonical Article',
        outboundLinks: ['https://example.com/referenced-topic'],
      });

      // The canonical URL should be the primary node in the graph
      expect(graph.hasNode('https://example.com/article')).toBe(true);
      expect(graph.hasEdge('https://example.com/article', 'https://example.com/referenced-topic')).toBe(true);
    });

    it('excludes nofollow edges when includeNofollow is false (default)', () => {
      const graph = new LinkGraph({ includeNofollow: false });

      graph.addDocument({
        url: 'https://example.com/blog',
        outboundLinks: [
          { normalizedUrl: 'https://example.com/trusted', isNofollow: false },
          { normalizedUrl: 'https://example.com/sponsored', isNofollow: true },
        ],
      });

      expect(graph.hasEdge('https://example.com/blog', 'https://example.com/trusted')).toBe(true);
      expect(graph.hasEdge('https://example.com/blog', 'https://example.com/sponsored')).toBe(false);
    });
  });

  describe('4. Memory & Bounded Limits Safeguards', () => {
    it('enforces maxOutboundEdgesPerNode limit on link farms / spider traps', () => {
      const graph = new LinkGraph({ maxOutboundEdgesPerNode: 5 });

      for (let i = 1; i <= 10; i++) {
        graph.addEdge('https://example.com/hub', `https://example.com/target-${i}`);
      }

      // Outbound edges capped at 5
      expect(graph.getOutDegree('https://example.com/hub')).toBe(5);
      expect(graph.getOutbound('https://example.com/hub')).toHaveLength(5);
      expect(graph.toJSON().metadata.truncatedEdges).toBe(5);
    });

    it('enforces maxNodes limit preventing unbounded graph growth', () => {
      const graph = new LinkGraph({ maxNodes: 4 });

      graph.ensureNode('https://example.com/node-1');
      graph.ensureNode('https://example.com/node-2');
      graph.ensureNode('https://example.com/node-3');
      graph.ensureNode('https://example.com/node-4');

      // Attempting to add 5th node should be rejected
      const addedFifth = graph.ensureNode('https://example.com/node-5');
      expect(addedFifth).toBe(false);
      expect(graph.getNodeUrls()).toHaveLength(4);
    });
  });

  describe('5. Topology Metrics & Dangling Node Identification', () => {
    it('computes accurate degrees, density, and identifies dangling nodes for PageRank', () => {
      const graph = new LinkGraph();

      // Structure:
      // A -> B, A -> C
      // B -> C
      // C has no outbound links (dangling node)
      graph.addEdge('https://example.com/a', 'https://example.com/b');
      graph.addEdge('https://example.com/a', 'https://example.com/c');
      graph.addEdge('https://example.com/b', 'https://example.com/c');

      const summary = graph.getSummary();
      expect(summary.nodeCount).toBe(3);
      expect(summary.edgeCount).toBe(3);
      expect(summary.danglingNodeCount).toBe(1);

      // Node C has 0 outbound edges
      expect(graph.getOutDegree('https://example.com/c')).toBe(0);
      expect(graph.getInDegree('https://example.com/c')).toBe(2);
      expect(graph.getDanglingNodes()).toEqual(['https://example.com/c']);

      // Reverse adjacency returns backlinks correctly
      expect(graph.getInbound('https://example.com/c')).toEqual([
        'https://example.com/a',
        'https://example.com/b',
      ]);
    });
  });

  describe('6. Reproducibility & Serialization', () => {
    it('guarantees 100% reproducible graph rebuild from crawl documents', () => {
      const crawlDocuments = [
        {
          url: 'https://example.com/doc-1',
          title: 'Document 1',
          outboundLinks: ['https://example.com/doc-2', 'https://example.com/doc-3'],
        },
        {
          url: 'https://example.com/doc-2',
          title: 'Document 2',
          outboundLinks: ['https://example.com/doc-3'],
        },
        {
          url: 'https://example.com/doc-3',
          title: 'Document 3',
          outboundLinks: [],
        },
      ];

      const graph1 = LinkGraph.rebuildFromCrawlData(crawlDocuments);
      const graph2 = LinkGraph.rebuildFromCrawlData(crawlDocuments);

      const fixedTimestamp = '2026-10-27T00:00:00.000Z';
      // Snapshots must be completely identical
      expect(graph1.toJSON(fixedTimestamp)).toEqual(graph2.toJSON(fixedTimestamp));
      expect(graph1.getNodeUrls()).toEqual(graph2.getNodeUrls());
      expect(graph1.getSummary()).toEqual(graph2.getSummary());
    });

    it('serializes to versioned JSON v1.0.0 and restores with full fidelity', () => {
      const graph = new LinkGraph();
      graph.addEdge('https://example.com/alpha', 'https://example.com/beta', { anchorText: 'Beta Docs' });
      graph.addEdge('https://example.com/beta', 'https://example.com/gamma');

      const jsonString = graph.exportJson();
      const restored = LinkGraph.importJson(jsonString);

      expect(restored.getNodeUrls()).toEqual(graph.getNodeUrls());
      expect(restored.hasEdge('https://example.com/alpha', 'https://example.com/beta')).toBe(true);
      expect(restored.hasEdge('https://example.com/beta', 'https://example.com/gamma')).toBe(true);
      expect(restored.getEdge('https://example.com/alpha', 'https://example.com/beta')?.anchorText).toBe('Beta Docs');
      expect(restored.getInbound('https://example.com/beta')).toEqual(['https://example.com/alpha']);
      expect(restored.getSummary()).toEqual(graph.getSummary());
    });
  });
});
