/**
 * @opensearch/ranking — Instant Answers Module Root (Phase 38 & Phase 103)
 */

export type {
  InstantAnswerAttribution,
  InstantAnswerPrivacyBehavior,
  InstantAnswerProvenance,
  InstantAnswerContext,
  InstantAnswerType,
  InstantAnswerPayload,
  InstantAnswerProviderMetadata,
  InstantAnswerProvider,
} from './answer-types.js';

export type { InstantAnswerRegistryOptions } from './answer-registry.js';
export {
  InstantAnswerRegistry,
  getDefaultInstantAnswerRegistry,
} from './answer-registry.js';

export {
  InstantAnswerEngine,
  createInstantAnswerEngine,
} from './instant-answer-engine.js';

// Providers
export { UnitConversionProvider } from './providers/unit-conversion-provider.js';
export { MathCalculationProvider } from './providers/math-calculation-provider.js';
export { CurrencyInstantAnswerProvider } from './providers/currency-provider.js';
export {
  OpenMeteoWeatherProvider,
  type WeatherProviderOptions,
} from './providers/weather-provider.js';
export { DefinitionInstantAnswerProvider } from './providers/definition-provider.js';
export { PlacesInstantAnswerProvider } from './providers/places-provider.js';

// Subordinate engines
export type { BangResult } from './bang-registry.js';
export { evaluateBang } from './bang-registry.js';
export type { MathEvaluationResult } from './math-evaluator.js';
export { MathEvaluator } from './math-evaluator.js';
export type { ConversionResult } from './conversion-evaluator.js';
export { ConversionEvaluator } from './conversion-evaluator.js';
export type { KnowledgeCardResult } from './knowledge-engine.js';
export { KnowledgeEngine } from './knowledge-engine.js';
export type { TimezoneConversionResult } from './timezone-evaluator.js';
export { TimezoneEvaluator } from './timezone-evaluator.js';
export type { CheatSheetResult } from './cheatsheet-engine.js';
export { CheatSheetEngine } from './cheatsheet-engine.js';
export type { CryptoEngineResult } from './crypto-engine.js';
export { CryptoEngine } from './crypto-engine.js';
export type { NetworkEngineResult } from './network-engine.js';
export { NetworkEngine } from './network-engine.js';
export type { PrivacyAuditResult } from './privacy-audit-engine.js';
export { PrivacyAuditEngine } from './privacy-audit-engine.js';
export type { CurrencyConversionResult } from './currency-converter.js';
export { CurrencyConverterEngine } from './currency-converter.js';
export type { MathSolverResult } from './math-engine.js';
export { SymbolicMathEngine } from './math-engine.js';
