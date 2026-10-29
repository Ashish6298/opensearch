import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { ApiServer } from '../src/server.js';
import { createInvertedIndex, createDocumentProcessor } from '@opensearch/indexer';
import { loadConfig } from '@opensearch/shared';
import type { SearchApiResponse } from '../src/types.js';

describe('Phase 104 — Quick Answer API Endpoint Integration', () => {
  let server: ApiServer;
  let baseUrl: string;

  beforeAll(async () => {
    const config = loadConfig();
    const index = createInvertedIndex();
    const processor = createDocumentProcessor();

    // Seed test documents
    index.addDocument(
      processor.process({
        id: 'doc-search-engine-1',
        url: 'https://opensearch.local/docs/search',
        title: 'OpenSearch Inverted Index Architecture',
        description: 'An inverted index is an index data structure storing a mapping from words to their locations in a document collection. It enables fast full-text searching.',
        bodyText: 'An inverted index is an index data structure storing a mapping from words to their locations in a document collection. It enables fast full-text searching.',
        language: 'en',
      }),
    );

    index.addDocument(
      processor.process({
        id: 'doc-search-engine-2',
        url: 'https://opensearch.local/docs/privacy',
        title: 'OpenSearch Privacy Principles',
        description: 'OpenSearch enforces a verifiable privacy receipt for all searches. Local-only search completely suppresses external providers and analytics trackers.',
        bodyText: 'OpenSearch enforces a verifiable privacy receipt for all searches. Local-only search completely suppresses external providers and analytics trackers.',
        language: 'en',
      }),
    );

    server = new ApiServer({
      config,
      index,
    });

    const info = await server.start(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${info.port}`;
  });

  afterAll(async () => {
    await server.stop();
  });

  function httpGet(path: string): Promise<{ statusCode: number; data: SearchApiResponse }> {
    return new Promise((resolve, reject) => {
      http.get(`${baseUrl}${path}`, res => {
        let raw = '';
        res.on('data', chunk => (raw += chunk));
        res.on('end', () => {
          try {
            resolve({
              statusCode: res.statusCode || 500,
              data: JSON.parse(raw),
            });
          } catch (e) {
            reject(e);
          }
        });
        res.on('error', reject);
      });
    });
  }

  it('populates quickAnswer in search API response when results provide verified evidence', async () => {
    const res = await httpGet('/api/v1/search?q=inverted+index+data+structure');
    expect(res.statusCode).toBe(200);
    expect(res.data.quickAnswer).toBeDefined();
    expect(res.data.quickAnswer?.status).toBe('sufficient_evidence');
    expect(res.data.quickAnswer?.hasSufficientEvidence).toBe(true);
    expect(res.data.quickAnswer?.summary).toContain('[1]');
    expect(res.data.quickAnswer?.citations.length).toBeGreaterThanOrEqual(1);

    const citation = res.data.quickAnswer?.citations[0];
    expect(citation?.documentId).toBe('doc-search-engine-1');
    expect(citation?.url).toBe('https://opensearch.local/docs/search');
    expect(citation?.snippetQuote).toContain('inverted index');
  });

  it('enforces Local-only mode end-to-end in Quick Answer API', async () => {
    const res = await httpGet('/api/v1/search?q=privacy+receipt&localOnly=true');
    expect(res.statusCode).toBe(200);
    expect(res.data.quickAnswer).toBeDefined();
    expect(res.data.quickAnswer?.provenance.localOnly).toBe(true);
    expect(res.data.quickAnswer?.model.isLocal).toBe(true);
    expect(res.data.quickAnswer?.model.requiresPaidService).toBe(false);

    for (const citation of res.data.quickAnswer?.citations || []) {
      expect(citation.sourceType).toBe('local');
    }
  });

  it('returns insufficient evidence safely when query has no matching documents', async () => {
    const res = await httpGet('/api/v1/search?q=unmatched_query_term_xyz_123');
    expect(res.statusCode).toBe(200);
    expect(res.data.quickAnswer?.hasSufficientEvidence).toBe(false);
    expect(res.data.quickAnswer?.citations).toHaveLength(0);
  });
});
