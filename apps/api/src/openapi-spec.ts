/**
 * @opensearch/api — OpenAPI 3.1.0 Specification Generator (Phase 43)
 *
 * Generates a complete, zero-dependency OpenAPI 3.1.0 JSON specification
 * for all OpenSearch HTTP API endpoints, parameter contracts, response schemas,
 * and error models.
 */

import { PROJECT_NAME, PROJECT_VERSION } from '@opensearch/shared';

export interface OpenApiSpecOptions {
  baseUrl?: string;
  env?: string;
}

export function generateOpenApiSpec(options: OpenApiSpecOptions = {}): Record<string, unknown> {
  const baseUrl = options.baseUrl ?? '/';

  return {
    openapi: '3.1.0',
    info: {
      title: `${PROJECT_NAME} REST API`,
      version: PROJECT_VERSION,
      description:
        'Privacy-first, self-hostable search engine REST API. Provides BM25 lexical search, instant answers, developer bangs, typo corrections, prefix autocomplete, and cluster health monitoring with zero tracking and zero telemetry.',
      license: {
        name: 'MIT',
        url: 'https://github.com/Ashish6298/opensearch/blob/main/LICENSE.md',
      },
      contact: {
        name: 'OpenSearch Maintainers',
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
    ],
    paths: {
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
            meta: {
              type: 'object',
              properties: {
                totalHits: { type: 'integer', example: 42 },
                candidateCount: { type: 'integer', example: 120 },
                durationMs: { type: 'number', example: 4.5 },
                timestamp: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
        SearchResultItem: {
          type: 'object',
          required: ['id', 'url', 'title', 'snippet', 'score'],
          properties: {
            id: { type: 'string', example: 'doc_9832749237' },
            url: { type: 'string', format: 'uri', example: 'https://www.typescriptlang.org/docs/' },
            title: { type: 'string', example: 'TypeScript: JavaScript With Syntax For Types' },
            snippet: {
              type: 'string',
              example: 'TypeScript extends JavaScript by adding types to the language...',
            },
            score: { type: 'number', example: 8.45 },
            domain: { type: 'string', example: 'typescriptlang.org' },
            category: { type: 'string', example: 'Programming' },
            lastCrawledAt: { type: 'string', format: 'date-time' },
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
          properties: {
            page: { type: 'integer', example: 1 },
            limit: { type: 'integer', example: 10 },
            totalHits: { type: 'integer', example: 42 },
            totalPages: { type: 'integer', example: 5 },
            hasNext: { type: 'boolean', example: true },
            hasPrev: { type: 'boolean', example: false },
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
          required: ['error', 'statusCode'],
          properties: {
            error: {
              type: 'string',
              example: 'Query parameter "q" is required and cannot be empty.',
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
      },
    },
  };
}
