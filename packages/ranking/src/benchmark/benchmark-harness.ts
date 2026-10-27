/**
 * @opensearch/ranking — Performance Benchmark Harness (Phase 94)
 *
 * Implements reproducible, end-to-end performance benchmarking:
 * - Measures index build time, index byte size, startup loading time
 * - Measures query throughput (QPS), min/p50/p90/p95/p99 latency
 * - Rigorously separates indexing time from query latency
 * - Defines distinct cold vs. warm query execution phases
 * - Uses fixed corpus versions and repeatable query suites
 * - Records hardware, operating system, and runtime environment
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  createDocumentProcessor,
  createInvertedIndex,
  getDemoCorpus,
  INDEX_FILE_NAME,
  InvertedIndex,
} from '@opensearch/indexer';
import { PROJECT_NAME, PROJECT_VERSION } from '@opensearch/shared';
import { createQueryParser } from '../query/query-parser.js';
import { createResultGenerator } from '../results/result-generator.js';
import { createCandidateRetriever } from '../retrieval/candidate-retriever.js';
import { createRankingEngine } from '../scorer/ranking-engine.js';
import {
  BENCHMARK_QUERY_SET_VERSION,
  REPEATABLE_BENCHMARK_QUERIES,
} from './benchmark-queries.js';
import {
  BenchmarkHarnessOptions,
  BenchmarkReport,
  HardwareEnvironment,
  IndexingBenchmarkResult,
  LatencyDistribution,
  MemorySnapshot,
  QueryLevelBenchmarkItem,
  QueryPhaseBenchmarkResult,
} from './benchmark-types.js';

export const FIXED_BENCHMARK_CORPUS_VERSION = 'v1.5.0-corpus-seed-tier';

export function getMemorySnapshot(): MemorySnapshot {
  const mem = process.memoryUsage();
  return {
    heapUsedMb: Math.round((mem.heapUsed / (1024 * 1024)) * 100) / 100,
    heapTotalMb: Math.round((mem.heapTotal / (1024 * 1024)) * 100) / 100,
    externalMb: Math.round((mem.external / (1024 * 1024)) * 100) / 100,
    rssMb: Math.round((mem.rss / (1024 * 1024)) * 100) / 100,
  };
}

export function captureEnvironment(): HardwareEnvironment {
  const cpus = os.cpus();
  const firstCpu = cpus[0];

  return {
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    cpuModel: firstCpu ? firstCpu.model : 'Unknown CPU',
    cpuCores: cpus.length,
    cpuSpeedMhz: firstCpu ? firstCpu.speed : 0,
    totalMemoryMb: Math.round(os.totalmem() / (1024 * 1024)),
    freeMemoryMb: Math.round(os.freemem() / (1024 * 1024)),
    nodeVersion: process.version,
    v8Version: process.versions.v8 || 'Unknown',
    openSearchVersion: PROJECT_VERSION || '1.4.0',
  };
}

export function calculateDistribution(latencies: number[]): LatencyDistribution {
  if (latencies.length === 0) {
    return {
      minMs: 0,
      p50Ms: 0,
      p90Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
      maxMs: 0,
      meanMs: 0,
      stdDevMs: 0,
    };
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const n = sorted.length;

  const minMs = sorted[0]!;
  const maxMs = sorted[n - 1]!;

  const p50Ms = sorted[Math.floor(0.5 * (n - 1))]!;
  const p90Ms = sorted[Math.floor(0.9 * (n - 1))]!;
  const p95Ms = sorted[Math.floor(0.95 * (n - 1))]!;
  const p99Ms = sorted[Math.floor(0.99 * (n - 1))]!;

  const sum = sorted.reduce((acc, val) => acc + val, 0);
  const meanMs = Math.round((sum / n) * 1000) / 1000;

  const variance = sorted.reduce((acc, val) => acc + Math.pow(val - meanMs, 2), 0) / n;
  const stdDevMs = Math.round(Math.sqrt(variance) * 1000) / 1000;

  return {
    minMs: Math.round(minMs * 1000) / 1000,
    p50Ms: Math.round(p50Ms * 1000) / 1000,
    p90Ms: Math.round(p90Ms * 1000) / 1000,
    p95Ms: Math.round(p95Ms * 1000) / 1000,
    p99Ms: Math.round(p99Ms * 1000) / 1000,
    maxMs: Math.round(maxMs * 1000) / 1000,
    meanMs,
    stdDevMs,
  };
}

/**
 * Runs the isolated indexing phase benchmark:
 * Measures build duration, build throughput, serialized index size, and startup deserialization time.
 */
export async function benchmarkIndexingPhase(
  documents: Array<{
    id: string;
    url?: string;
    canonicalUrl?: string;
    title: string;
    description?: string;
    headings?: string;
    bodyText?: string;
    content?: string;
  }>,
  tierName: string = 'demo',
): Promise<{
  result: IndexingBenchmarkResult;
  index: InvertedIndex;
}> {
  const memBefore = getMemorySnapshot();
  const processor = createDocumentProcessor();
  const index = createInvertedIndex();

  let totalBytes = 0;
  for (const doc of documents) {
    const text = (doc.title || '') + ' ' + (doc.description || '') + ' ' + (doc.headings || '') + ' ' + (doc.bodyText || doc.content || '');
    totalBytes += Buffer.byteLength(text, 'utf-8');
  }

  // 1. Measure Index Build Duration
  const buildStart = performance.now();
  for (const doc of documents) {
    const processed = processor.process({
      id: doc.id,
      url: doc.canonicalUrl || doc.url || `https://example.com/${doc.id}`,
      title: doc.title,
      description: doc.description || '',
      headings: doc.headings || '',
      bodyText: doc.bodyText || doc.content || '',
      language: 'en',
    });
    index.addDocument(processed);
  }
  const buildDurationMs = Math.round((performance.now() - buildStart) * 100) / 100;

  // 2. Measure Index Serialization and Size to Disk
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opensearch-bench-'));
  let indexSizeBytes = 0;
  let startupDurationMs = 0;
  const freshIndex = createInvertedIndex();

  try {
    await index.save(tempDir);
    const indexFilePath = path.join(tempDir, INDEX_FILE_NAME);
    if (fs.existsSync(indexFilePath)) {
      indexSizeBytes = fs.statSync(indexFilePath).size;
    }

    // 3. Measure Startup Time (Cold Re-hydration from Disk)
    const startupStart = performance.now();
    await freshIndex.load(tempDir);
    startupDurationMs = Math.round((performance.now() - startupStart) * 100) / 100;
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Safe fallback for transient file lock cleanup
    }
  }

  const memAfter = getMemorySnapshot();
  const stats = index.getStats();

  const docCount = documents.length;
  const buildRateDocsPerSec = buildDurationMs > 0 ? Math.round((docCount / (buildDurationMs / 1000)) * 10) / 10 : 0;
  const buildRateMbPerSec =
    buildDurationMs > 0 ? Math.round(((totalBytes / (1024 * 1024)) / (buildDurationMs / 1000)) * 100) / 100 : 0;

  return {
    result: {
      corpusTier: tierName,
      documentCount: docCount,
      corpusSizeBytes: totalBytes,
      corpusSizeMb: Math.round((totalBytes / (1024 * 1024)) * 100) / 100,
      buildDurationMs,
      buildRateDocsPerSec,
      buildRateMbPerSec,
      indexSizeBytes,
      indexSizeMb: Math.round((indexSizeBytes / (1024 * 1024)) * 100) / 100,
      vocabularyTermCount: stats.totalTerms,
      postingCount: stats.totalPostings,
      startupDurationMs,
      memoryBefore: memBefore,
      memoryAfter: memAfter,
      memoryDeltaMb: Math.round((memAfter.heapUsedMb - memBefore.heapUsedMb) * 100) / 100,
    },
    index: freshIndex,
  };
}

/**
 * Runs query pipeline benchmarks across cold and warm phases.
 */
export async function benchmarkQueryPhases(
  index: InvertedIndex,
  queries: readonly string[],
  options: {
    warmupIterations?: number;
    measuredIterations?: number;
    recordQueryLevelDetails?: boolean;
  } = {},
): Promise<{
  coldResult: QueryPhaseBenchmarkResult;
  warmResult: QueryPhaseBenchmarkResult;
  queryDetails?: QueryLevelBenchmarkItem[];
}> {
  const warmupIterations = options.warmupIterations ?? 2;
  const measuredIterations = options.measuredIterations ?? 5;

  const parser = createQueryParser();
  const retriever = createCandidateRetriever(index);
  const ranking = createRankingEngine(index);
  const generator = createResultGenerator();

  function executeQuery(rawQuery: string): { hitCount: number; durationMs: number } {
    const t0 = performance.now();
    const parsed = parser.parse(rawQuery);
    const retrieved = retriever.retrieve(parsed);
    const ranked = ranking.rank(parsed, retrieved.candidates);
    const results = generator.generateResults(parsed, ranked.hits, {
      pagination: { page: 1, pageSize: 10 },
    });
    const durationMs = performance.now() - t0;
    return { hitCount: results.pagination.totalHits, durationMs };
  }

  // ── 1. Cold Query Run Phase ──────────────────────────────────────────────
  const coldMemBefore = getMemorySnapshot();
  const coldLatencies: number[] = [];
  const coldQueryMap = new Map<string, { latency: number; hits: number }>();

  const coldStart = performance.now();
  for (const q of queries) {
    const exec = executeQuery(q);
    coldLatencies.push(exec.durationMs);
    coldQueryMap.set(q, { latency: exec.durationMs, hits: exec.hitCount });
  }
  const coldTotalDurationMs = performance.now() - coldStart;
  const coldMemAfter = getMemorySnapshot();

  const coldThroughputQps =
    coldTotalDurationMs > 0 ? Math.round((queries.length / (coldTotalDurationMs / 1000)) * 10) / 10 : 0;

  const coldResult: QueryPhaseBenchmarkResult = {
    queryCount: queries.length,
    totalExecutions: queries.length,
    durationMs: Math.round(coldTotalDurationMs * 100) / 100,
    throughputQps: coldThroughputQps,
    latencies: calculateDistribution(coldLatencies),
    memoryDeltaMb: Math.round((coldMemAfter.heapUsedMb - coldMemBefore.heapUsedMb) * 100) / 100,
  };

  // ── 2. JIT Warmup ────────────────────────────────────────────────────────
  for (let w = 0; w < warmupIterations; w++) {
    for (const q of queries) {
      executeQuery(q);
    }
  }

  // ── 3. Warm Query Run Phase ──────────────────────────────────────────────
  const warmMemBefore = getMemorySnapshot();
  const warmLatencies: number[] = [];
  const queryWarmLatencies = new Map<string, number[]>();

  for (const q of queries) {
    queryWarmLatencies.set(q, []);
  }

  const warmStart = performance.now();
  for (let iter = 0; iter < measuredIterations; iter++) {
    for (const q of queries) {
      const exec = executeQuery(q);
      warmLatencies.push(exec.durationMs);
      queryWarmLatencies.get(q)!.push(exec.durationMs);
    }
  }
  const warmTotalDurationMs = performance.now() - warmStart;
  const warmMemAfter = getMemorySnapshot();

  const totalWarmExecutions = queries.length * measuredIterations;
  const warmThroughputQps =
    warmTotalDurationMs > 0 ? Math.round((totalWarmExecutions / (warmTotalDurationMs / 1000)) * 10) / 10 : 0;

  const warmResult: QueryPhaseBenchmarkResult = {
    queryCount: queries.length,
    totalExecutions: totalWarmExecutions,
    durationMs: Math.round(warmTotalDurationMs * 100) / 100,
    throughputQps: warmThroughputQps,
    latencies: calculateDistribution(warmLatencies),
    memoryDeltaMb: Math.round((warmMemAfter.heapUsedMb - warmMemBefore.heapUsedMb) * 100) / 100,
  };

  // ── 4. Query-Level Details ───────────────────────────────────────────────
  let queryDetails: QueryLevelBenchmarkItem[] | undefined;
  if (options.recordQueryLevelDetails) {
    queryDetails = queries.map(q => {
      const coldInfo = coldQueryMap.get(q) || { latency: 0, hits: 0 };
      const warmLats = queryWarmLatencies.get(q) || [];
      const dist = calculateDistribution(warmLats);
      return {
        query: q,
        coldLatencyMs: Math.round(coldInfo.latency * 100) / 100,
        warmP50Ms: dist.p50Ms,
        totalHits: coldInfo.hits,
      };
    });
  }

  return {
    coldResult,
    warmResult,
    queryDetails,
  };
}

/**
 * Executes an end-to-end performance benchmark.
 */
export async function runBenchmark(options: BenchmarkHarnessOptions = {}): Promise<BenchmarkReport> {
  const env = captureEnvironment();

  // Load fixed corpus documents
  const demoCorpus = getDemoCorpus();
  const documents = options.documentCount ? demoCorpus.slice(0, options.documentCount) : demoCorpus;

  const queries = options.customQueries || REPEATABLE_BENCHMARK_QUERIES;

  // 1. Indexing Phase Benchmark
  const { result: indexingResult, index } = await benchmarkIndexingPhase(documents, options.corpusTier || 'demo');

  // 2. Query Phases Benchmark (Cold vs Warm)
  const { coldResult, warmResult, queryDetails } = await benchmarkQueryPhases(index, queries, {
    warmupIterations: options.warmupIterations,
    measuredIterations: options.measuredIterations,
    recordQueryLevelDetails: options.recordQueryLevelDetails ?? true,
  });

  return {
    benchmarkId: `bench-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    timestamp: new Date().toISOString(),
    environment: env,
    methodology: {
      fixedCorpusVersion: FIXED_BENCHMARK_CORPUS_VERSION,
      fixedQuerySetVersion: BENCHMARK_QUERY_SET_VERSION,
      coldRunDefinition:
        'Single sequential dispatch across all benchmark queries on cold JIT caches with unbuffered posting lists.',
      warmRunDefinition:
        'Repeated steady-state executions following JIT warmup iterations across identical queries.',
      warmupIterations: options.warmupIterations ?? 2,
      measuredIterations: options.measuredIterations ?? 5,
      separatedPhases: true,
    },
    indexingPhase: indexingResult,
    coldQueryPhase: coldResult,
    warmQueryPhase: warmResult,
    queryLevelDetails: queryDetails,
  };
}

/**
 * Serializes benchmark report to JSON.
 */
export function exportBenchmarkJson(report: BenchmarkReport): string {
  return JSON.stringify(report, null, 2);
}

/**
 * Exports benchmark report to Markdown.
 */
export function exportBenchmarkMarkdown(report: BenchmarkReport): string {
  const env = report.environment;
  const idx = report.indexingPhase;
  const cold = report.coldQueryPhase;
  const warm = report.warmQueryPhase;

  const lines: string[] = [
    `# OpenSearch Performance Benchmark Report`,
    ``,
    `**Benchmark ID:** \`${report.benchmarkId}\`  `,
    `**Timestamp:** ${report.timestamp}  `,
    `**System Engine:** ${PROJECT_NAME} v${env.openSearchVersion}  `,
    ``,
    `## 1. Hardware & Runtime Environment`,
    `| Attribute | Value |`,
    `| :--- | :--- |`,
    `| **OS Platform** | \`${env.platform}\` (${env.release}, ${env.arch}) |`,
    `| **CPU Model** | ${env.cpuModel} |`,
    `| **CPU Cores / Speed** | ${env.cpuCores} cores @ ${env.cpuSpeedMhz} MHz |`,
    `| **System Memory** | ${env.totalMemoryMb} MB total (${env.freeMemoryMb} MB free) |`,
    `| **Node.js Runtime** | \`${env.nodeVersion}\` (V8: \`${env.v8Version}\`) |`,
    ``,
    `## 2. Methodology & Invariants`,
    `- **Fixed Corpus Version:** \`${report.methodology.fixedCorpusVersion}\` (${idx.documentCount} documents)`,
    `- **Fixed Query Set:** \`${report.methodology.fixedQuerySetVersion}\` (${cold.queryCount} queries)`,
    `- **Phase Separation:** Indexing build time is measured strictly isolated from query latency.`,
    `- **Cold Query Run:** ${report.methodology.coldRunDefinition}`,
    `- **Warm Query Run:** ${report.methodology.warmRunDefinition} (${report.methodology.measuredIterations} iterations measured)`,
    ``,
    `## 3. Indexing Phase Benchmarks`,
    `| Metric | Result |`,
    `| :--- | :--- |`,
    `| **Corpus Document Count** | ${idx.documentCount.toLocaleString()} docs |`,
    `| **Corpus Raw Text Size** | ${idx.corpusSizeMb} MB (${idx.corpusSizeBytes.toLocaleString()} bytes) |`,
    `| **Build Duration** | **${idx.buildDurationMs} ms** |`,
    `| **Build Throughput** | **${idx.buildRateDocsPerSec.toLocaleString()} docs/sec** (${idx.buildRateMbPerSec} MB/sec) |`,
    `| **Serialized Index Size** | **${idx.indexSizeMb} MB** (${idx.indexSizeBytes.toLocaleString()} bytes) |`,
    `| **Vocabulary Term Count** | ${idx.vocabularyTermCount.toLocaleString()} unique terms |`,
    `| **Total Postings** | ${idx.postingCount.toLocaleString()} postings |`,
    `| **Cold Startup / Load Time** | **${idx.startupDurationMs} ms** |`,
    `| **Memory Delta (Heap)** | ${idx.memoryDeltaMb >= 0 ? '+' : ''}${idx.memoryDeltaMb} MB |`,
    ``,
    `## 4. Query Latency & Throughput Distribution`,
    `| Metric | Cold Run | Warm Run (Steady-State) | Unit |`,
    `| :--- | :--- | :--- | :--- |`,
    `| **Throughput (QPS)** | **${cold.throughputQps}** | **${warm.throughputQps}** | queries/sec |`,
    `| **Min Latency** | ${cold.latencies.minMs} | ${warm.latencies.minMs} | ms |`,
    `| **p50 Latency (Median)** | **${cold.latencies.p50Ms}** | **${warm.latencies.p50Ms}** | ms |`,
    `| **p90 Latency** | ${cold.latencies.p90Ms} | ${warm.latencies.p90Ms} | ms |`,
    `| **p95 Latency** | **${cold.latencies.p95Ms}** | **${warm.latencies.p95Ms}** | ms |`,
    `| **p99 Latency** | **${cold.latencies.p99Ms}** | **${warm.latencies.p99Ms}** | ms |`,
    `| **Max Latency** | ${cold.latencies.maxMs} | ${warm.latencies.maxMs} | ms |`,
    `| **Mean Latency** | ${cold.latencies.meanMs} | ${warm.latencies.meanMs} | ms |`,
    `| **Std Deviation** | ±${cold.latencies.stdDevMs} | ±${warm.latencies.stdDevMs} | ms |`,
    ``,
  ];

  if (report.queryLevelDetails && report.queryLevelDetails.length > 0) {
    lines.push(`## 5. Sample Query Latencies`);
    lines.push(`| Query | Cold Latency | Warm p50 | Hits |`);
    lines.push(`| :--- | :--- | :--- | :--- |`);
    for (const item of report.queryLevelDetails.slice(0, 10)) {
      lines.push(`| "${item.query}" | ${item.coldLatencyMs} ms | ${item.warmP50Ms} ms | ${item.totalHits} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
