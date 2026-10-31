/**
 * @opensearch/api — OpenAPI 3.1.0 Specification Generator (Phase 43)
 *
 * Generates a complete, zero-dependency OpenAPI 3.1.0 JSON specification
 * for all OpenSearch HTTP API endpoints, parameter contracts, response schemas,
 * and error models.
 */

import { PROJECT_NAME, PROJECT_VERSION, PRODUCT_NAME } from '@opensearch/shared';

export interface OpenApiSpecOptions {
  baseUrl?: string;
  env?: string;
}

export function generateOpenApiSpec(options: OpenApiSpecOptions = {}): Record<string, unknown> {
  const baseUrl = options.baseUrl ?? '/';

  return {
    openapi: '3.1.0',
    info: {
      title: `${PRODUCT_NAME} REST API`,
      version: PROJECT_VERSION,
      description:
        'Privacy-first, self-hostable search engine REST API. OpenSearch Web provides BM25 lexical search, instant answers, developer bangs, typo corrections, prefix autocomplete, and cluster health monitoring with zero tracking and zero telemetry. Note: OpenSearch Web is an independent project and is not affiliated with, sponsored by, or endorsed by Amazon Web Services, Inc. or the Amazon OpenSearch Project.',
      license: {
        name: 'MIT',
        url: 'https://github.com/Ashish6298/opensearch/blob/main/LICENSE.md',
      },
      contact: {
        name: 'OpenSearch Web Maintainers',
        url: 'https://github.com/Ashish6298/opensearch',
      },
    },
    servers: [
      {
        url: baseUrl,
        description: 'Current Environment Server',
      },
      {
        url: 'http://localhost:3001',
        description: 'Local API Daemon (Development)',
      },
      {
        url: 'http://localhost:3000',
        description: 'Unified Web & API Gateway',
      },
    ],
    tags: [
      {
        name: 'Search',
        description: 'Lexical search, instant calculations, bangs, and query parsing.',
      },
      {
        name: 'Suggestions',
        description: 'Prefix autocompletion and search-as-you-type vocabulary suggestions.',
      },
      {
        name: 'System & Health',
        description: 'Cluster health diagnostics, memory metrics, and index statistics.',
      },
      {
        name: 'Documentation',
        description: 'OpenAPI specification and schema discovery.',
      },
      {
        name: 'Focus Lenses',
        description: 'Curated and custom ranking profiles, domain boost/demote rules, and re-ranking previews.',
      },
      {
        name: 'Feedback & Quality',
        description: 'Voluntary privacy-conscious feedback, review queue management, evaluation case approval, and ranking change safety checks.',
      },
      {
        name: 'MCP Integration',
        description: 'Model Context Protocol (JSON-RPC 2.0 & SSE) endpoints for AI coding agents and desktop clients.',
      },
    ],
    paths: {
      '/': {
        get: {
          tags: ['Documentation'],
          summary: 'API discovery root',
          description:
            'Returns API service identity, version, discovery links to interactive documentation, OpenAPI specification, and endpoint catalog.',
          operationId: 'rootGet',
          responses: {
            '200': {
              description: 'API discovery payload.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      name: { type: 'string', example: PROJECT_NAME },
                      version: { type: 'string', example: PROJECT_VERSION },
                      description: { type: 'string' },
                      documentation: { type: 'string', example: '/docs' },
                      openapi: { type: 'string', example: '/api/v1/openapi.json' },
                      endpoints: { type: 'object' },
                      timestamp: { type: 'string', format: 'date-time' },
                      environment: { type: 'string', example: 'production' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/v1/search': {
        get: {
          tags: ['Search'],
          summary: 'Execute web search query',
          description:
            'Performs BM25 ranked lexical search across the local inverted index. Supports quoted phrases (`"exact phrase"`), term negation (`-term`), domain filters (`site:domain.com`), and filetype filters (`filetype:pdf`), instant calculations, and 50+ developer bangs (`!gh`, `!npm`, `!mdn`).',
          operationId: 'searchGet',
          parameters: [
            {
              name: 'q',
              in: 'query',
              required: true,
              description: 'The search query string (max 500 characters).',
              schema: {
                type: 'string',
                minLength: 1,
                maxLength: 500,
                example: 'typescript async await',
              },
            },
            {
              name: 'page',
              in: 'query',
              required: false,
              description: 'Page number for pagination (1-indexed).',
              schema: {
                type: 'integer',
                minimum: 1,
                default: 1,
                example: 1,
              },
            },
            {
              name: 'limit',
              in: 'query',
              required: false,
              description: 'Maximum number of results per page (1–100).',
              schema: {
                type: 'integer',
                minimum: 1,
                maximum: 100,
                default: 10,
                example: 10,
              },
            },
            {
              name: 'category',
              in: 'query',
              required: false,
              description: 'Filter results to a specific corpus category.',
              schema: {
                type: 'string',
                example: 'Technology',
              },
            },
            {
              name: 'domain',
              in: 'query',
              required: false,
              description: 'Filter results to a specific domain name.',
              schema: {
                type: 'string',
                example: 'nodejs.org',
              },
            },
            {
              name: 'site',
              in: 'query',
              required: false,
              description: 'Alias for domain filter.',
              schema: {
                type: 'string',
                example: 'developer.mozilla.org',
              },
            },
            {
              name: 'filetype',
              in: 'query',
              required: false,
              description: 'Filter results by file extension.',
              schema: {
                type: 'string',
                example: 'pdf',
              },
            },
            {
              name: 'lens',
              in: 'query',
              required: false,
              description: 'Focus Lens ranking profile ID (e.g., developer, student, no-trackers).',
              schema: {
                type: 'string',
                example: 'developer',
              },
            },
            {
              name: 'mode',
              in: 'query',
              required: false,
              description: 'Privacy mode: "local-only" disables all outbound remote provider queries.',
              schema: {
                type: 'string',
                enum: ['local-only', 'standard'],
                default: 'standard',
                example: 'local-only',
              },
            },
            {
              name: 'explain',
              in: 'query',
              required: false,
              description: 'Include detailed scoring explanations and factor breakdowns.',
              schema: {
                type: 'boolean',
                default: false,
                example: false,
              },
            },
            {
              name: 'safeSearch',
              in: 'query',
              required: false,
              description: 'Safe search filter level.',
              schema: {
                type: 'string',
                enum: ['strict', 'moderate', 'off'],
                default: 'moderate',
                example: 'moderate',
              },
            },
          ],
          responses: {
            '200': {
              description: 'Successful search response with ranked results and metadata.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/SearchApiResponse',
                  },
                },
              },
            },
            '400': {
              description: 'Invalid search query or parameter out of bounds.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse',
                  },
                },
              },
            },
            '413': {
              description: 'Request payload exceeds maximum allowed size.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse',
                  },
                },
              },
            },
            '429': {
              description: 'Rate limit exceeded (sliding-window IP limit).',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse',
                  },
                },
              },
            },
            '504': {
              description: 'Search deadline or execution timeout exceeded.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse',
                  },
                },
              },
            },
            '500': {
              description: 'Internal server error during search execution.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse',
                  },
                },
              },
            },
          },
        },
        post: {
          tags: ['Search'],
          summary: 'Execute search via JSON body',
          description:
            'Alternative search endpoint accepting JSON payload for complex query parameters.',
          operationId: 'searchPost',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['q'],
                  properties: {
                    q: {
                      type: 'string',
                      description: 'Search query string',
                      example: 'bm25 ranking algorithm',
                    },
                    page: {
                      type: 'integer',
                      minimum: 1,
                      default: 1,
                    },
                    limit: {
                      type: 'integer',
                      minimum: 1,
                      maximum: 100,
                      default: 10,
                    },
                    category: {
                      type: 'string',
                    },
                    domain: {
                      type: 'string',
                    },
                    filetype: {
                      type: 'string',
                    },
                    lens: {
                      type: 'string',
                      description: 'Focus Lens profile ID',
                      example: 'developer',
                    },
                    mode: {
                      type: 'string',
                      enum: ['local-only', 'standard'],
                      description: 'Privacy mode',
                      example: 'standard',
                    },
                    explain: {
                      type: 'boolean',
                      description: 'Include ranking explanation breakdown',
                      example: false,
                    },
                    safeSearch: {
                      type: 'string',
                      enum: ['strict', 'moderate', 'off'],
                      description: 'Safe search filter level',
                      example: 'moderate',
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Successful search response.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/SearchApiResponse',
                  },
                },
              },
            },
            '400': {
              description: 'Malformed JSON payload or invalid query.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse',
                  },
                },
              },
            },
            '413': {
              description: 'Request payload exceeds maximum allowed size (1MB limit).',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse',
                  },
                },
              },
            },
            '429': {
              description: 'Rate limit exceeded.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse',
                  },
                },
              },
            },
            '504': {
              description: 'Search deadline or execution timeout exceeded.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse',
                  },
                },
              },
            },
          },
        },
      },
      '/api/v1/search/stream': {
        get: {
          tags: ['Search'],
          summary: 'Stream search results via Server-Sent Events (SSE)',
          description:
            'Opens a persistent SSE connection streaming instant answers, ranked document chunks, and completion stats in real-time.',
          operationId: 'searchStreamGet',
          parameters: [
            {
              name: 'q',
              in: 'query',
              required: true,
              description: 'Search query string',
              schema: { type: 'string', minLength: 1, maxLength: 500, example: 'python' },
            },
            {
              name: 'limit',
              in: 'query',
              required: false,
              description: 'Maximum ranked items to stream',
              schema: { type: 'integer', default: 10, minimum: 1, maximum: 50 },
            },
            {
              name: 'category',
              in: 'query',
              required: false,
              description: 'Filter search to a specific category (all, images, news, developer, etc.)',
              schema: { type: 'string', example: 'developer' },
            },
            {
              name: 'lens',
              in: 'query',
              required: false,
              description: 'Focus Lens profile ID to customize ranking weights and domain boosts',
              schema: { type: 'string', example: 'developer' },
            },
            {
              name: 'mode',
              in: 'query',
              required: false,
              description: 'Privacy mode: "local-only" disables all outbound remote requests',
              schema: { type: 'string', enum: ['local-only', 'standard'], default: 'standard', example: 'local-only' },
            },
          ],
          responses: {
            '200': {
              description: 'Server-Sent Events text stream emitting typed events:\n- `event: answer`: Instant calculations, definitions, or quick answers\n- `event: results`: Chunks of ranked search result items\n- `event: done`: Stream completion stats, total hits, and verifiable privacy receipt\n- `event: error`: Error payload if stream fails',
              headers: {
                'Content-Type': {
                  schema: { type: 'string', example: 'text/event-stream; charset=utf-8' },
                  description: 'SSE event stream content type',
                },
                'Cache-Control': {
                  schema: { type: 'string', example: 'no-cache' },
                  description: 'Prevents intermediate proxy caching of stream chunks',
                },
              },
              content: {
                'text/event-stream': {
                  schema: {
                    type: 'string',
                    example: 'event: answer\\ndata: {...}\\n\\nevent: results\\ndata: {...}\\n\\nevent: done\\ndata: {...}\\n\\n',
                  },
                },
              },
            },
          },
        },
      },
      '/api/v1/suggest': {
        get: {
          tags: ['Suggestions'],
          summary: 'Prefix autocomplete suggestions',
          description:
            'Returns instant search-as-you-type term and phrase completions matching the input prefix.',
          operationId: 'suggestGet',
          parameters: [
            {
              name: 'q',
              in: 'query',
              required: true,
              description: 'Prefix query to autocomplete.',
              schema: {
                type: 'string',
                minLength: 1,
                maxLength: 100,
                example: 'type',
              },
            },
            {
              name: 'limit',
              in: 'query',
              required: false,
              description: 'Maximum number of suggestions to return (1–20).',
              schema: {
                type: 'integer',
                minimum: 1,
                maximum: 20,
                default: 5,
                example: 5,
              },
            },
          ],
          responses: {
            '200': {
              description: 'Successful suggestion response.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/SuggestApiResponse',
                  },
                },
              },
            },
            '400': {
              description: 'Missing or empty query prefix.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse',
                  },
                },
              },
            },
          },
        },
      },
      '/health': {
        get: {
          tags: ['System & Health'],
          summary: 'Cluster & service health check',
          description:
            'Returns detailed diagnostic telemetry including index status, document count, term count, memory metrics, rate limiter state, query cache efficiency, and component readiness.',
          operationId: 'healthGet',
          responses: {
            '200': {
              description: 'Service health check diagnostics.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/HealthCheckResponse',
                  },
                },
              },
            },
          },
        },
      },
      '/metrics': {
        get: {
          tags: ['System & Health'],
          summary: 'Prometheus operational metrics',
          description:
            'Exposes low-cardinality, privacy-safe Prometheus text exposition format (version 0.0.4) metrics for latency, provider health, result counts, index status, queue depth, and errors.',
          operationId: 'metricsGet',
          responses: {
            '200': {
              description: 'Prometheus metrics in text/plain or JSON snapshot format.',
              content: {
                'text/plain': {
                  schema: {
                    type: 'string',
                  },
                },
                'application/json': {
                  schema: {
                    type: 'object',
                  },
                },
              },
            },
          },
        },
      },
      '/api/v1/status': {
        get: {
          tags: ['System & Health'],
          summary: 'System status summary',
          description: 'Returns a lightweight system status overview and uptime.',
          operationId: 'statusGet',
          responses: {
            '200': {
              description: 'System status information.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', example: 'ok' },
                      service: { type: 'string', example: '@opensearch/api' },
                      version: { type: 'string', example: PROJECT_VERSION },
                      uptimeSeconds: { type: 'integer', example: 3600 },
                      timestamp: { type: 'string', format: 'date-time' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/v1/deployment': {
        get: {
          tags: ['System & Health'],
          summary: 'Deployment architecture evaluation and platform capabilities',
          description: 'Returns authoritative deployment mode, storage durability assessment, rate limit scope, and zero-cost/zero-secret invariants.',
          operationId: 'deploymentGet',
          responses: {
            '200': {
              description: 'Deployment architecture evaluation and platform capabilities.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', example: 'ok' },
                      product: { type: 'string', example: 'OpenSearch Web' },
                      version: { type: 'string', example: PROJECT_VERSION },
                      timestamp: { type: 'string', format: 'date-time' },
                      deployment: { type: 'object' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/v1/release': {
        get: {
          tags: ['System & Health'],
          summary: 'Release metadata and build traceability',
          description: 'Returns traceable release version, build timestamp, runtime versions, git revision, and zero-secret guarantees.',
          operationId: 'releaseGet',
          responses: {
            '200': {
              description: 'Release metadata and build information.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', example: 'ok' },
                      release: { type: 'object' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/v1/lenses': {
        get: {
          tags: ['Focus Lenses'],
          summary: 'List available Focus Lens ranking profiles',
          description: 'Returns all built-in and active Focus Lens profiles (general, student, developer, research, trusted-health, no-trackers) with versioned schemas, boost rules, and ranking weights.',
          operationId: 'lensesListGet',
          responses: {
            '200': {
              description: 'List of available Focus Lens profiles.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      lenses: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/FocusLensProfile' },
                      },
                      total: { type: 'integer', example: 6 },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/v1/lenses/{id}': {
        get: {
          tags: ['Focus Lenses'],
          summary: 'Get Focus Lens profile by ID',
          description: 'Retrieves a single Focus Lens profile definition by ID.',
          operationId: 'lensGetById',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              description: 'The lens identifier (e.g. developer, student, no-trackers).',
              schema: { type: 'string', example: 'developer' },
            },
          ],
          responses: {
            '200': {
              description: 'Focus Lens profile.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      lens: { $ref: '#/components/schemas/FocusLensProfile' },
                    },
                  },
                },
              },
            },
            '404': {
              description: 'Lens profile not found.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
      '/api/v1/lenses/validate': {
        post: {
          tags: ['Focus Lenses'],
          summary: 'Validate Focus Lens JSON profile',
          description: 'Validates a custom Focus Lens JSON schema definition for syntax errors, weight bounds, blocklists, and size limits.',
          operationId: 'lensValidatePost',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Validation result indicating whether the lens profile is valid.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      valid: { type: 'boolean', example: true },
                      errors: { type: 'array', items: { type: 'string' } },
                      profile: { $ref: '#/components/schemas/FocusLensProfile' },
                    },
                  },
                },
              },
            },
            '400': {
              description: 'Invalid JSON body or missing profile.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
      '/api/v1/lenses/preview': {
        post: {
          tags: ['Focus Lenses'],
          summary: 'Preview Focus Lens effect on sample benchmark queries',
          description: 'Previews the effects of a Focus Lens profile against fixed sample queries, explaining why results were boosted, demoted, or excluded.',
          operationId: 'lensPreviewPost',
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    lensId: { type: 'string', example: 'developer' },
                    profile: { type: 'object' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Lens preview report with per-result effect explanations.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      lensId: { type: 'string', example: 'developer' },
                      lensName: { type: 'string', example: 'Developer' },
                      totalQueriesTested: { type: 'integer', example: 3 },
                      samples: { type: 'array', items: { type: 'object' } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/v1/feedback': {
        get: {
          tags: ['Feedback & Quality'],
          summary: 'Export stored feedback and statistics',
          description: 'Returns stored search quality feedback and aggregated sentiment statistics under 30-day retention.',
          operationId: 'feedbackGet',
          responses: {
            '200': {
              description: 'Feedback records and summary statistics.',
            },
          },
        },
        post: {
          tags: ['Feedback & Quality'],
          summary: 'Submit voluntary search feedback',
          description: 'Submits voluntary rating and category with explicit user consent. Never collects raw queries, IPs, or identifiers.',
          operationId: 'feedbackPost',
          responses: {
            '201': {
              description: 'Feedback recorded successfully.',
            },
            '400': {
              description: 'Invalid feedback payload or missing consent.',
            },
          },
        },
        delete: {
          tags: ['Feedback & Quality'],
          summary: 'Purge all feedback records',
          description: 'Immediately purges all stored feedback records from the local system.',
          operationId: 'feedbackDelete',
          responses: {
            '200': {
              description: 'Feedback successfully purged.',
            },
          },
        },
      },
      '/api/v1/feedback/privacy': {
        get: {
          tags: ['Feedback & Quality'],
          summary: 'Feedback privacy notice & retention policy',
          description: 'Discloses retention duration (30 days), purge policies, and network metadata limitations.',
          operationId: 'feedbackPrivacyGet',
          responses: {
            '200': {
              description: 'Privacy notice and retention specifications.',
            },
          },
        },
      },
      '/api/v1/feedback/review': {
        get: {
          tags: ['Feedback & Quality'],
          summary: 'List feedback review queue items',
          description: 'Retrieves review queue items with optional status and clustering filters. Feedback items are strictly separated from ground truth.',
          operationId: 'feedbackReviewList',
          responses: {
            '200': {
              description: 'List of review items and total count.',
            },
          },
        },
      },
      '/api/v1/feedback/review/import': {
        post: {
          tags: ['Feedback & Quality'],
          summary: 'Import feedback into review queue',
          description: 'Imports feedback submissions into the review queue with non-invasive burst detection.',
          operationId: 'feedbackReviewImport',
          responses: {
            '200': {
              description: 'Feedback imported into review queue.',
            },
          },
        },
      },
      '/api/v1/feedback/review/stats': {
        get: {
          tags: ['Feedback & Quality'],
          summary: 'Feedback review queue statistics and clusters',
          description: 'Returns aggregated review queue metrics, burst counts, and metadata clusters.',
          operationId: 'feedbackReviewStats',
          responses: {
            '200': {
              description: 'Review queue statistics and cluster summaries.',
            },
          },
        },
      },
      '/api/v1/feedback/review/{id}': {
        patch: {
          tags: ['Feedback & Quality'],
          summary: 'Update review queue item status',
          description: 'Updates review state (pending, under_investigation, approved_for_evaluation, rejected, archived) and attaches curator notes.',
          operationId: 'feedbackReviewUpdate',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              description: 'Review queue item ID',
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Review item updated.',
            },
            '404': {
              description: 'Item not found.',
            },
          },
        },
      },
      '/api/v1/feedback/review/{id}/approve-case': {
        post: {
          tags: ['Feedback & Quality'],
          summary: 'Approve feedback as candidate evaluation case',
          description: 'Curates candidate case into evaluation dataset. Strictly blocks silent contamination into held-out split.',
          operationId: 'feedbackReviewApproveCase',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              description: 'Review queue item ID',
              schema: { type: 'string' },
            },
          ],
          responses: {
            '201': {
              description: 'Candidate evaluation case approved for tuning.',
            },
            '400': {
              description: 'Contamination attempt or invalid approval payload.',
            },
            '404': {
              description: 'Item not found.',
            },
          },
        },
      },
      '/api/v1/feedback/review/ranking-check': {
        post: {
          tags: ['Feedback & Quality'],
          summary: 'Verify ranking parameter modification safety',
          description: 'Enforces human review and reproducible benchmark verification before ranking adjustments.',
          operationId: 'feedbackRankingCheck',
          responses: {
            '200': {
              description: 'Ranking change proposal approved by safety gate.',
            },
            '400': {
              description: 'Ranking safety violation or held-out regression.',
            },
          },
        },
      },
      '/api/v1/mcp': {
        post: {
          tags: ['MCP Integration'],
          summary: 'Model Context Protocol (JSON-RPC 2.0) endpoint',
          description:
            'Dispatches JSON-RPC 2.0 requests to the OpenSearch Model Context Protocol server for AI coding agents and desktop applications. Provides search, quick_answer, get_status, and get_privacy_policy tools with strict query limits and server-side local-only enforcement.',
          operationId: 'mcpPost',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    jsonrpc: { type: 'string', enum: ['2.0'] },
                    id: { oneOf: [{ type: 'string' }, { type: 'number' }] },
                    method: { type: 'string' },
                    params: { type: 'object' },
                  },
                  required: ['jsonrpc', 'method'],
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'JSON-RPC 2.0 response object.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      jsonrpc: { type: 'string', enum: ['2.0'] },
                      id: { oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'null' }] },
                      result: { type: 'object' },
                      error: {
                        type: 'object',
                        properties: {
                          code: { type: 'integer' },
                          message: { type: 'string' },
                          data: { type: 'object' },
                        },
                      },
                    },
                  },
                },
              },
            },
            '503': {
              description: 'MCP server disabled on this instance.',
            },
          },
        },
      },
      '/api/v1/mcp/sse': {
        get: {
          tags: ['MCP Integration'],
          summary: 'Model Context Protocol Server-Sent Events (SSE) stream',
          description:
            'Opens an SSE channel for MCP server events and endpoint announcement.',
          operationId: 'mcpSseGet',
          responses: {
            '200': {
              description: 'Persistent SSE stream.',
              content: {
                'text/event-stream': {
                  schema: { type: 'string' },
                },
              },
            },
            '503': {
              description: 'MCP server disabled.',
            },
          },
        },
      },
      '/opensearch.xml': {
        get: {
          tags: ['Documentation'],
          summary: 'OpenSearch 1.1 browser search description document (OSDD)',
          description:
            'Returns standards-compatible OpenSearch 1.1 XML search descriptor for native browser address bar integration (Firefox, Chrome, Brave, Edge, Safari).',
          operationId: 'opensearchXmlGet',
          responses: {
            '200': {
              description: 'OpenSearch 1.1 XML Description Document.',
              content: {
                'application/opensearchdescription+xml': {
                  schema: { type: 'string' },
                },
              },
            },
          },
        },
      },
      '/api/v1/openapi.json': {
        get: {
          tags: ['Documentation'],
          summary: 'OpenAPI 3.1.0 specification',
          description: 'Retrieves the complete OpenAPI 3.1.0 JSON specification for OpenSearch.',
          operationId: 'openapiJsonGet',
          responses: {
            '200': {
              description: 'OpenAPI 3.1.0 JSON document.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                  },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        SearchApiResponse: {
          type: 'object',
          required: ['query', 'results', 'pagination', 'meta'],
          properties: {
            query: {
              type: 'object',
              properties: {
                raw: { type: 'string', example: 'typescript tutorial' },
                normalized: { type: 'string', example: 'typescript tutorial' },
                terms: {
                  type: 'array',
                  items: { type: 'string' },
                  example: ['typescript', 'tutorial'],
                },
                phrases: {
                  type: 'array',
                  items: { type: 'string' },
                },
                negatedTerms: {
                  type: 'array',
                  items: { type: 'string' },
                },
                filters: {
                  type: 'object',
                  additionalProperties: { type: 'string' },
                },
              },
            },
            instantAnswer: {
              $ref: '#/components/schemas/InstantAnswerResult',
            },
            quickAnswer: {
              $ref: '#/components/schemas/QuickAnswerPayload',
            },
            bang: {
              $ref: '#/components/schemas/BangShortcutResult',
            },
            didYouMean: {
              $ref: '#/components/schemas/TypoSuggestion',
            },
            results: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/SearchResultItem',
              },
            },
            pagination: {
              $ref: '#/components/schemas/PaginationMeta',
            },
            privacyReceipt: {
              $ref: '#/components/schemas/PrivacyReceipt',
            },
            meta: {
              type: 'object',
              properties: {
                totalHits: { type: 'integer', example: 42 },
                candidateCount: { type: 'integer', example: 120 },
                durationMs: { type: 'number', example: 4.5 },
                timestamp: { type: 'string', format: 'date-time' },
                explainPlan: { type: 'boolean', example: false },
                category: { type: 'string', example: 'developer' },
                categoryAvailable: { type: 'boolean', example: true },
                localOnly: { type: 'boolean', example: false },
                limitedResultsNotice: { type: 'string', nullable: true },
                lens: {
                  type: 'object',
                  nullable: true,
                  properties: {
                    id: { type: 'string', example: 'developer' },
                    name: { type: 'string', example: 'Developer' },
                    disclaimer: { type: 'string' },
                    isMedicalEndorsement: { type: 'boolean', example: false },
                  },
                },
                safeSearch: {
                  type: 'object',
                  properties: {
                    level: { type: 'string', example: 'moderate' },
                    filteredCount: { type: 'integer', example: 0 },
                    explanation: { type: 'string' },
                    whatItCovers: { type: 'string' },
                    whatItDoesNotCover: { type: 'string' },
                  },
                },
              },
            },
          },
        },
        SearchResultItem: {
          type: 'object',
          required: ['id', 'url', 'title', 'snippet', 'score'],
          properties: {
            id: { type: 'string', example: 'doc_9832749237' },
            documentId: { type: 'string', example: 'doc_9832749237' },
            url: { type: 'string', format: 'uri', example: 'https://www.typescriptlang.org/docs/' },
            displayUrl: { type: 'string', example: 'typescriptlang.org › docs' },
            title: { type: 'string', example: 'TypeScript: JavaScript With Syntax For Types' },
            highlightedTitle: { type: 'string', example: '<mark>TypeScript</mark>: JavaScript With Syntax For Types' },
            snippet: {
              type: 'string',
              example: 'TypeScript extends JavaScript by adding types to the language...',
            },
            highlightedSnippet: {
              type: 'string',
              example: '<mark>TypeScript</mark> extends JavaScript by adding types...',
            },
            score: { type: 'number', example: 8.45 },
            rank: { type: 'integer', example: 1 },
            domain: { type: 'string', example: 'typescriptlang.org' },
            category: { type: 'string', example: 'Programming' },
            source: {
              type: 'string',
              enum: ['local-index', 'local_index', 'google_fallback', 'duckduckgo_fallback', 'external'],
              example: 'local-index',
              description: 'Result provenance identifying the origin index or fallback provider.',
            },
            language: { type: 'string', nullable: true, example: 'en' },
            indexedAt: { type: 'string', format: 'date-time' },
            thumbnailUrl: { type: 'string', format: 'uri', nullable: true },
            publishedAt: { type: 'string', format: 'date-time', nullable: true },
            trackerIndicator: {
              type: 'object',
              nullable: true,
              description: 'Tracker classification and privacy indicator for the document domain.',
            },
            lensExplain: {
              type: 'object',
              nullable: true,
              description: 'Explanation of Focus Lens boost, demotion, or exclusion.',
            },
            explanation: {
              type: 'object',
              nullable: true,
              description: 'Detailed scoring factor breakdown when explain=true.',
            },
          },
        },
        InstantAnswerResult: {
          type: 'object',
          nullable: true,
          properties: {
            type: {
              type: 'string',
              enum: ['calculator', 'conversion', 'bang', 'knowledge'],
              example: 'calculator',
            },
            title: { type: 'string', example: '25 * 40 + 100' },
            primaryAnswer: { type: 'string', example: '1,100' },
            secondaryDetails: {
              type: 'object',
              additionalProperties: { type: 'string' },
            },
            redirectUrl: { type: 'string', nullable: true },
          },
        },
        QuickAnswerPayload: {
          type: 'object',
          nullable: true,
          properties: {
            status: {
              type: 'string',
              enum: ['sufficient_evidence', 'insufficient_evidence', 'no_relevant_sources', 'disagreement_detected'],
              example: 'sufficient_evidence',
            },
            summary: { type: 'string', example: 'TypeScript is a typed superset of JavaScript [1].' },
            hasSufficientEvidence: { type: 'boolean', example: true },
            citations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  index: { type: 'integer', example: 1 },
                  documentId: { type: 'string', example: 'doc-1' },
                  title: { type: 'string', example: 'TypeScript' },
                  url: { type: 'string', format: 'uri', example: 'https://typescriptlang.org' },
                  domain: { type: 'string', example: 'typescriptlang.org' },
                  snippetQuote: { type: 'string' },
                  sourceType: { type: 'string', enum: ['local', 'web'] },
                },
              },
            },
            model: {
              type: 'object',
              properties: {
                type: { type: 'string', example: 'extractive' },
                name: { type: 'string', example: 'deterministic-extractive-v1' },
                isLocal: { type: 'boolean', example: true },
                requiresPaidService: { type: 'boolean', example: false },
                disclosed: { type: 'boolean', example: true },
              },
            },
          },
        },
        BangShortcutResult: {
          type: 'object',
          nullable: true,
          properties: {
            isBang: { type: 'boolean', example: true },
            bangKey: { type: 'string', example: 'gh' },
            matchedTrigger: { type: 'string', example: 'gh' },
            serviceName: { type: 'string', example: 'GitHub' },
            category: { type: 'string', example: 'developer' },
            searchQuery: { type: 'string', example: 'opensearch' },
            redirectUrl: {
              type: 'string',
              example: 'https://github.com/search?q=opensearch',
            },
          },
        },
        TypoSuggestion: {
          type: 'object',
          nullable: true,
          properties: {
            originalQuery: { type: 'string', example: 'pythn' },
            correctedQuery: { type: 'string', example: 'python' },
            confidence: { type: 'number', example: 0.92 },
            distance: { type: 'integer', example: 1 },
          },
        },
        PaginationMeta: {
          type: 'object',
          required: ['page', 'pageSize', 'totalHits', 'totalPages'],
          properties: {
            page: { type: 'integer', example: 1, description: 'Current 1-based page index' },
            pageSize: { type: 'integer', example: 10, description: 'Number of results per page' },
            limit: { type: 'integer', example: 10, description: 'Backward-compatible alias for pageSize' },
            totalHits: { type: 'integer', example: 42, description: 'Total matching documents across index' },
            totalPages: { type: 'integer', example: 5, description: 'Total number of available pages' },
            hasNextPage: { type: 'boolean', example: true, description: 'Whether subsequent pages exist' },
            hasPrevPage: { type: 'boolean', example: false, description: 'Whether previous pages exist' },
            hasNext: { type: 'boolean', example: true, description: 'Backward-compatible alias for hasNextPage' },
            hasPrev: { type: 'boolean', example: false, description: 'Backward-compatible alias for hasPrevPage' },
            nextPage: { type: 'integer', nullable: true, example: 2 },
            prevPage: { type: 'integer', nullable: true, example: null },
            startIndex: { type: 'integer', example: 0 },
            endIndex: { type: 'integer', example: 9 },
          },
        },
        PrivacyReceipt: {
          type: 'object',
          required: ['schemaVersion', 'receiptId', 'timestamp', 'mode', 'networkDispatch', 'hostTelemetry', 'browserTelemetry', 'summary'],
          properties: {
            schemaVersion: { type: 'string', example: '1.0.0' },
            receiptId: { type: 'string', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' },
            timestamp: { type: 'string', format: 'date-time' },
            mode: { type: 'string', enum: ['standard', 'local-only'], example: 'local-only' },
            networkDispatch: {
              type: 'object',
              properties: {
                totalOutboundRequests: { type: 'integer', example: 0 },
                externalProvidersContacted: { type: 'array', items: { type: 'object' } },
                externalProvidersSkipped: { type: 'array', items: { type: 'object' } },
                isPartialResult: { type: 'boolean', example: false },
                searchDeadlineExceeded: { type: 'boolean', example: false },
              },
            },
            hostTelemetry: {
              type: 'object',
              properties: {
                clientIpHandling: {
                  type: 'object',
                  properties: {
                    received: { type: 'boolean', example: true },
                    anonymizedInMemory: { type: 'boolean', example: true },
                    maskApplied: { type: 'string', example: 'loopback' },
                    loggedToDisk: { type: 'boolean', example: false },
                  },
                },
                dataPersistence: {
                  type: 'object',
                  properties: {
                    cookiesIssued: { type: 'boolean', example: false },
                    localStorageUsedForPreferencesOnly: { type: 'boolean', example: true },
                    sessionIdentifiersCreated: { type: 'boolean', example: false },
                    rawQueryStoredInDatabase: { type: 'boolean', example: false },
                    rawQueryLoggedToDisk: { type: 'boolean', example: false },
                  },
                },
              },
            },
            browserTelemetry: {
              type: 'object',
              properties: {
                thirdPartyScriptsExecuted: { type: 'boolean', example: false },
                thirdPartyAnalyticsLoaded: { type: 'boolean', example: false },
                remoteSuggestionsRequested: { type: 'boolean', example: false },
                remoteThumbnailsRequested: { type: 'boolean', example: false },
                referrerPolicyEnforced: { type: 'string', example: 'strict-origin-when-cross-origin' },
              },
            },
            summary: { type: 'string' },
          },
        },
        FocusLensProfile: {
          type: 'object',
          required: ['id', 'name', 'schemaVersion'],
          properties: {
            id: { type: 'string', example: 'developer' },
            name: { type: 'string', example: 'Developer' },
            description: { type: 'string', example: 'Boosts developer documentation, code repositories, and technical specs.' },
            schemaVersion: { type: 'string', example: '1.0.0' },
            weights: {
              type: 'object',
              properties: {
                bm25: { type: 'number', example: 1.0 },
                pageRank: { type: 'number', example: 0.8 },
                freshness: { type: 'number', example: 0.5 },
                lensBoost: { type: 'number', example: 1.5 },
              },
            },
            boostRules: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  domain: { type: 'string', example: 'github.com' },
                  factor: { type: 'number', example: 1.8 },
                  rationale: { type: 'string' },
                },
              },
            },
            demoteRules: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  domain: { type: 'string' },
                  factor: { type: 'number' },
                  rationale: { type: 'string' },
                },
              },
            },
            excludeDomains: {
              type: 'array',
              items: { type: 'string' },
            },
            disclaimer: { type: 'string' },
          },
        },
        SuggestApiResponse: {
          type: 'object',
          required: ['query', 'suggestions', 'count'],
          properties: {
            query: { type: 'string', example: 'type' },
            suggestions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  text: { type: 'string', example: 'typescript' },
                  score: { type: 'number', example: 100 },
                  type: { type: 'string', example: 'term' },
                },
              },
            },
            count: { type: 'integer', example: 5 },
          },
        },
        HealthCheckResponse: {
          type: 'object',
          properties: {
            name: { type: 'string', example: PROJECT_NAME },
            version: { type: 'string', example: PROJECT_VERSION },
            status: { type: 'string', enum: ['ok', 'degraded', 'error'], example: 'ok' },
            timestamp: { type: 'string', format: 'date-time' },
            uptimeSeconds: { type: 'integer', example: 120 },
            memoryUsageMb: { type: 'number', example: 42.5 },
            totalDocumentsIndexed: { type: 'integer', example: 113 },
            routesAvailable: {
              type: 'array',
              items: { type: 'string' },
            },
            components: {
              type: 'object',
              additionalProperties: { type: 'object' },
            },
          },
        },
        ErrorResponse: {
          type: 'object',
          required: ['error'],
          properties: {
            error: {
              type: 'object',
              required: ['message', 'code'],
              properties: {
                message: {
                  type: 'string',
                  example: 'Query parameter "page" must be a positive integer greater than or equal to 1.',
                },
                code: {
                  type: 'string',
                  example: 'INVALID_PAGE_NUMBER',
                },
                category: {
                  type: 'string',
                  example: 'VALIDATION',
                },
                statusCode: {
                  type: 'integer',
                  example: 400,
                },
                timestamp: {
                  type: 'string',
                  format: 'date-time',
                },
                details: {
                  type: 'object',
                  nullable: true,
                },
              },
            },
            statusCode: {
              type: 'integer',
              example: 400,
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
      },
    },
  };
}
