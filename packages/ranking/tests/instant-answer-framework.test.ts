/**
 * @opensearch/ranking — Phase 103 Instant Answer Framework & Provider Tests
 *
 * Covers all Phase 103 tasks and acceptance criteria:
 * 1. Modular interface: supportedQueryTypes, source, freshness, attribution, privacyBehavior, timeout, failureHandling.
 * 2. Every instant answer has provenance (source, timestamp, attribution, freshness, isRemote, privacyMode).
 * 3. Remote answers respect the selected privacy mode (Local-only mode strictly blocks all remote modules).
 * 4. Unsupported queries fall back to ordinary search (returns null without error).
 * 5. Local calculations for unit conversions (deterministic, zero network).
 * 6. Weather from Open-Meteo with verified terms (CC BY 4.0, non-commercial open use).
 * 7. Currency results show explicit source and timestamp.
 * 8. Legitimate sources for definitions (Wiktionary/WordNet) and places (OpenStreetMap/GeoNames).
 * 9. Never fabricates an answer when a provider fails or encounters network errors.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  InstantAnswerEngine,
  createInstantAnswerEngine,
  InstantAnswerRegistry,
  UnitConversionProvider,
  MathCalculationProvider,
  CurrencyInstantAnswerProvider,
  OpenMeteoWeatherProvider,
  DefinitionInstantAnswerProvider,
  PlacesInstantAnswerProvider,
  InstantAnswerProvider,
  InstantAnswerContext,
} from '../src/index.js';

describe('Phase 103 — Instant-Answer Framework & Providers Suite', () => {
  describe('Task & Acceptance Criterion 1: Modular Interface & Provenance', () => {
    it('requires each provider module to declare all architectural metadata', () => {
      const registry = new InstantAnswerRegistry();
      const providers = registry.listProviders();

      expect(providers.length).toBeGreaterThanOrEqual(6);

      for (const p of providers) {
        expect(typeof p.id).toBe('string');
        expect(p.id.length).toBeGreaterThan(0);
        expect(typeof p.name).toBe('string');
        expect(Array.isArray(p.supportedQueryTypes)).toBe(true);
        expect(p.supportedQueryTypes.length).toBeGreaterThan(0);
        expect(typeof p.source).toBe('string');
        expect(['realtime', 'daily', 'static', 'hourly']).toContain(p.freshness);
        expect(p.attribution).toBeDefined();
        expect(typeof p.attribution.name).toBe('string');
        expect(typeof p.privacyBehavior).toBe('object');
        expect(typeof p.privacyBehavior.allowsLocalOnly).toBe('boolean');
        expect(typeof p.privacyBehavior.requiresNetwork).toBe('boolean');
        expect(typeof p.timeoutMs).toBe('number');
        expect(['fallback-to-search', 'silent']).toContain(p.failureHandling);
      }
    });

    it('guarantees that every generated instant answer has complete provenance', async () => {
      const engine = createInstantAnswerEngine();

      const testQueries = [
        '50 kg in lbs',
        '15 * 4 + 20',
        '100 usd to eur',
        'define algorithm',
        'where is Paris',
      ];

      for (const q of testQueries) {
        const answer = await engine.evaluateAsync(q);
        expect(answer).not.toBeNull();
        expect(answer?.primaryResult).toBeDefined();

        // Acceptance Criterion 1: Every instant answer has provenance
        const prov = answer?.provenance;
        expect(prov).toBeDefined();
        expect(typeof prov?.source).toBe('string');
        expect(prov?.source.length).toBeGreaterThan(0);
        expect(typeof prov?.timestamp).toBe('string');
        expect(new Date(prov!.timestamp).getTime()).not.toBeNaN();
        expect(prov?.attribution).toBeDefined();
        expect(typeof prov?.attribution.name).toBe('string');
        expect(['realtime', 'daily', 'static', 'hourly']).toContain(prov?.freshness);
        expect(typeof prov?.isRemote).toBe('boolean');
        expect(['local-only', 'standard']).toContain(prov?.privacyMode);
        expect(prov?.verified).toBe(true);
      }
    });
  });

  describe('Task & Acceptance Criterion 2: Privacy Mode & Local-Only Enforcement', () => {
    it('ensures Local-only mode strictly blocks all remote answer modules', async () => {
      const mockFetch = vi.fn();
      const weatherProvider = new OpenMeteoWeatherProvider({ customFetch: mockFetch });

      // In standard mode, remote module indicates canHandle = true
      expect(weatherProvider.canHandle('weather in Tokyo', { isLocalOnly: false })).toBe(true);

      // In Local-only mode, canHandle must be false and evaluate must return null immediately
      expect(weatherProvider.canHandle('weather in Tokyo', { isLocalOnly: true })).toBe(false);
      expect(weatherProvider.canHandle('weather in Tokyo', { privacyMode: 'local-only' })).toBe(false);

      const localResult = await weatherProvider.evaluate('weather in Tokyo', { isLocalOnly: true });
      expect(localResult).toBeNull();
      // Zero network fetch calls dispatched
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('registry blocks remote providers when isLocalOnly is true', async () => {
      const mockFetch = vi.fn();
      const weatherProvider = new OpenMeteoWeatherProvider({ customFetch: mockFetch });
      const registry = new InstantAnswerRegistry({
        providers: [weatherProvider, new MathCalculationProvider()],
      });

      // 1. Local calculation passes in Local-only mode
      const mathAns = await registry.evaluateAsync('25 * 4', { isLocalOnly: true });
      expect(mathAns).not.toBeNull();
      expect(mathAns?.primaryResult).toBe('100');
      expect(mathAns?.expression).toBe('25 * 4');
      expect(mathAns?.provenance.privacyMode).toBe('local-only');

      // 2. Remote weather is blocked in Local-only mode
      const weatherAns = await registry.evaluateAsync('weather in Paris', { isLocalOnly: true });
      expect(weatherAns).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Task & Acceptance Criterion 3: Fallback on Unsupported Queries & Errors', () => {
    it('unsupported queries cleanly return null and fall back to ordinary search', async () => {
      const engine = createInstantAnswerEngine();

      const generalQueries = [
        'how to learn rust programming',
        'history of open source software',
        'best hiking trails in the pacific northwest',
        'quantum computing hardware architecture',
      ];

      for (const q of generalQueries) {
        const answer = await engine.evaluateAsync(q);
        expect(answer).toBeNull(); // Clean fallback to ordinary search
      }
    });

    it('never fabricates an answer when a provider fails or network errors occur', async () => {
      // Create a weather provider with a failing network fetch
      const failingFetch = vi.fn().mockRejectedValue(new Error('Network connection timeout (ETIMEDOUT)'));
      const failingWeather = new OpenMeteoWeatherProvider({ customFetch: failingFetch });

      const res = await failingWeather.evaluate('weather in Tokyo', { isLocalOnly: false });
      // Must not fabricate a fake temperature
      expect(res).toBeNull();

      // Create a weather provider where HTTP returns 500 Internal Server Error
      const http500Fetch = vi.fn().mockResolvedValue(new Response('Internal Server Error', { status: 500 }));
      const failingHttp = new OpenMeteoWeatherProvider({ customFetch: http500Fetch });
      const res500 = await failingHttp.evaluate('weather in London', { isLocalOnly: false });
      expect(res500).toBeNull();
    });

    it('never fabricates a definition when a word is not found in legitimate dictionary', () => {
      const defProvider = new DefinitionInstantAnswerProvider();
      const res = defProvider.evaluate('define nonExistentSuperFakeWord12345');
      expect(res).toBeNull();
    });

    it('never fabricates geographic coordinates when a place is not found in cartographic database', () => {
      const placesProvider = new PlacesInstantAnswerProvider();
      const res = placesProvider.evaluate('where is FakeMadeUpNarniaCity');
      expect(res).toBeNull();
    });
  });

  describe('Specific Instant Answer Providers', () => {
    it('prefers local calculations for unit conversions with zero network calls', () => {
      const provider = new UnitConversionProvider();
      expect(provider.isRemote).toBe(false);
      expect(provider.privacyBehavior.requiresNetwork).toBe(false);

      const res = provider.evaluate('100 km to miles');
      expect(res).not.toBeNull();
      expect(res?.type).toBe('conversion');
      expect(res?.primaryResult).toContain('100 km = 62.137 mile');
      expect(res?.provenance.source).toContain('Local Deterministic Unit Calculation');
      expect(res?.provenance.isRemote).toBe(false);

      const digitalRes = provider.evaluate('1024 mb in gb');
      expect(digitalRes).not.toBeNull();
      expect(digitalRes?.primaryResult).toContain('1024 MB = 1 GB');
    });

    it('provides currency results showing explicit source and timestamp', () => {
      const provider = new CurrencyInstantAnswerProvider();

      const res = provider.evaluate('100 usd to eur');
      expect(res).not.toBeNull();
      expect(res?.type).toBe('currency');
      expect(res?.primaryResult).toContain('92');
      expect(res?.secondaryDetails?.['Data Source']).toBe(provider.source);
      expect(res?.secondaryDetails?.['Evaluation Timestamp']).toBeDefined();
      expect(res?.secondaryDetails?.['Reference Date']).toBe(provider.referenceRateDate);
      expect(res?.provenance.source).toContain('European Central Bank');
      expect(res?.provenance.attribution.name).toContain('European Central Bank');
    });

    it('uses legitimate Wiktionary/WordNet source for definitions', () => {
      const provider = new DefinitionInstantAnswerProvider();

      const res = provider.evaluate('define algorithm');
      expect(res).not.toBeNull();
      expect(res?.type).toBe('definition');
      expect(res?.primaryResult).toContain('step-by-step procedure');
      expect(res?.secondaryDetails?.['Part of Speech']).toBe('noun');
      expect(res?.secondaryDetails?.Etymology).toBeDefined();
      expect(res?.provenance.source).toBe('Wiktionary & Open English WordNet');
      expect(res?.provenance.attribution.license).toContain('CC BY-SA 4.0');
    });

    it('uses legitimate OpenStreetMap/GeoNames source for places and capitals', () => {
      const provider = new PlacesInstantAnswerProvider();

      const capitalRes = provider.evaluate('capital of Australia');
      expect(capitalRes).not.toBeNull();
      expect(capitalRes?.title).toContain('Canberra');
      expect(capitalRes?.primaryResult).toContain('Canberra is the capital of Australia');
      expect(capitalRes?.provenance.source).toContain('OpenStreetMap & GeoNames');
      expect(capitalRes?.provenance.attribution.license).toContain('ODbL 1.0');

      const locationRes = provider.evaluate('where is Paris');
      expect(locationRes).not.toBeNull();
      expect(locationRes?.primaryResult).toContain('Paris, France');
      expect(locationRes?.secondaryDetails?.Coordinates).toContain('48.8566');
    });

    it('evaluates real-time weather with Open-Meteo API when permitted', async () => {
      const mockWeatherResponse = {
        current: {
          temperature_2m: 21.5,
          apparent_temperature: 20.8,
          weather_code: 0,
          relative_humidity_2m: 55,
          wind_speed_10m: 12.3,
        },
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockWeatherResponse,
      });

      const provider = new OpenMeteoWeatherProvider({ customFetch: mockFetch });
      const res = await provider.evaluate('weather in Tokyo', { isLocalOnly: false });

      expect(res).not.toBeNull();
      expect(res?.type).toBe('weather');
      expect(res?.title).toContain('Weather in Tokyo');
      expect(res?.primaryResult).toContain('21.5°C');
      expect(res?.secondaryDetails?.Condition).toContain('Clear sky');
      expect(res?.provenance.source).toBe('Open-Meteo Free Weather API');
      expect(res?.provenance.attribution.license).toBe('CC BY 4.0');
      expect(res?.provenance.isRemote).toBe(true);
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('Registry Extensibility', () => {
    it('allows registering and unregistering custom providers', async () => {
      const registry = new InstantAnswerRegistry({ providers: [] });
      expect(registry.listProviders()).toHaveLength(0);

      const customProvider: InstantAnswerProvider = {
        id: 'custom-quote',
        name: 'Daily Philosophy Quote',
        supportedQueryTypes: ['knowledge_card'],
        source: 'Open Philosophy Archive',
        freshness: 'daily',
        isRemote: false,
        timeoutMs: 100,
        failureHandling: 'fallback-to-search',
        attribution: { name: 'Philosophy Archive', license: 'CC BY 4.0' },
        privacyBehavior: {
          allowsLocalOnly: true,
          requiresNetwork: false,
          sendsQueryText: false,
          sendsIpAddress: false,
        },
        canHandle: q => q.toLowerCase() === 'quote of the day',
        evaluate: () => ({
          type: 'knowledge_card',
          badge: '[quote]',
          title: 'Quote of the Day',
          primaryResult: 'The unexamined life is not worth living. — Socrates',
          provenance: {
            source: 'Open Philosophy Archive',
            timestamp: new Date().toISOString(),
            attribution: { name: 'Philosophy Archive', license: 'CC BY 4.0' },
            freshness: 'daily',
            isRemote: false,
            privacyMode: 'standard',
            verified: true,
          },
        }),
      };

      registry.registerProvider(customProvider);
      expect(registry.listProviders()).toHaveLength(1);
      expect(registry.getProvider('custom-quote')).toBeDefined();

      const answer = await registry.evaluateAsync('quote of the day');
      expect(answer?.primaryResult).toContain('Socrates');

      const removed = registry.unregisterProvider('custom-quote');
      expect(removed).toBe(true);
      expect(registry.listProviders()).toHaveLength(0);
    });
  });
});
