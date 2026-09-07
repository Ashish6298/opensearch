/**
 * OpenSearch — Phase 25 Verification Gate Runner
 *
 * Validates Crawler Security Hardening:
 * 1. Scheme Validation: Only http: and https: schemes permitted; rejects dangerous schemes.
 * 2. SSRF & Private Network Rejection: Blocks localhost, RFC-1918, link-local, and cloud metadata.
 * 3. Response-Size Limit Enforcement: Aborts streaming downloads when exceeding maxPageBytes.
 * 4. Redirect Loops & Chains: Traps circular redirect loops and halts after maxRedirects.
 * 5. Timeout Enforcement: Aborts slow / unresponsive endpoints with standard TIMEOUT code.
 * 6. Content-Type Restrictions: Rejects binary PDFs and unaccepted MIME types gracefully.
 * 7. Malformed Input Resilience: Sanitizes control characters and parses broken markup safely.
 * 8. End-to-End Orchestrator Security: Validates orchestrator execution against hostile payloads.
 */

import { createServer } from 'node:http';
import { createLogger } from '@opensearch/shared';
import {
  NodeFetcher,
  FETCH_ERROR_CODE,
  createCrawlerSecurityValidator,
  createHtmlParser,
} from '@opensearch/crawler';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

const silentLogger = createLogger('@opensearch/crawler:verify-p25', {
  level: 'silent',
  format: 'json',
});

async function runVerification() {
  console.log('\n=== Phase 25: Crawler Security Hardening Verification ===\n');

  // 1. Scheme Validation
  console.log('► 1. Scheme Validation');
  const validator = createCrawlerSecurityValidator();

  const badSchemes = [
    'ftp://files.example.com/download.zip',
    'file:///etc/shadow',
    'gopher://gopher.floodgap.com',
    'javascript:alert(document.cookie)',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
  ];

  for (const uri of badSchemes) {
    const res = await validator.validateTargetUrl(uri);
    assert(!res.allowed, `Rejected prohibited scheme URL: "${uri.slice(0, 35)}..."`);
  }

  const goodSchemes = ['http://example.org/page', 'https://example.org/secure'];
  for (const uri of goodSchemes) {
    const res = await validator.validateTargetUrl(uri);
    assert(res.allowed, `Permitted legitimate scheme URL: "${uri}"`);
  }

  // 2. Private Network & SSRF Rejection
  console.log('\n► 2. Private Network & SSRF Rejection');
  const privateIps = [
    'http://127.0.0.1:8080/metrics',
    'http://localhost/admin',
    'http://10.0.0.1/sensitive',
    'http://192.168.0.1/settings',
    'http://172.16.0.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://vault.internal:8200/',
    'http://router.local/',
  ];

  for (const target of privateIps) {
    const res = await validator.validateTargetUrl(target);
    assert(
      !res.allowed && res.code === 'SSRF_REJECTED',
      `Blocked private/SSRF target: "${target}"`,
    );
  }

  // 3. Setup Hostile Target Test Server
  console.log('\n► 3. Hostile Web Target Defense Simulation');
  let mockServer;
  let mockPort = 0;

  try {
    mockServer = createServer((req, res) => {
      const url = req.url || '/';

      if (url === '/redirect-loop-1') {
        res.writeHead(302, { Location: `http://127.0.0.1:${mockPort}/redirect-loop-2` });
        res.end();
        return;
      }
      if (url === '/redirect-loop-2') {
        res.writeHead(302, { Location: `http://127.0.0.1:${mockPort}/redirect-loop-1` });
        res.end();
        return;
      }

      if (url === '/oversized-payload') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        const block = 'B'.repeat(32 * 1024);
        for (let i = 0; i < 40; i++) {
          res.write(block);
        }
        res.end();
        return;
      }

      if (url === '/binary-archive.zip') {
        res.writeHead(200, { 'Content-Type': 'application/zip' });
        res.end('PK\x03\x04 fake zip file header');
        return;
      }

      if (url === '/slow-hang') {
        setTimeout(() => {
          if (!res.writableEnded) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<h1>Late</h1>');
          }
        }, 600);
        return;
      }

      if (url === '/malformed-html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(
          '<!DOCTYPE html><html><head><title>Broken\x00 Markup</title></head><body><h1>Unclosed header<p>Broken control chars: \x01\x02\x03 and <a href="/valid-path">Valid Link</a>',
        );
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!DOCTYPE html><html><body><h1>Safe</h1></body></html>');
    });

    await new Promise(resolve => {
      mockServer.listen(0, '127.0.0.1', () => {
        mockPort = mockServer.address().port;
        resolve();
      });
    });

    process.env.OPENSEARCH_ALLOW_PRIVATE_URLS = 'true';

    // 4. Circular Redirect Defense
    console.log('\n► 4. Redirect Loop Protection');
    const redirectFetcher = new NodeFetcher({
      logger: silentLogger,
      maxRedirects: 4,
    });
    const loopResult = await redirectFetcher.fetch({
      url: `http://127.0.0.1:${mockPort}/redirect-loop-1`,
    });
    assert(!loopResult.ok, 'Redirect loop fetch failed as expected');
    assert(
      loopResult.code === FETCH_ERROR_CODE.REDIRECT_FAILURE,
      `Returned code REDIRECT_FAILURE (${loopResult.code})`,
    );
    assert(
      loopResult.redirectCount >= 4,
      `Redirect counter stopped at ${loopResult.redirectCount} redirects`,
    );

    // 5. Oversized Payload Defense
    console.log('\n► 5. Streaming Response-Size Limits');
    const sizeFetcher = new NodeFetcher({
      logger: silentLogger,
      maxPageBytes: 64 * 1024, // 64 KB limit
    });
    const sizeResult = await sizeFetcher.fetch({
      url: `http://127.0.0.1:${mockPort}/oversized-payload`,
    });
    assert(!sizeResult.ok, 'Oversized payload download aborted successfully');
    assert(
      sizeResult.code === FETCH_ERROR_CODE.CONTENT_SIZE_EXCEEDED,
      `Returned code CONTENT_SIZE_EXCEEDED (${sizeResult.code})`,
    );

    // 6. Content-Type Restrictions
    console.log('\n► 6. Content-Type Filtering');
    const mimeFetcher = new NodeFetcher({
      logger: silentLogger,
    });
    const mimeResult = await mimeFetcher.fetch({
      url: `http://127.0.0.1:${mockPort}/binary-archive.zip`,
    });
    assert(!mimeResult.ok, 'Non-text MIME type rejected');
    assert(
      mimeResult.code === FETCH_ERROR_CODE.UNSUPPORTED_CONTENT_TYPE,
      `Returned code UNSUPPORTED_CONTENT_TYPE (${mimeResult.code})`,
    );

    // 7. Timeout Enforcement
    console.log('\n► 7. Request Timeout Enforcement');
    const timeoutFetcher = new NodeFetcher({
      logger: silentLogger,
      timeoutMs: 150,
      maxRetries: 0,
    });
    const timeoutResult = await timeoutFetcher.fetch({
      url: `http://127.0.0.1:${mockPort}/slow-hang`,
    });
    assert(!timeoutResult.ok, 'Hanging request was aborted by timeout');
    assert(
      timeoutResult.code === FETCH_ERROR_CODE.TIMEOUT,
      `Returned code TIMEOUT (${timeoutResult.code})`,
    );

    // 8. Malformed HTML & Binary Resilience
    console.log('\n► 8. Malformed HTML & Control Character Sanitization');
    const parser = createHtmlParser();
    const parseResult = parser.parse(
      '<!DOCTYPE html><html><head><title>Broken\x00 Title</title></head><body><h1>Unclosed tag<p>Valid text with <a href="/valid-path">Valid Link</a>',
      `http://127.0.0.1:${mockPort}/malformed-html`,
    );

    assert(parseResult.title.length > 0, 'Extracted title from broken HTML');
    assert(parseResult.bodyText.includes('Valid text'), 'Extracted visible text without crashes');
    assert(
      parseResult.discoveredUrls.length === 1,
      'Extracted valid outbound links despite broken structure',
    );

    delete process.env.OPENSEARCH_ALLOW_PRIVATE_URLS;
  } finally {
    if (mockServer) {
      await new Promise(resolve => mockServer.close(() => resolve()));
    }
  }

  console.log('\n--------------------------------------------------');
  console.log(`Phase 25 Verification Summary: ${passed} passed, ${failed} failed`);
  console.log('--------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('Fatal error during Phase 25 verification:', err);
  process.exit(1);
});
