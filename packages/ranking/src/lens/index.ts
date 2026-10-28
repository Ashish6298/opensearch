/**
 * @opensearch/ranking — Focus Lens Module (Phase 101 & Phase 102)
 */

export type {
  DomainRuleAction,
  DomainMultiplierRule,
  FocusLensRankingWeights,
  FocusLensProfileMetadata,
  FocusLensProfile,
  LensScoreExplanation,
  LensValidationResult,
} from './lens-types.js';

export {
  CURRENT_LENS_SCHEMA_VERSION,
  SUPPORTED_LENS_SCHEMA_VERSIONS,
  HEALTH_LENS_DISCLAIMER,
  NO_TRACKERS_LENS_DISCLAIMER,
  LENS_BOOST_MIN,
  LENS_BOOST_MAX,
  LENS_DEMOTE_MIN,
  LENS_DEMOTE_MAX,
  LENS_WEIGHT_MIN,
  LENS_WEIGHT_MAX,
  MAX_LENS_FILE_SIZE_BYTES,
} from './lens-types.js';

export {
  FOCUS_LENS_JSON_SCHEMA,
  isValidDomainPattern,
  validateLensProfile,
} from './lens-schema.js';

export {
  GENERAL_LENS,
  STUDENT_LENS,
  DEVELOPER_LENS,
  RESEARCH_LENS,
  TRUSTED_HEALTH_LENS,
  NO_TRACKERS_LENS,
  BUILTIN_LENSES,
  getBuiltinLens,
  isBuiltinLensId,
} from './builtin-lenses.js';

export type { EvaluatedLensResult } from './lens-evaluator.js';
export {
  extractHostnameFromUrl,
  matchesDomainPattern,
  evaluateLensForDocument,
} from './lens-evaluator.js';

export type { FocusLensRegistryOptions } from './lens-registry.js';
export {
  FocusLensRegistry,
  getDefaultLensRegistry,
} from './lens-registry.js';

// ── Phase 102: Lens Editor, Import/Export, and Previewer ─────────────────
export type { LensExportOptions } from './lens-import-export.js';
export {
  exportLensToJson,
  importLensFromJson,
} from './lens-import-export.js';

export type { LensEditorOptions } from './lens-editor.js';
export {
  FocusLensEditor,
} from './lens-editor.js';

export type {
  SampleQueryDocument,
  PreviewResultHit,
  QueryPreviewSummary,
  LensPreviewReport,
  LensPreviewOptions,
} from './lens-previewer.js';

export {
  FIXED_PREVIEW_CORPUS,
  FIXED_SAMPLE_QUERIES,
  previewLensEffects,
} from './lens-previewer.js';
