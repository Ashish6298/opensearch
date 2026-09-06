/**
 * @opensearch/api — HTTP Server & Routing Types (Phase 16 & 17)
 *
 * Defines contracts, request/response models, routing signatures,
 * validation schemas, search endpoints, and context for the HTTP Search API service.
 */

import { IncomingMessage, ServerResponse } from 'node:http';
import { InvertedIndex } from '@opensearch/indexer';
import {
  CandidateRetriever,
  QueryParser,
  RankingEngine,
  ResultGenerator,
  SearchResultItem,
  PaginationMeta,
} from '@opensearch/ranking';
import { AppConfig, Logger, SystemStatus } from '@opensearch/shared';

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
}

export interface SearchServices {
  index: InvertedIndex;
  queryParser: QueryParser;
  candidateRetriever: CandidateRetriever;
  rankingEngine: RankingEngine;
  resultGenerator: ResultGenerator;
}

export interface ApiAppContext {
  config: AppConfig;
  logger: Logger;
  startTime: number;
  services?: SearchServices;
}

export interface HealthCheckResponse extends SystemStatus {
  uptimeSeconds: number;
  memoryUsageMb: number;
  environment: string;
  routesAvailable: string[];
  totalDocumentsIndexed?: number;
}

export interface SearchApiResponse {
  query: {
    raw: string;
    normalized: string;
    terms: string[];
    phrases: string[];
    negatedTerms: string[];
  };
  results: SearchResultItem[];
  pagination: PaginationMeta;
  meta: {
    totalHits: number;
    candidateCount: number;
    durationMs: number;
    timestamp: string;
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
}

export type ApiApplicationContext = ApiAppContext;
