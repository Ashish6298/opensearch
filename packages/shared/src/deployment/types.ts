/**
 * @opensearch/shared — Deployment Architecture Types & Contracts (Phase 118)
 *
 * Establishes formal deployment modes, platform capability assessments,
 * durability invariants, and rate-limiting scope guarantees across:
 * - local-first (desktop / developer / workstation)
 * - self-hosted (Linux VPS / persistent container / on-premise)
 * - serverless (ephemeral functions: AWS Lambda / Vercel / Netlify)
 * - cluster (multi-instance behind reverse proxy / load balancer)
 */

export const SUPPORTED_DEPLOYMENT_MODES = {
  LOCAL_FIRST: 'local-first',
  SELF_HOSTED: 'self-hosted',
  SERVERLESS: 'serverless',
  CLUSTER: 'cluster',
} as const;

export type SupportedDeploymentMode =
  (typeof SUPPORTED_DEPLOYMENT_MODES)[keyof typeof SUPPORTED_DEPLOYMENT_MODES];

export type DeploymentTier = 1 | 2;

export type StorageDurabilityMode = 'durable' | 'ephemeral' | 'hybrid-external';

export type RateLimiterScope = 'instance-local' | 'file-shared' | 'gateway-delegated';

export type DeploymentPlatform =
  | 'workstation'
  | 'bare-metal-vps'
  | 'docker-container'
  | 'aws-lambda'
  | 'vercel'
  | 'netlify'
  | 'google-cloud-run'
  | 'generic-serverless'
  | 'unknown';

export interface PlatformCapabilities {
  /** Durability classification of the primary storage directory */
  storageDurability: StorageDurabilityMode;
  /** Whether long-running background crawler and indexing tasks are supported */
  backgroundTasksSupported: boolean;
  /** Whether continuous crawling loops can run without execution timeouts */
  continuousCrawlingSupported: boolean;
  /** Whether process rate limits guarantee global limits across all traffic */
  globalRateLimitGuaranteed: boolean;
  /** Whether an external database or shared storage mount is required for durability */
  requiresExternalSharedStore: boolean;
  /** Invariant: Operates completely without paid SaaS or cloud subscriptions */
  zeroPaidDependencies: boolean;
  /** Invariant: Operates completely without mandatory API keys, secrets, or licenses */
  zeroSecretsRequired: boolean;
  /** Invariant: Operates on localhost / IP without mandatory paid domain names */
  zeroPaidDomainsRequired: boolean;
  /** Invariant: 100% functional local path available out-of-the-box */
  localPathAvailable: boolean;
}

export interface DeploymentStorageAudit {
  durability: StorageDurabilityMode;
  isEphemeral: boolean;
  resolvedPath: string;
  warning?: string;
  recommendation?: string;
}

export interface DeploymentRateLimitingAudit {
  scope: RateLimiterScope;
  isGloballyGuaranteed: boolean;
  note: string;
  recommendation?: string;
}

export interface DeploymentInvariants {
  zeroPaidServices: boolean;
  zeroSecretsRequired: boolean;
  zeroPaidDomainsRequired: boolean;
  offlineCapable: boolean;
  localPathAvailable: boolean;
}

export interface DeploymentArchitectureEvaluation {
  /** Active deployment mode */
  mode: SupportedDeploymentMode;
  /** Support tier: 1 = Primary & Fully Supported, 2 = Restricted / Advisory */
  tier: DeploymentTier;
  /** Human-readable tier label */
  tierLabel: 'Tier 1 (Fully Supported)' | 'Tier 2 (Restricted / Advisory)';
  /** Whether this is a primary supported tier */
  isPrimarySupported: boolean;
  /** Detected runtime platform environment */
  platform: DeploymentPlatform;
  /** Detailed platform capabilities */
  capabilities: PlatformCapabilities;
  /** Storage durability audit */
  storage: DeploymentStorageAudit;
  /** Rate-limiting scope audit */
  rateLimiting: DeploymentRateLimitingAudit;
  /** Project non-negotiable invariants */
  invariants: DeploymentInvariants;
  /** Explicit list of limitations on this platform */
  limitations: string[];
  /** Actionable deployment recommendations */
  recommendations: string[];
  /** Active warning messages (e.g. data loss or rate limit scope warnings) */
  warnings: string[];
}
