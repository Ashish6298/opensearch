/**
 * @opensearch/ranking — Math Calculation Instant Answer Provider (Phase 103)
 *
 * Implements deterministic local arithmetic, trigonometry, percentages, and scientific calculations:
 * - Pure local execution: zero network calls, zero external dependencies
 * - Full provenance with MIT attribution
 * - Safe expression parsing preventing arbitrary code execution
 */

import { MathEvaluator } from '../math-evaluator.js';
import {
  InstantAnswerContext,
  InstantAnswerPayload,
  InstantAnswerProvider,
} from '../answer-types.js';

export class MathCalculationProvider implements InstantAnswerProvider {
  public readonly id = 'math-calculator';
  public readonly name = 'Deterministic Local Math & Calculation Engine';
  public readonly supportedQueryTypes = ['calculation'] as const;
  public readonly source = 'Local Deterministic Mathematical Evaluator';
  public readonly freshness = 'static' as const;
  public readonly isRemote = false;
  public readonly timeoutMs = 50;
  public readonly failureHandling = 'fallback-to-search' as const;

  public readonly attribution = {
    name: 'OpenSearch Deterministic Math Evaluator',
    license: 'MIT',
    statement: 'Calculated locally using sandboxed recursive-descent math expression evaluator.',
  };

  public readonly privacyBehavior = {
    allowsLocalOnly: true,
    requiresNetwork: false,
    sendsQueryText: false,
    sendsIpAddress: false,
    privacyNotice: 'Evaluated locally in memory. Zero external network calls.',
  };

  private readonly evaluator = new MathEvaluator();

  canHandle(query: string): boolean {
    if (!query) return false;
    const q = query.trim();
    return (
      /^[\d\s+\-*/^%().,eE]+$/.test(q) ||
      /\b(?:sqrt|sin|cos|tan|log|ln|abs|ceil|floor|pi|tau)\b/i.test(q)
    );
  }

  evaluate(query: string, context?: InstantAnswerContext): InstantAnswerPayload | null {
    try {
      const res = this.evaluator.evaluate(query);
      if (!res) return null;

      const privacyMode = context?.isLocalOnly ? 'local-only' : (context?.privacyMode ?? 'standard');
      const timestamp = new Date().toISOString();

      return {
        type: 'calculation',
        badge: '[calculation]',
        title: 'Calculation',
        expression: res.expression,
        primaryResult: res.formattedResult,
        secondaryDetails: {
          Expression: res.expression,
          Result: res.formattedResult,
          'Numeric Value': res.result,
          'Evaluation Engine': this.source,
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
      // Never fabricate on error
      return null;
    }
  }
}
