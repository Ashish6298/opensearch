/**
 * @opensearch/api — Phase 114: Product Identity Verification Test Suite
 *
 * Verifies:
 * 1. Product Identity Constants & Disambiguation:
 *    - Canonical name vs distinct name ('OpenSearch' vs 'OpenSearch Web').
 *    - Explicit disclaimer of non-affiliation with Amazon OpenSearch / AWS.
 *    - Explicit statement that no legal trademark clearance is claimed.
 *    - Protocol compatibility with OpenSearch 1.1 description documents.
 * 2. API Endpoints Product Metadata:
 *    - GET / exposes product identity, version, endpoints, and legal non-affiliation.
 *    - GET /api/v1/status exposes product identity, status, and legal disclaimer.
 *    - GET /opensearch.xml retains distinct ShortName 'OpenSearch Web' and disclaimer.
 *    - GET /docs renders distinct product branding and non-affiliation text.
 * 3. Web UI Shell Identity:
 *    - HTML autodiscovery title 'OpenSearch Web'.
 *    - Terminal footer product identity notice disambiguating from AWS/Amazon OpenSearch.
 * 4. Intentional Legacy References:
 *    - Core engine identifier (PROJECT_NAME = 'OpenSearch') maintained for backward compatibility.
 *    - Internal package scopes (@opensearch/*) remain functional and documented.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  PROJECT_NAME,
  PROJECT_VERSION,
  PRODUCT_IDENTITY,
  PRODUCT_NAME,
  PRODUCT_FULL_NAME,
  PRODUCT_DISCLAIMER,
  TRADEMARK_NOTICE,
  getProjectIdentity,
} from '@opensearch/shared';
import { ApiServer, createApiServer } from '../src/index.js';
import { createWebServer, WebServer } from '../../web/src/server.js';
import { createInvertedIndex } from '@opensearch/indexer';

describe('Phase 114 — Product Identity and Trademark Disambiguation Suite', () => {
  let apiServer: ApiServer;
  let webServer: WebServer;
  let apiBaseUrl: string;
  let webBaseUrl: string;

  beforeAll(async () => {
    const index = createInvertedIndex();
    apiServer = createApiServer({
      index,
      rateLimitPerMinute: 100,
      enableMcp: false,
    });
    const apiInfo = await apiServer.start(0, '127.0.0.1');
    apiBaseUrl = `http://127.0.0.1:${apiInfo.port}`;

    webServer = createWebServer({
      apiUrl: `${apiBaseUrl}/api/v1/search`,
    });
    const webInfo = await webServer.start(0, '127.0.0.1');
    webBaseUrl = `http://127.0.0.1:${webInfo.port}`;
  });

  afterAll(async () => {
    await apiServer.stop();
    await webServer.stop();
  });

  describe('1. Shared Substrate Product Identity Models', () => {
    it('defines distinct public product identity distinct from Amazon OpenSearch', () => {
      expect(PRODUCT_IDENTITY.distinctName).toBe('OpenSearch Web');
      expect(PRODUCT_IDENTITY.shortName).toBe('OpenSearch Web');
      expect(PRODUCT_NAME).toBe('OpenSearch Web');
      expect(PRODUCT_FULL_NAME).toContain('OpenSearch Web');
      expect(PRODUCT_FULL_NAME).toContain('Sovereign Privacy-Preserving Search Engine');
    });

    it('documents intentional canonical references for internal engine components', () => {
      expect(PRODUCT_IDENTITY.canonicalName).toBe('OpenSearch');
      expect(PROJECT_NAME).toBe('OpenSearch');
      expect(PRODUCT_IDENTITY.packageScope).toBe('@opensearch');
      expect(PRODUCT_IDENTITY.repositoryName).toBe('opensearch');
    });

    it('contains explicit non-affiliation disclaimer regarding Amazon Web Services', () => {
      expect(PRODUCT_DISCLAIMER).toContain('Amazon Web Services');
      expect(PRODUCT_DISCLAIMER).toContain('Amazon OpenSearch');
      expect(PRODUCT_DISCLAIMER).toContain('not affiliated with');
    });

    it('explicitly states that no legal trademark clearance is claimed', () => {
      expect(TRADEMARK_NOTICE).toContain('No claim of legal trademark clearance');
      expect(TRADEMARK_NOTICE).toContain('belong to their respective owners');
    });

    it('getProjectIdentity returns comprehensive identity payload', () => {
      const identity = getProjectIdentity();
      expect(identity.name).toBe('OpenSearch');
      expect(identity.version).toBe(PROJECT_VERSION);
      expect(identity.productName).toBe('OpenSearch Web');
      expect(identity.fullName).toContain('OpenSearch Web');
      expect(identity.disclaimer).toBe(PRODUCT_DISCLAIMER);
      expect(identity.trademarkNotice).toBe(TRADEMARK_NOTICE);
      expect(identity.protocolCompatibility).toContain('OpenSearch 1.1');
    });
  });

  describe('2. API Server Product Identity & Metadata', () => {
    it('GET / exposes distinct product identity, description, and legal notices', async () => {
      const res = await fetch(`${apiBaseUrl}/`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.name).toBe('OpenSearch');
      expect(json.product).toBe('OpenSearch Web');
      expect(json.fullName).toBe(PRODUCT_FULL_NAME);
      expect(json.description).toContain('OpenSearch Web');
      expect(json.legal).toBeDefined();
      expect(json.legal.disclaimer).toBe(PRODUCT_DISCLAIMER);
      expect(json.legal.notAffiliatedWith).toContain('Amazon Web Services');
      expect(json.legal.trademarkNotice).toBe(TRADEMARK_NOTICE);
    });

    it('GET /api/v1/status includes product identity and non-affiliation notice', async () => {
      const res = await fetch(`${apiBaseUrl}/api/v1/status`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.name).toBe('OpenSearch');
      expect(json.product).toBe('OpenSearch Web');
      expect(json.phase).toContain('Phase 114');
      expect(json.legal).toBeDefined();
      expect(json.legal.disclaimer).toBe(PRODUCT_DISCLAIMER);
      expect(json.legal.trademarkNotice).toBe(TRADEMARK_NOTICE);
    });

    it('GET /opensearch.xml serves OpenSearch Web descriptor with non-affiliation disclaimer', async () => {
      const res = await fetch(`${apiBaseUrl}/opensearch.xml`);
      expect(res.status).toBe(200);

      const text = await res.text();
      expect(text).toContain('<ShortName>OpenSearch Web</ShortName>');
      expect(text).toContain('Not affiliated with Amazon Web Services or Amazon OpenSearch Service');
    });

    it('GET /docs renders distinct OpenSearch Web branding and legal notice', async () => {
      const res = await fetch(`${apiBaseUrl}/docs`);
      expect(res.status).toBe(200);

      const html = await res.text();
      expect(html).toContain('Developer Docs & API Sandbox — OpenSearch Web');
      expect(html).toContain('⚡ OpenSearch Web');
      expect(html).toContain(PRODUCT_DISCLAIMER);
    });
  });

  describe('3. Web Application Identity & Disambiguation', () => {
    it('HTML shell head declares distinct product title and autodiscovery', async () => {
      const res = await fetch(`${webBaseUrl}/`);
      expect(res.status).toBe(200);

      const html = await res.text();
      expect(html).toContain('title="OpenSearch Web"');
      expect(html).toContain('OpenSearch Web — Privacy-First Web Search</title>');
      expect(html).toContain('Not affiliated with Amazon Web Services or Amazon OpenSearch Service');
    });

    it('Terminal footer presents distinct product identity notice', async () => {
      const res = await fetch(`${webBaseUrl}/`);
      expect(res.status).toBe(200);

      const html = await res.text();
      expect(html).toContain('footer-identity-notice');
      expect(html).toContain('OpenSearch Web is an independent search engine project');
      expect(html).toContain('Not affiliated with Amazon Web Services or the Amazon OpenSearch Project');
      expect(html).toContain('Compatible with OpenSearch 1.1 description format');
    });

    it('/browser-search guide presents distinct product identity section', async () => {
      const res = await fetch(`${webBaseUrl}/browser-search`);
      expect(res.status).toBe(200);

      const html = await res.text();
      expect(html).toContain('Add OpenSearch Web to Your Browser');
      expect(html).toContain('Distinct Product Identity');
      expect(html).toContain('Not affiliated with Amazon Web Services or Amazon OpenSearch Service');
    });
  });
});
