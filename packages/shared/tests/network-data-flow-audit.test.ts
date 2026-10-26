/**
 * @opensearch/shared — Network & Data-Flow Audit Test Suite (Phase 82)
 *
 * Verifies that the network data-flow inventory accurately documents all request
 * destinations, separates browser-to-host from host-to-provider traffic, enforces
 * zero analytics/third-party scripts by default, verifies referrer policies, and
 * prevents sending query-bearing URLs to unrelated origins.
 */

import { describe, it, expect } from 'vitest';
import {
  NETWORK_DATA_FLOW_INVENTORY,
  auditNetworkDataFlow,
  isQueryBearingUrlLeaked,
  RECOMMENDED_REFERRER_POLICY,
  auditHtmlPrivacy,
  auditResponseHeaders,
} from '../src/index.js';
import { generateHtmlShell, WebServer, renderImageCard } from '../../../apps/web/src/index.js';
import { createSecurityHeadersMiddleware } from '../../../apps/api/src/middlewares.js';

describe('Phase 82 — Network and Data-Flow Audit Suite', () => {
  describe('1. Inventory Completeness & Taxonomy', () => {
    it('documents all required request categories in the inventory', () => {
      const categories = new Set(NETWORK_DATA_FLOW_INVENTORY.map((item) => item.category));

      expect(categories.has('search-api')).toBe(true);
      expect(categories.has('frontend-assets')).toBe(true);
      expect(categories.has('provider')).toBe(true);
      expect(categories.has('suggestions')).toBe(true);
      expect(categories.has('thumbnails')).toBe(true);
      expect(categories.has('fonts')).toBe(true);
      expect(categories.has('scripts')).toBe(true);
      expect(categories.has('analytics')).toBe(true);
      expect(categories.has('error-reporting')).toBe(true);
      expect(categories.has('outbound-destination')).toBe(true);
    });

    it('documents browser-to-host and host-to-provider traffic separately', () => {
      const directions = new Set(NETWORK_DATA_FLOW_INVENTORY.map((item) => item.direction));

      expect(directions.has('browser-to-host')).toBe(true);
      expect(directions.has('host-to-provider')).toBe(true);
      expect(directions.has('browser-to-third-party')).toBe(true);
      expect(directions.has('internal')).toBe(true);

      const browserToHost = NETWORK_DATA_FLOW_INVENTORY.filter(
        (item) => item.direction === 'browser-to-host',
      );
      const hostToProvider = NETWORK_DATA_FLOW_INVENTORY.filter(
        (item) => item.direction === 'host-to-provider',
      );

      expect(browserToHost.length).toBeGreaterThanOrEqual(2);
      expect(hostToProvider.length).toBeGreaterThanOrEqual(3);
    });

    it('passes the automated network data-flow audit with 0 violations', () => {
      const audit = auditNetworkDataFlow();

      expect(audit.compliant).toBe(true);
      expect(audit.violations).toHaveLength(0);
      expect(audit.privacyProtections.zeroThirdPartyScripts).toBe(true);
      expect(audit.privacyProtections.zeroAnalyticsTrackers).toBe(true);
      expect(audit.privacyProtections.zeroExternalCrashReporters).toBe(true);
      expect(audit.privacyProtections.clientIpShieldedAtHost).toBe(true);
      expect(audit.privacyProtections.zeroCookiesIssued).toBe(true);
    });
  });

  describe('2. Removal of Unnecessary Analytics, Scripts & Telemetry', () => {
    it('ensures analytics and third-party script inventory items are disabled by default', () => {
      const thirdPartyScripts = NETWORK_DATA_FLOW_INVENTORY.find(
        (item) => item.id === 'scripts-third-party',
      );
      const analytics = NETWORK_DATA_FLOW_INVENTORY.find(
        (item) => item.id === 'analytics-telemetry',
      );
      const errorReporting = NETWORK_DATA_FLOW_INVENTORY.find(
        (item) => item.id === 'error-reporting-external',
      );

      expect(thirdPartyScripts).toBeDefined();
      expect(thirdPartyScripts?.enabledByDefault).toBe(false);

      expect(analytics).toBeDefined();
      expect(analytics?.enabledByDefault).toBe(false);

      expect(errorReporting).toBeDefined();
      expect(errorReporting?.enabledByDefault).toBe(false);
    });

    it('verifies generated web HTML contains zero third-party script sources or tracking pixels', () => {
      const html = generateHtmlShell({ title: 'OpenSearch Test' });
      const audit = auditHtmlPrivacy(html);

      expect(audit.compliant).toBe(true);
      expect(audit.issues).toHaveLength(0);
      expect(html).not.toContain('google-analytics');
      expect(html).not.toContain('googletagmanager');
      expect(html).not.toContain('facebook.net');
      expect(html).not.toContain('clarity.ms');
      expect(html).not.toContain('cdn.jsdelivr.net');
      expect(html).not.toContain('unpkg.com');
    });

    it('verifies typography uses OS native system font stack with zero external font calls', () => {
      const fontItem = NETWORK_DATA_FLOW_INVENTORY.find((item) => item.category === 'fonts');

      expect(fontItem).toBeDefined();
      expect(fontItem?.direction).toBe('internal');
      expect(fontItem?.exposure.transmitsQueryText).toBe(false);
      expect(fontItem?.exposure.transmitsClientIp).toBe(false);
    });
  });

  describe('3. Referrer-Policy Configuration & Isolation', () => {
    it('configures Referrer-Policy meta tag in the HTML shell', () => {
      const html = generateHtmlShell();
      expect(html).toContain('<meta name="referrer" content="strict-origin-when-cross-origin">');
    });

    it('WebServer emits strict-origin-when-cross-origin Referrer-Policy and CSP headers', async () => {
      const server = new WebServer();
      const headers: Record<string, string> = {};

      const mockRes: any = {
        setHeader: (key: string, value: string) => {
          headers[key.toLowerCase()] = value;
        },
        statusCode: 200,
        end: () => {},
      };

      const mockReq: any = {
        url: '/',
        headers: { host: 'localhost:3000' },
        socket: {},
      };

      await server.handleRequest(mockReq, mockRes);

      expect(headers['referrer-policy']).toBe(RECOMMENDED_REFERRER_POLICY);
      expect(headers['content-security-policy']).toBeDefined();
      expect(headers['content-security-policy']).toContain("default-src 'self'");
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['x-frame-options']).toBe('DENY');

      const audit = auditResponseHeaders(headers);
      expect(audit.compliant).toBe(true);
    });

    it('API security middleware emits strict-origin-when-cross-origin Referrer-Policy', () => {
      const middleware = createSecurityHeadersMiddleware();
      const headers: Record<string, string> = {};

      const mockRes: any = {
        setHeader: (k: string, v: string) => {
          headers[k.toLowerCase()] = v;
        },
      };
      const mockReq: any = { raw: { headers: {}, socket: {} } };

      middleware(mockReq, mockRes, () => {});

      expect(headers['referrer-policy']).toBe(RECOMMENDED_REFERRER_POLICY);
      expect(headers['content-security-policy']).toContain("default-src 'none'");
    });

    it('renders image cards with referrerpolicy="no-referrer" to protect image thumbnail downloads', () => {
      const cardHtml = renderImageCard({
        documentId: 'img-123',
        url: 'https://commons.wikimedia.org/wiki/File:Example.jpg',
        title: 'Example Graphic',
        thumbnailUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Example.jpg/320px-Example.jpg',
        source: 'wikimedia',
        attribution: 'Wikimedia Commons',
      });

      expect(cardHtml).toContain('referrerpolicy="no-referrer"');
      expect(cardHtml).toContain('rel="noopener noreferrer"');
    });
  });

  describe('4. Query-Bearing URL Leakage Prevention', () => {
    it('detects when an external destination URL improperly contains raw search query parameters', () => {
      const leakedUrl = 'https://unrelated-ad-network.example.com/track?q=confidential+search+term';
      const isLeaked = isQueryBearingUrlLeaked(leakedUrl, ['confidential', 'search', 'term']);

      expect(isLeaked).toBe(true);
    });

    it('allows clean canonical destination URLs without search query terms', () => {
      const cleanUrl = 'https://en.wikipedia.org/wiki/Quantum_computing';
      const isLeaked = isQueryBearingUrlLeaked(cleanUrl, ['quantum', 'computing']);

      expect(isLeaked).toBe(false);
    });

    it('exempts internal OpenSearch API search paths from false positive leak warnings', () => {
      const internalApiUrl = 'http://localhost:3000/api/v1/search?q=indexer';
      const isLeaked = isQueryBearingUrlLeaked(internalApiUrl, ['indexer']);

      expect(isLeaked).toBe(false);
    });
  });

  describe('5. Host-to-Provider Client IP Shielding', () => {
    it('verifies that no host-to-provider endpoint transmits client IP addresses', () => {
      const providerEndpoints = NETWORK_DATA_FLOW_INVENTORY.filter(
        (item) => item.direction === 'host-to-provider',
      );

      for (const endpoint of providerEndpoints) {
        expect(endpoint.exposure.transmitsClientIp).toBe(false);
        if (endpoint.enabledByDefault) {
          expect(endpoint.exposure.clientIpHandling).toBe('shielded');
        } else {
          expect(endpoint.exposure.clientIpHandling).toBe('none');
        }
        expect(endpoint.exposure.transmitsIdentifiers).toBe(false);
      }
    });

    it('verifies that internal endpoints transmit zero network data', () => {
      const internalEndpoints = NETWORK_DATA_FLOW_INVENTORY.filter(
        (item) => item.direction === 'internal',
      );

      for (const endpoint of internalEndpoints) {
        expect(endpoint.exposure.transmitsClientIp).toBe(false);
        expect(endpoint.exposure.transmitsReferrer).toBe(false);
        expect(endpoint.exposure.transmitsIdentifiers).toBe(false);
      }
    });
  });
});
