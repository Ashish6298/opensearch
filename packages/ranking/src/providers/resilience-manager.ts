/**
 * @opensearch/ranking — Search Provider Resilience & Error Sanitization (Phase 71)
 *
 * Provides enterprise-grade resilience mechanisms for federated search:
 * - Exponential backoff with random jitter for transient retries.
 * - HTTP 429 and Retry-After header tracking and cooldown.
 * - Circuit breaker to halt retry storms against degraded upstreams.
 * - Meaningful, user-friendly error sanitization without exposing internal traces or paths.
 */

import { ProviderErrorCode } from './provider-types.js';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface ProviderCircuitStatus {
  state: CircuitState;
  consecutiveFailures: number;
  lastFailureMs: number;
  cooldownUntilMs: number;
}

export interface ResilienceManagerOptions {
  circuitFailureThreshold?: number;
  circuitCooldownMs?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  jitterMs?: number;
}

export class ResilienceManager {
  private readonly failureThreshold: number;
  private readonly circuitCooldownMs: number;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly jitterMs: number;

  private readonly circuits = new Map<string, ProviderCircuitStatus>();
  private readonly rateLimits = new Map<string, number>(); // providerId -> resetAtMs

  constructor(options: ResilienceManagerOptions = {}) {
    this.failureThreshold = options.circuitFailureThreshold ?? 3;
    this.circuitCooldownMs = options.circuitCooldownMs ?? 30000;
    this.baseBackoffMs = options.baseBackoffMs ?? 100;
    this.maxBackoffMs = options.maxBackoffMs ?? 2000;
    this.jitterMs = options.jitterMs ?? 50;
  }

  /**
   * Checks whether a provider is permitted to execute, evaluating both
   * the circuit breaker and any active Retry-After cooldown.
   */
  public canExecute(providerId: string): {
    allowed: boolean;
    reason?: 'CIRCUIT_OPEN' | 'RATE_LIMITED';
    retryAfterSeconds?: number;
  } {
    const id = providerId.toLowerCase().trim();
    const now = Date.now();

    // 1. Check Rate Limit Cooldown
    const rateLimitReset = this.rateLimits.get(id);
    if (rateLimitReset && now < rateLimitReset) {
      const remainingSeconds = Math.max(1, Math.ceil((rateLimitReset - now) / 1000));
      return {
        allowed: false,
        reason: 'RATE_LIMITED',
        retryAfterSeconds: remainingSeconds,
      };
    } else if (rateLimitReset) {
      this.rateLimits.delete(id);
    }

    // 2. Check Circuit Breaker
    const circuit = this.circuits.get(id);
    if (!circuit || circuit.state === 'CLOSED') {
      return { allowed: true };
    }

    if (circuit.state === 'OPEN') {
      if (now >= circuit.cooldownUntilMs) {
        // Transition to HALF_OPEN to allow one trial request
        circuit.state = 'HALF_OPEN';
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: 'CIRCUIT_OPEN',
        retryAfterSeconds: Math.max(1, Math.ceil((circuit.cooldownUntilMs - now) / 1000)),
      };
    }

    // HALF_OPEN allows the execution
    return { allowed: true };
  }

  /**
   * Records a successful execution, resetting circuit breaker counters.
   */
  public recordSuccess(providerId: string): void {
    const id = providerId.toLowerCase().trim();
    this.circuits.set(id, {
      state: 'CLOSED',
      consecutiveFailures: 0,
      lastFailureMs: 0,
      cooldownUntilMs: 0,
    });
  }

  /**
   * Records an execution failure, potentially tripping the circuit breaker.
   */
  public recordFailure(providerId: string, errorCode?: ProviderErrorCode): void {
    const id = providerId.toLowerCase().trim();
    const now = Date.now();

    // Do not trip circuit breaker on user cancellations or manual disables
    if (errorCode === 'CANCELLED' || errorCode === 'DISABLED') {
      return;
    }

    const current = this.circuits.get(id) || {
      state: 'CLOSED',
      consecutiveFailures: 0,
      lastFailureMs: 0,
      cooldownUntilMs: 0,
    };

    current.consecutiveFailures++;
    current.lastFailureMs = now;

    if (current.consecutiveFailures >= this.failureThreshold || current.state === 'HALF_OPEN') {
      current.state = 'OPEN';
      current.cooldownUntilMs = now + this.circuitCooldownMs;
    }

    this.circuits.set(id, current);
  }

  /**
   * Sets rate limit cooldown from Retry-After header or provider indicator.
   */
  public setRateLimit(providerId: string, retryAfterSeconds: number): void {
    const id = providerId.toLowerCase().trim();
    const safeSeconds = Math.max(1, retryAfterSeconds);
    this.rateLimits.set(id, Date.now() + safeSeconds * 1000);
  }

  /**
   * Computes exponential backoff with random jitter.
   */
  public calculateBackoff(attempt: number): number {
    const exponential = this.baseBackoffMs * Math.pow(2, attempt);
    const capped = Math.min(this.maxBackoffMs, exponential);
    const jitter = Math.floor(Math.random() * this.jitterMs);
    return capped + jitter;
  }

  /**
   * Determines if a failure is transient and eligible for retry.
   */
  public isTransient(errorCode?: ProviderErrorCode): boolean {
    return (
      errorCode === 'TIMEOUT' ||
      errorCode === 'UPSTREAM_ERROR' ||
      errorCode === 'NETWORK_ERROR'
    );
  }

  /**
   * Classifies an arbitrary thrown error or status into standardized ProviderErrorCode.
   */
  public classifyError(err: any): ProviderErrorCode {
    if (!err) return 'UPSTREAM_ERROR';

    const msg = typeof err === 'string' ? err : err.message || '';
    const name = err?.name || '';
    const status = err?.status || err?.statusCode;

    if (status === 429 || /429|rate limit|too many requests/i.test(msg)) {
      return 'RATE_LIMITED';
    }

    if (
      status >= 500 ||
      /500|502|503|504|internal server error|bad gateway|service unavailable/i.test(msg)
    ) {
      return 'UPSTREAM_ERROR';
    }

    if (
      name === 'TimeoutError' ||
      /timeout|timed out|search deadline exceeded/i.test(msg)
    ) {
      return 'TIMEOUT';
    }

    if (
      name === 'AbortError' ||
      /aborted|cancelled|canceled/i.test(msg)
    ) {
      return 'CANCELLED';
    }

    if (
      /oversize|oversized|payload too large|max payload|response.*exceed|exceeded.*size/i.test(msg)
    ) {
      return 'OVERSIZED_RESPONSE';
    }

    if (
      err instanceof SyntaxError ||
      /invalid json|json parse|unexpected token/i.test(msg)
    ) {
      return 'INVALID_RESPONSE';
    }

    if (
      /network|offline|econnrefused|enotfound|fetch failed/i.test(msg)
    ) {
      return 'NETWORK_ERROR';
    }

    if (/disabled/i.test(msg)) {
      return 'DISABLED';
    }

    return 'UPSTREAM_ERROR';
  }

  /**
   * Produces a clean, user-friendly, non-leaking explanation for end users.
   */
  public sanitizeErrorMessage(code: ProviderErrorCode, fallback = ''): string {
    switch (code) {
      case 'TIMEOUT':
        return 'The search provider did not respond within the allocated time limit.';
      case 'RATE_LIMITED':
        return 'The search provider rate limit was reached. Cooldown initiated.';
      case 'UPSTREAM_ERROR':
        return 'The upstream provider encountered a temporary service disruption.';
      case 'NETWORK_ERROR':
        return 'Unable to reach the search provider due to an offline or network error.';
      case 'INVALID_RESPONSE':
        return 'The provider returned an unrecognized or corrupted data format.';
      case 'OVERSIZED_RESPONSE':
        return 'The provider response exceeded the maximum permitted size limit.';
      case 'CANCELLED':
        return 'The search request was cancelled.';
      case 'CIRCUIT_OPEN':
        return 'Provider temporarily suspended to protect against upstream failure storms.';
      case 'DISABLED':
        return 'The search provider is currently disabled.';
      default:
        return fallback || 'A temporary error occurred while querying the search provider.';
    }
  }

  /**
   * Returns active circuit status for a provider if tracked.
   */
  public getCircuitStatus(providerId: string): ProviderCircuitStatus | undefined {
    return this.circuits.get(providerId.toLowerCase().trim());
  }

  /**
   * Resets all circuit states and rate limit timers (for testing).
   */
  public reset(): void {
    this.circuits.clear();
    this.rateLimits.clear();
  }
}
