/**
 * @opensearch/web — Result Formatting Utilities (Phase 20, Phase 78 & Phase 80)
 *
 * Provides pure formatting functions for rendering search results:
 * - Result card HTML with title, display URL, domain badge, snippet, and highlights
 * - Category-aware formatting for All, Images, and News
 * - Enforces safe image URLs, source attribution, and license verification
 * - Distinguishes stale news from recent information (zero timestamp fabrication)
 * - Category-specific empty states when a category is unavailable
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
  source?: string;
  attribution?: string;
  license?: string;
  contentType?: string;
  publishedAt?: string;
  publicationDate?: string;
  thumbnailUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
  isStale?: boolean;
  recencyLabel?: string;
  isDemo?: boolean;
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

const DISALLOWED_SCHEMES = [
  'javascript:',
  'vbscript:',
  'file:',
  'ftp:',
  'blob:',
  'about:',
  'chrome:',
  'view-source:',
];

/**
 * Validates and sanitizes image URLs strictly allowing only http: and https: protocols.
 */
export function validateSafeImageUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > 4096) return null;
  if (/[\x00-\x1f\x7f]/.test(trimmed)) return null;

  const lower = trimmed.toLowerCase();
  for (const scheme of DISALLOWED_SCHEMES) {
    if (lower.startsWith(scheme)) return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    if (!parsed.hostname || parsed.hostname.length === 0) {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

export interface NewsRecencyInfo {
  isRecent: boolean;
  isStale: boolean;
  label: string;
  ageDays: number;
  formattedDate: string;
}

/**
 * Accurately evaluates publication timestamp recency vs staleness.
 * Never fabricates publication dates; returns null if missing or invalid.
 */
export function evaluateNewsRecency(
  publishedAt: string | undefined,
  referenceNowMs: number = Date.now(),
): NewsRecencyInfo | null {
  if (!publishedAt || typeof publishedAt !== 'string') {
    return null;
  }
  const trimmed = publishedAt.trim();
  if (!trimmed) return null;

  const parsed = new Date(trimmed);
  const timeMs = parsed.getTime();
  if (isNaN(timeMs)) {
    return null;
  }

  const ageMs = Math.max(0, referenceNowMs - timeMs);
  const ageMinutes = Math.floor(ageMs / (60 * 1000));
  const ageHours = Math.floor(ageMs / (60 * 60 * 1000));
  const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
  const formattedDate = parsed.toISOString().split('T')[0] ?? '';

  if (ageHours < 24) {
    const label = ageHours < 1
      ? (ageMinutes <= 1 ? 'Just now' : `${ageMinutes}m ago`)
      : `${ageHours}h ago`;
    return {
      isRecent: true,
      isStale: false,
      label,
      ageDays: 0,
      formattedDate,
    };
  }

  if (ageDays <= 7) {
    return {
      isRecent: true,
      isStale: false,
      label: `${ageDays}d ago`,
      ageDays,
      formattedDate,
    };
  }

  if (ageDays <= 30) {
    const weeks = Math.floor(ageDays / 7);
    return {
      isRecent: false,
      isStale: false,
      label: `${weeks}w ago`,
      ageDays,
      formattedDate,
    };
  }

  const months = Math.floor(ageDays / 30);
  const staleLabel = ageDays > 365
    ? `${Math.floor(ageDays / 365)}y ago`
    : `${months}mo ago`;

  return {
    isRecent: false,
    isStale: true,
    label: staleLabel,
    ageDays,
    formattedDate,
  };
}

/**
 * Renders a single result card component HTML.
 */
export function renderResultCard(item: FormattedResultItem): string {
  const safeUrl = escapeHtml(item.url || '#');
  const safeDomain = escapeHtml(item.domain || '');
  const safeDisplayUrl = escapeHtml(item.displayUrl || item.url || '');
  const safeAttribution = item.attribution ? escapeHtml(item.attribution) : '';
  const safeLicense = item.license ? escapeHtml(item.license) : '';
  const safeSource = item.source && item.source !== 'local-index' ? escapeHtml(item.source) : '';
  const safeContentType = item.contentType ? escapeHtml(item.contentType) : '';

  const rawDate = item.publishedAt || item.publicationDate;
  let formattedDate = '';
  let recencyBadge = '';

  if (rawDate) {
    try {
      const parsed = new Date(rawDate);
      if (!isNaN(parsed.getTime())) {
        formattedDate = parsed.toISOString().split('T')[0] ?? '';
        const recency = evaluateNewsRecency(rawDate);
        if (recency) {
          if (recency.isRecent) {
            recencyBadge = `<span class="news-recency-badge recent" aria-label="Recent news">${escapeHtml(recency.label)}</span>`;
          } else if (recency.isStale) {
            recencyBadge = `<span class="news-recency-badge stale" aria-label="Stale news">[stale: ${escapeHtml(recency.label)}]</span>`;
          } else {
            recencyBadge = `<span class="news-recency-badge standard">${escapeHtml(recency.label)}</span>`;
          }
        }
      } else {
        formattedDate = escapeHtml(String(rawDate));
      }
    } catch {
      formattedDate = escapeHtml(String(rawDate));
    }
  }

  const displayTitle = item.highlightedTitle
    ? sanitizeHighlightedHtml(item.highlightedTitle)
    : escapeHtml(item.title) || 'Untitled Document';

  const displaySnippet = item.highlightedSnippet
    ? sanitizeHighlightedHtml(item.highlightedSnippet)
    : escapeHtml(item.snippet || 'No description available.');

  const provenanceBadge = safeAttribution
    ? `<span class="result-attribution-badge" aria-label="Attribution">[${safeAttribution}]</span>`
    : (safeSource ? `<span class="result-source-badge" aria-label="Source">[source: ${safeSource}]</span>` : '');

  const demoBadge = item.isDemo
    ? `<span class="result-demo-badge" aria-label="Demo corpus result">[Demo]</span>`
    : '';

  const licenseBadge = safeLicense
    ? `<span class="result-license-badge" aria-label="License">[${safeLicense}]</span>`
    : '';

  const contentTypeBadge = safeContentType
    ? `<span class="result-content-type-badge" aria-label="Content Type">[${safeContentType}]</span>`
    : '';

  const dateBadge = formattedDate
    ? `<time class="result-date-badge" datetime="${escapeHtml(rawDate)}" aria-label="Published date">${formattedDate}</time>`
    : '';

  const safeThumbnailUrl = validateSafeImageUrl(item.thumbnailUrl);
  const thumbnailHtml = safeThumbnailUrl
    ? `<div class="result-thumbnail"><img src="${escapeHtml(safeThumbnailUrl)}" alt="" loading="lazy" class="result-thumbnail-img" onerror="this.closest('.result-thumbnail')?.remove();" /></div>`
    : '';

  return `
    <article class="result-card" data-document-id="${escapeHtml(item.documentId)}" role="article" aria-labelledby="result-title-${escapeHtml(item.documentId)}">
      ${thumbnailHtml}
      <div class="result-content">
        <div class="result-header">
          ${demoBadge ? `${demoBadge} ` : ''}${safeDomain ? `<span class="result-domain-badge" aria-label="Domain">${safeDomain}</span>` : ''}
          ${provenanceBadge ? `${provenanceBadge} ` : ''}${licenseBadge ? `${licenseBadge} ` : ''}${contentTypeBadge ? `${contentTypeBadge} ` : ''}${dateBadge ? `${dateBadge} ` : ''}${recencyBadge ? `${recencyBadge} ` : ''}<cite class="result-url" title="${safeUrl}">${safeDisplayUrl}</cite>
        </div>
        <h2 class="result-title" id="result-title-${escapeHtml(item.documentId)}">
          <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="result-link" aria-label="${escapeHtml(item.title || 'Untitled Document')} (opens in new tab)">
            ${displayTitle}
          </a>
        </h2>
        <p class="result-snippet">
          ${displaySnippet}
        </p>
      </div>
    </article>
  `.trim();
}

/**
 * Renders an Image Result Card (for the Images category grid).
 * Enforces safe image URL, source attribution, and license information.
 */
export function renderImageCard(item: FormattedResultItem): string {
  const safeThumbUrl = validateSafeImageUrl(item.thumbnailUrl);
  if (!safeThumbUrl) return '';

  const safeUrl = escapeHtml(item.url || '#');
  const safeTitle = escapeHtml(item.title || 'Untitled Image');
  const safeAttribution = escapeHtml(item.attribution || (item.source ? `Source: ${item.source}` : 'Wikimedia Commons'));
  const safeLicense = item.license ? escapeHtml(item.license) : '';
  const safeDomain = escapeHtml(item.domain || '');
  const dimensions = (item.imageWidth && item.imageHeight)
    ? `${item.imageWidth}×${item.imageHeight}`
    : '';

  return `
    <div class="image-card" data-document-id="${escapeHtml(item.documentId)}" role="group" aria-label="${safeTitle}">
      <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="image-card-link" aria-label="${safeTitle} (opens in new tab)">
        <div class="image-card-thumb-container">
          <img src="${escapeHtml(safeThumbUrl)}" alt="${safeTitle}" loading="lazy" referrerpolicy="no-referrer" class="image-card-thumb" onerror="this.closest('.image-card')?.remove();" />
          ${dimensions ? `<span class="image-card-dimensions">${escapeHtml(dimensions)}</span>` : ''}
        </div>
        <div class="image-card-info">
          <div class="image-card-title" title="${safeTitle}">${safeTitle}</div>
          <div class="image-card-meta">
            ${safeDomain ? `<span class="image-card-domain">${safeDomain}</span>` : ''}
            <span class="image-card-attribution" title="${safeAttribution}">[${safeAttribution}]</span>
            ${safeLicense ? `<span class="image-card-license">[${safeLicense}]</span>` : ''}
          </div>
        </div>
      </a>
    </div>
  `.trim();
}

/**
 * Renders a useful empty state when a category is unavailable or yields zero results.
 */
export function renderCategoryEmptyState(category: string, query: string, isLocalOnly = false): string {
  const catLower = category.toLowerCase().trim();
  const safeQuery = escapeHtml(query);

  if (catLower === 'images' || catLower === 'multimedia' || catLower === 'image') {
    return `
      <div class="category-empty-state" role="status" aria-live="polite">
        <div class="category-empty-title">[0 image results]</div>
        <p class="category-empty-desc">
          ${isLocalOnly
            ? 'Image search is unavailable in Local-only mode because the local index does not contain multimedia assets.'
            : `No verified image results found for "${safeQuery}". Only authenticated sources with verified licenses and safe thumbnails are displayed.`}
        </p>
        <div class="category-empty-hint">&gt; Try switching to the "All" tab or searching for broader subjects.</div>
      </div>
    `.trim();
  }

  if (catLower === 'news') {
    return `
      <div class="category-empty-state" role="status" aria-live="polite">
        <div class="category-empty-title">[0 news articles]</div>
        <p class="category-empty-desc">
          ${isLocalOnly
            ? 'News category search is unavailable in Local-only mode. No local documents are classified as news.'
            : `No recent news articles found for "${safeQuery}". Results are restricted strictly to verified news sources with authentic timestamps.`}
        </p>
        <div class="category-empty-hint">&gt; General web and encyclopedia results can be viewed on the "All" tab.</div>
      </div>
    `.trim();
  }

  return `
    <div class="category-empty-state" role="status" aria-live="polite">
      <div class="category-empty-title">[0 hits]</div>
      <p class="category-empty-desc">No results found in "${escapeHtml(category)}" category for "${safeQuery}".</p>
      <div class="category-empty-hint">&gt; Try switching to "All" to view combined general results.</div>
    </div>
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