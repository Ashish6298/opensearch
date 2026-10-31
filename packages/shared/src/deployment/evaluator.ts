/**
 * @opensearch/shared — Deployment Architecture Evaluator (Phase 118)
 *
 * Implements authoritative evaluation of hosting modes, storage durability,
 * serverless execution limitations, process-memory rate limit scopes, and
 * zero-cost / zero-secret invariants.
 */

import * as os from 'node:os';
import * as path from 'node:path';
import {
  DeploymentArchitectureEvaluation,
  DeploymentPlatform,
  DeploymentTier,
  PlatformCapabilities,
  RateLimiterScope,
  StorageDurabilityMode,
  SUPPORTED_DEPLOYMENT_MODES,
  SupportedDeploymentMode,
} from './types.js';

/**
 * Known ephemeral directories across Linux, macOS, and Windows.
 */
function getKnownEphemeralPrefixes(): string[] {
  const prefixes = ['/tmp', '/var/tmp', '/dev/shm'];
  try {
    const tmp = os.tmpdir();
    if (tmp) {
      prefixes.push(path.resolve(tmp));
    }
  } catch {
    // Ignore fallback
  }
  return prefixes;
}

/**
 * Checks whether a given directory path is located in an ephemeral temporary filesystem.
 */
export function isEphemeralStoragePath(storageDir: string): boolean {
  if (!storageDir) return true;
  const rawNormalized = storageDir.toLowerCase().replace(/\\/g, '/');
  const resolved = path.resolve(storageDir);
  const normalized = resolved.toLowerCase().replace(/\\/g, '/');

  // Direct POSIX ephemeral mount points
  const posixEphemeral = ['/tmp', '/var/tmp', '/dev/shm'];
  for (const p of posixEphemeral) {
    if (
      rawNormalized === p ||
      rawNormalized.startsWith(`${p}/`) ||
      normalized.includes(p)
    ) {
      return true;
    }
  }

  const ephemeralPrefixes = getKnownEphemeralPrefixes().map(p =>
    p.toLowerCase().replace(/\\/g, '/'),
  );

  for (const prefix of ephemeralPrefixes) {
    if (normalized === prefix || normalized.startsWith(`${prefix}/`)) {
      return true;
    }
  }

  // Heuristic pattern match for temporary folders
  if (normalized.includes('/temp/') || normalized.includes('/tmp/')) {
    return true;
  }

  return false;
}

/**
 * Detects the runtime hosting platform based on environment variables and filesystem probes.
 */
export function detectRuntimePlatform(
  sourceEnv: Record<string, string | undefined> = process.env,
): DeploymentPlatform {
  if (sourceEnv.AWS_LAMBDA_FUNCTION_NAME || sourceEnv.LAMBDA_TASK_ROOT) {
    return 'aws-lambda';
  }
  if (sourceEnv.VERCEL || sourceEnv.VERCEL_ENV) {
    return 'vercel';
  }
  if (sourceEnv.NETLIFY || sourceEnv.NETLIFY_IMAGES_CDN_DOMAIN) {
    return 'netlify';
  }
  if (sourceEnv.K_SERVICE || (sourceEnv.GOOGLE_CLOUD_PROJECT && sourceEnv.PORT)) {
    return 'google-cloud-run';
  }
  if (
    sourceEnv.DOCKER_CONTAINER ||
    sourceEnv.IS_DOCKER ||
    sourceEnv.CONTAINER === 'docker' ||
    sourceEnv.KUBERNETES_SERVICE_HOST
  ) {
    return 'docker-container';
  }
  return 'workstation';
}

/**
 * Resolves the active deployment mode from environment or detected platform.
 */
export function resolveDeploymentMode(
  sourceEnv: Record<string, string | undefined> = process.env,
): SupportedDeploymentMode {
  const explicit =
    sourceEnv.DEPLOYMENT_MODE ||
    sourceEnv.OPENSEARCH_DEPLOYMENT_MODE ||
    sourceEnv.DEPLOYMENT_MODEL;

  if (explicit) {
    const norm = explicit.trim().toLowerCase();
    if (norm === 'local-first' || norm === 'desktop' || norm === 'local') {
      return SUPPORTED_DEPLOYMENT_MODES.LOCAL_FIRST;
    }
    if (norm === 'self-hosted' || norm === 'standalone' || norm === 'vps' || norm === 'docker') {
      return SUPPORTED_DEPLOYMENT_MODES.SELF_HOSTED;
    }
    if (norm === 'serverless' || norm === 'lambda' || norm === 'edge') {
      return SUPPORTED_DEPLOYMENT_MODES.SERVERLESS;
    }
    if (norm === 'cluster' || norm === 'distributed') {
      return SUPPORTED_DEPLOYMENT_MODES.CLUSTER;
    }
  }

  // Auto-detect based on platform if unspecified
  const platform = detectRuntimePlatform(sourceEnv);
  if (
    platform === 'aws-lambda' ||
    platform === 'vercel' ||
    platform === 'netlify' ||
    platform === 'generic-serverless'
  ) {
    return SUPPORTED_DEPLOYMENT_MODES.SERVERLESS;
  }

  // If in production, default to self-hosted; otherwise local-first
  const isProd = sourceEnv.NODE_ENV === 'production';
  return isProd
    ? SUPPORTED_DEPLOYMENT_MODES.SELF_HOSTED
    : SUPPORTED_DEPLOYMENT_MODES.LOCAL_FIRST;
}

/**
 * Returns the capability profile for a given deployment mode.
 */
export function getPlatformCapabilities(mode: SupportedDeploymentMode): PlatformCapabilities {
  switch (mode) {
    case SUPPORTED_DEPLOYMENT_MODES.LOCAL_FIRST:
      return {
        storageDurability: 'durable',
        backgroundTasksSupported: true,
        continuousCrawlingSupported: true,
        globalRateLimitGuaranteed: true,
        requiresExternalSharedStore: false,
        zeroPaidDependencies: true,
        zeroSecretsRequired: true,
        zeroPaidDomainsRequired: true,
        localPathAvailable: true,
      };

    case SUPPORTED_DEPLOYMENT_MODES.SELF_HOSTED:
      return {
        storageDurability: 'durable',
        backgroundTasksSupported: true,
        continuousCrawlingSupported: true,
        globalRateLimitGuaranteed: true,
        requiresExternalSharedStore: false,
        zeroPaidDependencies: true,
        zeroSecretsRequired: true,
        zeroPaidDomainsRequired: true,
        localPathAvailable: true,
      };

    case SUPPORTED_DEPLOYMENT_MODES.SERVERLESS:
      return {
        storageDurability: 'ephemeral',
        backgroundTasksSupported: false,
        continuousCrawlingSupported: false,
        globalRateLimitGuaranteed: false,
        requiresExternalSharedStore: true,
        zeroPaidDependencies: true,
        zeroSecretsRequired: true,
        zeroPaidDomainsRequired: true,
        localPathAvailable: true,
      };

    case SUPPORTED_DEPLOYMENT_MODES.CLUSTER:
      return {
        storageDurability: 'hybrid-external',
        backgroundTasksSupported: true,
        continuousCrawlingSupported: true,
        globalRateLimitGuaranteed: false,
        requiresExternalSharedStore: true,
        zeroPaidDependencies: true,
        zeroSecretsRequired: true,
        zeroPaidDomainsRequired: true,
        localPathAvailable: true,
      };
  }
}

export interface DeploymentEvaluationOptions {
  mode?: SupportedDeploymentMode | string;
  storageDir?: string;
  env?: Record<string, string | undefined>;
  isProduction?: boolean;
}

/**
 * Authoritative evaluation of the application deployment architecture against
 * hosting platform constraints, storage durability invariants, and rate-limiting guarantees.
 */
export function evaluateDeploymentArchitecture(
  options: DeploymentEvaluationOptions = {},
): DeploymentArchitectureEvaluation {
  const env = options.env ?? process.env;
  const platform = detectRuntimePlatform(env);
  const resolvedMode = options.mode
    ? resolveDeploymentMode({ ...env, DEPLOYMENT_MODE: String(options.mode) })
    : resolveDeploymentMode(env);

  const capabilities = getPlatformCapabilities(resolvedMode);
  const storageDir = options.storageDir ?? env.STORAGE_DIR ?? './data/storage';
  const resolvedPath = path.resolve(storageDir);
  const isEphemeral = isEphemeralStoragePath(resolvedPath);
  const isProduction = options.isProduction ?? env.NODE_ENV === 'production';

  const isPrimary =
    resolvedMode === SUPPORTED_DEPLOYMENT_MODES.LOCAL_FIRST ||
    resolvedMode === SUPPORTED_DEPLOYMENT_MODES.SELF_HOSTED;
  const tier: DeploymentTier = isPrimary ? 1 : 2;
  const tierLabel = isPrimary
    ? ('Tier 1 (Fully Supported)' as const)
    : ('Tier 2 (Restricted / Advisory)' as const);

  const warnings: string[] = [];
  const limitations: string[] = [];
  const recommendations: string[] = [];

  // 1. Storage Durability Evaluation & Explicit Non-Assumption Checks
  let durability: StorageDurabilityMode = capabilities.storageDurability;
  if (isEphemeral) {
    durability = 'ephemeral';
  }

  if (resolvedMode === SUPPORTED_DEPLOYMENT_MODES.SERVERLESS) {
    limitations.push(
      'Serverless filesystem writes (/tmp) are ephemeral and discarded across invocations and container redeployments.',
    );
    limitations.push(
      'Autonomous background crawlers cannot run due to invocation timeouts and container sleep lifecycles.',
    );
    limitations.push(
      'Concurrent SQLite writes across multiple stateless instances can cause SQLITE_BUSY locking errors.',
    );
    warnings.push(
      'Serverless Mode Notice: Serverless filesystem writes do NOT persist between instances. Long-running crawling is disabled.',
    );
    recommendations.push(
      'Use Serverless only for read-only query serving against a static pre-built index or external providers, or mount a persistent network volume.',
    );
  } else if (isEphemeral) {
    warnings.push(
      `Ephemeral Storage Detected: Storage directory "${resolvedPath}" is in a temporary path. Data will be lost upon restart.`,
    );
    if (isProduction) {
      warnings.push(
        'CRITICAL: Production deployment detected on an ephemeral filesystem without a durable volume mount.',
      );
    }
    recommendations.push(
      'Mount a durable host directory or Docker volume (e.g., -v /var/data/opensearch:/app/data) to preserve index data.',
    );
  } else {
    recommendations.push(
      'Durable storage confirmed. Regular snapshot backups are recommended before major upgrades.',
    );
  }

  // 2. Rate-Limiting Scope Evaluation & Explicit Non-Assumption Checks
  let rateLimiterScope: RateLimiterScope = 'instance-local';
  let isGloballyGuaranteed = true;
  let rateLimitNote = 'Process-memory token bucket rate limiting guarantees enforcement on this single instance.';

  if (resolvedMode === SUPPORTED_DEPLOYMENT_MODES.SERVERLESS) {
    rateLimiterScope = 'instance-local';
    isGloballyGuaranteed = false;
    rateLimitNote =
      'Process-memory rate limits apply only per warm container invocation. They do NOT apply globally across multiple serverless instances.';
    limitations.push(
      'In-memory rate limits do not provide global guarantees across dynamically scaled serverless instances.',
    );
    recommendations.push(
      'For public multi-instance or serverless deployments, enforce global rate limits at the edge / API Gateway (e.g. Cloudflare WAF or AWS API Gateway).',
    );
  } else if (resolvedMode === SUPPORTED_DEPLOYMENT_MODES.CLUSTER) {
    rateLimiterScope = 'gateway-delegated';
    isGloballyGuaranteed = false;
    rateLimitNote =
      'Cluster deployment detected. Process-memory rate limits protect individual instances, but global quotas require reverse proxy / API gateway rate limiting.';
    limitations.push(
      'Multi-instance process-memory rate limits are isolated to each individual node.',
    );
    recommendations.push(
      'Configure ingress rate limiting at the reverse proxy (Nginx limit_req_zone or Caddy rate_limit) for cluster-wide enforcement.',
    );
  } else {
    recommendations.push(
      'Local-first / Self-hosted single-instance rate limits are fully enforced in-process without requiring external Redis.',
    );
  }

  // 3. Local-First Fully Functional Path Guarantee
  recommendations.push(
    'A fully functional local path is maintained out-of-the-box with zero configuration, zero cloud dependencies, and zero mandatory secrets.',
  );

  return {
    mode: resolvedMode,
    tier,
    tierLabel,
    isPrimarySupported: isPrimary,
    platform,
    capabilities,
    storage: {
      durability,
      isEphemeral,
      resolvedPath,
      warning: isEphemeral
        ? 'Filesystem writes are ephemeral and will not persist across container recreations or server restarts.'
        : undefined,
      recommendation: isEphemeral
        ? 'Mount a persistent host directory to STORAGE_DIR.'
        : 'Storage directory is durable.',
    },
    rateLimiting: {
      scope: rateLimiterScope,
      isGloballyGuaranteed,
      note: rateLimitNote,
      recommendation: !isGloballyGuaranteed
        ? 'Enforce global rate limits at your edge reverse proxy or API gateway.'
        : undefined,
    },
    invariants: {
      zeroPaidServices: true,
      zeroSecretsRequired: true,
      zeroPaidDomainsRequired: true,
      offlineCapable: true,
      localPathAvailable: true,
    },
    limitations,
    recommendations,
    warnings,
  };
}
