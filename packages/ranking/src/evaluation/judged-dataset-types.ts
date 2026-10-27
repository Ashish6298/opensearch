/**
 * @opensearch/ranking — Judged Query Dataset Schema & Domain Models (Phase 90)
 *
 * Defines the versioned schema for offline IR evaluation datasets:
 * - 5 Core Query Categories: Everyday, Education, Programming, Research, Ambiguous
 * - 4-Level Graded Relevance Scale (0 = Irrelevant, 1 = Marginal, 2 = Relevant, 3 = Perfect)
 * - Strict Separation of Tuning vs. Held-Out Evaluation splits
 * - Zero Personal Data / Zero User Query Logs privacy guarantee
 * - Documented provenance, annotation rubric, and licensing
 */

export type JudgedQueryCategory =
  | 'everyday'
  | 'education'
  | 'programming'
  | 'research'
  | 'ambiguous';

export type DatasetSplit = 'tuning' | 'held_out';

export type RelevanceGrade = 0 | 1 | 2 | 3;

export type RelevanceLabel = 'irrelevant' | 'marginal' | 'relevant' | 'perfect';

export interface JudgedDocument {
  /** Target document ID in corpus or inverted index */
  documentId: string;
  /** Canonical destination URL */
  url: string;
  /** Title of the document */
  title: string;
  /** Graded relevance score: 0 = Irrelevant, 1 = Marginal, 2 = Relevant, 3 = Perfect */
  grade: RelevanceGrade;
  /** Human-readable label corresponding to the numeric grade */
  relevance: RelevanceLabel;
  /** Explanation justifying why the grade was assigned according to the annotation rubric */
  rationale: string;
  /** Excerpt or snippet text if available */
  snippet?: string;
  /** Domain or origin */
  domain?: string;
}

export interface JudgedQuery {
  /** Unique query identifier, e.g. 'q-prog-01' */
  id: string;
  /** User search query text */
  query: string;
  /** The semantic domain category */
  category: JudgedQueryCategory;
  /** Dataset partition: 'tuning' for parameter fitting, 'held_out' for unbiased validation */
  split: DatasetSplit;
  /** Detailed description of user intent and information need */
  intent: string;
  /** Clarification notes on interpretations if category is 'ambiguous' */
  ambiguityNotes?: string;
  /** Graded candidate document assessments */
  judgments: JudgedDocument[];
  /** Expected optimal document IDs sorted by ideal rank */
  idealOrder?: string[];
}

export interface JudgedDatasetProvenance {
  /** Creator / Curator identification */
  curator: string;
  /** Date when the dataset was curated or last revised (ISO 8601) */
  curatedAt: string;
  /** License governing dataset usage */
  license: string;
  /** Methodology description */
  methodology: string;
  /** Confirmation that zero personal queries or user telemetry was used */
  privacyAssurance: string;
  /** Annotation rubric version identifier */
  annotationRubricVersion: string;
}

export interface JudgedDataset {
  /** Schema version */
  schemaVersion: '1.0.0';
  /** Name identifier of the dataset (e.g. 'opensearch-ci-judged-queries-v1') */
  name: string;
  /** Brief description */
  description: string;
  /** Provenance and licensing metadata */
  provenance: JudgedDatasetProvenance;
  /** Total number of queries in the dataset */
  queryCount: number;
  /** Total number of judged document pairs */
  totalJudgments: number;
  /** Breakdown by category */
  categoryCounts: Record<JudgedQueryCategory, number>;
  /** Breakdown by split */
  splitCounts: Record<DatasetSplit, number>;
  /** Array of judged queries */
  queries: JudgedQuery[];
}

export interface JudgedDatasetFilterOptions {
  /** Filter by category */
  category?: JudgedQueryCategory | JudgedQueryCategory[];
  /** Filter by split partition */
  split?: DatasetSplit;
  /** Minimum number of judgments required per query */
  minJudgments?: number;
  /** Search query substring */
  search?: string;
}
