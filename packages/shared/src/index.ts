/**
 * @opensearch/shared
 * Central entry point for common constants, types, utilities, config, logger, and errors.
 */

import {
  PROJECT_NAME,
  PROJECT_VERSION,
  PRODUCT_IDENTITY,
  PRODUCT_NAME,
  PRODUCT_FULL_NAME,
  PRODUCT_DISCLAIMER,
  TRADEMARK_NOTICE,
} from './constants.js';

export * from './constants.js';
export * from './types.js';
export * from './errors/index.js';
export * from './utils/index.js';
export * from './logger/index.js';
export * from './config/index.js';
export * from './privacy/index.js';
export * from './metrics/index.js';
export * from './demo-data.js';
export * from './deployment/index.js';

export interface ProjectIdentity {
  name: string;
  version: string;
  productName: string;
  fullName: string;
  disclaimer: string;
  trademarkNotice: string;
  protocolCompatibility: string;
}

export function getProjectIdentity(): ProjectIdentity {
  return {
    name: PROJECT_NAME,
    version: PROJECT_VERSION,
    productName: PRODUCT_NAME,
    fullName: PRODUCT_FULL_NAME,
    disclaimer: PRODUCT_DISCLAIMER,
    trademarkNotice: TRADEMARK_NOTICE,
    protocolCompatibility: PRODUCT_IDENTITY.protocolCompatibility,
  };
}
