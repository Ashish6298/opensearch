/**
 * @opensearch/api — HTTP Server Application (Phase 16, 17 & 18)
 *
 * Coordinates server lifecycle, router configuration, middleware pipelines,
 * rate limiting, timeout enforcement, search subsystem wiring, and graceful startup/shutdown.
 */

import { createServer, Server } from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { createInvertedIndex, InvertedIndex } from '@opensearch/indexer';
import { createStorageAdapter } from '@opensearch/storage';
import {
  createCandidateRetriever,
  createQueryParser,
  createRankingEngine,
  createResultGenerator,
  createQueryCache,
  LruQueryCache,
} from '@opensearch/ranking';
import { AppConfig, createLogger, loadConfig, Logger } from '@opensearch/shared';
import {
  createCorsMiddleware,
  createLoggingMiddleware,
  createRateLimitMiddleware,
  createSecurityHeadersMiddleware,
  createTimeoutMiddleware,
} from './middlewares.js';
import { createRateLimiter, MemoryRateLimiter } from './rate-limiter.js';
import { Router } from './router.js';
import { handleApiRoot, handleHealthCheck, handleSearch, handleSystemStatus } from './routes.js';
import { ApiAppContext, ApiServerOptions, SearchApiResponse, SearchServices } from './types.js';

export class ApiServer {
  private readonly config: AppConfig;
  private readonly logger: Logger;
  private readonly router: Router;
  private readonly startTime: number;
  private readonly services: SearchServices;
  private readonly rateLimiter: MemoryRateLimiter;
  private readonly queryCache: LruQueryCache<SearchApiResponse>;
  private readonly customIndexProvided: boolean;
  private server: Server | null = null;

  constructor(options: ApiServerOptions = {}) {
    this.config = options.config ?? loadConfig();
    this.logger =
      options.logger ??
      createLogger('@opensearch/api', {
        level: this.config.logging.level,
        format: this.config.logging.format,
      });
    this.router = new Router();
    this.startTime = Date.now();

    // Wire or initialize rate limiter
    const rateLimit = options.rateLimitPerMinute ?? this.config.api.rateLimitPerMinute ?? 60;
    this.rateLimiter = createRateLimiter({
      maxRequests: rateLimit,
      windowMs: 60_000,
    });

    // Wire or initialize query cache (Phase 28 performance optimization)
    this.queryCache = createQueryCache<SearchApiResponse>({
      maxCapacity: 250,
      ttlMs: 60_000,
    });

    // Wire or initialize search subsystem services
    this.services = options.services ?? this.initializeSearchServices(options.index);
    this.customIndexProvided = Boolean(options.services || options.index);

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

  getContext(): ApiAppContext {
    return {
      config: this.config,
      logger: this.logger,
      startTime: this.startTime,
      services: this.services,
      rateLimiter: this.rateLimiter,
      queryCache: this.queryCache,
    };
  }

  private initializeSearchServices(customIndex?: InvertedIndex): SearchServices {
    const index = customIndex ?? createInvertedIndex({ indexDir: this.config.storage.indexDir });

    const queryParser = createQueryParser({
      maxQueryLength: this.config.search.maxQueryLength,
    });
    const candidateRetriever = createCandidateRetriever(index, {
      defaultMaxCandidates: this.config.search.maxCandidates,
    });
    const rankingEngine = createRankingEngine(index);
    const resultGenerator = createResultGenerator({
      pagination: {
        pageSize: this.config.search.defaultPageSize,
      },
    });

    return {
      index,
      queryParser,
      candidateRetriever,
      rankingEngine,
      resultGenerator,
      queryCache: this.queryCache,
    };
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
        this.logger.info('Active search index loaded from storage', {
          buildId: activeMeta.buildId,
          totalDocuments: activeMeta.documentCount,
          totalTerms: activeMeta.termCount,
          indexPath: resolvedIndexPath,
        });
      }
      await storage.close();
    } catch (e) {
      this.logger.warn('Could not load active index metadata on boot', { error: (e as Error).message });
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
    this.router.get('/health', handleHealthCheck);
    this.router.get('/api/v1/status', handleSystemStatus);
    this.router.get('/api/v1/search', handleSearch);
    this.router.post('/api/v1/search', handleSearch);
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

    const context = this.getContext();

    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        this.router.handleRequest(req, res, context);
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
  }

  /**
   * Gracefully stops the HTTP server and cleans up resources.
   */
  async stop(): Promise<void> {
    this.rateLimiter.destroy();

    if (!this.server) {
      return;
    }

    return new Promise((resolve, reject) => {
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
}

/**
 * Factory creating an ApiServer instance.
 */
export function createApiServer(options?: ApiServerOptions): ApiServer {
  return new ApiServer(options);
}
