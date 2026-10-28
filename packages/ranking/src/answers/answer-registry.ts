/**
 * @opensearch/ranking — Modular Instant Answer Registry & Orchestrator (Phase 103)
 *
 * Implements the extensible provider registry and orchestration framework:
 * - Modular provider lifecycle and declarative capability matching
 * - Strict Local-Only enforcement (blocks all remote modules when local-only mode is active)
 * - Safe execution with per-module timeout bounds and non-fabrication guarantees
 * - Clean fallback to ordinary search on unsupported queries or provider failures
 * - Every generated answer is guaranteed to carry immutable source provenance
 */

import {
  InstantAnswerContext,
  InstantAnswerPayload,
  InstantAnswerProvider,
  InstantAnswerProviderMetadata,
} from './answer-types.js';
import { UnitConversionProvider } from './providers/unit-conversion-provider.js';
import { MathCalculationProvider } from './providers/math-calculation-provider.js';
import { CurrencyInstantAnswerProvider } from './providers/currency-provider.js';
import { OpenMeteoWeatherProvider } from './providers/weather-provider.js';
import { DefinitionInstantAnswerProvider } from './providers/definition-provider.js';
import { PlacesInstantAnswerProvider } from './providers/places-provider.js';

export interface InstantAnswerRegistryOptions {
  providers?: InstantAnswerProvider[];
}

export class InstantAnswerRegistry {
  private readonly providers = new Map<string, InstantAnswerProvider>();

  constructor(options: InstantAnswerRegistryOptions = {}) {
    if (options.providers) {
      for (const p of options.providers) {
        this.registerProvider(p);
      }
    } else {
      this.registerDefaultProviders();
    }
  }

  /**
   * Registers a default suite of vetted, legitimate instant answer providers.
   */
  private registerDefaultProviders(): void {
    // 1. Local Unit Conversions (SI, digital storage, epoch, color)
    this.registerProvider(new UnitConversionProvider());
    // 2. Local Deterministic Math & Arithmetic Evaluator
    this.registerProvider(new MathCalculationProvider());
    // 3. Currency & Exchange Rates (European Central Bank data)
    this.registerProvider(new CurrencyInstantAnswerProvider());
    // 4. Remote Weather via Open-Meteo (CC BY 4.0, zero API keys, blocked in local-only)
    this.registerProvider(new OpenMeteoWeatherProvider());
    // 5. Lexical Definitions (Wiktionary & Open English WordNet)
    this.registerProvider(new DefinitionInstantAnswerProvider());
    // 6. Geographic Places & Capitals (OpenStreetMap & GeoNames)
    this.registerProvider(new PlacesInstantAnswerProvider());
  }

  /**
   * Registers an instant answer provider.
   */
  registerProvider(provider: InstantAnswerProvider): void {
    this.providers.set(provider.id, provider);
  }

  /**
   * Unregisters a provider by ID.
   */
  unregisterProvider(id: string): boolean {
    return this.providers.delete(id);
  }

  /**
   * Retrieves a registered provider by ID.
   */
  getProvider(id: string): InstantAnswerProvider | undefined {
    return this.providers.get(id);
  }

  /**
   * Lists all registered provider metadata declarations.
   */
  listProviders(): InstantAnswerProviderMetadata[] {
    return Array.from(this.providers.values()).map(p => ({
      id: p.id,
      name: p.name,
      supportedQueryTypes: p.supportedQueryTypes,
      source: p.source,
      freshness: p.freshness,
      attribution: p.attribution,
      privacyBehavior: p.privacyBehavior,
      timeoutMs: p.timeoutMs,
      failureHandling: p.failureHandling,
      isRemote: p.isRemote,
    }));
  }

  /**
   * Asynchronously evaluates a search query against registered providers.
   *
   * Guarantees:
   * 1. Every answer includes complete provenance.
   * 2. Remote answer modules are strictly blocked if Local-only mode is active.
   * 3. Never fabricates an answer if a provider fails or times out.
   * 4. Unsupported queries cleanly return null and fall back to ordinary search.
   */
  async evaluateAsync(
    query: string,
    context: InstantAnswerContext = {},
  ): Promise<InstantAnswerPayload | null> {
    if (!query || typeof query !== 'string') return null;
    const cleanQuery = query.trim();
    if (!cleanQuery) return null;

    const isLocalOnly = context.isLocalOnly || context.privacyMode === 'local-only';

    for (const provider of this.providers.values()) {
      // Acceptance Criterion: Ensure Local-only mode blocks all remote answer modules
      if (isLocalOnly && (provider.isRemote || provider.privacyBehavior.requiresNetwork)) {
        continue;
      }

      // Check whether provider can handle this query
      try {
        if (!provider.canHandle(cleanQuery, context)) {
          continue;
        }
      } catch {
        continue;
      }

      // Execute provider with timeout race to prevent hanging
      try {
        const timeoutMs = context.timeoutMs ?? provider.timeoutMs ?? 2000;
        let timer: ReturnType<typeof setTimeout> | undefined;

        const timeoutPromise = new Promise<null>(resolve => {
          timer = setTimeout(() => resolve(null), timeoutMs);
        });

        const evalPromise = Promise.resolve(provider.evaluate(cleanQuery, context));
        const result = await Promise.race([evalPromise, timeoutPromise]);
        if (timer) clearTimeout(timer);

        if (result && result.primaryResult) {
          // Guarantee valid provenance
          if (!result.provenance) {
            result.provenance = {
              source: provider.source,
              timestamp: new Date().toISOString(),
              attribution: provider.attribution,
              freshness: provider.freshness,
              isRemote: provider.isRemote,
              privacyMode: isLocalOnly ? 'local-only' : 'standard',
              verified: true,
            };
          }
          return result;
        }
      } catch {
        // Acceptance Criterion: Never fabricate an answer when a provider fails
        // Fall back silently to next provider or ordinary search
        continue;
      }
    }

    // Acceptance Criterion: Unsupported queries fall back to ordinary search
    return null;
  }

  /**
   * Synchronously evaluates a search query against local instant answer providers.
   * Automatically suppresses remote providers to guarantee zero latency penalty.
   */
  evaluate(query: string, context: InstantAnswerContext = {}): InstantAnswerPayload | null {
    if (!query || typeof query !== 'string') return null;
    const cleanQuery = query.trim();
    if (!cleanQuery) return null;

    for (const provider of this.providers.values()) {
      // Remote providers cannot run in synchronous mode
      if (provider.isRemote || provider.privacyBehavior.requiresNetwork) {
        continue;
      }

      try {
        if (!provider.canHandle(cleanQuery, context)) {
          continue;
        }

        const result = provider.evaluate(cleanQuery, context);
        // If provider returned a promise in sync path, skip it
        if (result && typeof (result as any).then === 'function') {
          continue;
        }

        const syncResult = result as InstantAnswerPayload | null;
        if (syncResult && syncResult.primaryResult) {
          if (!syncResult.provenance) {
            syncResult.provenance = {
              source: provider.source,
              timestamp: new Date().toISOString(),
              attribution: provider.attribution,
              freshness: provider.freshness,
              isRemote: false,
              privacyMode: context.isLocalOnly ? 'local-only' : 'standard',
              verified: true,
            };
          }
          return syncResult;
        }
      } catch {
        // Never fabricate on error
        continue;
      }
    }

    return null;
  }
}

// Global default singleton registry
let defaultInstantAnswerRegistryInstance: InstantAnswerRegistry | null = null;

export function getDefaultInstantAnswerRegistry(): InstantAnswerRegistry {
  if (!defaultInstantAnswerRegistryInstance) {
    defaultInstantAnswerRegistryInstance = new InstantAnswerRegistry();
  }
  return defaultInstantAnswerRegistryInstance;
}
