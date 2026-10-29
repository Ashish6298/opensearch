/**
 * @opensearch/ranking — Unit Conversion Instant Answer Provider (Phase 103)
 *
 * Implements deterministic local calculations for:
 * - Physical units (length, weight/mass, temperature, speed, energy)
 * - Digital data storage (bytes, KB, MB, GB, TB, PB)
 * - Color codes (HEX, RGB, HSL)
 * - Unix Epoch timestamps
 *
 * Strictly local, offline, deterministic calculation with complete provenance.
 */

import { ConversionEvaluator } from '../conversion-evaluator.js';
import {
  InstantAnswerContext,
  InstantAnswerPayload,
  InstantAnswerProvider,
} from '../answer-types.js';

export class UnitConversionProvider implements InstantAnswerProvider {
  public readonly id = 'unit-conversion';
  public readonly name = 'Local Unit & Metric Conversion Engine';
  public readonly supportedQueryTypes = ['conversion', 'color', 'epoch'] as const;
  public readonly source = 'Local Deterministic Unit Calculation Engine';
  public readonly freshness = 'static' as const;
  public readonly isRemote = false;
  public readonly timeoutMs = 50;
  public readonly failureHandling = 'fallback-to-search' as const;

  public readonly attribution = {
    name: 'OpenSearch Deterministic Unit Conversion Library',
    license: 'MIT',
    statement: 'Calculated locally using standard ISO/IEC 80000 and SI dimensional formulas.',
  };

  public readonly privacyBehavior = {
    allowsLocalOnly: true,
    requiresNetwork: false,
    sendsQueryText: false,
    sendsIpAddress: false,
    privacyNotice: 'Evaluated 100% locally in browser/server memory. Zero network transmission.',
  };

  private readonly evaluator = new ConversionEvaluator();

  canHandle(query: string): boolean {
    if (!query) return false;
    const q = query.trim().toLowerCase();
    // Quick patterns for conversion, colors, epoch
    return (
      /\b(?:to|in|=)\b/.test(q) ||
      /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(q) ||
      /^rgb\(/i.test(q) ||
      /^hsl\(/i.test(q) ||
      /\b(?:epoch|timestamp|unix)\b/i.test(q) ||
      /^(1[0-9]{9}|1[0-9]{12})$/.test(q)
    );
  }

  evaluate(query: string, context?: InstantAnswerContext): InstantAnswerPayload | null {
    try {
      const res = this.evaluator.evaluate(query);
      if (!res) return null;

      const privacyMode = context?.isLocalOnly ? 'local-only' : (context?.privacyMode ?? 'standard');

      if (res.type === 'unit') {
        return {
          type: 'conversion',
          badge: '[unit-conversion]',
          title: `Unit Conversion: ${res.fromUnit} to ${res.toUnit}`,
          expression: `${res.fromValue} ${res.fromUnit} = ${res.toValue} ${res.toUnit}`,
          primaryResult: res.formattedSummary,
          secondaryDetails: {
            'Source Amount': `${res.fromValue} ${res.fromUnit}`,
            'Target Result': `${res.toValue} ${res.toUnit}`,
            'Conversion Mode': 'Exact Local SI Dimension Conversion',
          },
          provenance: {
            source: this.source,
            timestamp: new Date().toISOString(),
            attribution: this.attribution,
            freshness: this.freshness,
            isRemote: false,
            privacyMode,
            verified: true,
          },
        };
      }

      if (res.type === 'color') {
        return {
          type: 'color',
          badge: '[color-tool]',
          title: `Color Conversion: ${res.hex}`,
          primaryResult: `${res.hex} | ${res.rgb} | ${res.hsl}`,
          previewCss: res.previewCss,
          secondaryDetails: {
            HEX: res.hex,
            RGB: res.rgb,
            HSL: res.hsl,
          },
          provenance: {
            source: this.source,
            timestamp: new Date().toISOString(),
            attribution: this.attribution,
            freshness: this.freshness,
            isRemote: false,
            privacyMode,
            verified: true,
          },
        };
      }

      if (res.type === 'epoch') {
        return {
          type: 'epoch',
          badge: '[epoch-converter]',
          title: res.title,
          primaryResult: res.utcIso,
          secondaryDetails: {
            'UTC ISO': res.utcIso,
            'UTC Formatted': res.utcFormatted,
            'Epoch Seconds': res.epochSeconds,
            'Epoch Millis': res.epochMillis,
            Relative: res.relativeDescription,
          },
          provenance: {
            source: this.source,
            timestamp: new Date().toISOString(),
            attribution: this.attribution,
            freshness: this.freshness,
            isRemote: false,
            privacyMode,
            verified: true,
          },
        };
      }

      return null;
    } catch {
      // Never fabricate
      return null;
    }
  }
}
