/**
 * @opensearch/indexer — Document Processor (Phase 9)
 *
 * Coordinates full document processing:
 * 1. Safe field separation (title, headings, description, body)
 * 2. Positional tokenization & stop-word filtration per field
 * 3. Field boost weighting metadata
 * 4. Document-level term dictionary aggregation with term frequencies and positions
 * 5. Document ID assignment and metadata extraction
 */

import { randomUUID, createHash } from 'node:crypto';
import { DocumentRecord } from '@opensearch/storage';
import {
  DocumentProcessor,
  DocumentProcessorOptions,
  DocumentTermSummary,
  FieldName,
  ProcessedDocument,
  ProcessedField,
  RawDocumentInput,
  Token,
} from './pipeline-types.js';
import { tokenize } from './tokenizer.js';
import { normalizeText } from './normalizer.js';
import { getFieldWeight } from './field-weights.js';

function computeUrlHashFallback(url: string): string {
  return createHash('sha256').update(url.trim()).digest('hex');
}

export class DefaultDocumentProcessor implements DocumentProcessor {
  private readonly options: DocumentProcessorOptions;

  constructor(options: DocumentProcessorOptions = {}) {
    this.options = {
      minTokenLength: 1,
      maxTokenLength: 64,
      removeStopWords: true,
      stripAccents: true,
      ...options,
    };
  }

  process(input: DocumentRecord | RawDocumentInput): ProcessedDocument {
    const documentId =
      input.id || (this.options.idGenerator ? this.options.idGenerator() : randomUUID());
    const url = input.url || '';
    const urlHash = (input as DocumentRecord).urlHash || computeUrlHashFallback(url);
    const title = input.title || '';
    const description = input.description || '';
    const headings = input.headings || '';
    const bodyText =
      (input as DocumentRecord).bodyText || (input as RawDocumentInput).bodyText || '';
    const language = input.language || null;

    const fields = new Map<FieldName, ProcessedField>();
    const terms = new Map<string, DocumentTermSummary>();

    // Process each field
    const fieldDefinitions: Array<{ name: FieldName; content: string }> = [
      { name: 'title', content: title },
      { name: 'headings', content: headings },
      { name: 'description', content: description },
      { name: 'body', content: bodyText },
    ];

    let totalTokens = 0;

    for (const { name, content } of fieldDefinitions) {
      const tokens = this.tokenizeText(content);
      const weight = getFieldWeight(name, this.options.fieldWeights);
      const termFrequencies = new Map<string, number>();

      for (const token of tokens) {
        const currentCount = termFrequencies.get(token.term) || 0;
        termFrequencies.set(token.term, currentCount + 1);

        // Aggregate into document-wide terms map
        let termSummary = terms.get(token.term);
        if (!termSummary) {
          termSummary = {
            term: token.term,
            totalFrequency: 0,
            weightedScore: 0,
            fieldCounts: new Map<FieldName, number>(),
            fieldPositions: new Map<FieldName, number[]>(),
          };
          terms.set(token.term, termSummary);
        }

        termSummary.totalFrequency += 1;
        termSummary.weightedScore += weight;

        const fieldCount = termSummary.fieldCounts.get(name) || 0;
        termSummary.fieldCounts.set(name, fieldCount + 1);

        const positions = termSummary.fieldPositions.get(name) || [];
        positions.push(token.position);
        termSummary.fieldPositions.set(name, positions);
      }

      fields.set(name, {
        fieldName: name,
        weight,
        totalTokens: tokens.length,
        tokens,
        termFrequencies,
      });

      totalTokens += tokens.length;
    }

    return {
      documentId,
      url,
      urlHash,
      title,
      description,
      language,
      fields,
      terms,
      totalTokens,
      uniqueTerms: terms.size,
      processedAt: new Date().toISOString(),
    };
  }

  tokenizeText(text: string): Token[] {
    return tokenize(text, {
      minTokenLength: this.options.minTokenLength,
      maxTokenLength: this.options.maxTokenLength,
      removeStopWords: this.options.removeStopWords,
      customStopWords: this.options.customStopWords,
      stripAccents: this.options.stripAccents,
      lowercase: true,
    });
  }

  normalizeTerm(term: string): string {
    return normalizeText(term, {
      stripAccents: this.options.stripAccents,
      lowercase: true,
    });
  }
}

/**
 * Factory creating a configured DocumentProcessor instance.
 */
export function createDocumentProcessor(options?: DocumentProcessorOptions): DocumentProcessor {
  return new DefaultDocumentProcessor(options);
}
