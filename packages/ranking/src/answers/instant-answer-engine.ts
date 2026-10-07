/**
 * @opensearch/ranking — Instant Answers Engine (Phase 38)
 *
 * Coordinates zero-click instant answers, zero-dependency mathematical evaluations,
 * direct data/unit/color conversions, and fast developer bang shortcuts.
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

export interface InstantAnswerPayload {
  /** Answer category identifier */
  type: 'calculation' | 'conversion' | 'color' | 'epoch' | 'bang' | 'knowledge_card' | 'timezone' | 'cheatsheet' | 'crypto' | 'network' | 'privacy' | 'currency' | 'math_solver';
  /** Display badge tag e.g. '[instant-answer]' or '[bang-redirect]' */
  badge: string;
  /** Section title */
  title: string;
  /** Query expression */
  expression?: string;
  /** Primary prominent result text */
  primaryResult: string;
  /** Description (for knowledge cards or cheatsheets) */
  description?: string;
  /** Code snippet or command (for cheatsheets or crypto copy) */
  codeSnippet?: string;
  /** Additional structured fields for detail tables */
  secondaryDetails?: Record<string, string | number>;
  /** Optional target redirect URL (for bang shortcuts or knowledge references) */
  redirectUrl?: string;
  /** Optional CSS color value for visual swatch preview */
  previewCss?: string;
}

export class InstantAnswerEngine {
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

  constructor() {
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
   * Evaluates query string for instant answers, conversions, knowledge cards, timezones, cheatsheets, crypto tools, network calculators, or bang shortcuts.
   * Returns null if no instant answer is applicable. Completes in < 0.1ms.
   */
  evaluate(rawQuery: string): InstantAnswerPayload | null {
    if (!rawQuery || typeof rawQuery !== 'string') {
      return null;
    }

    const trimmed = rawQuery.trim();
    if (!trimmed) {
      return null;
    }

    // 1. Bang Shortcut Evaluation
    const bang = evaluateBang(trimmed);
    if (bang) {
      return this.formatBangAnswer(bang);
    }

    // 2. Cryptographic Generators & Encoders (Phase 56)
    const cryptoTool = this.cryptoEngine.evaluate(trimmed);
    if (cryptoTool) {
      return this.formatCryptoAnswer(cryptoTool);
    }

    // 3. Network Subnet & Cron Explainer (Phase 57)
    const networkTool = this.networkEngine.evaluate(trimmed);
    if (networkTool) {
      return this.formatNetworkAnswer(networkTool);
    }

    // 4. Website Privacy & Security Audit (Phase 58)
    const privacyTool = this.privacyAuditEngine.evaluate(trimmed);
    if (privacyTool) {
      return this.formatPrivacyAnswer(privacyTool);
    }

    // 5. Real-Time Currency, Crypto & Unit Scaling (Phase 60)
    const currTool = this.currencyConverterEngine.evaluate(trimmed);
    if (currTool) {
      return this.formatCurrencyAnswer(currTool);
    }

    // 6. Symbolic Math & Equation Solver (Phase 61)
    const mathSolve = this.symbolicMathEngine.evaluate(trimmed);
    if (mathSolve) {
      return this.formatMathSolverAnswer(mathSolve);
    }

    // 7. Direct Math Expression Evaluation
    const math = this.mathEvaluator.evaluate(trimmed);
    if (math) {
      return this.formatMathAnswer(math);
    }

    // 8. Direct Conversions (Epoch, Color, Units)
    const conv = this.conversionEvaluator.evaluate(trimmed);
    if (conv) {
      return this.formatConversionAnswer(conv);
    }

    // 9. World Clock & Timezone Conversions (Phase 50)
    const tz = this.timezoneEvaluator.evaluate(trimmed);
    if (tz) {
      return this.formatTimezoneAnswer(tz);
    }

    // 10. Developer Syntax Cheat Sheets (Phase 51)
    const cheat = this.cheatSheetEngine.lookup(trimmed);
    if (cheat) {
      return this.formatCheatSheetAnswer(cheat);
    }

    // 11. In-Memory Knowledge Graph / Entity Cards (Phase 49)
    const card = this.knowledgeEngine.lookup(trimmed);
    if (card) {
      return this.formatKnowledgeAnswer(card);
    }

    return null;
  }

  private formatCryptoAnswer(tool: CryptoEngineResult): InstantAnswerPayload {
    return {
      type: 'crypto',
      badge: '[crypto-toolkit]',
      title: tool.title,
      primaryResult: tool.output,
      description: tool.description,
      codeSnippet: tool.copyValue,
      secondaryDetails: tool.details,
    };
  }

  private formatNetworkAnswer(tool: NetworkEngineResult): InstantAnswerPayload {
    return {
      type: 'network',
      badge: '[network-diagnostics]',
      title: tool.title,
      primaryResult: tool.output,
      description: tool.description,
      secondaryDetails: tool.details,
    };
  }

  private formatPrivacyAnswer(tool: PrivacyAuditResult): InstantAnswerPayload {
    return {
      type: 'privacy',
      badge: `[privacy-audit:${tool.grade}]`,
      title: `Privacy & Security Grade: ${tool.grade} (${tool.score}/100)`,
      primaryResult: `${tool.domain} — Rating ${tool.grade}`,
      description: tool.description,
      secondaryDetails: tool.details,
    };
  }

  private formatCurrencyAnswer(tool: CurrencyConversionResult): InstantAnswerPayload {
    return {
      type: 'currency',
      badge: `[${tool.category}-converter]`,
      title: `${tool.fromUnit} to ${tool.toUnit} Conversion`,
      primaryResult: tool.formattedResult,
      secondaryDetails: tool.details,
    };
  }

  private formatMathSolverAnswer(tool: MathSolverResult): InstantAnswerPayload {
    return {
      type: 'math_solver',
      badge: '[symbolic-solver]',
      title: tool.expression,
      primaryResult: tool.solution,
      codeSnippet: tool.latexFormula,
      description: tool.steps.join(' ➔ '),
      secondaryDetails: tool.details,
    };
  }

  private formatCheatSheetAnswer(cheat: CheatSheetResult): InstantAnswerPayload {
    return {
      type: 'cheatsheet',
      badge: cheat.badge,
      title: cheat.title,
      primaryResult: cheat.command,
      codeSnippet: cheat.command,
      description: cheat.description,
      secondaryDetails: cheat.details,
    };
  }

  private formatTimezoneAnswer(tz: TimezoneConversionResult): InstantAnswerPayload {
    return {
      type: 'timezone',
      badge: '[world-clock]',
      title: tz.title,
      primaryResult: tz.primaryTime,
      secondaryDetails: tz.details,
    };
  }

  private formatKnowledgeAnswer(card: KnowledgeCardResult): InstantAnswerPayload {
    return {
      type: 'knowledge_card',
      badge: card.badge,
      title: card.title,
      primaryResult: card.title,
      description: card.description,
      redirectUrl: card.url,
      secondaryDetails: card.attributes,
    };
  }

  private formatBangAnswer(bang: BangResult): InstantAnswerPayload {
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
    };
  }

  private formatMathAnswer(math: MathEvaluationResult): InstantAnswerPayload {
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
    };
  }

  private formatConversionAnswer(conv: ConversionResult): InstantAnswerPayload {
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
      };
    }

    return {
      type: 'conversion',
      badge: '[instant-answer]',
      title: 'Instant Answer',
      primaryResult: '',
    };
  }
}

/**
 * Factory for InstantAnswerEngine
 */
export function createInstantAnswerEngine(): InstantAnswerEngine {
  return new InstantAnswerEngine();
}
