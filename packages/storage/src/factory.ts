/**
 * @opensearch/storage — Storage Factory
 * Creates storage adapter instances using typed application configuration.
 */

import { AppConfig, Logger, createLogger } from '@opensearch/shared';
import { JsonStorageAdapter } from './adapters/json-adapter.js';
import { StorageAdapter } from './repositories.js';

export interface StorageFactoryOptions {
  config: Pick<AppConfig, 'storage' | 'logging'>;
  logger?: Logger;
}

/**
 * Creates and returns a StorageAdapter from typed AppConfig.
 * The concrete implementation (JsonStorageAdapter) is hidden behind the interface.
 * Future phases can swap this factory to return a different adapter.
 */
export function createStorageAdapter(options: StorageFactoryOptions): StorageAdapter {
  const logger =
    options.logger ??
    createLogger('@opensearch/storage', {
      level: options.config.logging.level,
      format: options.config.logging.format,
    });

  return new JsonStorageAdapter({
    storageDir: options.config.storage.storageDir,
    logger,
  });
}
