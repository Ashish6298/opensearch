import { describe, it, expect, beforeEach } from 'vitest';
import { createPrefixTrie, PrefixTrie } from '../src/index.js';

describe('Prefix Trie & Autocomplete Engine (Phase 35)', () => {
  let trie: PrefixTrie;

  beforeEach(() => {
    trie = createPrefixTrie();
  });

  it('should insert terms and retrieve exact prefix matches', () => {
    trie.insert('opensearch', 100, 'popular');
    trie.insert('open source', 80, 'seed');
    trie.insert('openai', 50, 'term');
    trie.insert('open source software', 40, 'title');
    trie.insert('optics', 20, 'term');
    trie.insert('python', 90, 'popular');

    const suggestions = trie.suggest('open', 5);
    expect(suggestions).toHaveLength(4);
    expect(suggestions[0]?.text.toLowerCase()).toBe('opensearch');
    expect(suggestions.map(s => s.text.toLowerCase())).toEqual([
      'opensearch',
      'open source',
      'openai',
      'open source software',
    ]);
  });

  it('should perform case-insensitive prefix lookups', () => {
    trie.insert('TypeScript', 95, 'seed');
    trie.insert('TypeDoc', 60, 'term');
    trie.insert('Typewriter', 40, 'term');

    const matchesLower = trie.suggest('type', 5);
    expect(matchesLower).toHaveLength(3);
    expect(matchesLower[0]?.text).toBe('TypeScript');

    const matchesUpper = trie.suggest('TYPE', 5);
    expect(matchesUpper).toHaveLength(3);
    expect(matchesUpper[0]?.text).toBe('TypeScript');
  });

  it('should handle limit parameter properly', () => {
    for (let i = 1; i <= 10; i++) {
      trie.insert(`query item ${i}`, i * 10);
    }

    const top3 = trie.suggest('query', 3);
    expect(top3).toHaveLength(3);
    expect(top3[0]?.text).toBe('query item 10');
  });

  it('should handle empty or invalid inputs gracefully', () => {
    trie.insert('react', 50);

    expect(trie.suggest('', 5)).toEqual([]);
    expect(trie.suggest('   ', 5)).toEqual([]);
    expect(trie.suggest('nonexistent', 5)).toEqual([]);
  });

  it('should support update with higher weight', () => {
    trie.insert('vitest', 10);
    trie.insert('vitest', 100);

    const res = trie.suggest('vit', 1);
    expect(res).toHaveLength(1);
    expect(res[0]?.text).toBe('vitest');
    expect(res[0]?.weight).toBe(100);
  });

  it('should execute suggestions with sub-millisecond latency', () => {
    // Populate with 500 terms
    for (let i = 0; i < 500; i++) {
      trie.insert(`benchmark term ${i} data`, i % 20);
    }

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      trie.suggest('bench', 5);
    }
    const elapsed = performance.now() - start;
    const avgPerQueryMs = elapsed / 100;

    expect(avgPerQueryMs).toBeLessThan(1.0); // well below 10ms SLA
  });
});
