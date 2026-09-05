/**
 * @opensearch/indexer — Inverted Index Factory (Phase 10)
 */

import { InvertedIndex, InvertedIndexOptions } from './index-types.js';
import { MemoryInvertedIndex } from './inverted-index.js';

/**
 * Creates and returns an InvertedIndex instance.
 */
export function createInvertedIndex(options?: InvertedIndexOptions): InvertedIndex {
  return new MemoryInvertedIndex(options);
}
