/**
 * @opensearch/shared — Operational Metrics Subsystem (Phase 113)
 *
 * Provides a low-cardinality, privacy-safe, zero-dependency metrics registry
 * supporting Counter, Gauge, and Histogram metrics serialized in standard
 * Prometheus text exposition format (0.0.4).
 */

export * from './types.js';
export * from './privacy-guards.js';
export * from './registry.js';
