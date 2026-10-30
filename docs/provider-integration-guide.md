# Search Provider Integration Guide

**Milestone 39 — Phase 115**  
**Product:** OpenSearch Web  
**Scope:** Creating, registering, and testing external search providers under the strict Privacy Contract.

---

## 1. Overview & Privacy Contract

OpenSearch Web supports federated search providers to enrich search recall when local corpus results are sparse. However, **all providers must comply with the strict Privacy Contract**:

1. **Zero User PII**: You must **never** forward client IP addresses, user session tokens, cookies, or raw User-Agent headers to external providers.
2. **Deterministic Timeouts**: Every provider request must respect the configured timeout budget (typically 2,000–3,500 ms) using `AbortSignal.timeout()`.
3. **Graceful Degradation**: If an upstream provider fails, times out, or returns HTTP 429/500, the failure must be captured safely without crashing the query or bringing down the search service.
4. **Attribution & Transparency**: External results must be attributed to their source, and contacted providers must be truthfully listed in the **Privacy Receipt**.

---

## 2. Implementing the `SearchProvider` Interface

All search providers implement the standard interface defined in `@opensearch/ranking`:

```typescript
export interface SearchProvider {
  /** Unique provider identifier (e.g. 'wikipedia', 'arxiv', 'openlibrary') */
  readonly id: string;

  /** Human-readable provider display name */
  readonly name: string;

  /** Health-check probe to determine provider availability */
  healthCheck?(): Promise<boolean>;

  /** Execute an upstream search query */
  search(query: string, options?: ProviderSearchOptions): Promise<ProviderSearchResult>;
}
```

### Complete Implementation Example: Wikipedia Provider

```typescript
import { SearchProvider, ProviderSearchOptions, ProviderSearchResult } from '@opensearch/ranking';

export class WikipediaSearchProvider implements SearchProvider {
  readonly id = 'wikipedia';
  readonly name = 'Wikipedia Open Encyclopedia';
  private readonly endpoint = 'https://en.wikipedia.org/w/api.php';

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.endpoint}?action=query&meta=siteinfo&format=json`, {
        signal: AbortSignal.timeout(2000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async search(query: string, options: ProviderSearchOptions = {}): Promise<ProviderSearchResult> {
    const limit = options.limit ?? 5;
    const timeoutMs = options.timeoutMs ?? 2500;

    const url = new URL(this.endpoint);
    url.searchParams.set('action', 'opensearch');
    url.searchParams.set('search', query);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('namespace', '0');
    url.searchParams.set('format', 'json');

    // Strict privacy: clean outbound headers, zero user identifiers
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': 'OpenSearchBot/1.0 (+https://github.com/Ashish6298/opensearch)',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Wikipedia API returned HTTP ${response.status}`);
    }

    const data = await response.json();
    const [, titles, snippets, urls] = data;

    const items = (titles as string[]).map((title, i) => ({
      title,
      url: (urls as string[])[i],
      snippet: (snippets as string[])[i] || '',
      provider: this.id,
      score: 1.0 - i * 0.05,
    }));

    return {
      providerId: this.id,
      results: items,
      totalCount: items.length,
      durationMs: 0, // will be recorded by orchestrator
    };
  }
}
```

---

## 3. Registering the Provider

Register your new provider in the `ProviderRegistry`:

```typescript
import { createProviderRegistry } from '@opensearch/ranking';
import { WikipediaSearchProvider } from './wikipedia-provider.js';

const registry = createProviderRegistry();
registry.register(new WikipediaSearchProvider());
```

---

## 4. Testing Your Provider

Write unit and integration tests verifying:
- Output normalization and score bounds `[0.0, 1.0]`.
- Timeout handling when the network stalls.
- Zero-PII compliance (no cookies, no forwarded IP).
- Privacy Receipt transparency.

Run your tests using Vitest:
```bash
npx vitest run packages/ranking/tests/provider-privacy-contract.test.ts
```
