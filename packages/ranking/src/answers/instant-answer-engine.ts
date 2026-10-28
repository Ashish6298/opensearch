/**
 * @opensearch/ranking — Instant Answers Engine (Phase 38 & Phase 103)
 *
 * Coordinates zero-click instant answers, zero-dependency mathematical evaluations,
 * direct data/unit/color conversions, currency exchange, weather, definitions,
 * places, and fast developer bang shortcuts with strict provenance and privacy-mode enforcement.
 */

import { BangResult, evaluateBang } from './bang-registry.js';
import { MathEvaluator, MathEvaluationResult } from './math-evaluator.js';
import { ConversionEvaluator, ConversionResult } from './conversion-evaluator.js';
import { KnowledgeEngine, KnowledgeCardResult } from './knowledge-engine.js';
import { TimezoneEvaluator, TimezoneConversionResult } from './timezone-evaluator.js';
import { CheatSheetEngine, CheatSheetResult } from './cheatsheet-engine.js';
import { CryptoEngine, CryptoEngineResult } from './crypto-engine.js';
import { NetworkEngine, NetworkEngineResult } from './network-engine.js';
import { PrivacyAuditEngine, PrivacyAuditResult } from './privacy-audit-engine.js';
import { CurrencyConverterEngine, CurrencyConversionResult } from './currency-converter.js';
import { SymbolicMathEngine, MathSolverResult } from './math-engine.js';
import {
  InstantAnswerContext,
  InstantAnswerPayload,
  InstantAnswerProvenance,
} from './answer-types.js';
import { InstantAnswerRegistry } from './answer-registry.js';

export type { InstantAnswerPayload, InstantAnswerProvenance, InstantAnswerContext };

export class InstantAnswerEngine {
  private readonly registry: InstantAnswerRegistry;
  private readonly mathEvaluator: MathEvaluator;
  private readonly conversionEvaluator: ConversionEvaluator;
  private readonly knowledgeEngine: KnowledgeEngine;
  private readonly timezoneEvaluator: TimezoneEvaluator;
  private readonly cheatSheetEngine: CheatSheetEngine;
  private readonly cryptoEngine: CryptoEngine;
  private readonly networkEngine: NetworkEngine;
  private readonly privacyAuditEngine: PrivacyAuditEngine;
  private readonly currencyConverterEngine: CurrencyConverterEngine;
  private readonly symbolicMathEngine: SymbolicMathEngine;

  constructor(options: { registry?: InstantAnswerRegistry } = {}) {
    this.registry = options.registry ?? new InstantAnswerRegistry();
    this.mathEvaluator = new MathEvaluator();
    this.conversionEvaluator = new ConversionEvaluator();
    this.knowledgeEngine = new KnowledgeEngine();
    this.timezoneEvaluator = new TimezoneEvaluator();
    this.cheatSheetEngine = new CheatSheetEngine();
    this.cryptoEngine = new CryptoEngine();
    this.networkEngine = new NetworkEngine();
    this.privacyAuditEngine = new PrivacyAuditEngine();
    this.currencyConverterEngine = new CurrencyConverterEngine();
    this.symbolicMathEngine = new SymbolicMathEngine();
  }

  /**
   * Retrieves the underlying modular InstantAnswerRegistry.
   */
  getRegistry(): InstantAnswerRegistry {
    return this.registry;
  }

  /**
   * Asynchronously evaluates queries against modular providers (including weather, currency, definitions, places).
   * Enforces privacy mode (blocks remote providers if local-only).
   * Never fabricates answers on provider failure.
   */
  async evaluateAsync(
    rawQuery: string,
    context: InstantAnswerContext = {},
  ): Promise<InstantAnswerPayload | null> {
    if (!rawQuery || typeof rawQuery !== 'string') return null;
    const trimmed = rawQuery.trim();
    if (!trimmed) return null;

    // 1. First consult modular provider framework (Unit conversions, weather, currency, definitions, places, math)
    const providerResult = await this.registry.evaluateAsync(trimmed, context);
    if (providerResult) {
      return providerResult;
    }

    // 2. Fall back to local synchronous engines with provenance attached
    return this.evaluateLocalSync(trimmed, context);
  }

  /**
   * Synchronously evaluates queries against local instant answer engines.
   * Guarantees zero latency and zero outbound network calls.
   */
  evaluate(rawQuery: string, context: InstantAnswerContext = {}): InstantAnswerPayload | null {
    if (!rawQuery || typeof rawQuery !== 'string') {
      return null;
    }

    const trimmed = rawQuery.trim();
    if (!trimmed) {
      return null;
    }

    // 1. Check modular registry local providers
    const registryResult = this.registry.evaluate(trimmed, context);
    if (registryResult) {
      return registryResult;
    }

    // 2. Evaluate remaining local specialized engines
    return this.evaluateLocalSync(trimmed, context);
  }

  /**
   * Evaluates local synchronous engines and guarantees provenance on all results.
   */
  private evaluateLocalSync(trimmed: string, context: InstantAnswerContext): InstantAnswerPayload | null {
    const privacyMode = context.isLocalOnly ? 'local-only' : (context.privacyMode ?? 'standard');

    // 1. Bang Shortcut Evaluation
    const bang = evaluateBang(trimmed);
    if (bang) {
      return this.formatBangAnswer(bang, privacyMode);
    }

    // 2. Cryptographic Generators & Encoders (Phase 56)
    const cryptoTool = this.cryptoEngine.evaluate(trimmed);
    if (cryptoTool) {
      return this.formatCryptoAnswer(cryptoTool, privacyMode);
    }

    // 3. Network Subnet & Cron Explainer (Phase 57)
    const networkTool = this.networkEngine.evaluate(trimmed);
    if (networkTool) {
      return this.formatNetworkAnswer(networkTool, privacyMode);
    }

    // 4. Website Privacy & Security Audit (Phase 58)
    const privacyTool = this.privacyAuditEngine.evaluate(trimmed);
    if (privacyTool) {
      return this.formatPrivacyAnswer(privacyTool, privacyMode);
    }

    // 5. Real-Time Currency, Crypto & Unit Scaling (Phase 60)
    const currTool = this.currencyConverterEngine.evaluate(trimmed);
    if (currTool) {
      return this.formatCurrencyAnswer(currTool, privacyMode);
    }

    // 6. Symbolic Math & Equation Solver (Phase 61)
    const mathSolve = this.symbolicMathEngine.evaluate(trimmed);
    if (mathSolve) {
      return this.formatMathSolverAnswer(mathSolve, privacyMode);
    }

    // 7. Direct Math Expression Evaluation
    const math = this.mathEvaluator.evaluate(trimmed);
    if (math) {
      return this.formatMathAnswer(math, privacyMode);
    }

    // 8. Direct Conversions (Epoch, Color, Units)
    const conv = this.conversionEvaluator.evaluate(trimmed);
    if (conv) {
      return this.formatConversionAnswer(conv, privacyMode);
    }

    // 9. World Clock & Timezone Conversions (Phase 50)
    const tz = this.timezoneEvaluator.evaluate(trimmed);
    if (tz) {
      return this.formatTimezoneAnswer(tz, privacyMode);
    }

    // 10. Developer Syntax Cheat Sheets (Phase 51)
    const cheat = this.cheatSheetEngine.lookup(trimmed);
    if (cheat) {
      return this.formatCheatSheetAnswer(cheat, privacyMode);
    }

    // 11. In-Memory Knowledge Graph / Entity Cards (Phase 49)
    const card = this.knowledgeEngine.lookup(trimmed);
    if (card) {
      return this.formatKnowledgeAnswer(card, privacyMode);
    }

    return null;
  }

  private buildLocalProvenance(
    source: string,
    attributionName: string,
    privacyMode: 'local-only' | 'standard',
  ): InstantAnswerProvenance {
    return {
      source,
      timestamp: new Date().toISOString(),
      attribution: {
        name: attributionName,
        license: 'MIT / Open Source',
      },
      freshness: 'static',
      isRemote: false,
      privacyMode,
      verified: true,
    };
  }

  private formatCryptoAnswer(tool: CryptoEngineResult, privacyMode: 'local-only' | 'standard'): InstantAnswerPayload {
    return {
      type: 'crypto',
      badge: '[crypto-toolkit]',
      title: tool.title,
      primaryResult: tool.output,
      description: tool.description,
      codeSnippet: tool.copyValue,
      secondaryDetails: tool.details,
      provenance: this.buildLocalProvenance('Local Cryptographic Engine', 'OpenSearch Crypto Subsystem', privacyMode),
    };
  }

  private formatNetworkAnswer(tool: NetworkEngineResult, privacyMode: 'local-only' | 'standard'): InstantAnswerPayload {
    return {
      type: 'network',
      badge: '[network-diagnostics]',
      title: tool.title,
      primaryResult: tool.output,
      description: tool.description,
      secondaryDetails: tool.details,
      provenance: this.buildLocalProvenance('Local Network IPv4/CIDR Evaluator', 'OpenSearch Network Subsystem', privacyMode),
    };
  }

  private formatPrivacyAnswer(tool: PrivacyAuditResult, privacyMode: 'local-only' | 'standard'): InstantAnswerPayload {
    return {
      type: 'privacy',
      badge: `[privacy-audit:${tool.grade}]`,
      title: `Privacy & Security Grade: ${tool.grade} (${tool.score}/100)`,
      primaryResult: `${tool.domain} — Rating ${tool.grade}`,
      description: tool.description,
      secondaryDetails: tool.details,
      provenance: this.buildLocalProvenance('Local Privacy Security Scorer', 'OpenSearch Privacy Audit Subsystem', privacyMode),
    };
  }

  private formatCurrencyAnswer(tool: CurrencyConversionResult, privacyMode: 'local-only' | 'standard'): InstantAnswerPayload {
    return {
      type: 'currency',
      badge: `[${tool.category}-converter]`,
      title: `${tool.fromUnit.toUpperCase()} to ${tool.toUnit.toUpperCase()} Conversion`,
      primaryResult: tool.formattedResult,
      secondaryDetails: {
        ...tool.details,
        Source: 'European Central Bank Reference Rates',
        Timestamp: new Date().toISOString(),
      },
      provenance: {
        source: 'European Central Bank Reference Rates',
        timestamp: new Date().toISOString(),
        attribution: {
          name: 'European Central Bank / Open Exchange Data',
          url: 'https://www.ecb.europa.eu/',
          license: 'Public Domain / Open Data',
        },
        freshness: 'daily',
        isRemote: false,
        privacyMode,
        verified: true,
      },
    };
  }

  private formatMathSolverAnswer(tool: MathSolverResult, privacyMode: 'local-only' | 'standard'): InstantAnswerPayload {
    return {
      type: 'math_solver',
      badge: '[symbolic-solver]',
      title: tool.expression,
      primaryResult: tool.solution,
      codeSnippet: tool.latexFormula,
      description: tool.steps.join(' ➔ '),
      secondaryDetails: tool.details,
      provenance: this.buildLocalProvenance('Local Symbolic Algebraic Solver', 'OpenSearch Math Engine', privacyMode),
    };
  }

  private formatCheatSheetAnswer(cheat: CheatSheetResult, privacyMode: 'local-only' | 'standard'): InstantAnswerPayload {
    return {
      type: 'cheatsheet',
      badge: cheat.badge,
      title: cheat.title,
      primaryResult: cheat.command,
      codeSnippet: cheat.command,
      description: cheat.description,
      secondaryDetails: cheat.details,
      provenance: this.buildLocalProvenance('Developer Syntax Cheat Sheet Database', 'OpenSearch Developer Reference', privacyMode),
    };
  }

  private formatTimezoneAnswer(tz: TimezoneConversionResult, privacyMode: 'local-only' | 'standard'): InstantAnswerPayload {
    return {
      type: 'timezone',
      badge: '[world-clock]',
      title: tz.title,
      primaryResult: tz.primaryTime,
      secondaryDetails: tz.details,
      provenance: this.buildLocalProvenance('IANA World Time Zone Database', 'OpenSearch Timezone Engine', privacyMode),
    };
  }

  private formatKnowledgeAnswer(card: KnowledgeCardResult, privacyMode: 'local-only' | 'standard'): InstantAnswerPayload {
    return {
      type: 'knowledge_card',
      badge: card.badge,
      title: card.title,
      primaryResult: card.title,
      description: card.description,
      redirectUrl: card.url,
      secondaryDetails: card.attributes,
      provenance: this.buildLocalProvenance('In-Memory Knowledge Graph', 'OpenSearch Knowledge Entity Base', privacyMode),
    };
  }

  private formatBangAnswer(bang: BangResult, privacyMode: 'local-only' | 'standard'): InstantAnswerPayload {
    const queryDisplay = bang.searchQuery ? `"${bang.searchQuery}"` : 'Home';
    return {
      type: 'bang',
      badge: '[bang-redirect]',
      title: `Redirect to ${bang.serviceName}`,
      expression: `!${bang.matchedTrigger} ${bang.searchQuery}`.trim(),
      primaryResult: `Redirecting to ${bang.serviceName} for ${queryDisplay}`,
      redirectUrl: bang.redirectUrl,
      secondaryDetails: {
        'Target Service': bang.serviceName,
        'Bang Trigger': `!${bang.matchedTrigger}`,
        'Search Target': bang.searchQuery || '(Empty query / Direct Home)',
        'Redirect URL': bang.redirectUrl,
      },
      provenance: this.buildLocalProvenance('Developer Bang Shortcut Registry', 'OpenSearch Bang Shortcuts', privacyMode),
    };
  }

  private formatMathAnswer(math: MathEvaluationResult, privacyMode: 'local-only' | 'standard'): InstantAnswerPayload {
    return {
      type: 'calculation',
      badge: '[calculator]',
      title: 'Calculation',
      expression: math.expression,
      primaryResult: math.formattedResult,
      secondaryDetails: {
        Expression: math.expression,
        Result: math.formattedResult,
      },
      provenance: this.buildLocalProvenance('Local Deterministic Mathematical Evaluator', 'OpenSearch Calculator Engine', privacyMode),
    };
  }

  private formatConversionAnswer(conv: ConversionResult, privacyMode: 'local-only' | 'standard'): InstantAnswerPayload {
    const prov = this.buildLocalProvenance('Local Deterministic Unit Calculation Engine', 'OpenSearch Conversion Library', privacyMode);

    if (conv.type === 'epoch') {
      return {
        type: 'epoch',
        badge: '[epoch-converter]',
        title: conv.title,
        primaryResult: conv.utcIso,
        secondaryDetails: {
          'UTC ISO': conv.utcIso,
          'UTC Formatted': conv.utcFormatted,
          'Epoch Seconds': conv.epochSeconds,
          'Epoch Millis': conv.epochMillis,
          Relative: conv.relativeDescription,
        },
        provenance: prov,
      };
    }

    if (conv.type === 'color') {
      return {
        type: 'color',
        badge: '[color-converter]',
        title: conv.title,
        primaryResult: `${conv.hex}  |  ${conv.rgb}  |  ${conv.hsl}`,
        previewCss: conv.previewCss,
        secondaryDetails: {
          HEX: conv.hex,
          RGB: conv.rgb,
          HSL: conv.hsl,
        },
        provenance: prov,
      };
    }

    if (conv.type === 'unit') {
      return {
        type: 'conversion',
        badge: '[unit-converter]',
        title: conv.title,
        primaryResult: conv.formattedSummary,
        secondaryDetails: {
          'From Value': `${conv.fromValue} ${conv.fromUnit}`,
          'Converted Value': `${conv.toValue} ${conv.toUnit}`,
        },
        provenance: prov,
      };
    }

    return {
      type: 'conversion',
      badge: '[instant-answer]',
      title: 'Instant Answer',
      primaryResult: '',
      provenance: prov,
    };
  }
}

/**
 * Factory for InstantAnswerEngine
 */
export function createInstantAnswerEngine(): InstantAnswerEngine {
  return new InstantAnswerEngine();
}
