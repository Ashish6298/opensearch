/**
 * @opensearch/indexer — Zero-Trace Reader Mode Extractor (Phase 59)
 *
 * Extracts clean, tracker-stripped, advertisement-free Markdown text from
 * indexed document content or HTML sources.
 */

export interface ReaderDocument {
  url: string;
  title: string;
  markdown: string;
  wordCount: number;
  readingTimeMinutes: number;
  extractedAt: string;
}

export class ReaderExtractor {
  /**
   * Converts raw document text/HTML into a clean Markdown representation
   * stripping navigation, boilerplate, scripts, ads, and telemetry.
   */
  extract(url: string, title: string, rawContent: string): ReaderDocument {
    if (!rawContent || typeof rawContent !== 'string') {
      return {
        url,
        title: title || 'Untitled Document',
        markdown: '_No content available for reader mode._',
        wordCount: 0,
        readingTimeMinutes: 0,
        extractedAt: new Date().toISOString(),
      };
    }

    let cleaned = rawContent
      // Strip script and style tags
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
      .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
      .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
      // Convert common block HTML tags to Markdown
      .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n# $1\n')
      .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n## $1\n')
      .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n### $1\n')
      .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\n```\n$1\n```\n')
      .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
      .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
      .replace(/<p[^>]*>(.*?)<\/p>/gi, '\n$1\n')
      .replace(/<br\s*\/?>/gi, '\n')
      // Strip remaining HTML tags
      .replace(/<[^>]+>/g, '')
      // Decode standard HTML entities
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // Normalize consecutive blank lines
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (!cleaned) {
      cleaned = '_[Clean text extracted without script/ad trackers]_';
    }

    const words = cleaned.split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const readingTimeMinutes = Math.max(1, Math.round(wordCount / 200));

    const markdownOutput = `# ${title || 'Document'}\n\n> Source: [${url}](${url})\n> Read Time: ~${readingTimeMinutes} min (${wordCount} words)\n\n---\n\n${cleaned}`;

    return {
      url,
      title: title || 'Untitled Document',
      markdown: markdownOutput,
      wordCount,
      readingTimeMinutes,
      extractedAt: new Date().toISOString(),
    };
  }
}
