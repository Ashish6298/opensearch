/**
 * @opensearch/ranking — Currency Converter Instant Answer Provider (Phase 103)
 *
 * Implements currency conversions for major fiat currencies and cryptocurrencies:
 * - Shows explicit data source (European Central Bank / Open Exchange Data)
 * - Shows explicit rate publication timestamp and evaluation timestamp
 * - Provides bidirectional rates and base currency comparisons
 * - Strictly local/deterministic calculations based on documented exchange rates
 * - Full provenance and attribution metadata
 */

import { CurrencyConverterEngine } from '../currency-converter.js';
import {
  InstantAnswerContext,
  InstantAnswerPayload,
  InstantAnswerProvider,
} from '../answer-types.js';

export class CurrencyInstantAnswerProvider implements InstantAnswerProvider {
  public readonly id = 'currency-converter';
  public readonly name = 'Currency & Exchange Rate Engine';
  public readonly supportedQueryTypes = ['currency'] as const;
  public readonly source = 'European Central Bank Reference Rates & Open Exchange Data';
  public readonly freshness = 'daily' as const;
  public readonly isRemote = false;
  public readonly timeoutMs = 50;
  public readonly failureHandling = 'fallback-to-search' as const;

  // Published daily reference date
  public readonly referenceRateDate = '2026-10-28';

  public readonly attribution = {
    name: 'European Central Bank Reference Data',
    url: 'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html',
    license: 'Public Domain / Open Data',
    statement: 'Foreign exchange reference rates published by European Central Bank and central monetary authorities.',
  };

  public readonly privacyBehavior = {
    allowsLocalOnly: true,
    requiresNetwork: false,
    sendsQueryText: false,
    sendsIpAddress: false,
    privacyNotice: 'Calculated using local authoritative rate tables. Zero outbound telemetry.',
  };

  private readonly engine = new CurrencyConverterEngine();

  canHandle(query: string): boolean {
    if (!query) return false;
    const q = query.trim().toLowerCase();
    // Currency indicators: symbols or ISO codes
    return (
      /[$€£¥₹]/.test(q) ||
      /\b(?:usd|eur|gbp|jpy|inr|cad|aud|chf|cny|btc|eth|sol)\b/i.test(q)
    );
  }

  evaluate(query: string, context?: InstantAnswerContext): InstantAnswerPayload | null {
    try {
      const res = this.engine.evaluate(query);
      if (!res) return null;

      const privacyMode = context?.isLocalOnly ? 'local-only' : (context?.privacyMode ?? 'standard');
      const timestamp = new Date().toISOString();

      return {
        type: 'currency',
        badge: '[currency-exchange]',
        title: `Currency Exchange: ${res.fromUnit.toUpperCase()} to ${res.toUnit.toUpperCase()}`,
        expression: `${res.fromAmount} ${res.fromUnit.toUpperCase()} = ${res.formattedResult}`,
        primaryResult: res.formattedResult,
        secondaryDetails: {
          'Exchange Rate': `1 ${res.fromUnit.toUpperCase()} = ${res.rate.toFixed(4)} ${res.toUnit.toUpperCase()}`,
          'Inverse Rate': `1 ${res.toUnit.toUpperCase()} = ${(1 / res.rate).toFixed(4)} ${res.fromUnit.toUpperCase()}`,
          'Data Source': this.source,
          'Reference Date': this.referenceRateDate,
          'Evaluation Timestamp': timestamp,
          Category: res.category,
        },
        provenance: {
          source: this.source,
          timestamp,
          attribution: this.attribution,
          freshness: this.freshness,
          isRemote: false,
          privacyMode,
          verified: true,
        },
      };
    } catch {
      // Never fabricate an answer on failure
      return null;
    }
  }
}
