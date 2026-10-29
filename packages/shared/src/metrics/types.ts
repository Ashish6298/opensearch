/**
 * @opensearch/shared — Operational Metrics Contracts & Types (Phase 113)
 *
 * Defines low-cardinality, privacy-safe metric definitions, labels, and exposition models.
 * Strictly guarantees zero collection of raw user queries, IPs, or user identifiers.
 */

export type MetricType = 'counter' | 'gauge' | 'histogram';

export type MetricLabels = Record<string, string | number>;

export interface MetricDefinition {
  name: string;
  help: string;
  type: MetricType;
  labelNames?: string[];
}

export interface MetricValueRecord {
  labels: MetricLabels;
  value: number;
  timestamp?: number;
}

export interface HistogramBucket {
  le: number;
  count: number;
}

export interface HistogramRecord {
  labels: MetricLabels;
  count: number;
  sum: number;
  buckets: HistogramBucket[];
}

export interface CounterMetric {
  readonly definition: MetricDefinition;
  inc(labels?: MetricLabels, value?: number): void;
  get(labels?: MetricLabels): number;
  reset(): void;
  getRecords(): MetricValueRecord[];
}

export interface GaugeMetric {
  readonly definition: MetricDefinition;
  set(value: number): void;
  set(labels: MetricLabels, value: number): void;
  inc(labels?: MetricLabels, value?: number): void;
  dec(labels?: MetricLabels, value?: number): void;
  get(labels?: MetricLabels): number;
  reset(): void;
  getRecords(): MetricValueRecord[];
}

export interface HistogramMetric {
  readonly definition: MetricDefinition;
  observe(value: number): void;
  observe(labels: MetricLabels, value: number): void;
  reset(): void;
  getRecords(): HistogramRecord[];
  readonly bucketUpperBounds: number[];
}

export interface MetricsRegistrySnapshot {
  timestamp: string;
  counters: Record<string, MetricValueRecord[]>;
  gauges: Record<string, MetricValueRecord[]>;
  histograms: Record<string, HistogramRecord[]>;
}
