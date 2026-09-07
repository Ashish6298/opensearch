import { SearchResultItem } from '@opensearch/ranking';

export async function fetchGoogleLive(query: string, limit = 10): Promise<SearchResultItem[]> {
  const items: SearchResultItem[] = [];

  // Method 1: Google Suggest & Knowledge Engine
  try {
    const suggestUrl = `https://suggestqueries.google.com/complete/search?client=chrome&q=${encodeURIComponent(query)}`;
    const suggestRes = await fetch(suggestUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(2500),
    });

    if (suggestRes.ok) {
      const data = (await suggestRes.json()) as [string, string[], string[], string[], Record<string, unknown>];
      const suggestions = data[1] || [];
      const descriptions = data[2] || [];
      const urls = data[3] || [];

      for (let i = 0; i < urls.length && items.length < limit; i++) {
        const u = urls[i];
        const s = suggestions[i];
        if (u && u.startsWith('http')) {
          let domain = '';
          try {
            domain = new URL(u).hostname.replace(/^www\./, '');
          } catch {
            domain = u;
          }

          items.push({
            documentId: `google-direct-${items.length + 1}`,
            score: 1.0 - items.length * 0.04,
            rank: items.length + 1,
            title: s || domain,
            highlightedTitle: s || domain,
            url: u,
            displayUrl: `${domain} › ...`,
            domain,
            snippet: descriptions[i] || `Direct web result for ${s} on ${domain}.`,
            highlightedSnippet: descriptions[i] || `Direct web result for ${s} on ${domain}.`,
            language: 'en',
            indexedAt: new Date().toISOString(),
          });
        }
      }
    }
  } catch {}

  // Method 2: DuckDuckGo HTML Web Search (Scrapes actual website domains like google, github, twitter, news)
  if (items.length < limit) {
    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(3500),
      });

      if (res.ok) {
        const html = await res.text();
        const titleRegex = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        const snippetRegex = /<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;

        const titles: Array<{ url: string; title: string }> = [];
        let m;
        while ((m = titleRegex.exec(html)) !== null) {
          let rawHref = m[1] || '';
          if (rawHref.includes('uddg=')) {
            try {
              const u = new URL(rawHref, 'https://duckduckgo.com');
              rawHref = decodeURIComponent(u.searchParams.get('uddg') || rawHref);
            } catch {}
          }
          const title = (m[2] || '').replace(/<[^>]+>/g, '').trim();
          if (rawHref.startsWith('http') && title) {
            titles.push({ url: rawHref, title });
          }
        }

        const snippets: string[] = [];
        while ((m = snippetRegex.exec(html)) !== null) {
          snippets.push((m[1] || '').replace(/<[^>]+>/g, '').trim());
        }

        for (let i = 0; i < titles.length && items.length < limit; i++) {
          const t = titles[i]!;
          if (!items.some(x => x.url === t.url)) {
            let domain = '';
            try {
              domain = new URL(t.url).hostname.replace(/^www\./, '');
            } catch {
              domain = t.url;
            }

            const snippet = snippets[i] || `Official website and articles from ${domain}.`;
            items.push({
              documentId: `web-organic-${items.length + 1}`,
              score: 0.95 - items.length * 0.03,
              rank: items.length + 1,
              title: t.title,
              highlightedTitle: t.title,
              url: t.url,
              displayUrl: `${domain} › ...`,
              domain,
              snippet,
              highlightedSnippet: snippet,
              language: 'en',
              indexedAt: new Date().toISOString(),
            });
          }
        }
      }
    } catch {}
  }

  // Method 3: DuckDuckGo Instant Answers API
  if (items.length < limit) {
    try {
      const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;
      const ddgRes = await fetch(ddgUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(2500),
      });

      if (ddgRes.ok) {
        const data = (await ddgRes.json()) as {
          AbstractURL?: string;
          Heading?: string;
          AbstractText?: string;
          RelatedTopics?: Array<{ FirstURL?: string; Text?: string }>;
        };

        if (data.AbstractURL && data.Heading) {
          let domain = '';
          try {
            domain = new URL(data.AbstractURL).hostname.replace(/^www\./, '');
          } catch {}

          if (!items.some(x => x.url === data.AbstractURL)) {
            items.push({
              documentId: `web-answer`,
              score: 0.99,
              rank: 1,
              title: data.Heading,
              highlightedTitle: data.Heading,
              url: data.AbstractURL,
              displayUrl: `${domain} › ...`,
              domain,
              snippet: data.AbstractText || data.Heading,
              highlightedSnippet: data.AbstractText || data.Heading,
              language: 'en',
              indexedAt: new Date().toISOString(),
            });
          }
        }

        if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
          for (const topic of data.RelatedTopics) {
            if (topic.FirstURL && topic.Text && items.length < limit) {
              if (!items.some(x => x.url === topic.FirstURL)) {
                let domain = '';
                try {
                  domain = new URL(topic.FirstURL).hostname.replace(/^www\./, '');
                } catch {}

                items.push({
                  documentId: `web-topic-${items.length + 1}`,
                  score: 0.85 - items.length * 0.02,
                  rank: items.length + 1,
                  title: topic.Text.split(' - ')[0] || topic.Text.slice(0, 50),
                  highlightedTitle: topic.Text.split(' - ')[0] || topic.Text.slice(0, 50),
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
      }
    } catch {}
  }

  return items.slice(0, limit);
}

export async function fetchExternalWebResults(query: string, limit = 10): Promise<SearchResultItem[]> {
  return fetchGoogleLive(query, limit);
}
