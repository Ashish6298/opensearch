/**
 * @opensearch/api — Live External Search Fallback
 *
 * Automatically fetches live web results when local index has 0 results or few results,
 * providing comprehensive coverage for any user search without manual re-feeding.
 */

import { SearchResultItem } from '@opensearch/ranking';

export async function fetchExternalWebResults(query: string, limit = 10): Promise<SearchResultItem[]> {
  try {
    const items: SearchResultItem[] = [];

    // 1. Wikipedia Open Search API (Fast, reliable, free JSON API)
    try {
      const wikiUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=${limit}&namespace=0&format=json`;
      const wikiRes = await fetch(wikiUrl, {
        headers: { 'User-Agent': 'OpenSearch-Engine/1.0 (privacy-search)' },
        signal: AbortSignal.timeout(3000),
      });

      if (wikiRes.ok) {
        const data = (await wikiRes.json()) as [string, string[], string[], string[]];
        const titles = data[1] || [];
        const snippets = data[2] || [];
        const urls = data[3] || [];

        for (let i = 0; i < titles.length; i++) {
          const t = titles[i];
          const u = urls[i];
          const s = snippets[i];
          if (t && u) {
            items.push({
              documentId: `wiki-${i + 1}`,
              score: 1.0 - i * 0.05,
              rank: i + 1,
              title: t,
              highlightedTitle: t,
              url: u,
              displayUrl: `en.wikipedia.org › wiki › ${encodeURIComponent(t.replace(/\s+/g, '_'))}`,
              domain: 'en.wikipedia.org',
              snippet: s || `${t} overview and detailed knowledge guide on Wikipedia.`,
              highlightedSnippet: s || `${t} overview and detailed knowledge guide on Wikipedia.`,
              language: 'en',
              indexedAt: new Date().toISOString(),
            });
          }
        }
      }
    } catch {
      // Ignore wikipedia timeout/error
    }

    // 2. DuckDuckGo Instant Answers & Lite Search
    if (items.length < limit) {
      try {
        const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
        const ddgRes = await fetch(ddgUrl, {
          headers: { 'User-Agent': 'OpenSearch-Engine/1.0 (privacy-search)' },
          signal: AbortSignal.timeout(3000),
        });

        if (ddgRes.ok) {
          const ddgData = (await ddgRes.json()) as {
            AbstractText?: string;
            AbstractURL?: string;
            Heading?: string;
            RelatedTopics?: Array<{ Text?: string; FirstURL?: string; Result?: string }>;
          };

          if (ddgData.Heading && ddgData.AbstractURL) {
            const domain = new URL(ddgData.AbstractURL).hostname.replace(/^www\./, '');
            items.push({
              documentId: `ddg-main`,
              score: 0.95,
              rank: items.length + 1,
              title: ddgData.Heading,
              highlightedTitle: ddgData.Heading,
              url: ddgData.AbstractURL,
              displayUrl: `${domain} › ...`,
              domain,
              snippet: ddgData.AbstractText || ddgData.Heading,
              highlightedSnippet: ddgData.AbstractText || ddgData.Heading,
              language: 'en',
              indexedAt: new Date().toISOString(),
            });
          }

          if (ddgData.RelatedTopics && Array.isArray(ddgData.RelatedTopics)) {
            for (const topic of ddgData.RelatedTopics) {
              if (topic.FirstURL && topic.Text && items.length < limit) {
                let domain = 'web';
                try {
                  domain = new URL(topic.FirstURL).hostname.replace(/^www\./, '');
                } catch {}

                items.push({
                  documentId: `ddg-topic-${items.length + 1}`,
                  score: 0.85 - items.length * 0.05,
                  rank: items.length + 1,
                  title: topic.Text.split(' - ')[0] || topic.Text.slice(0, 60),
                  highlightedTitle: topic.Text.split(' - ')[0] || topic.Text.slice(0, 60),
                  url: topic.FirstURL,
                  displayUrl: `${domain} › ...`,
                  domain,
                  snippet: topic.Text,
                  highlightedSnippet: topic.Text,
                  language: 'en',
                  indexedAt: new Date().toISOString(),
                });
              }
            }
          }
        }
      } catch {
        // Ignore DDG errors
      }
    }

    return items;
  } catch {
    return [];
  }
}
