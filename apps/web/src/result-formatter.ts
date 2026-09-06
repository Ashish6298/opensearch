/**
 * @opensearch/web — Result Formatting Utilities (Phase 20)
 *
 * Provides pure formatting functions for rendering search results:
 * - Result card HTML with title, display URL, domain badge, snippet, and highlights
 * - Pagination bar controls (Previous, numbered pages, Next)
 * - Result summary counters ("About 42 results (12ms)")
 * - HTML escaping and security sanitization
 */

export interface FormattedResultItem {
  documentId: string;
  url: string;
  displayUrl?: string;
  domain?: string;
  title: string;
  highlightedTitle?: string;
  snippet?: string;
  highlightedSnippet?: string;
  score?: number;
  rank?: number;
}

export interface PaginationData {
  page: number;
  pageSize: number;
  totalHits: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  nextPage: number | null;
  prevPage: number | null;
}

/**
 * Escapes unsafe characters for HTML injection.
 */
export function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Sanitizes and permits only `<mark>` and `</mark>` tags within pre-highlighted text.
 */
export function sanitizeHighlightedHtml(rawText: string): string {
  if (!rawText) return '';
  // Split around <mark> and </mark> tags to escape all content while preserving safe mark highlights
  return rawText
    .split(/(<\/?mark>)/i)
    .map(token => {
      const lower = token.toLowerCase();
      if (lower === '<mark>' || lower === '</mark>') {
        return lower;
      }
      return escapeHtml(token);
    })
    .join('');
}

/**
 * Renders a single result card component HTML.
 */
export function renderResultCard(item: FormattedResultItem): string {
  const safeUrl = escapeHtml(item.url || '#');
  const safeDomain = escapeHtml(item.domain || '');
  const safeDisplayUrl = escapeHtml(item.displayUrl || item.url || '');

  const displayTitle = item.highlightedTitle
    ? sanitizeHighlightedHtml(item.highlightedTitle)
    : escapeHtml(item.title) || 'Untitled Document';

  const displaySnippet = item.highlightedSnippet
    ? sanitizeHighlightedHtml(item.highlightedSnippet)
    : escapeHtml(item.snippet || 'No description available.');

  return `
    <article class="result-card" data-document-id="${escapeHtml(item.documentId)}" role="article" aria-labelledby="result-title-${escapeHtml(item.documentId)}">
      <div class="result-header">
        ${safeDomain ? `<span class="result-domain-badge" aria-label="Domain">${safeDomain}</span>` : ''}
        <cite class="result-url" title="${safeUrl}">${safeDisplayUrl}</cite>
      </div>
      <h2 class="result-title" id="result-title-${escapeHtml(item.documentId)}">
        <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="result-link" aria-label="${escapeHtml(item.title || 'Untitled Document')} (opens in new tab)">
          ${displayTitle}
        </a>
      </h2>
      <p class="result-snippet">
        ${displaySnippet}
      </p>
    </article>
  `.trim();
}

/**
 * Renders the results summary metadata bar ("About 12 results (8ms)").
 */
export function renderResultsSummary(totalHits: number, durationMs: number): string {
  if (totalHits <= 0) return '';
  const plural = totalHits === 1 ? 'result' : 'results';
  return `About ${totalHits.toLocaleString()} ${plural} (${durationMs}ms)`;
}

/**
 * Renders the pagination navigation controls component HTML.
 */
export function renderPaginationControls(pagination: PaginationData): string {
  if (pagination.totalPages <= 1) {
    return '';
  }

  const { page, totalPages, hasPrevPage, hasNextPage, prevPage, nextPage } = pagination;

  let pagesHtml = '';
  // Show up to 5 page number buttons centered around current page
  const maxButtons = 5;
  let startPage = Math.max(1, page - Math.floor(maxButtons / 2));
  const endPage = Math.min(totalPages, startPage + maxButtons - 1);

  if (endPage - startPage + 1 < maxButtons) {
    startPage = Math.max(1, endPage - maxButtons + 1);
  }

  for (let p = startPage; p <= endPage; p++) {
    const isCurrent = p === page;
    pagesHtml += `
      <button
        type="button"
        class="pagination-btn page-num-btn ${isCurrent ? 'active' : ''}"
        data-page="${p}"
        aria-label="Page ${p}${isCurrent ? ', current page' : ''}"
        ${isCurrent ? 'aria-current="page" disabled' : ''}
      >
        ${p}
      </button>
    `;
  }

  return `
    <nav class="pagination-container" aria-label="Search Results Pagination">
      <button
        type="button"
        class="pagination-btn pagination-prev"
        id="pagination-prev-btn"
        data-page="${prevPage || 1}"
        ${!hasPrevPage ? 'disabled aria-disabled="true"' : ''}
        aria-label="Go to previous page"
      >
        ← Previous
      </button>
      <div class="pagination-pages" role="group" aria-label="Page selection">
        ${pagesHtml}
      </div>
      <button
        type="button"
        class="pagination-btn pagination-next"
        id="pagination-next-btn"
        data-page="${nextPage || totalPages}"
        ${!hasNextPage ? 'disabled aria-disabled="true"' : ''}
        aria-label="Go to next page"
      >
        Next →
      </button>
    </nav>
  `.trim();
}
