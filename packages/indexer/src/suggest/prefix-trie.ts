/**
 * @opensearch/indexer — In-Memory Prefix Trie / Suggestion Index (Phase 35)
 *
 * Provides deterministic, low-latency prefix search suggestions and auto-completions
 * with frequency/weight ranking and zero external dependencies.
 */

export interface SuggestionEntry {
  text: string;
  weight: number;
  source?: 'seed' | 'title' | 'heading' | 'term' | 'popular';
}

export interface SuggestionMatch {
  text: string;
  weight: number;
  score: number;
}

export class TrieNode {
  public children: Map<string, TrieNode> = new Map();
  public isEndOfWord: boolean = false;
  public entries: SuggestionEntry[] = [];
  public maxChildWeight: number = 0;
}

export interface PrefixTrieOptions {
  maxDepth?: number;
  caseSensitive?: boolean;
}

export class PrefixTrie {
  private root: TrieNode;
  private totalWords: number = 0;
  private readonly maxDepth: number;
  private readonly caseSensitive: boolean;

  constructor(options: PrefixTrieOptions = {}) {
    this.root = new TrieNode();
    this.maxDepth = options.maxDepth ?? 64;
    this.caseSensitive = options.caseSensitive ?? false;
  }

  /**
   * Normalizes an input string for consistent trie traversal.
   */
  private normalize(str: string): string {
    const trimmed = str.trim();
    return this.caseSensitive ? trimmed : trimmed.toLowerCase();
  }

  /**
   * Inserts a word/phrase with an associated ranking weight.
   */
  insert(text: string, weight: number = 1, source?: SuggestionEntry['source']): void {
    if (!text || typeof text !== 'string') return;
    const normalized = this.normalize(text);
    if (!normalized || normalized.length > this.maxDepth) return;

    let current = this.root;
    current.maxChildWeight = Math.max(current.maxChildWeight, weight);

    for (let i = 0; i < normalized.length; i++) {
      const char = normalized[i]!;
      let next = current.children.get(char);
      if (!next) {
        next = new TrieNode();
        current.children.set(char, next);
      }
      current = next;
      current.maxChildWeight = Math.max(current.maxChildWeight, weight);
    }

    if (!current.isEndOfWord) {
      current.isEndOfWord = true;
      this.totalWords++;
    }

    // Update or add entry preserving original capitalization if available
    const existingEntryIndex = current.entries.findIndex(
      e => e.text.toLowerCase() === text.trim().toLowerCase(),
    );

    if (existingEntryIndex >= 0) {
      const existing = current.entries[existingEntryIndex]!;
      existing.weight = Math.max(existing.weight, weight);
      if (source) existing.source = source;
    } else {
      current.entries.push({
        text: text.trim(),
        weight,
        source,
      });
    }

    // Sort entries at this node by weight descending
    current.entries.sort((a, b) => b.weight - a.weight);
  }

  /**
   * Searches for terms with the given prefix and returns top N suggestions.
   */
  suggest(prefix: string, limit: number = 5): SuggestionMatch[] {
    if (!prefix || typeof prefix !== 'string') return [];
    const normalizedPrefix = this.normalize(prefix);
    if (!normalizedPrefix) return [];

    let current = this.root;
    for (let i = 0; i < normalizedPrefix.length; i++) {
      const char = normalizedPrefix[i]!;
      const next = current.children.get(char);
      if (!next) {
        return []; // No matches for prefix
      }
      current = next;
    }

    // Traverse subtree from current node to collect all candidate words
    const candidates: SuggestionEntry[] = [];
    this.collectSubtree(current, candidates, Math.max(limit * 20, 100));

    // Deduplicate by text (case-insensitive)
    const uniqueMap = new Map<string, SuggestionEntry>();
    for (const entry of candidates) {
      const key = entry.text.toLowerCase();
      const existing = uniqueMap.get(key);
      if (!existing || existing.weight < entry.weight) {
        uniqueMap.set(key, entry);
      }
    }

    // Score candidates: exact prefix match bonus + length penalty + weight boost
    const scored: SuggestionMatch[] = Array.from(uniqueMap.values()).map(item => {
      const lowerItem = item.text.toLowerCase();
      let score = item.weight;

      // Exact prefix match bonus
      if (lowerItem.startsWith(normalizedPrefix)) {
        score += 50;
      }
      // Exact match bonus
      if (lowerItem === normalizedPrefix) {
        score += 100;
      }
      // Shorter length slight preference
      score += Math.max(0, 20 - item.text.length * 0.5);

      return {
        text: item.text,
        weight: item.weight,
        score,
      };
    });

    // Sort descending by score, then alphabetically
    scored.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.text.localeCompare(b.text);
    });

    return scored.slice(0, limit);
  }

  private collectSubtree(node: TrieNode, results: SuggestionEntry[], maxCollect: number): void {
    if (results.length >= maxCollect) return;

    if (node.isEndOfWord) {
      for (const entry of node.entries) {
        results.push(entry);
        if (results.length >= maxCollect) return;
      }
    }

    for (const [_, childNode] of node.children) {
      this.collectSubtree(childNode, results, maxCollect);
      if (results.length >= maxCollect) return;
    }
  }

  size(): number {
    return this.totalWords;
  }

  clear(): void {
    this.root = new TrieNode();
    this.totalWords = 0;
  }
}

export function createPrefixTrie(options?: PrefixTrieOptions): PrefixTrie {
  return new PrefixTrie(options);
}
