/**
 * @opensearch/indexer — Field Weight Configuration (Phase 9)
 *
 * Defines default multiplier weights for ranking term occurrences across
 * different semantic fields of a document.
 */

import { FieldWeightConfig } from './pipeline-types.js';

export const DEFAULT_FIELD_WEIGHTS: Readonly<FieldWeightConfig> = Object.freeze({
  title: 3.0,
  headings: 2.0,
  description: 1.5,
  body: 1.0,
  defaultWeight: 1.0,
});

/**
 * Resolves the effective field boost weight for a given field name.
 */
export function getFieldWeight(
  fieldName: string,
  customWeights?: Partial<FieldWeightConfig>,
): number {
  const weights = { ...DEFAULT_FIELD_WEIGHTS, ...customWeights };
  switch (fieldName.toLowerCase()) {
    case 'title':
      return weights.title;
    case 'headings':
    case 'heading':
      return weights.headings;
    case 'description':
    case 'meta_description':
      return weights.description;
    case 'body':
    case 'bodytext':
    case 'content':
      return weights.body;
    default:
      return weights.defaultWeight;
  }
}
