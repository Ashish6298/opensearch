import { describe, it, expect } from 'vitest';
import {
  createInstantAnswerEngine,
  evaluateBang,
  MathEvaluator,
  ConversionEvaluator,
  BANG_CATALOG,
} from '../src/index.js';

describe('Instant Answers, Direct Conversions & Bangs Subsystem (Phase 38)', () => {
  const engine = createInstantAnswerEngine();
  const math = new MathEvaluator();
  const conv = new ConversionEvaluator();

  describe('1. Bang Command Registry & Shortcut Evaluator', () => {
    it('should maintain at least 50 curated developer and research bangs', () => {
      expect(BANG_CATALOG.length).toBeGreaterThanOrEqual(50);
    });

    it('should evaluate prefix bang commands (!gh, !npm, !mdn, !w, !so, !caniuse)', () => {
      const gh = evaluateBang('!gh opensearch');
      expect(gh).toBeDefined();
      expect(gh?.isBang).toBe(true);
      expect(gh?.serviceName).toBe('GitHub');
      expect(gh?.searchQuery).toBe('opensearch');
      expect(gh?.redirectUrl).toBe('https://github.com/search?q=opensearch');

      const npm = evaluateBang('!npm vitest');
      expect(npm?.serviceName).toBe('npm');
      expect(npm?.redirectUrl).toBe('https://www.npmjs.com/search?q=vitest');

      const mdn = evaluateBang('!mdn Array.prototype.map');
      expect(mdn?.serviceName).toBe('MDN Web Docs');
      expect(mdn?.redirectUrl).toContain('developer.mozilla.org');

      const wiki = evaluateBang('!w open source search');
      expect(wiki?.serviceName).toBe('Wikipedia');
      expect(wiki?.redirectUrl).toContain('wikipedia.org');

      const so = evaluateBang('!so react hooks');
      expect(so?.serviceName).toBe('Stack Overflow');
      expect(so?.redirectUrl).toContain('stackoverflow.com');

      const ciu = evaluateBang('!caniuse webp');
      expect(ciu?.serviceName).toBe('Can I Use');
      expect(ciu?.redirectUrl).toContain('caniuse.com');
    });

    it('should evaluate suffix bang commands', () => {
      const suffixGh = evaluateBang('opensearch architecture !gh');
      expect(suffixGh?.serviceName).toBe('GitHub');
      expect(suffixGh?.searchQuery).toBe('opensearch architecture');
      expect(suffixGh?.redirectUrl).toBe('https://github.com/search?q=opensearch%20architecture');
    });

    it('should handle aliases (e.g. !github, !crates, !wiki)', () => {
      const aliasGh = evaluateBang('!github repo');
      expect(aliasGh?.serviceName).toBe('GitHub');

      const aliasCargo = evaluateBang('!crates serde');
      expect(aliasCargo?.serviceName).toBe('Crates.io');
    });

    it('should return null on standard non-bang queries or unknown bang triggers', () => {
      expect(evaluateBang('regular search query')).toBeNull();
      expect(evaluateBang('!nonexistentbang12345 search')).toBeNull();
      expect(evaluateBang('')).toBeNull();
    });
  });

  describe('2. Safe Mathematical Expression Evaluator (No eval)', () => {
    it('should evaluate standard arithmetic operations and precedence', () => {
      const res1 = math.evaluate('25 * 40');
      expect(res1?.result).toBe(1000);
      expect(res1?.formattedResult).toBe('1,000');

      const res2 = math.evaluate('10 + 20 * 3');
      expect(res2?.result).toBe(70);

      const res3 = math.evaluate('(10 + 20) * 3');
      expect(res3?.result).toBe(90);

      const res4 = math.evaluate('100 / 4 - 5');
      expect(res4?.result).toBe(20);
    });

    it('should evaluate powers, roots, and mathematical functions', () => {
      const pow = math.evaluate('2^10');
      expect(pow?.result).toBe(1024);

      const sqrt = math.evaluate('sqrt(144)');
      expect(sqrt?.result).toBe(12);

      const sqrtNoParens = math.evaluate('sqrt 256');
      expect(sqrtNoParens?.result).toBe(16);

      const log = math.evaluate('log(1000)');
      expect(log?.result).toBe(3);
    });

    it('should calculate percentages (X% of Y)', () => {
      const pct1 = math.evaluate('15% of 200');
      expect(pct1?.result).toBe(30);

      const pct2 = math.evaluate('20 percent of 500');
      expect(pct2?.result).toBe(100);
    });

    it('should handle mathematical constants like pi and e', () => {
      const piRes = math.evaluate('pi * 2');
      expect(piRes?.result).toBeCloseTo(Math.PI * 2, 5);
    });

    it('should safely reject invalid, malicious or non-math expressions', () => {
      expect(math.evaluate('eval("alert(1)")')).toBeNull();
      expect(math.evaluate('function() { return 1; }')).toBeNull();
      expect(math.evaluate('10 / 0')).toBeNull();
      expect(math.evaluate('10 % 0')).toBeNull();
      expect(math.evaluate('how to bake cookies')).toBeNull();
      expect(math.evaluate('')).toBeNull();
    });
  });

  describe('3. Direct Conversions (Epoch, Color, Units)', () => {
    it('should convert Unix epoch timestamps to UTC ISO and relative strings', () => {
      const epoch = conv.evaluate('epoch 1700000000');
      expect(epoch?.type).toBe('epoch');
      if (epoch && epoch.type === 'epoch') {
        expect(epoch.utcIso).toBe('2023-11-14T22:13:20.000Z');
        expect(epoch.epochSeconds).toBe(1700000000);
      }

      const epochNow = conv.evaluate('timestamp now');
      expect(epochNow?.type).toBe('epoch');
    });

    it('should convert color codes between HEX, RGB, and HSL', () => {
      const hex = conv.evaluate('#38bdf8');
      expect(hex?.type).toBe('color');
      if (hex && hex.type === 'color') {
        expect(hex.hex).toBe('#38bdf8');
        expect(hex.rgb).toBe('rgb(56, 189, 248)');
        expect(hex.hsl).toBe('hsl(198, 93%, 60%)');
      }

      const rgb = conv.evaluate('rgb(255, 255, 255)');
      expect(rgb?.type).toBe('color');
      if (rgb && rgb.type === 'color') {
        expect(rgb.hex).toBe('#ffffff');
      }
    });

    it('should perform unit conversions (Temperature, Length, Weight, Storage)', () => {
      const temp = conv.evaluate('100 c to f');
      expect(temp?.type).toBe('unit');
      if (temp && temp.type === 'unit') {
        expect(temp.toValue).toBe(212);
      }

      const length = conv.evaluate('10 km to miles');
      expect(length?.type).toBe('unit');
      if (length && length.type === 'unit') {
        expect(length.toValue).toBeCloseTo(6.2137, 2);
      }

      const storage = conv.evaluate('10 gb in mb');
      expect(storage?.type).toBe('unit');
      if (storage && storage.type === 'unit') {
        expect(storage.toValue).toBe(10240);
      }
    });
  });

  describe('4. Master InstantAnswerEngine Orchestration', () => {
    it('should format calculation instant answer payload', () => {
      const answer = engine.evaluate('calc 50 * 20');
      expect(answer).toBeDefined();
      expect(answer?.type).toBe('calculation');
      expect(answer?.badge).toBe('[calculator]');
      expect(answer?.primaryResult).toBe('1,000');
    });

    it('should format bang redirect instant answer payload', () => {
      const answer = engine.evaluate('!gh opensearch');
      expect(answer).toBeDefined();
      expect(answer?.type).toBe('bang');
      expect(answer?.badge).toBe('[bang-redirect]');
      expect(answer?.redirectUrl).toBe('https://github.com/search?q=opensearch');
    });

    it('should format epoch conversion instant answer payload', () => {
      const answer = engine.evaluate('epoch 1600000000');
      expect(answer).toBeDefined();
      expect(answer?.type).toBe('epoch');
      expect(answer?.badge).toBe('[epoch-converter]');
      expect(answer?.primaryResult).toBe('2020-09-13T12:26:40.000Z');
    });

    it('should return null for queries without instant answers', () => {
      expect(engine.evaluate('distributed database consensus algorithm')).toBeNull();
    });
  });
});
