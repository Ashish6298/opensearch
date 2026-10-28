import { describe, expect, it } from 'vitest';
import {
  classifyDocumentResources,
  DefaultHtmlParser,
  extractOrigin,
  extractRegistrableDomain,
  extractSubresources,
  getDefaultTrackerClassifier,
  getDefaultTrackerRegistry,
  isFirstPartyResource,
  REVIEWABLE_TRACKER_REGISTRY_METADATA,
  TrackerClassifier,
  TrackerRegistry,
} from '../src/index.js';

describe('Phase 99 — Tracker and Subresource Metadata Classification Suite', () => {
  describe('1. Registrable Domain & Origin Classification', () => {
    it('extracts registrable domain (eTLD+1) correctly for standard and multi-level TLDs', () => {
      expect(extractRegistrableDomain('example.com')).toBe('example.com');
      expect(extractRegistrableDomain('sub.example.com')).toBe('example.com');
      expect(extractRegistrableDomain('cdn.assets.sub.example.com')).toBe('example.com');

      // Multi-level TLDs
      expect(extractRegistrableDomain('bbc.co.uk')).toBe('bbc.co.uk');
      expect(extractRegistrableDomain('news.bbc.co.uk')).toBe('bbc.co.uk');
      expect(extractRegistrableDomain('service.gov.uk')).toBe('service.gov.uk');
      expect(extractRegistrableDomain('sydney.edu.au')).toBe('sydney.edu.au');
      expect(extractRegistrableDomain('tokyo.ac.jp')).toBe('tokyo.ac.jp');

      // Localhost and IPs
      expect(extractRegistrableDomain('localhost')).toBe('localhost');
      expect(extractRegistrableDomain('127.0.0.1')).toBe('127.0.0.1');
    });

    it('extracts normalized origin', () => {
      expect(extractOrigin('https://example.com:8080/path?query=1#hash')).toBe('https://example.com:8080');
      expect(extractOrigin('http://sub.domain.org/test')).toBe('http://sub.domain.org');
      expect(extractOrigin('invalid-url')).toBe('');
    });

    it('classifies first-party vs third-party resources accurately', () => {
      const docUrl = 'https://blog.example.com/posts/privacy-guide';

      // Same host or same registrable domain = first-party
      expect(isFirstPartyResource('https://blog.example.com/app.js', docUrl)).toBe(true);
      expect(isFirstPartyResource('https://cdn.example.com/style.css', docUrl)).toBe(true);
      expect(isFirstPartyResource('https://static.assets.example.com/logo.png', docUrl)).toBe(true);

      // Different registrable domain = third-party
      expect(isFirstPartyResource('https://www.google-analytics.com/analytics.js', docUrl)).toBe(false);
      expect(isFirstPartyResource('https://connect.facebook.net/en_US/fbevents.js', docUrl)).toBe(false);
      expect(isFirstPartyResource('https://cdn.other-service.org/lib.js', docUrl)).toBe(false);
    });
  });

  describe('2. Reviewable Tracker Registry Metadata & Provenance', () => {
    it('exposes reviewable registry metadata with provenance, license, and update date', () => {
      expect(REVIEWABLE_TRACKER_REGISTRY_METADATA.version).toBeDefined();
      expect(REVIEWABLE_TRACKER_REGISTRY_METADATA.license).toContain('CC BY-SA 4.0');
      expect(REVIEWABLE_TRACKER_REGISTRY_METADATA.licenseUrl).toContain('creativecommons.org');
      expect(REVIEWABLE_TRACKER_REGISTRY_METADATA.provenance).toContain('EasyPrivacy');
      expect(REVIEWABLE_TRACKER_REGISTRY_METADATA.provenance).toContain('DuckDuckGo Tracker Radar');
      expect(REVIEWABLE_TRACKER_REGISTRY_METADATA.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
      expect(REVIEWABLE_TRACKER_REGISTRY_METADATA.maintainer).toBeDefined();
    });

    it('matches known tracker domains via exact and subdomain matching', () => {
      const registry = getDefaultTrackerRegistry();

      const gaMatch = registry.matchDomain('google-analytics.com');
      expect(gaMatch).not.toBeNull();
      expect(gaMatch!.name).toBe('Google Analytics');
      expect(gaMatch!.category).toBe('analytics');
      expect(gaMatch!.license).toBe('CC BY-SA 4.0');

      // Subdomain matching
      const doubleClickSub = registry.matchDomain('stats.ad.doubleclick.net');
      expect(doubleClickSub).not.toBeNull();
      expect(doubleClickSub!.name).toBe('Google DoubleClick');
      expect(doubleClickSub!.category).toBe('advertising');

      const fbMatch = registry.matchDomain('connect.facebook.net');
      expect(fbMatch).not.toBeNull();
      expect(fbMatch!.name).toContain('Facebook');

      const hotjarMatch = registry.matchDomain('static.hotjar.com');
      expect(hotjarMatch).not.toBeNull();
      expect(hotjarMatch!.category).toBe('session-recording');

      // Non-tracker domain
      expect(registry.matchDomain('wikipedia.org')).toBeNull();
      expect(registry.matchDomain('github.com')).toBeNull();
    });
  });

  describe('3. Static Subresource Extraction (Zero Script Execution)', () => {
    it('extracts script, stylesheet, image, and iframe subresources', () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Test Page</title>
            <link rel="stylesheet" href="/assets/style.css">
            <script src="https://cdn.example.com/app.js"></script>
            <link rel="preconnect" href="https://fonts.gstatic.com">
          </head>
          <body>
            <h1>Hello World</h1>
            <img src="https://images.example.com/photo.jpg" alt="Photo">
            <iframe src="https://embed.example.com/player"></iframe>
          </body>
        </html>
      `;

      const resources = extractSubresources(html, 'https://example.com/index.html');

      expect(resources.length).toBe(5);

      const scriptRes = resources.find(r => r.tagName === 'script');
      expect(scriptRes).toBeDefined();
      expect(scriptRes!.resolvedUrl).toBe('https://cdn.example.com/app.js');
      expect(scriptRes!.originCategory).toBe('first-party');
      expect(scriptRes!.resourceType).toBe('script');

      const cssRes = resources.find(r => r.resourceType === 'stylesheet');
      expect(cssRes).toBeDefined();
      expect(cssRes!.resolvedUrl).toBe('https://example.com/assets/style.css');

      const iframeRes = resources.find(r => r.resourceType === 'iframe');
      expect(iframeRes).toBeDefined();
      expect(iframeRes!.resolvedUrl).toBe('https://embed.example.com/player');
    });

    it('identifies tracking pixel beacons based on dimension heuristics', () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head><title>Beacon Test</title></head>
          <body>
            <img src="https://tracking.com/pixel.gif" width="1" height="1" alt="">
            <img src="https://tracking.com/hidden.png" style="display: none;" alt="">
            <img src="https://example.com/hero.jpg" width="800" height="600" alt="Hero">
          </body>
        </html>
      `;

      const resources = extractSubresources(html, 'https://example.com/');
      const beacons = resources.filter(r => r.isPixelBeacon);

      expect(beacons.length).toBe(2);
      expect(beacons[0]!.resolvedUrl).toBe('https://tracking.com/pixel.gif');
      expect(beacons[1]!.resolvedUrl).toBe('https://tracking.com/hidden.png');

      const heroImg = resources.find(r => r.resolvedUrl.includes('hero.jpg'));
      expect(heroImg!.isPixelBeacon).toBe(false);
    });

    it('ignores inline data URIs and javascript scheme attributes', () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head><title>Data Test</title></head>
          <body>
            <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==">
            <script src="javascript:void(0)"></script>
          </body>
        </html>
      `;

      const resources = extractSubresources(html, 'https://example.com/');
      expect(resources.length).toBe(0);
    });
  });

  describe('4. Tracker Classification Determinism & Evidence Reporting', () => {
    it('detects multiple third-party trackers with high confidence and full evidence', () => {
      const html = `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <title>Heavy Tracking Commercial Site</title>
            <link rel="stylesheet" href="/style.css">
            <script src="https://www.google-analytics.com/analytics.js"></script>
            <script src="https://connect.facebook.net/en_US/fbevents.js"></script>
          </head>
          <body>
            <h1>News Article</h1>
            <iframe src="https://ad.doubleclick.net/adi/N1234.site"></iframe>
            <img src="https://bat.bing.com/action/0" width="1" height="1">
          </body>
        </html>
      `;

      const result = classifyDocumentResources(html, 'https://my-news-portal.com/articles/tech');

      expect(result.status).toBe('trackers_detected');
      expect(result.confidence).toBe('high');
      expect(result.trackerCount).toBeGreaterThanOrEqual(3);
      expect(result.thirdPartyCount).toBeGreaterThanOrEqual(3);
      expect(result.categoriesDetected).toContain('analytics');
      expect(result.categoriesDetected).toContain('social');
      expect(result.categoriesDetected).toContain('advertising');

      expect(result.evidence.hasHead).toBe(true);
      expect(result.evidence.hasBody).toBe(true);
      expect(result.evidence.hasValidStructure).toBe(true);
      expect(result.evidence.beaconCount).toBe(1);
      expect(result.evidence.rationale).toContain('Detected');

      // Verify tracker matches have provenance and license
      const gaTracker = result.trackers.find(t => t.matchedDomain === 'google-analytics.com');
      expect(gaTracker).toBeDefined();
      expect(gaTracker!.owner).toBe('Google LLC');
      expect(gaTracker!.license).toBe('CC BY-SA 4.0');
    });

    it('guarantees deterministic output across multiple invocations', () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head><title>Determinism Test</title><script src="https://googletagmanager.com/gtm.js?id=GTM-123"></script></head>
          <body><p>Content</p></body>
        </html>
      `;

      const run1 = classifyDocumentResources(html, 'https://example.com/');
      const run2 = classifyDocumentResources(html, 'https://example.com/');

      expect(run1.status).toBe(run2.status);
      expect(run1.confidence).toBe(run2.confidence);
      expect(run1.trackerCount).toBe(run2.trackerCount);
      expect(run1.trackers[0]!.matchedDomain).toBe(run2.trackers[0]!.matchedDomain);
      expect(run1.evidence.htmlLength).toBe(run2.evidence.htmlLength);
    });

    it('classifies sites with only first-party assets as no_trackers_detected', () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Privacy First Site</title>
            <link rel="stylesheet" href="/assets/main.css">
            <script src="https://static.privacy-site.org/app.js"></script>
          </head>
          <body>
            <header>Welcome</header>
            <p>We do not track you.</p>
            <img src="/images/logo.svg" alt="Logo">
          </body>
        </html>
      `;

      const result = classifyDocumentResources(html, 'https://privacy-site.org/');

      expect(result.status).toBe('no_trackers_detected');
      expect(result.confidence).toBe('high');
      expect(result.trackerCount).toBe(0);
      expect(result.firstPartyCount).toBe(3);
      expect(result.thirdPartyCount).toBe(0);
      expect(result.evidence.rationale).toContain('zero third-party telemetry detected');
    });
  });

  describe('5. Acceptance Criteria: Incomplete & Unverified Evidence Guard', () => {
    it('assigns unverified status when HTML lacks document structure (no site labeled tracker-free without evidence)', () => {
      // Truncated snippet lacking head/body structure
      const truncatedHtml = '<div>Just an isolated div without head or body</div>';

      const result = classifyDocumentResources(truncatedHtml, 'https://example.com/');

      expect(result.status).toBe('unverified');
      expect(result.confidence).toBe('low');
      expect(result.trackerCount).toBe(0);
      expect(result.evidence.hasValidStructure).toBe(false);
      expect(result.evidence.rationale).toContain('cannot verify tracker status');
    });

    it('assigns unknown status on empty or whitespace markup', () => {
      const resultEmpty = classifyDocumentResources('', 'https://example.com/');
      expect(resultEmpty.status).toBe('unknown');
      expect(resultEmpty.confidence).toBe('none');

      const resultWhitespace = classifyDocumentResources('   \n\t  ', 'https://example.com/');
      expect(resultWhitespace.status).toBe('unknown');
      expect(resultWhitespace.confidence).toBe('none');
    });

    it('assigns unknown status on invalid document URL', () => {
      const validHtml = '<!DOCTYPE html><html><head><title>Hi</title></head><body><p>Test</p></body></html>';
      const result = classifyDocumentResources(validHtml, 'not-a-valid-url');

      expect(result.status).toBe('unknown');
      expect(result.confidence).toBe('none');
      expect(result.evidence.rationale).toContain('Document URL is invalid');
    });
  });

  describe('6. Integration with DefaultHtmlParser', () => {
    it('populates trackerClassification on ExtractedDocument when classifyTrackers option is enabled', () => {
      const parser = new DefaultHtmlParser({ classifyTrackers: true });

      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Parser Integration Page</title>
            <script src="https://www.google-analytics.com/analytics.js"></script>
          </head>
          <body>
            <h1>Main Title</h1>
            <p>Body text paragraph for crawler testing.</p>
          </body>
        </html>
      `;

      const doc = parser.parse(html, 'https://example.org/');

      expect(doc.title).toBe('Parser Integration Page');
      expect(doc.bodyText).toContain('Body text paragraph');
      expect(doc.trackerClassification).toBeDefined();
      expect(doc.trackerClassification!.status).toBe('trackers_detected');
      expect(doc.trackerClassification!.trackerCount).toBe(1);
      expect(doc.trackerClassification!.trackers[0]!.trackerName).toBe('Google Analytics');
    });

    it('leaves trackerClassification undefined by default to preserve parser performance', () => {
      const parser = new DefaultHtmlParser(); // default classifyTrackers: false
      const html = `<!DOCTYPE html><html><head><title>T</title></head><body><p>B</p></body></html>`;
      const doc = parser.parse(html, 'https://example.org/');

      expect(doc.trackerClassification).toBeUndefined();
    });
  });
});
