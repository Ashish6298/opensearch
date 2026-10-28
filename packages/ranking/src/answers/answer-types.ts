/**
 * @opensearch/ranking — Instant Answer Framework Types & Contracts (Phase 103)
 *
 * Defines the modular interface for instant-answer providers:
 * - Declarative query types, source, freshness, attribution, privacy behavior, and timeouts
 * - Provenance tracking for every generated instant answer
 * - Strict local-only and privacy-mode contracts
 * - Failure handling semantics preventing fabricated answers
 */

export interface InstantAnswerAttribution {
  name: string;
  url?: string;
  license?: string;
  statement?: string;
}

export interface InstantAnswerPrivacyBehavior {
  /** Whether the provider can run in strict Local-only mode */
  allowsLocalOnly: boolean;
  /** Whether the provider makes outbound network requests */
  requiresNetwork: boolean;
  /** Whether the search query text is transmitted over the network */
  sendsQueryText: boolean;
  /** Whether client IP address is forwarded */
  sendsIpAddress: boolean;
  /** Explanatory transparency note */
  privacyNotice?: string;
}

export interface InstantAnswerProvenance {
  /** Documented name of the data source */
  source: string;
  /** Generation or reference publication timestamp in ISO-8601 format */
  timestamp: string;
  /** Source attribution and licensing information */
  attribution: InstantAnswerAttribution;
  /** Freshness guarantee */
  freshness: 'realtime' | 'daily' | 'static' | 'hourly';
  /** Whether the answer utilized external network communication */
  isRemote: boolean;
  /** Active privacy mode during answer execution */
  privacyMode: 'local-only' | 'standard';
  /** Verification status confirming non-fabrication */
  verified: boolean;
}

export interface InstantAnswerContext {
  /** Whether Local-only mode is active (blocks all remote modules) */
  isLocalOnly?: boolean;
  /** Active search privacy mode */
  privacyMode?: 'local-only' | 'standard';
  /** Execution timeout deadline in milliseconds */
  timeoutMs?: number;
  /** Anonymized client IP if available */
  clientIp?: string;
}

export type InstantAnswerType =
  | 'calculation'
  | 'conversion'
  | 'weather'
  | 'currency'
  | 'definition'
  | 'places'
  | 'color'
  | 'epoch'
  | 'bang'
  | 'knowledge_card'
  | 'timezone'
  | 'cheatsheet'
  | 'crypto'
  | 'network'
  | 'privacy'
  | 'math_solver';

export interface InstantAnswerPayload {
  /** Answer category identifier */
  type: InstantAnswerType;
  /** Display badge tag e.g. '[instant-answer]' or '[weather]' */
  badge: string;
  /** Section title */
  title: string;
  /** Query expression */
  expression?: string;
  /** Primary prominent result text */
  primaryResult: string;
  /** Description (for definitions, places, knowledge cards) */
  description?: string;
  /** Code snippet or command (for cheatsheets or crypto copy) */
  codeSnippet?: string;
  /** Additional structured fields for detail tables */
  secondaryDetails?: Record<string, string | number>;
  /** Optional target redirect URL (for bang shortcuts or knowledge references) */
  redirectUrl?: string;
  /** Optional CSS color value for visual swatch preview */
  previewCss?: string;
  /** Mandatory provenance information (Phase 103 acceptance criteria) */
  provenance: InstantAnswerProvenance;
}

export interface InstantAnswerProviderMetadata {
  /** Unique provider identifier */
  id: string;
  /** Human-readable display name */
  name: string;
  /** Supported query categories */
  supportedQueryTypes: readonly InstantAnswerType[];
  /** Data source documentation */
  source: string;
  /** Data freshness policy */
  freshness: 'realtime' | 'daily' | 'static' | 'hourly';
  /** Provenance attribution */
  attribution: InstantAnswerAttribution;
  /** Privacy behavior specification */
  privacyBehavior: InstantAnswerPrivacyBehavior;
  /** Execution timeout in milliseconds */
  timeoutMs: number;
  /** Failure policy: never fabricate; fall back cleanly to ordinary search */
  failureHandling: 'fallback-to-search' | 'silent';
  /** Whether this provider requires remote network calls */
  isRemote: boolean;
}

/**
 * Modular interface that every instant-answer provider module must implement.
 */
export interface InstantAnswerProvider extends InstantAnswerProviderMetadata {
  /**
   * Fast synchronous heuristic checking whether this provider can handle the query.
   */
  canHandle(query: string, context?: InstantAnswerContext): boolean;

  /**
   * Evaluates the query to generate an instant answer.
   * Guarantee: Returns null if unsupported or if an error occurs. Never fabricates.
   */
  evaluate(
    query: string,
    context?: InstantAnswerContext,
  ): Promise<InstantAnswerPayload | null> | InstantAnswerPayload | null;
}
