/**
 * @opensearch/ranking — Synonym Graph & Query Expansion Engine (Phase 46)
 *
 * Provides a zero-dependency bidirectional synonym graph and query expansion
 * mechanism. Expands search query terms with weighted synonyms (original term = 1.0,
 * synonym = 0.6) to boost search recall without polluting exact phrases or operators.
 */

export interface SynonymMatch {
  /** The expanded synonym term */
  term: string;
  /** Weight factor for relevance scoring (e.g. 1.0 for original, 0.6 for synonym) */
  weight: number;
  /** The source term that triggered this expansion */
  sourceTerm: string;
}

export interface ExpandedQueryTerms {
  /** Original positive query terms (weight 1.0) */
  originalTerms: string[];
  /** Array of all unique expanded synonym terms */
  synonymTerms: string[];
  /** Full map of term -> weight */
  termWeights: Map<string, number>;
  /** All unique terms combined (originals + synonyms) */
  allTerms: string[];
  /** Detailed expansions per original term */
  expansions: Map<string, SynonymMatch[]>;
}

export interface SynonymEngineOptions {
  /** Default weight multiplier for expanded synonym terms (default: 0.6) */
  synonymWeight?: number;
  /** Custom additional synonym pairs or groupings to merge with seed dictionary */
  customSynonyms?: Record<string, string[]>;
}

/**
 * Curated seed synonym groups mapping technical, programming, and general terms.
 * Groups are automatically indexed bidirectionally.
 */
export const SEED_SYNONYM_GROUPS: ReadonlyArray<readonly string[]> = [
  // Programming languages & ecosystems
  ['js', 'javascript', 'ecmascript'],
  ['ts', 'typescript'],
  ['py', 'python'],
  ['golang', 'go'],
  ['rust', 'rustlang'],
  ['cpp', 'cplusplus', 'c++'],
  ['csharp', 'c#', 'dotnet'],
  ['rb', 'ruby'],
  ['kt', 'kotlin'],
  ['php', 'hypertext'],
  
  // Web & Tech concepts
  ['docs', 'documentation', 'manual', 'guide', 'reference'],
  ['auth', 'authentication', 'authorization', 'login'],
  ['repo', 'repository', 'codebase'],
  ['cfg', 'config', 'configuration', 'settings'],
  ['dir', 'directory', 'folder'],
  ['pkg', 'package', 'module', 'library', 'lib'],
  ['db', 'database', 'datastore', 'storage'],
  ['api', 'endpoint', 'rest', 'service'],
  ['cli', 'command', 'terminal', 'shell', 'console'],
  ['ui', 'gui', 'frontend', 'interface'],
  ['dev', 'developer', 'development'],
  ['spec', 'specification', 'standard'],
  ['dep', 'dependency', 'dependencies'],
  ['env', 'environment'],
  ['err', 'error', 'exception', 'failure', 'bug'],
  ['req', 'request', 'payload'],
  ['res', 'response', 'result'],
  ['idx', 'index', 'indexer'],
  ['perf', 'performance', 'speed', 'latency', 'benchmark'],
  ['msg', 'message'],
  ['sync', 'synchronize', 'synchronous'],
  ['async', 'asynchronous'],
  
  // General & action terms
  ['fast', 'quick', 'rapid', 'speedy'],
  ['build', 'compile', 'bundle'],
  ['test', 'spec', 'verification'],
  ['help', 'faq', 'support'],
  ['create', 'generate', 'scaffold', 'init', 'initialize'],
  ['delete', 'remove', 'purge', 'clean', 'destroy'],
  ['find', 'search', 'lookup', 'query'],
  ['start', 'launch', 'run', 'execute'],
  ['stop', 'terminate', 'kill', 'halt'],
  ['update', 'upgrade', 'modify', 'patch'],
  ['doc', 'document', 'page', 'article'],
];

export class SynonymEngine {
  private readonly graph = new Map<string, Set<string>>();
  private readonly synonymWeight: number;

  constructor(options: SynonymEngineOptions = {}) {
    this.synonymWeight = options.synonymWeight ?? 0.6;
    this.buildGraph(SEED_SYNONYM_GROUPS, options.customSynonyms);
  }

  /**
   * Initializes bidirectional graph edges from seed groups and custom mappings.
   */
  private buildGraph(
    groups: ReadonlyArray<readonly string[]>,
    custom?: Record<string, string[]>,
  ): void {
    // 1. Index seed groups
    for (const group of groups) {
      const normalizedGroup = group.map(t => t.toLowerCase().trim()).filter(Boolean);
      for (let i = 0; i < normalizedGroup.length; i++) {
        const source = normalizedGroup[i];
        if (!source) continue;
        let neighbors = this.graph.get(source);
        if (!neighbors) {
          neighbors = new Set<string>();
          this.graph.set(source, neighbors);
        }
        for (let j = 0; j < normalizedGroup.length; j++) {
          if (i !== j) {
            const target = normalizedGroup[j];
            if (target) neighbors.add(target);
          }
        }
      }
    }

    // 2. Index custom synonyms if provided
    if (custom) {
      for (const [key, values] of Object.entries(custom)) {
        const src = key.toLowerCase().trim();
        if (!src) continue;
        let neighbors = this.graph.get(src);
        if (!neighbors) {
          neighbors = new Set<string>();
          this.graph.set(src, neighbors);
        }
        for (const val of values) {
          const tgt = val.toLowerCase().trim();
          if (tgt && tgt !== src) {
            neighbors.add(tgt);
            // Add reverse mapping
            let reverseNeighbors = this.graph.get(tgt);
            if (!reverseNeighbors) {
              reverseNeighbors = new Set<string>();
              this.graph.set(tgt, reverseNeighbors);
            }
            reverseNeighbors.add(src);
          }
        }
      }
    }
  }

  /**
   * Returns list of direct synonyms for a given term.
   */
  getSynonyms(term: string): string[] {
    const normalized = term.toLowerCase().trim();
    const set = this.graph.get(normalized);
    if (!set || set.size === 0) {
      return [];
    }
    return Array.from(set);
  }

  /**
   * Expands an array of query terms with weighted synonyms.
   */
  expandQuery(terms: string[]): ExpandedQueryTerms {
    const originalTerms = terms.map(t => t.toLowerCase().trim()).filter(Boolean);
    const originalSet = new Set(originalTerms);
    const termWeights = new Map<string, number>();
    const expansions = new Map<string, SynonymMatch[]>();
    const synonymTermsSet = new Set<string>();

    // Original terms have 1.0 weight
    for (const term of originalTerms) {
      termWeights.set(term, 1.0);
    }

    // Expand depth-1 synonyms
    for (const term of originalTerms) {
      const synonyms = this.getSynonyms(term);
      const matches: SynonymMatch[] = [];

      for (const syn of synonyms) {
        // Do not downgrade an existing original term's weight
        if (!originalSet.has(syn)) {
          synonymTermsSet.add(syn);
          // If already added by another synonym, retain highest weight
          const existingWeight = termWeights.get(syn) ?? 0;
          if (this.synonymWeight > existingWeight) {
            termWeights.set(syn, this.synonymWeight);
          }
          matches.push({
            term: syn,
            weight: this.synonymWeight,
            sourceTerm: term,
          });
        }
      }

      if (matches.length > 0) {
        expansions.set(term, matches);
      }
    }

    const synonymTerms = Array.from(synonymTermsSet);
    const allTerms = [...originalTerms, ...synonymTerms];

    return {
      originalTerms,
      synonymTerms,
      termWeights,
      allTerms,
      expansions,
    };
  }
}

/**
 * Singleton / factory helper for SynonymEngine.
 */
export function createSynonymEngine(options?: SynonymEngineOptions): SynonymEngine {
  return new SynonymEngine(options);
}
