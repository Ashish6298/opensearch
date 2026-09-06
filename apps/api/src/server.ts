/**
 * @opensearch/api — HTTP Server Application (Phase 16 & 17)
 *
 * Coordinates server lifecycle, router configuration, middleware pipelines,
 * search engine service wiring, and graceful startup/shutdown.
 */

import { createServer, Server } from 'node:http';
import { createInvertedIndex, InvertedIndex } from '@opensearch/indexer';
import {
  createCandidateRetriever,
  createQueryParser,
  createRankingEngine,
  createResultGenerator,
} from '@opensearch/ranking';
import { AppConfig, createLogger, loadConfig, Logger } from '@opensearch/shared';
import {
  createCorsMiddleware,
  createLoggingMiddleware,
  createSecurityHeadersMiddleware,
} from './middlewares.js';
import { Router } from './router.js';
import { handleApiRoot, handleHealthCheck, handleSearch, handleSystemStatus } from './routes.js';
import { ApiAppContext, ApiServerOptions, SearchServices } from './types.js';

export class ApiServer {
  private readonly config: AppConfig;
  private readonly logger: Logger;
  private readonly router: Router;
  private readonly startTime: number;
  private readonly services: SearchServices;
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

    // Wire or initialize search subsystem services
    this.services = options.services ?? this.initializeSearchServices(options.index);

    this.setupMiddlewares(options.corsOrigin ?? this.config.api.corsOrigin);
    this.setupRoutes();
  }

  getRouter(): Router {
    return this.router;
  }

  getServices(): SearchServices {
    return this.services;
  }

  getContext(): ApiAppContext {
    return {
      config: this.config,
      logger: this.logger,
      startTime: this.startTime,
      services: this.services,
    };
  }

  private initializeSearchServices(customIndex?: InvertedIndex): SearchServices {
    const index = customIndex ?? createInvertedIndex({ indexDir: this.config.storage.indexDir });
    const queryParser = createQueryParser({
      maxQueryLength: this.config.search.maxQueryLength,
      minQueryLength: this.config.search.minQueryLength,
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
    };
  }

  private setupMiddlewares(corsOrigin: string): void {
    this.router.use(createCorsMiddleware(corsOrigin));
    this.router.use(createSecurityHeadersMiddleware());
    this.router.use(createLoggingMiddleware());
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

  /**
   * Gracefully stops the HTTP server.
   */
  async stop(): Promise<void> {
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
