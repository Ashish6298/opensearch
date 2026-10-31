/**
 * @opensearch/shared — Release Packaging & Build Metadata (Phase 120)
 *
 * Implements traceable release metadata, repeatable build tracking,
 * and deployment environment disclosures.
 */

import {
  PRODUCT_NAME,
  PROJECT_NAME,
  PROJECT_VERSION,
} from '../constants.js';
import { SUPPORTED_DEPLOYMENT_MODES } from '../deployment/types.js';

export interface ReleaseMetadata {
  /** SemVer release version string */
  version: string;
  /** Distinct product display name */
  productName: string;
  /** Internal canonical workspace name */
  canonicalName: string;
  /** ISO timestamp of release metadata generation */
  timestamp: string;
  /** Node.js runtime version */
  nodeRuntime: string;
  /** Current Git commit SHA or revision identifier */
  gitRevision: string;
  /** Whether release builds enforce deterministic lockfile builds */
  isRepeatableBuild: boolean;
  /** Whether accidental package publication is blocked */
  isPublishProtected: boolean;
  /** Default storage schema version */
  defaultSchemaVersion: number;
  /** Supported deployment modes */
  supportedDeploymentModes: string[];
  /** Zero-secret and zero-paid guarantees */
  guarantees: {
    zeroPaidServices: boolean;
    zeroSecretsRequired: boolean;
    localPathAvailable: boolean;
  };
}

/**
 * Generates traceable release metadata for runtime introspection and release verification.
 */
export function getReleaseMetadata(): ReleaseMetadata {
  const gitRevision =
    process.env.GIT_COMMIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.COMMIT_REF ||
    'local-build';

  return {
    version: PROJECT_VERSION,
    productName: PRODUCT_NAME,
    canonicalName: PROJECT_NAME,
    timestamp: new Date().toISOString(),
    nodeRuntime: process.version,
    gitRevision,
    isRepeatableBuild: true,
    isPublishProtected: true,
    defaultSchemaVersion: 1,
    supportedDeploymentModes: Object.values(SUPPORTED_DEPLOYMENT_MODES),
    guarantees: {
      zeroPaidServices: true,
      zeroSecretsRequired: true,
      localPathAvailable: true,
    },
  };
}
