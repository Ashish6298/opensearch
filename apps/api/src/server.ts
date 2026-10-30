/**
 * @opensearch/api — HTTP Server Application (Phase 16, 17 & 18)
 *
 * Coordinates server lifecycle, router configuration, middleware pipelines,
 * rate limiting, timeout enforcement, search subsystem wiring, and graceful startup/shutdown.
 */

import { createServer, Server } from 'node:http';
import { Socket } from 'node:net';
import path from 'node:path';
import fs from 'node:fs';
import {
  createInvertedIndex,
  createPrefixTrie,
  InvertedIndex,
  PrefixTrie,
} from '@opensearch/indexer';
import { createStorageAdapter, auditStoragePersistence } from '@opensearch/storage';
import {
  createCandidateRetriever,
  createQueryParser,
  createRankingEngine,
  createResultGenerator,
  createQueryCache,
  LruQueryCache,
  createTypoToleranceEngine,
  createInstantAnswerEngine,
  createQuickAnswerEngine,
  createFeedbackService,
  createFeedbackReviewQueue,
} from '@opensearch/ranking';
import { AppConfig, createLogger, loadConfig, Logger, getDefaultRegistry, MetricsRegistry } from '@opensearch/shared';
import {
  createCorsMiddleware,
  createLoggingMiddleware,
  createRateLimitMiddleware,
  createSecurityHeadersMiddleware,
  createTimeoutMiddleware,
} from './middlewares.js';
import { createRateLimiter, MemoryRateLimiter } from './rate-limiter.js';
import { Router } from './router.js';
import {
  handleApiDocs,
  handleApiRoot,
  handleHealthCheck,
  handleReadinessCheck,
  handleMetrics,
  handleOpenApiSpec,
  handleSearch,
  handleSearchStream,
  handleSuggest,
  handleSystemStatus,
  handleListLenses,
  handleGetLens,
  handleValidateLens,
  handlePreviewLens,
  handlePostFeedback,
  handleGetFeedback,
  handleDeleteFeedback,
  handleGetFeedbackPrivacy,
  handleImportFeedbackReview,
  handleListFeedbackReview,
  handleGetFeedbackReviewStats,
  handleUpdateFeedbackReviewItem,
  handleApproveEvaluationCase,
  handleRankingSafetyCheck,
  handleOpenSearchDescriptor,
  handleMcpPost,
  handleMcpSse,
} from './routes.js';
import {
  ApiAppContext,
  ApiServerOptions,
  DeploymentModel,
  SearchApiResponse,
  SearchServices,
  ServerLifecycleState,
  TrustProxyConfig,
} from './types.js';
import { OpenSearchMcpServer } from './mcp/index.js';

export class ApiServer {
  private readonly config: AppConfig;
  private readonly logger: Logger;
  private readonly router: Router;
  private readonly startTime: number;
  private readonly services: SearchServices;
  private readonly rateLimiter: MemoryRateLimiter;
  private readonly queryCache: LruQueryCache<SearchApiResponse>;
  private readonly customIndexProvided: boolean;
  private readonly mcpServer: OpenSearchMcpServer;
  private readonly enableMcp: boolean;
  private readonly trustProxy: TrustProxyConfig;
  private readonly deploymentModel: DeploymentModel;
  private readonly metrics: MetricsRegistry;
  private server: Server | null = null;
  private state: ServerLifecycleState = 'initializing';
  private activeRequestsCount = 0;
  private readonly sockets = new Set<Socket>();
  private sigtermHandler: (() => void) | null = null;
  private sigintHandler: (() => void) | null = null;

  constructor(options: ApiServerOptions = {}) {
    this.config = options.config ?? loadConfig();
    this.logger =
      options.logger ??
      createLogger('@opensearch/api', {
        level: this.config.logging.level,
        format: this.config.logging.format,
      });

    // Resolve trust proxy setting (default false for security)
    if (options.trustProxy !== undefined) {
      this.trustProxy = options.trustProxy;
    } else {
      const envTrust = process.env.TRUST_PROXY?.trim();
      if (envTrust === 'true' || envTrust === '1') {
        this.trustProxy = true;
      } else if (envTrust && envTrust !== 'false' && envTrust !== '0') {
        this.trustProxy = envTrust.split(',').map(s => s.trim());
      } else {
        this.trustProxy = false;
      }
    }

    // Resolve hosting deployment model (default: standalone)
    this.deploymentModel =
      options.deploymentModel ??
      ((process.env.DEPLOYMENT_MODEL as DeploymentModel) || 'standalone');

    this.router = new Router({ trustProxy: this.trustProxy });
    this.startTime = Date.now();

    // Wire or initialize rate limiter with multi-store & route-specific limits support
    const rateLimit = options.rateLimitPerMinute ?? this.config.api.rateLimitPerMinute ?? 60;
    this.rateLimiter = createRateLimiter({
      maxRequests: rateLimit,
      windowMs: 60_000,
      store: options.rateLimitStore,
      routeRules: options.routeRateLimits,
    });

    // Wire or initialize query cache (Phase 28 performance optimization)
    this.queryCache = createQueryCache<SearchApiResponse>({
      maxCapacity: 250,
      ttlMs: 60_000,
    });

    // Wire or initialize search subsystem services
    this.services = options.services ?? this.initializeSearchServices(options.index);
    if (options.providerRegistry && !this.services.providerRegistry) {
      this.services.providerRegistry = options.providerRegistry;
    }
    this.customIndexProvided = Boolean(options.services || options.index);

    // Initialize Model Context Protocol (MCP) server (Phase 109)
    const envMcp = process.env.ENABLE_MCP?.trim().toLowerCase();
    this.enableMcp =
      options.enableMcp ?? (envMcp !== undefined ? envMcp === 'true' || envMcp === '1' : true);
    this.mcpServer = new OpenSearchMcpServer({
      services: this.services,
      config: this.config,
      logger: this.logger,
      isLocalOnly: options.isLocalOnly ?? false,
      enabled: this.enableMcp,
    });

    // Initialize metrics registry (Phase 113)
    this.metrics = options.metrics ?? getDefaultRegistry();

    const timeoutMs = options.searchTimeoutMs ?? this.config.search.searchTimeoutMs ?? 5_000;
    const corsOrigin = options.corsOrigin ?? this.config.api.corsOrigin ?? '*';

    this.setupMiddlewares(corsOrigin, timeoutMs);
    this.setupRoutes();
  }

  getRouter(): Router {
    return this.router;
  }

  getServices(): SearchServices {
    return this.services;
  }

  getRateLimiter(): MemoryRateLimiter {
    return this.rateLimiter;
  }

  getQueryCache(): LruQueryCache<SearchApiResponse> {
    return this.queryCache;
  }

  getMcpServer(): OpenSearchMcpServer {
    return this.mcpServer;
  }

  getMetrics(): MetricsRegistry {
    return this.metrics;
  }

  getState(): ServerLifecycleState {
    return this.state;
  }

  getActiveRequestsCount(): number {
    return this.activeRequestsCount;
  }

  getContext(): ApiAppContext {
    const self = this;
    return {
      config: this.config,
      logger: this.logger,
      startTime: this.startTime,
      services: this.services,
      providerRegistry: this.services.providerRegistry,
      rateLimiter: this.rateLimiter,
      queryCache: this.queryCache,
      feedbackService: this.services?.feedbackService,
      feedbackReviewQueue: this.services?.feedbackReviewQueue,
      mcpServer: this.mcpServer,
      enableMcp: this.enableMcp,
      trustProxy: this.trustProxy,
      deploymentModel: this.deploymentModel,
      metrics: this.metrics,
      get isShuttingDown() {
        return self.state === 'shutting_down';
      },
      get lifecycleState() {
        return self.state;
      },
    };
  }

  private initializeSearchServices(customIndex?: InvertedIndex): SearchServices {
    const index = customIndex ?? createInvertedIndex({ indexDir: this.config.storage.indexDir });
    const prefixTrie = createPrefixTrie();

    // Populate initial prefix trie with vocabulary
    this.populatePrefixTrieFromIndex(index, prefixTrie);

    const queryParser = createQueryParser({
      maxQueryLength: this.config.search.maxQueryLength,
    });
    const candidateRetriever = createCandidateRetriever(index, {
      defaultMaxCandidates: this.config.search.maxCandidates,
    });
    const rankingEngine = createRankingEngine(index);
    const typoEngine = createTypoToleranceEngine(index);
    const instantAnswerEngine = createInstantAnswerEngine();
    const quickAnswerEngine = createQuickAnswerEngine();
    const feedbackService = createFeedbackService();
    const feedbackReviewQueue = createFeedbackReviewQueue();
    const resultGenerator = createResultGenerator({
      pagination: {
        pageSize: this.config.search.defaultPageSize,
      },
    });

    return {
      index,
      prefixTrie,
      typoEngine,
      instantAnswerEngine,
      quickAnswerEngine,
      queryParser,
      candidateRetriever,
      rankingEngine,
      resultGenerator,
      queryCache: this.queryCache,
      feedbackService,
      feedbackReviewQueue,
    };
  }

  private populatePrefixTrieFromIndex(index: InvertedIndex, trie: PrefixTrie): void {
    const terms = index.getTerms();
    for (const term of terms) {
      const df = index.getDocumentFrequency(term);
      trie.insert(term, Math.max(10, df * 5), 'term');
    }
  }

  /**
   * Loads the active search index from disk storage if one is present.
   */
  async loadActiveIndex(): Promise<void> {
    if (this.customIndexProvided || this.services.index.getStats().totalDocuments > 0) {
      return;
    }
    try {
      // Resolve potential storage directories (from current working directory or workspace root)
      const candidateStorageDirs = [
        this.config.storage.storageDir,
        path.resolve(process.cwd(), this.config.storage.storageDir),
        path.resolve(process.cwd(), '..', this.config.storage.storageDir),
        path.resolve(process.cwd(), '..', '..', this.config.storage.storageDir),
        './data/storage',
        '../../data/storage',
      ];

      let storageDirToUse = this.config.storage.storageDir;
      for (const cand of candidateStorageDirs) {
        if (fs.existsSync(path.join(cand, 'index-metadata.json'))) {
          storageDirToUse = cand;
          break;
        }
      }

      const storage = createStorageAdapter({
        config: {
          ...this.config,
          storage: {
            ...this.config.storage,
            storageDir: storageDirToUse,
          },
        },
      });

      await storage.initialize();
      const activeMeta = await storage.indexMetadata.findActive();
      if (activeMeta && activeMeta.indexPath) {
        const candidateIndexPaths = [
          activeMeta.indexPath,
          path.resolve(process.cwd(), activeMeta.indexPath),
          path.resolve(path.dirname(storageDirToUse), '..', activeMeta.indexPath),
          path.resolve(storageDirToUse, '..', 'index', 'builds', activeMeta.buildId),
        ];

        let resolvedIndexPath = activeMeta.indexPath;
        for (const cand of candidateIndexPaths) {
          if (fs.existsSync(path.join(cand, 'index-data.json')) || fs.existsSync(cand)) {
            resolvedIndexPath = cand;
            break;
          }
        }

        await this.services.index.load(resolvedIndexPath);
        if (this.services.prefixTrie) {
          this.populatePrefixTrieFromIndex(this.services.index, this.services.prefixTrie);
        }
        this.logger.info('Active search index loaded from storage', {
          buildId: activeMeta.buildId,
          totalDocuments: activeMeta.documentCount,
          totalTerms: activeMeta.termCount,
          indexPath: resolvedIndexPath,
        });
      }
      await storage.close();
    } catch (e) {
      this.logger.warn('Could not load active index metadata on boot', {
        error: (e as Error).message,
      });
    }
  }

  private setupMiddlewares(corsOrigin: string, timeoutMs: number): void {
    // 1. CORS Preflight & headers
    this.router.use(createCorsMiddleware(corsOrigin));
    // 2. Defensive Security headers (CSP, X-Content-Type-Options, etc.)
    this.router.use(createSecurityHeadersMiddleware());
    // 3. Privacy-conscious structured access logging
    this.router.use(createLoggingMiddleware());
    // 4. In-memory Rate Limiting
    this.router.use(createRateLimitMiddleware(this.rateLimiter));
    // 5. Timeout protection
    this.router.use(createTimeoutMiddleware(timeoutMs));
  }

  private setupRoutes(): void {
    this.router.get('/', handleApiRoot);
    this.router.get('/docs', handleApiDocs);
    this.router.get('/health', handleHealthCheck);
    this.router.get('/healthz', handleHealthCheck);
    this.router.get('/ready', handleReadinessCheck);
    this.router.get('/readyz', handleReadinessCheck);
    this.router.get('/api/v1/status', handleSystemStatus);
    this.router.get('/api/v1/search', handleSearch);
    this.router.post('/api/v1/search', handleSearch);
    this.router.get('/api/v1/search/stream', handleSearchStream);
    this.router.get('/api/v1/suggest', handleSuggest);
    this.router.get('/api/v1/lenses', handleListLenses);
    this.router.get('/api/v1/lenses/:id', handleGetLens);
    this.router.post('/api/v1/lenses/validate', handleValidateLens);
    this.router.post('/api/v1/lenses/preview', handlePreviewLens);
    this.router.get('/api/v1/feedback', handleGetFeedback);
    this.router.post('/api/v1/feedback', handlePostFeedback);
    this.router.delete('/api/v1/feedback', handleDeleteFeedback);
    this.router.get('/api/v1/feedback/privacy', handleGetFeedbackPrivacy);
    this.router.post('/api/v1/feedback/review/import', handleImportFeedbackReview);
    this.router.get('/api/v1/feedback/review', handleListFeedbackReview);
    this.router.get('/api/v1/feedback/review/stats', handleGetFeedbackReviewStats);
    this.router.patch('/api/v1/feedback/review/:id', handleUpdateFeedbackReviewItem);
    this.router.post('/api/v1/feedback/review/:id/approve-case', handleApproveEvaluationCase);
    this.router.post('/api/v1/feedback/review/ranking-check', handleRankingSafetyCheck);
    this.router.get('/opensearch.xml', handleOpenSearchDescriptor);
    this.router.get('/opensearchdescription.xml', handleOpenSearchDescriptor);
    this.router.get('/metrics', handleMetrics);
    this.router.post('/api/v1/mcp', handleMcpPost);
    this.router.get('/api/v1/mcp/sse', handleMcpSse);
    this.router.get('/api/v1/openapi.json', handleOpenApiSpec);
    this.router.get('/openapi.json', handleOpenApiSpec);
  }

  /**
   * Starts the HTTP server on the configured or specified host/port.
   */
  async start(
    portOverride?: number,
    hostOverride?: string,
  ): Promise<{ port: number; host: string }> {
    const port = portOverride ?? this.config.api.server.port;
    const host = hostOverride ?? this.config.api.server.host;

    // Pre-flight startup validation
    this.validateStartupConfig(port, host);

    // Ensure active search index is loaded before accepting traffic
    await this.loadActiveIndex();

    this.state = 'ready';
    this.activeRequestsCount = 0;
    const context = this.getContext();

    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        // Stop accepting new work during shutdown (allow health & readiness probes)
        if (this.state === 'shutting_down') {
          const pathname = (req.url || '').split('?')[0];
          if (
            pathname === '/health' ||
            pathname === '/healthz' ||
            pathname === '/ready' ||
            pathname === '/readyz'
          ) {
            this.router.handleRequest(req, res, context);
            return;
          }

          res.setHeader('Connection', 'close');
          res.setHeader('Retry-After', '5');
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: {
                message: 'Server is shutting down and cannot accept new requests.',
                code: 'SERVER_SHUTTING_DOWN',
                category: 'INTERNAL',
                statusCode: 503,
                timestamp: new Date().toISOString(),
              },
            }),
          );
          return;
        }

        this.activeRequestsCount++;
        let decremented = false;
        const decrement = () => {
          if (!decremented) {
            decremented = true;
            this.activeRequestsCount = Math.max(0, this.activeRequestsCount - 1);
          }
        };
        res.on('finish', decrement);
        res.on('close', decrement);

        this.router.handleRequest(req, res, context);
      });

      this.server.on('connection', socket => {
        this.sockets.add(socket);
        socket.on('close', () => {
          this.sockets.delete(socket);
        });
      });

      this.server.on('error', err => {
        this.logger.error('Failed to start HTTP API server', { error: err.message });
        reject(err);
      });

      this.server.listen(port, host, () => {
        const address = this.server?.address();
        const actualPort = typeof address === 'object' && address ? address.port : port;
        this.logger.info('HTTP API server listening', {
          host,
          port: actualPort,
          env: this.config.env,
        });
        resolve({ port: actualPort, host });
      });
    });
  }

  private validateStartupConfig(port: number, host: string): void {
    if (port < 0 || port > 65535 || isNaN(port)) {
      throw new Error(`Invalid server port configured: ${port}`);
    }
    if (!host || typeof host !== 'string') {
      throw new Error(`Invalid server host configured: "${host}"`);
    }
    if (!this.config.storage.indexDir) {
      this.logger.warn('Index directory not specified in configuration; using defaults');
    }

    const persistenceAudit = auditStoragePersistence(
      this.config.storage.storageDir,
      this.deploymentModel,
      this.config.isProduction,
    );
    if (persistenceAudit.warnings.length > 0) {
      for (const w of persistenceAudit.warnings) {
        this.logger.warn(`Storage persistence: ${w}`, {
          storageDir: this.config.storage.storageDir,
          deploymentModel: this.deploymentModel,
        });
      }
    }
  }

  /**
   * Transitions server into draining mode. While draining:
   * - New requests to operational routes receive HTTP 503 (SERVER_SHUTTING_DOWN).
   * - /ready reports 503 (shutting_down) so load balancers stop sending traffic.
   * - /health remains 200 (alive).
   * - In-flight requests are allowed to finish up to gracePeriodMs.
   */
  async drain(gracePeriodMs = 1000): Promise<void> {
    if (this.state === 'shutting_down' || this.state === 'stopped') {
      return;
    }
    this.state = 'shutting_down';
    this.logger.info('Initiating graceful draining...', {
      activeRequests: this.activeRequestsCount,
      gracePeriodMs,
    });

    const startWait = Date.now();
    while (this.activeRequestsCount > 0 && Date.now() - startWait < gracePeriodMs) {
      await new Promise(r => setTimeout(r, 20));
    }
  }

  /**
   * Gracefully stops the HTTP server, draining in-flight requests and flushing state.
   */
  async stop(gracePeriodMs = 1000): Promise<void> {
    if (this.state === 'stopped') {
      return;
    }

    if (this.state !== 'shutting_down') {
      await this.drain(gracePeriodMs);
    }

    if (this.activeRequestsCount > 0) {
      this.logger.warn('Grace period expired with active requests remaining; forcing termination', {
        remainingActiveRequests: this.activeRequestsCount,
      });
    }

    // Destroy remaining open sockets
    for (const socket of this.sockets) {
      try {
        socket.destroy();
      } catch {
        // Best effort
      }
    }
    this.sockets.clear();

    // Flush rate limiter and query cache state
    this.rateLimiter.destroy();
    this.queryCache.clear();

    // Close the HTTP server
    if (this.server) {
      await new Promise<void>((resolve, reject) => {
        this.server?.close(err => {
          if (err) {
            this.logger.error('Error closing HTTP server', { error: err.message });
            reject(err);
          } else {
            this.logger.info('HTTP API server stopped successfully');
            this.server = null;
            resolve();
          }
        });
      });
    }

    this.state = 'stopped';
    this.disableGracefulShutdown();
  }

  /**
   * Binds graceful shutdown signal handlers (SIGTERM and SIGINT).
   */
  enableGracefulShutdown(options?: { timeoutMs?: number; exitOnComplete?: boolean }): void {
    if (this.sigtermHandler || this.sigintHandler) {
      return;
    }
    const timeoutMs = options?.timeoutMs ?? 5000;
    const exitOnComplete = options?.exitOnComplete ?? false;

    const handler = async (signal: string) => {
      this.logger.info(`Received ${signal}, initiating graceful shutdown...`, { signal });
      try {
        await this.stop(timeoutMs);
        if (exitOnComplete) {
          process.exit(0);
        }
      } catch (e) {
        this.logger.error('Error during graceful shutdown', { error: (e as Error).message });
        if (exitOnComplete) {
          process.exit(1);
        }
      }
    };

    this.sigtermHandler = () => void handler('SIGTERM');
    this.sigintHandler = () => void handler('SIGINT');

    process.on('SIGTERM', this.sigtermHandler);
    process.on('SIGINT', this.sigintHandler);
  }

  /**
   * Removes graceful shutdown signal handlers.
   */
  disableGracefulShutdown(): void {
    if (this.sigtermHandler) {
      process.removeListener('SIGTERM', this.sigtermHandler);
      this.sigtermHandler = null;
    }
    if (this.sigintHandler) {
      process.removeListener('SIGINT', this.sigintHandler);
      this.sigintHandler = null;
    }
  }
}

/**
 * Factory creating an ApiServer instance.
 */
export function createApiServer(options?: ApiServerOptions): ApiServer {
  return new ApiServer(options);
}
