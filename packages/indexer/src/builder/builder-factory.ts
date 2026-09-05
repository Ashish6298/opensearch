/**
 * @opensearch/indexer — Index Builder Factory (Phase 11)
 */

import { AppConfig, Logger, createLogger } from '@opensearch/shared';
import { StorageAdapter } from '@opensearch/storage';
import { DocumentProcessor } from '../pipeline/pipeline-types.js';
import { IndexBuilder } from './builder-types.js';
import { DefaultIndexBuilder } from './index-builder.js';

export interface IndexBuilderFactoryOptions {
  config: AppConfig;
  storage: StorageAdapter;
  processor?: DocumentProcessor;
  logger?: Logger;
  indexDir?: string;
}

/**
 * Creates and configures an IndexBuilder instance.
 */
export function createIndexBuilder(options: IndexBuilderFactoryOptions): IndexBuilder {
  const logger = options.logger ?? createLogger('@opensearch/indexer:builder');
  return new DefaultIndexBuilder({
    ...options,
    logger,
  });
}
