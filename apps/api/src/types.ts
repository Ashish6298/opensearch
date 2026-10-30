/**
 * @opensearch/api — HTTP Server & Routing Types (Phase 16, 17 & 18)
 *
 * Defines contracts, request/response models, routing signatures,
 * validation schemas, search endpoints, and context for the HTTP Search API service.
 */

import { IncomingMessage, ServerResponse } from 'node:http';
import { InvertedIndex, PrefixTrie, SuggestionMatch } from '@opensearch/indexer';
import {
  CandidateRetriever,
  QueryParser,
  RankingEngine,
  ResultGenerator,
  SearchResultItem,
  PaginationMeta,
  LruQueryCache,
  TypoToleranceEngine,
  DidYouMeanResult,
  QueryFilter,
  InstantAnswerEngine,
  InstantAnswerPayload,
  QuickAnswerEngine,
  QuickAnswerPayload,
  FeedbackService,
  FeedbackReviewQueue,
  BangResult,
  ProviderRegistry,
} from '@opensearch/ranking';
import { AppConfig, Logger, SystemStatus, PrivacyReceipt, MetricsRegistry } from '@opensearch/shared';
import { MemoryRateLimiter } from './rate-limiter.js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'OPTIONS' | 'HEAD' | string;

export interface ApiRequest {
  /** Underlying Node.js HTTP request */
  raw: IncomingMessage;
  /** HTTP Method in uppercase (GET, POST, etc.) */
  method: string;
  /** Full URL path (excluding query string) */
  pathname: string;
  /** Query parameter key-value pairs */
  query: Record<string, string | string[] | undefined>;
  /** Parsed route parameters (e.g. /items/:id) */
  params: Record<string, string>;
  /** Request headers normalized to lowercase keys */
  headers: Record<string, string | string[] | undefined>;
  /** Parsed JSON or raw text body */
  body: unknown;
  /** Client IP address */
  ip: string;
  /** Matched route pattern for low-cardinality metrics (e.g. /items/:id) */
  routePattern?: string;
}

export interface ApiResponse {
  /** Underlying Node.js HTTP response */
  raw: ServerResponse;
  /** Sets response HTTP status code */
  status(code: number): this;
  /** Sets a response header */
  setHeader(name: string, value: string | number | readonly string[]): this;
  /** Sends a JSON response with Content-Type: application/json */
  json(data: unknown): void;
  /** Sends a plain text response */
  text(data: string, contentType?: string): void;
  /** Sends an empty response with status code */
  sendEmpty(code?: number): void;
}

export type RouteHandler = (
  req: ApiRequest,
  res: ApiResponse,
  context: ApiAppContext,
) => Promise<void> | void;

export type MiddlewareHandler = (
  req: ApiRequest,
  res: ApiResponse,
  next: () => Promise<void> | void,
  context: ApiAppContext,
) => Promise<void> | void;

export interface RouteDefinition {
  method: HttpMethod;
  pattern: string | RegExp;
  paramNames?: string[];
  handler: RouteHandler;
  pathPattern?: string;
}

export interface SearchServices {
  index: InvertedIndex;
  prefixTrie?: PrefixTrie;
  typoEngine?: TypoToleranceEngine;
  instantAnswerEngine?: InstantAnswerEngine;
  quickAnswerEngine?: QuickAnswerEngine;
  queryParser: QueryParser;
  candidateRetriever: CandidateRetriever;
  rankingEngine: RankingEngine;
  resultGenerator: ResultGenerator;
  queryCache?: LruQueryCache<SearchApiResponse>;
  providerRegistry?: ProviderRegistry;
  feedbackService?: FeedbackService;
  feedbackReviewQueue?: FeedbackReviewQueue;
}

export interface McpServerLike {
  isEnabled(): boolean;
  handleMessage(rawMessage: unknown): Promise<unknown>;
}

export type TrustProxyConfig = boolean | string[] | ((ip: string) => boolean);
export type DeploymentModel = 'standalone' | 'cluster' | 'serverless';
export type ServerLifecycleState = 'initializing' | 'ready' | 'shutting_down' | 'stopped';

export interface ReadinessResponse {
  status: 'ready' | 'not_ready' | 'shutting_down';
  ready: boolean;
  timestamp: string;
  uptimeSeconds: number;
  deploymentModel: DeploymentModel;
  index: {
    status: 'ok' | 'degraded' | 'error';
    documentsIndexed: number;
    termsIndexed: number;
  };
  providers: {
    availableCount: number;
    totalRegistered: number;
  };
  reason?: string;
}

export interface ApiAppContext {
  config: AppConfig;
  logger: Logger;
  startTime: number;
  services?: SearchServices;
  rateLimiter?: MemoryRateLimiter;
  queryCache?: LruQueryCache<SearchApiResponse>;
  providerRegistry?: ProviderRegistry;
  feedbackService?: FeedbackService;
  feedbackReviewQueue?: FeedbackReviewQueue;
  mcpServer?: McpServerLike;
  enableMcp?: boolean;
  trustProxy?: TrustProxyConfig;
  deploymentModel?: DeploymentModel;
  isShuttingDown?: boolean;
  lifecycleState?: ServerLifecycleState;
  metrics?: MetricsRegistry;
  isDemoMode?: boolean;
}

export interface ComponentHealth {
  status: 'ok' | 'degraded' | 'error';
  details?: Record<string, unknown>;
}

export interface HealthCheckResponse extends SystemStatus {
  status: 'ok' | 'degraded' | 'error';
  uptimeSeconds: number;
  memoryUsageMb: number;
  environment: string;
  routesAvailable: string[];
  totalDocumentsIndexed?: number;
  components?: {
    index: ComponentHealth;
    rateLimiter: ComponentHealth;
    memory: ComponentHealth;
    queryCache?: ComponentHealth;
    providers?: ComponentHealth;
    storage?: ComponentHealth;
  };
}

export interface SuggestApiResponse {
  query: string;
  suggestions: SuggestionMatch[];
  meta: {
    count: number;
    durationMs: number;
    timestamp: string;
  };
}

export interface SearchApiResponse {
  query: {
    raw: string;
    normalized: string;
    terms: string[];
    phrases: string[];
    negatedTerms: string[];
    filters?: QueryFilter;
  };
  instantAnswer?: InstantAnswerPayload | null;
  quickAnswer?: QuickAnswerPayload | null;
  bang?: BangResult | null;
  didYouMean?: DidYouMeanResult | null;
  results: Array<SearchResultItem & { explanation?: unknown }>;
  pagination: PaginationMeta;
  privacyReceipt?: PrivacyReceipt;
  meta: {
    totalHits: number;
    candidateCount: number;
    durationMs: number;
    timestamp: string;
    explainPlan?: boolean;
    category?: string;
    categoryAvailable?: boolean;
    localOnly?: boolean;
    limitedResultsNotice?: string;
    privacyReceipt?: PrivacyReceipt;
    safeSearch?: {
      level: string;
      filteredCount: number;
      explanation: string;
      whatItCovers?: string;
      whatItDoesNotCover?: string;
    };
    [key: string]: unknown;
  };
}

export interface ApiServerOptions {
  config?: AppConfig;
  logger?: Logger;
  port?: number;
  host?: string;
  corsOrigin?: string;
  services?: SearchServices;
  index?: InvertedIndex;
  providerRegistry?: ProviderRegistry;
  feedbackService?: FeedbackService;
  rateLimitPerMinute?: number;
  searchTimeoutMs?: number;
  /** Whether the Model Context Protocol (MCP) server endpoints are enabled. Default: true */
  enableMcp?: boolean;
  /** Whether to enforce Local-only mode server-side. Default: false */
  isLocalOnly?: boolean;
  /** Reverse proxy trust configuration (false = ignore X-Forwarded-For, true = trust, or list of trusted IPs). Default: false */
  trustProxy?: TrustProxyConfig;
  /** Hosting deployment model. Default: 'standalone' */
  deploymentModel?: DeploymentModel;
  /** Storage backend for rate limiter (in-memory or file-backed) */
  rateLimitStore?: import('./rate-limiter.js').RateLimitStore;
  /** Custom route rate limit rules */
  routeRateLimits?: import('./rate-limiter.js').RouteRateLimitRule[];
  /** Metrics registry instance (Phase 113) */
  metrics?: MetricsRegistry;
  isDemoMode?: boolean;
  /** Whether Prometheus metrics are enabled (default: true) */
  enableMetrics?: boolean;
}

export type ApiApplicationContext = ApiAppContext;
