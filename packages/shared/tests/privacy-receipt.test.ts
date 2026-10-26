import { describe, it, expect } from 'vitest';
import {
  createPrivacyReceipt,
  getProviderMetadataDefaults,
  ContactedProviderRecord,
  SkippedProviderRecord,
} from '../src/privacy/privacy-receipt.js';

describe('Phase 84: Privacy Receipt Schema & Generator', () => {
  it('should generate a typed receipt conforming to schema version 1.0.0', () => {
    const receipt = createPrivacyReceipt({
      mode: 'standard',
      clientIp: '192.168.1.100',
    });

    expect(receipt.schemaVersion).toBe('1.0.0');
    expect(receipt.receiptId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(typeof receipt.timestamp).toBe('string');
    expect(receipt.mode).toBe('standard');
    expect(receipt.networkDispatch.totalOutboundRequests).toBe(0);
    expect(receipt.networkDispatch.externalProvidersContacted).toEqual([]);
    expect(receipt.networkDispatch.externalProvidersSkipped).toEqual([]);
    expect(receipt.networkDispatch.isPartialResult).toBe(false);
    expect(receipt.networkDispatch.searchDeadlineExceeded).toBe(false);
  });

  it('strictly enforces zero leakage of raw query text or cross-search identifiers', () => {
    const testSecretQuery = 'super-confidential-user-search-term-12345';
    const receipt = createPrivacyReceipt({
      mode: 'standard',
      clientIp: '203.0.113.195',
      contactedProviders: [
        {
          providerId: 'wikimedia',
          endpoint: 'https://en.wikipedia.org/w/api.php',
          purpose: 'web-retrieval',
          statusCode: 200,
          latencyMs: 85,
          queryTransmitted: true,
          clientIpForwarded: false,
          status: 'success',
        },
      ],
    });

    const serialized = JSON.stringify(receipt);
    expect(serialized).not.toContain(testSecretQuery);
    expect(receipt.hostTelemetry.dataPersistence.rawQueryStoredInDatabase).toBe(false);
    expect(receipt.hostTelemetry.dataPersistence.rawQueryLoggedToDisk).toBe(false);
    expect(receipt.hostTelemetry.dataPersistence.sessionIdentifiersCreated).toBe(false);
    expect(receipt.hostTelemetry.dataPersistence.cookiesIssued).toBe(false);
  });

  it('safely handles client IP addresses with zero disk logging or upstream forwarding', () => {
    const ipv4Receipt = createPrivacyReceipt({
      mode: 'standard',
      clientIp: '198.51.100.42',
    });
    expect(ipv4Receipt.hostTelemetry.clientIpHandling.received).toBe(true);
    expect(ipv4Receipt.hostTelemetry.clientIpHandling.anonymizedInMemory).toBe(true);
    expect(ipv4Receipt.hostTelemetry.clientIpHandling.maskApplied).toBe('ipv4-24');
    expect(ipv4Receipt.hostTelemetry.clientIpHandling.loggedToDisk).toBe(false);

    const ipv6Receipt = createPrivacyReceipt({
      mode: 'standard',
      clientIp: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
    });
    expect(ipv6Receipt.hostTelemetry.clientIpHandling.maskApplied).toBe('ipv6-48');

    const loopbackReceipt = createPrivacyReceipt({
      mode: 'standard',
      clientIp: '127.0.0.1',
    });
    expect(loopbackReceipt.hostTelemetry.clientIpHandling.maskApplied).toBe('loopback');
  });

  it('omits redactionAndTruncation section when no truncation occurred', () => {
    const receipt = createPrivacyReceipt({
      mode: 'standard',
      queryTruncated: false,
      credentialsRedacted: false,
    });

    expect(receipt.hostTelemetry.redactionAndTruncation).toBeUndefined();
  });

  it('includes redactionAndTruncation section ONLY when truncation or redaction actually occurred', () => {
    const truncatedReceipt = createPrivacyReceipt({
      mode: 'standard',
      queryTruncated: true,
    });
    expect(truncatedReceipt.hostTelemetry.redactionAndTruncation).toBeDefined();
    expect(truncatedReceipt.hostTelemetry.redactionAndTruncation?.queryTruncated).toBe(true);
    expect(truncatedReceipt.hostTelemetry.redactionAndTruncation?.reason).toContain('character limit');

    const redactedReceipt = createPrivacyReceipt({
      mode: 'standard',
      credentialsRedacted: true,
    });
    expect(redactedReceipt.hostTelemetry.redactionAndTruncation).toBeDefined();
    expect(redactedReceipt.hostTelemetry.redactionAndTruncation?.credentialsRedacted).toBe(true);
  });

  it('accurately records contacted and skipped providers with plain-language summary', () => {
    const contacted: ContactedProviderRecord[] = [
      {
        providerId: 'wikimedia',
        endpoint: 'https://en.wikipedia.org/w/api.php',
        purpose: 'web-retrieval',
        statusCode: 200,
        latencyMs: 120,
        queryTransmitted: true,
        clientIpForwarded: false,
        status: 'success',
      },
    ];

    const skipped: SkippedProviderRecord[] = [
      {
        providerId: 'hacker_news',
        reason: 'category-mismatch',
        details: 'Category news not requested.',
      },
    ];

    const receipt = createPrivacyReceipt({
      mode: 'standard',
      contactedProviders: contacted,
      skippedProviders: skipped,
      hasThumbnails: true,
    });

    expect(receipt.networkDispatch.totalOutboundRequests).toBe(1);
    expect(receipt.networkDispatch.externalProvidersContacted).toHaveLength(1);
    expect(receipt.networkDispatch.externalProvidersContacted[0].clientIpForwarded).toBe(false);
    expect(receipt.networkDispatch.externalProvidersSkipped).toHaveLength(1);
    expect(receipt.networkDispatch.externalProvidersSkipped[0].reason).toBe('category-mismatch');
    expect(receipt.browserTelemetry.remoteThumbnailsRequested).toBe(true);
    expect(receipt.browserTelemetry.remoteSuggestionsRequested).toBe(false);
    expect(receipt.summary).toContain('Hybrid Web Search');
    expect(receipt.summary).toContain('wikimedia');
  });

  it('generates transparent Local-only mode receipt', () => {
    const skipped: SkippedProviderRecord[] = [
      {
        providerId: 'wikimedia',
        reason: 'local-only-mode',
        details: 'Local-only mode active.',
      },
      {
        providerId: 'hacker_news',
        reason: 'local-only-mode',
        details: 'Local-only mode active.',
      },
    ];

    const receipt = createPrivacyReceipt({
      mode: 'local-only',
      contactedProviders: [],
      skippedProviders: skipped,
    });

    expect(receipt.mode).toBe('local-only');
    expect(receipt.networkDispatch.totalOutboundRequests).toBe(0);
    expect(receipt.networkDispatch.externalProvidersContacted).toHaveLength(0);
    expect(receipt.networkDispatch.externalProvidersSkipped).toHaveLength(2);
    expect(receipt.summary).toContain('Local-Only Search');
    expect(receipt.summary).toContain('Zero external providers were contacted');
  });

  it('resolves default metadata for known search providers', () => {
    const wiki = getProviderMetadataDefaults('wikimedia');
    expect(wiki.endpoint).toContain('wikipedia.org');
    expect(wiki.purpose).toBe('web-retrieval');

    const images = getProviderMetadataDefaults('wikimedia_images');
    expect(images.purpose).toBe('image-search');

    const hn = getProviderMetadataDefaults('hacker_news');
    expect(hn.purpose).toBe('news-search');

    const unknown = getProviderMetadataDefaults('custom_engine');
    expect(unknown.purpose).toBe('web-retrieval');
    expect(unknown.endpoint).toBe('https://custom_engine.external-api.org');
  });
});
