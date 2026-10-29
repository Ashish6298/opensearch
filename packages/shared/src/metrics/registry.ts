/**
 * @opensearch/shared — In-Memory Prometheus-Compatible Metrics Registry (Phase 113)
 *
 * Implements an in-memory, zero-dependency, privacy-preserving metric collector.
 * Automatically validates low-cardinality label constraints and formats output
 * to standard Prometheus text exposition format (version 0.0.4).
 */

import {
  CounterMetric,
  GaugeMetric,
  HistogramBucket,
  HistogramMetric,
  HistogramRecord,
  MetricDefinition,
  MetricLabels,
  MetricsRegistrySnapshot,
  MetricValueRecord,
} from './types.js';
import { validateMetricLabels } from './privacy-guards.js';

export const DEFAULT_LATENCY_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
];

export const DEFAULT_COUNT_BUCKETS = [
  0, 1, 5, 10, 20, 50, 100,
];

function serializeLabelKey(labels: MetricLabels): string {
  const keys = Object.keys(labels).sort();
  return keys.map(k => `${k}=${labels[k]}`).join(',');
}

function formatLabelsForPrometheus(labels: MetricLabels): string {
  const keys = Object.keys(labels);
  if (keys.length === 0) return '';
  const pairs = keys.map(k => {
    const val = String(labels[k]).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
    return `${k}="${val}"`;
  });
  return `{${pairs.join(',')}}`;
}

class CounterImpl implements CounterMetric {
  private values = new Map<string, { labels: MetricLabels; value: number }>();

  constructor(readonly definition: MetricDefinition) {}

  inc(labelsOrValue?: MetricLabels | number, maybeValue?: number): void {
    let labels: MetricLabels = {};
    let incValue = 1;

    if (typeof labelsOrValue === 'number') {
      incValue = labelsOrValue;
    } else if (labelsOrValue && typeof labelsOrValue === 'object') {
      labels = validateMetricLabels(labelsOrValue, this.definition.name);
      if (typeof maybeValue === 'number') {
        incValue = maybeValue;
      }
    }

    if (incValue < 0) {
      throw new Error(`Counter "${this.definition.name}" cannot be incremented by a negative value: ${incValue}`);
    }

    const key = serializeLabelKey(labels);
    const existing = this.values.get(key);
    if (existing) {
      existing.value += incValue;
    } else {
      this.values.set(key, { labels, value: incValue });
    }
  }

  get(labels: MetricLabels = {}): number {
    const validated = validateMetricLabels(labels, this.definition.name);
    const key = serializeLabelKey(validated);
    return this.values.get(key)?.value ?? 0;
  }

  reset(): void {
    this.values.clear();
  }

  getRecords(): MetricValueRecord[] {
    return Array.from(this.values.values()).map(r => ({
      labels: { ...r.labels },
      value: r.value,
    }));
  }
}

class GaugeImpl implements GaugeMetric {
  private values = new Map<string, { labels: MetricLabels; value: number }>();

  constructor(readonly definition: MetricDefinition) {}

  set(labelsOrValue: MetricLabels | number, maybeValue?: number): void {
    let labels: MetricLabels = {};
    let value = 0;

    if (typeof labelsOrValue === 'number') {
      value = labelsOrValue;
    } else if (labelsOrValue && typeof labelsOrValue === 'object') {
      labels = validateMetricLabels(labelsOrValue, this.definition.name);
      value = typeof maybeValue === 'number' ? maybeValue : 0;
    }

    const key = serializeLabelKey(labels);
    this.values.set(key, { labels, value });
  }

  inc(labels?: MetricLabels, value = 1): void {
    const validated = labels ? validateMetricLabels(labels, this.definition.name) : {};
    const key = serializeLabelKey(validated);
    const existing = this.values.get(key);
    if (existing) {
      existing.value += value;
    } else {
      this.values.set(key, { labels: validated, value });
    }
  }

  dec(labels?: MetricLabels, value = 1): void {
    this.inc(labels, -value);
  }

  get(labels: MetricLabels = {}): number {
    const validated = validateMetricLabels(labels, this.definition.name);
    const key = serializeLabelKey(validated);
    return this.values.get(key)?.value ?? 0;
  }

  reset(): void {
    this.values.clear();
  }

  getRecords(): MetricValueRecord[] {
    return Array.from(this.values.values()).map(r => ({
      labels: { ...r.labels },
      value: r.value,
    }));
  }
}

class HistogramImpl implements HistogramMetric {
  readonly bucketUpperBounds: number[];
  private records = new Map<
    string,
    { labels: MetricLabels; count: number; sum: number; buckets: Map<number, number> }
  >();

  constructor(
    readonly definition: MetricDefinition,
    buckets: number[] = DEFAULT_LATENCY_BUCKETS,
  ) {
    this.bucketUpperBounds = Array.from(new Set(buckets)).sort((a, b) => a - b);
  }

  observe(labelsOrValue: MetricLabels | number, maybeValue?: number): void {
    let labels: MetricLabels = {};
    let value = 0;

    if (typeof labelsOrValue === 'number') {
      value = labelsOrValue;
    } else if (labelsOrValue && typeof labelsOrValue === 'object') {
      labels = validateMetricLabels(labelsOrValue, this.definition.name);
      value = typeof maybeValue === 'number' ? maybeValue : 0;
    }

    const key = serializeLabelKey(labels);
    let record = this.records.get(key);
    if (!record) {
      const bucketMap = new Map<number, number>();
      for (const b of this.bucketUpperBounds) {
        bucketMap.set(b, 0);
      }
      record = { labels, count: 0, sum: 0, buckets: bucketMap };
      this.records.set(key, record);
    }

    record.count++;
    record.sum += value;

    for (const bound of this.bucketUpperBounds) {
      if (value <= bound) {
        record.buckets.set(bound, (record.buckets.get(bound) || 0) + 1);
      }
    }
  }

  reset(): void {
    this.records.clear();
  }

  getRecords(): HistogramRecord[] {
    return Array.from(this.records.values()).map(r => {
      const buckets: HistogramBucket[] = [];
      for (const bound of this.bucketUpperBounds) {
        buckets.push({ le: bound, count: r.buckets.get(bound) || 0 });
      }
      return {
        labels: { ...r.labels },
        count: r.count,
        sum: r.sum,
        buckets,
      };
    });
  }
}

export class MetricsRegistry {
  private counters = new Map<string, CounterImpl>();
  private gauges = new Map<string, GaugeImpl>();
  private histograms = new Map<string, HistogramImpl>();

  counter(name: string, help: string, labelNames: string[] = []): CounterMetric {
    let existing = this.counters.get(name);
    if (!existing) {
      existing = new CounterImpl({ name, help, type: 'counter', labelNames });
      this.counters.set(name, existing);
    }
    return existing;
  }

  gauge(name: string, help: string, labelNames: string[] = []): GaugeMetric {
    let existing = this.gauges.get(name);
    if (!existing) {
      existing = new GaugeImpl({ name, help, type: 'gauge', labelNames });
      this.gauges.set(name, existing);
    }
    return existing;
  }

  histogram(
    name: string,
    help: string,
    labelNames: string[] = [],
    buckets: number[] = DEFAULT_LATENCY_BUCKETS,
  ): HistogramMetric {
    let existing = this.histograms.get(name);
    if (!existing) {
      existing = new HistogramImpl(
        { name, help, type: 'histogram', labelNames },
        buckets,
      );
      this.histograms.set(name, existing);
    }
    return existing;
  }

  getSnapshot(): MetricsRegistrySnapshot {
    const snapshot: MetricsRegistrySnapshot = {
      timestamp: new Date().toISOString(),
      counters: {},
      gauges: {},
      histograms: {},
    };

    for (const [name, counter] of this.counters.entries()) {
      snapshot.counters[name] = counter.getRecords();
    }
    for (const [name, gauge] of this.gauges.entries()) {
      snapshot.gauges[name] = gauge.getRecords();
    }
    for (const [name, hist] of this.histograms.entries()) {
      snapshot.histograms[name] = hist.getRecords();
    }

    return snapshot;
  }

  reset(): void {
    for (const counter of this.counters.values()) counter.reset();
    for (const gauge of this.gauges.values()) gauge.reset();
    for (const hist of this.histograms.values()) hist.reset();
  }

  toPrometheusFormat(): string {
    const lines: string[] = [];

    // 1. Counters
    for (const [name, counter] of this.counters.entries()) {
      const records = counter.getRecords();
      lines.push(`# HELP ${name} ${counter.definition.help}`);
      lines.push(`# TYPE ${name} counter`);
      if (records.length === 0) {
        lines.push(`${name} 0`);
      } else {
        for (const rec of records) {
          const labelStr = formatLabelsForPrometheus(rec.labels);
          lines.push(`${name}${labelStr} ${rec.value}`);
        }
      }
    }

    // 2. Gauges
    for (const [name, gauge] of this.gauges.entries()) {
      const records = gauge.getRecords();
      lines.push(`# HELP ${name} ${gauge.definition.help}`);
      lines.push(`# TYPE ${name} gauge`);
      if (records.length === 0) {
        lines.push(`${name} 0`);
      } else {
        for (const rec of records) {
          const labelStr = formatLabelsForPrometheus(rec.labels);
          lines.push(`${name}${labelStr} ${rec.value}`);
        }
      }
    }

    // 3. Histograms
    for (const [name, hist] of this.histograms.entries()) {
      const records = hist.getRecords();
      lines.push(`# HELP ${name} ${hist.definition.help}`);
      lines.push(`# TYPE ${name} histogram`);
      if (records.length === 0) {
        lines.push(`${name}_count 0`);
        lines.push(`${name}_sum 0`);
      } else {
        for (const rec of records) {
          // Buckets
          for (const b of rec.buckets) {
            const labelsWithLe: MetricLabels = { ...rec.labels, le: b.le };
            const labelStr = formatLabelsForPrometheus(labelsWithLe);
            lines.push(`${name}_bucket${labelStr} ${b.count}`);
          }
          // +Inf bucket
          const labelsWithInf: MetricLabels = { ...rec.labels, le: '+Inf' };
          const infLabelStr = formatLabelsForPrometheus(labelsWithInf);
          lines.push(`${name}_bucket${infLabelStr} ${rec.count}`);

          // Sum and Count
          const labelStr = formatLabelsForPrometheus(rec.labels);
          lines.push(`${name}_sum${labelStr} ${rec.sum}`);
          lines.push(`${name}_count${labelStr} ${rec.count}`);
        }
      }
    }

    return lines.join('\n') + '\n';
  }
}

// Global default singleton registry
let defaultRegistry: MetricsRegistry | undefined;

export function getDefaultRegistry(): MetricsRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new MetricsRegistry();
  }
  return defaultRegistry;
}

export function resetDefaultRegistry(): void {
  if (defaultRegistry) {
    defaultRegistry.reset();
  }
}
