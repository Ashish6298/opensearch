import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createStorageAdapter, StorageAdapter } from '@opensearch/storage';
import {
  createIndexBuilder,
  createPrefixTrie,
  PrefixTrie,
  InvertedIndex,
} from '@opensearch/indexer';
import {
  createQueryParser,
  createCandidateRetriever,
  createRankingEngine,
  createResultGenerator,
  createTypoToleranceEngine,
  createInstantAnswerEngine,
  RankingEngine,
  TypoToleranceEngine,
  InstantAnswerEngine,
} from '@opensearch/ranking';
import { SitemapParser } from '@opensearch/crawler';
import { createApiServer, ApiServer, generateOpenApiSpec, generateDocsHtml } from '@opensearch/api';
import { runCli } from '../../../packages/cli/src/index.js';
import { loadConfig, PROJECT_NAME, PROJECT_VERSION } from '@opensearch/shared';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';

describe('Phase 45 — V1.2.0 End-to-End Integration, Benchmarking & Release Verification', () => {
  let tempDir: string;
  let storage: StorageAdapter;
  let invertedIndex: InvertedIndex;
  let rankingEngine: RankingEngine;
  let prefixTrie: PrefixTrie;
  let typoEngine: TypoToleranceEngine;
  let queryParser: ReturnType<typeof createQueryParser>;
  let instantAnswerEngine: InstantAnswerEngine;
  let apiServer: ApiServer;
  let apiBaseUrl: string;

  const testCorpus = [
    {
      url: 'https://opensearch.dev/docs/architecture',
      title: 'OpenSearch V1.2.0 Architecture & Engineering Guide',
      content:
        'OpenSearch is a privacy-first web search engine. It features inverted indexing, Okapi BM25 ranking, prefix autocomplete, and zero tracking.',
      domain: 'opensearch.dev',
      etag: '"arch-v120"',
      lastModified: 'Wed, 21 Oct 2026 07:28:00 GMT',
    },
    {
      url: 'https://opensearch.dev/docs/crawler',
      title: 'OpenSearch Autonomous Crawler & Sitemap Engine',
      content:
        'The crawler module supports robots.txt parsing, XML sitemap discovery, streaming sitemap parsing, and HTTP 304 conditional recrawling.',
      domain: 'opensearch.dev',
      etag: '"crawler-v120"',
      lastModified: 'Thu, 22 Oct 2026 08:00:00 GMT',
    },
    {
      url: 'https://opensearch.dev/docs/cli',
      title: 'OpenSearch Standalone CLI Tool Reference',
      content:
        'Execute search queries directly from terminal using npx @opensearch/cli with ANSI styling, JSON output, and stdin pipeline support.',
      domain: 'opensearch.dev',
      etag: '"cli-v120"',
      lastModified: 'Thu, 22 Oct 2026 09:00:00 GMT',
    },
    {
      url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
      title: 'JavaScript Web Technology Documentation | MDN',
      content:
        'JavaScript is a lightweight interpreted compiled language with first-class functions known for web development and node.js environments.',
      domain: 'developer.mozilla.org',
      etag: '"mdn-js"',
      lastModified: 'Fri, 23 Oct 2026 10:00:00 GMT',
    },
    {
      url: 'https://en.wikipedia.org/wiki/Information_retrieval',
      title: 'Information Retrieval and Search Engine Ranking',
      content:
        'Information retrieval is the science of searching for information in a document corpus using inverted indices and relevance scoring algorithms like BM25.',
      domain: 'en.wikipedia.org',
      etag: '"wiki-ir"',
      lastModified: 'Sat, 24 Oct 2026 11:00:00 GMT',
    },
  ];

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opensearch-v120-bench-'));
    const storageDir = path.join(tempDir, 'storage');
    const indexDir = path.join(tempDir, 'index');

    const config = loadConfig({
      STORAGE_DIR: storageDir,
      INDEX_DIR: indexDir,
      NODE_ENV: 'test',
    });

    storage = createStorageAdapter({ config });
    await storage.initialize();

    // Store corpus
    for (let i = 0; i < testCorpus.length; i++) {
      const doc = testCorpus[i];
      await storage.documents.create({
        url: doc.url,
        urlHash: `hash_${i}_${doc.domain}`,
        title: doc.title,
        headings: doc.title,
        description: doc.content.slice(0, 80),
        bodyText: doc.content,
        language: 'en',
        contentType: 'text/html',
        contentLength: doc.content.length,
        httpStatus: 200,
        etag: doc.etag,
        lastModified: doc.lastModified,
        outboundLinks: [],
      });
    }

    // Build Inverted Index
    const indexBuilder = createIndexBuilder({
      storage,
      indexDir,
    });
    await indexBuilder.build({ mode: 'full' });
    invertedIndex = indexBuilder.getActiveIndex()!;

    // Initialize subsystems
    queryParser = createQueryParser();
    const candidateRetriever = createCandidateRetriever(invertedIndex);
    rankingEngine = createRankingEngine(invertedIndex);
    const resultGenerator = createResultGenerator();

    prefixTrie = createPrefixTrie();
    for (const doc of testCorpus) {
      prefixTrie.insert(doc.title, 5);
      prefixTrie.insert(doc.domain, 3);
    }
    prefixTrie.insert('opensearch', 10);
    prefixTrie.insert('opensearch architecture', 8);
    prefixTrie.insert('crawler', 6);
    prefixTrie.insert('javascript', 7);

    typoEngine = createTypoToleranceEngine(invertedIndex);
    instantAnswerEngine = createInstantAnswerEngine();

    // Start API Server
    apiServer = createApiServer({
      config,
      services: {
        index: invertedIndex,
        queryParser,
        candidateRetriever,
        rankingEngine,
        resultGenerator,
      },
    });
    const info = await apiServer.start(0, '127.0.0.1');
    apiBaseUrl = `http://127.0.0.1:${info.port}`;
  });

  afterAll(async () => {
    if (apiServer) {
      await apiServer.stop();
    }
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // cleanup ignore
      }
    }
  });

  describe('1. Global System Identity & Version Convergence', () => {
    it('reports version 1.2.0 across project identity constants', () => {
      expect(PROJECT_NAME).toBe('OpenSearch');
      expect(PROJECT_VERSION).toBe('1.2.0');
    });

    it('OpenAPI spec reflects version 1.2.0 and correct metadata', () => {
      const spec = generateOpenApiSpec();
      expect(spec.openapi).toBe('3.1.0');
      expect(spec.info.version).toBe('1.2.0');
      expect(spec.info.title).toContain('OpenSearch');
    });

    it('Zero-dependency documentation renderer produces compliant HTML with version badge', () => {
      const html = generateDocsHtml();
      expect(html).toContain('v1.2.0');
      expect(html).toContain('Developer API Reference');
      expect(html).toContain('/api/v1/openapi.json');
    });
  });

  describe('2. End-to-End Search Pipeline & Milestone Features', () => {
    it('handles query operators (site: and exact phrase quotes)', async () => {
      const parsed = queryParser.parse('site:opensearch.dev "privacy-first"');
      expect(parsed.filters?.site).toBe('opensearch.dev');
      expect(parsed.phrases.length).toBeGreaterThan(0);
      expect(parsed.phrases[0]!.rawPhrase).toBe('privacy-first');
    });

    it('evaluates instant calculations, conversions, and bangs', () => {
      const calc = instantAnswerEngine.evaluate('15 * 4');
      expect(calc).not.toBeNull();
      expect(calc?.primaryResult).toBe('60');

      const bang = instantAnswerEngine.evaluate('!gh opensearch');
      expect(bang).not.toBeNull();
      expect(bang?.type).toBe('bang');
      expect(bang?.redirectUrl).toContain('github.com');
    });

    it('suggests typo corrections for misspelled terms', () => {
      const correction = typoEngine.suggestCorrection('artitecture');
      expect(correction).not.toBeNull();
      expect(correction?.suggestedQuery.toLowerCase()).toContain('architecture');
    });

    it('evaluates XML sitemap parsing', async () => {
      const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url>
            <loc>https://opensearch.dev/docs/architecture</loc>
            <lastmod>2026-10-21</lastmod>
            <changefreq>daily</changefreq>
            <priority>0.9</priority>
          </url>
        </urlset>`;

      const parser = new SitemapParser();
      const entries = await parser.parse(sitemapXml, 'https://opensearch.dev');
      expect(entries.urls.length).toBe(1);
      expect(entries.urls[0]!.loc).toBe('https://opensearch.dev/docs/architecture');
    });

    it('executes standalone CLI search with JSON output against live test API', async () => {
      const res = await runCli(['privacy', '--api', apiBaseUrl, '--json']);
      expect(res.exitCode).toBe(0);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.results).toBeDefined();
      expect(parsed.results.length).toBeGreaterThan(0);
      expect(parsed.results[0].title).toContain('OpenSearch V1.2.0 Architecture');
    });
  });

  describe('3. Latency & Performance Benchmarks (P99 SLA Verification)', () => {
    it('executes autocomplete suggestions with P99 latency < 5ms over 1,000 queries', () => {
      const iterations = 1000;
      const latencies: number[] = [];
      const testPrefixes = ['o', 'op', 'open', 'craw', 'doc', 'java', 'info', 'rele', 'arch'];

      for (let i = 0; i < iterations; i++) {
        const prefix = testPrefixes[i % testPrefixes.length]!;
        const start = performance.now();
        const suggestions = prefixTrie.suggest(prefix);
        const duration = performance.now() - start;
        latencies.push(duration);
        expect(suggestions).toBeDefined();
      }

      latencies.sort((a, b) => a - b);
      const p50 = latencies[Math.floor(iterations * 0.5)]!;
      const p90 = latencies[Math.floor(iterations * 0.9)]!;
      const p99 = latencies[Math.floor(iterations * 0.99)]!;
      const max = latencies[iterations - 1]!;

      // P99 SLA under 5ms
      expect(p99).toBeLessThan(5.0);
    });

    it('executes local index search queries with P99 latency < 20ms over 500 queries', () => {
      const iterations = 500;
      const latencies: number[] = [];
      const queries = [
        'privacy-first search engine',
        'crawler sitemap discovery',
        'information retrieval bm25',
        'javascript documentation',
        'standalone cli tool',
      ];

      const candidateRetriever = createCandidateRetriever(invertedIndex);

      for (let i = 0; i < iterations; i++) {
        const q = queries[i % queries.length]!;
        const parsed = queryParser.parse(q);
        const start = performance.now();
        const retrievalResult = candidateRetriever.retrieve(parsed);
        const results = rankingEngine.rank(parsed, retrievalResult.candidates);
        const duration = performance.now() - start;
        latencies.push(duration);
        expect(results.hits.length).toBeGreaterThan(0);
      }

      latencies.sort((a, b) => a - b);
      const p50 = latencies[Math.floor(iterations * 0.5)]!;
      const p90 = latencies[Math.floor(iterations * 0.9)]!;
      const p99 = latencies[Math.floor(iterations * 0.99)]!;

      // P99 SLA under 20ms
      expect(p99).toBeLessThan(20.0);
    });

    it('verifies zero memory leaks / stable heap during repeated sitemap and query cycles', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      const parser = new SitemapParser();

      // Run 2,000 cycles
      for (let i = 0; i < 2000; i++) {
        const xml = `<urlset><url><loc>https://example.com/page/${i}</loc></url></urlset>`;
        await parser.parse(xml, 'https://example.com');
        prefixTrie.suggest('op');
        typoEngine.suggestCorrection('searchh');
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const diffMb = (finalMemory - initialMemory) / (1024 * 1024);
      // Ensure memory growth is well bounded (< 35 MB)
      expect(diffMb).toBeLessThan(35);
    });
  });
});
