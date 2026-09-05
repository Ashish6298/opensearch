/**
 * Phase 5 Tests — SSRF Guard
 *
 * Validates syntactic IP checks and hostname safety validation.
 */

import { describe, it, expect } from 'vitest';
import {
  isPrivateOrLoopbackIp,
  validateTargetHostSync,
  validateTargetHostDns,
} from '../src/fetcher/ssrf-guard.js';

describe('SSRF Guard — isPrivateOrLoopbackIp', () => {
  describe('IPv4 checks', () => {
    it('detects 127.0.0.1 as loopback', () => {
      expect(isPrivateOrLoopbackIp('127.0.0.1')).toBe(true);
    });

    it('detects 127.0.1.1 as loopback range', () => {
      expect(isPrivateOrLoopbackIp('127.0.1.1')).toBe(true);
    });

    it('detects 10.x.x.x private block', () => {
      expect(isPrivateOrLoopbackIp('10.0.0.1')).toBe(true);
      expect(isPrivateOrLoopbackIp('10.255.255.255')).toBe(true);
    });

    it('detects 172.16.x.x - 172.31.x.x private block', () => {
      expect(isPrivateOrLoopbackIp('172.16.0.1')).toBe(true);
      expect(isPrivateOrLoopbackIp('172.24.1.100')).toBe(true);
      expect(isPrivateOrLoopbackIp('172.31.255.255')).toBe(true);
      // 172.15.x and 172.32.x are public
      expect(isPrivateOrLoopbackIp('172.15.255.255')).toBe(false);
      expect(isPrivateOrLoopbackIp('172.32.0.1')).toBe(false);
    });

    it('detects 192.168.x.x private block', () => {
      expect(isPrivateOrLoopbackIp('192.168.0.1')).toBe(true);
      expect(isPrivateOrLoopbackIp('192.168.1.254')).toBe(true);
    });

    it('detects 169.254.x.x link-local / AWS metadata IP', () => {
      expect(isPrivateOrLoopbackIp('169.254.169.254')).toBe(true);
      expect(isPrivateOrLoopbackIp('169.254.0.1')).toBe(true);
    });

    it('detects 0.0.0.0 "this" network', () => {
      expect(isPrivateOrLoopbackIp('0.0.0.0')).toBe(true);
    });

    it('detects carrier-grade NAT 100.64.x.x', () => {
      expect(isPrivateOrLoopbackIp('100.64.0.1')).toBe(true);
      expect(isPrivateOrLoopbackIp('100.127.255.255')).toBe(true);
      expect(isPrivateOrLoopbackIp('100.63.0.1')).toBe(false);
      expect(isPrivateOrLoopbackIp('100.128.0.1')).toBe(false);
    });

    it('allows public IPv4 addresses', () => {
      expect(isPrivateOrLoopbackIp('8.8.8.8')).toBe(false);
      expect(isPrivateOrLoopbackIp('1.1.1.1')).toBe(false);
      expect(isPrivateOrLoopbackIp('93.184.216.34')).toBe(false);
      expect(isPrivateOrLoopbackIp('142.250.190.46')).toBe(false);
    });
  });

  describe('IPv6 checks', () => {
    it('detects ::1 loopback', () => {
      expect(isPrivateOrLoopbackIp('::1')).toBe(true);
      expect(isPrivateOrLoopbackIp('0:0:0:0:0:0:0:1')).toBe(true);
    });

    it('detects :: unspecified address', () => {
      expect(isPrivateOrLoopbackIp('::')).toBe(true);
    });

    it('detects unique-local fc00::/7 (fc.. and fd..)', () => {
      expect(isPrivateOrLoopbackIp('fc00::1')).toBe(true);
      expect(isPrivateOrLoopbackIp('fd12:3456:789a::1')).toBe(true);
    });

    it('detects link-local fe80::/10', () => {
      expect(isPrivateOrLoopbackIp('fe80::1')).toBe(true);
      expect(isPrivateOrLoopbackIp('febf::ffff')).toBe(true);
    });

    it('detects IPv4-mapped private IPv6 addresses', () => {
      expect(isPrivateOrLoopbackIp('::ffff:127.0.0.1')).toBe(true);
      expect(isPrivateOrLoopbackIp('::ffff:192.168.1.1')).toBe(true);
      expect(isPrivateOrLoopbackIp('::ffff:10.0.0.1')).toBe(true);
      expect(isPrivateOrLoopbackIp('::ffff:8.8.8.8')).toBe(false);
    });

    it('allows public IPv6 addresses', () => {
      expect(isPrivateOrLoopbackIp('2606:4700:4700::1111')).toBe(false);
      expect(isPrivateOrLoopbackIp('2001:4860:4860::8888')).toBe(false);
    });
  });
});

describe('SSRF Guard — validateTargetHostSync', () => {
  it('blocks localhost in any case', () => {
    expect(validateTargetHostSync('localhost').allowed).toBe(false);
    expect(validateTargetHostSync('LOCALHOST').allowed).toBe(false);
    expect(validateTargetHostSync('LocalHost').allowed).toBe(false);
  });

  it('blocks dangerous local/internal hostnames', () => {
    expect(validateTargetHostSync('127.0.0.1').allowed).toBe(false);
    expect(validateTargetHostSync('10.0.0.1').allowed).toBe(false);
    expect(validateTargetHostSync('192.168.1.1').allowed).toBe(false);
    expect(validateTargetHostSync('169.254.169.254').allowed).toBe(false);
    expect(validateTargetHostSync('app.local').allowed).toBe(false);
    expect(validateTargetHostSync('service.internal').allowed).toBe(false);
    expect(validateTargetHostSync('k8s.cluster.local').allowed).toBe(false);
    expect(validateTargetHostSync('router.lan').allowed).toBe(false);
    expect(validateTargetHostSync('machine.home.arpa').allowed).toBe(false);
  });

  it('allows public domain names', () => {
    expect(validateTargetHostSync('example.com').allowed).toBe(true);
    expect(validateTargetHostSync('wikipedia.org').allowed).toBe(true);
    expect(validateTargetHostSync('api.github.com').allowed).toBe(true);
    expect(validateTargetHostSync('news.ycombinator.com').allowed).toBe(true);
  });
});

describe('SSRF Guard — validateTargetHostDns', () => {
  it('blocks localhost directly', async () => {
    const r = await validateTargetHostDns('localhost');
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/localhost|blocked/i);
  });

  it('blocks literal private IPs without DNS lookup', async () => {
    const r = await validateTargetHostDns('127.0.0.1');
    expect(r.allowed).toBe(false);
  });

  it('allows public domain when DNS resolves to public IP', async () => {
    // example.com is guaranteed to exist and resolve to public IP
    const r = await validateTargetHostDns('example.com');
    expect(r.allowed).toBe(true);
  });
});
