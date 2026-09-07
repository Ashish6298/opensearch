/**
 * OpenSearch Public Web Client (Terminal UI)
 *
 * Provides event handling, search query execution, terminal result rendering,
 * dot-leader pagination, states (loading, empty, error), and URL synchronization.
 */

(function () {
  'use strict';

  // DOM Elements
  const searchForm = document.getElementById('search-form');
  const searchInput = document.getElementById('search-input');
  const loadingIndicator = document.getElementById('loading-indicator');
  const emptyState = document.getElementById('empty-state');
  const emptyQueryText = document.getElementById('empty-query-text');
  const errorState = document.getElementById('error-state');
  const errorMessage = document.getElementById('error-message');
  const errorRetryBtn = document.getElementById('error-retry-btn');
  const resultsArea = document.getElementById('results-area');
  const resultsMeta = document.getElementById('results-meta');
  const paginationArea = document.getElementById('pagination-area');
  const a11yAnnouncer = document.getElementById('a11y-announcer');

  // Configuration
  const rawApiUrl = window.__OPENSEARCH_API_URL__ || '';
  const API_ENDPOINT = rawApiUrl
    ? rawApiUrl.endsWith('/api/v1/search')
      ? rawApiUrl
      : `${rawApiUrl.replace(/\/+$/, '')}/api/v1/search`
    : '/api/v1/search';
  const PAGE_SIZE = 10;

  // State
  let currentQuery = '';
  let currentPage = 1;
  let activeAbortController = null;

  function init() {
    // Check URL parameters for pre-filled query and page
    const params = new URLSearchParams(window.location.search);
    const initialQuery = params.get('q') || '';
    const initialPage = parseInt(params.get('page') || '1', 10) || 1;

    if (initialQuery) {
      searchInput.value = initialQuery;
      performSearch(initialQuery, initialPage, false);
    } else {
      searchInput.focus();
    }

    attachEventListeners();
  }

  function attachEventListeners() {
    // Form submission
    searchForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const query = searchInput.value.trim();
      if (!query) return;
      currentPage = 1;
      updateUrl(query, currentPage);
      performSearch(query, currentPage);
    });

    // Error retry button
    if (errorRetryBtn) {
      errorRetryBtn.addEventListener('click', function () {
        if (currentQuery) {
          performSearch(currentQuery, currentPage);
        }
      });
    }

    // Keyboard navigation
    window.addEventListener('keydown', function (e) {
      // '/' key: focus search input if not inside an input
      if (
        e.key === '/' &&
        document.activeElement !== searchInput &&
        !['input', 'textarea', 'select'].includes(
          document.activeElement?.tagName?.toLowerCase() || '',
        )
      ) {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
      }

      // 'Escape' key: clear query
      if (e.key === 'Escape' && document.activeElement === searchInput) {
        if (searchInput.value.length > 0) {
          searchInput.value = '';
          hideAllStates();
          if (resultsArea) resultsArea.innerHTML = '';
          if (resultsMeta) resultsMeta.textContent = '';
          if (paginationArea) paginationArea.innerHTML = '';
          updateUrl('', 1);
          announceA11y('Search cleared.');
        } else {
          searchInput.blur();
        }
      }
    });

    // Pagination button clicks
    if (paginationArea) {
      paginationArea.addEventListener('click', function (e) {
        const targetBtn = e.target.closest('.pagination-btn');
        if (!targetBtn || targetBtn.disabled) return;

        const targetPage = parseInt(targetBtn.getAttribute('data-page') || '1', 10);
        if (targetPage && targetPage !== currentPage) {
          currentPage = targetPage;
          updateUrl(currentQuery, currentPage);
          performSearch(currentQuery, currentPage);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    }

    // Handle browser back/forward history
    window.addEventListener('popstate', function () {
      const params = new URLSearchParams(window.location.search);
      const query = params.get('q') || '';
      const page = parseInt(params.get('page') || '1', 10) || 1;

      searchInput.value = query;
      currentPage = page;

      if (query) {
        performSearch(query, page, false);
      } else {
        hideAllStates();
        if (resultsArea) resultsArea.innerHTML = '';
        if (resultsMeta) resultsMeta.textContent = '';
        if (paginationArea) paginationArea.innerHTML = '';
      }
    });
  }

  function announceA11y(message) {
    if (a11yAnnouncer) {
      a11yAnnouncer.textContent = message;
    }
  }

  function updateUrl(query, page) {
    const url = new URL(window.location.href);
    if (query) {
      url.searchParams.set('q', query);
      if (page > 1) {
        url.searchParams.set('page', page.toString());
      } else {
        url.searchParams.delete('page');
      }
    } else {
      url.searchParams.delete('q');
      url.searchParams.delete('page');
    }
    window.history.pushState({ q: query, page }, '', url.toString());
  }

  function hideAllStates() {
    if (loadingIndicator) loadingIndicator.style.display = 'none';
    if (emptyState) emptyState.style.display = 'none';
    if (errorState) errorState.style.display = 'none';
  }

  async function performSearch(query, page = 1) {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }

    currentQuery = query;
    currentPage = page;

    hideAllStates();
    if (paginationArea) paginationArea.innerHTML = '';
    if (loadingIndicator) loadingIndicator.style.display = 'block';
    announceA11y(`Searching for ${query}...`);

    activeAbortController = new AbortController();
    const signal = activeAbortController.signal;

    try {
      const fetchUrl = `${API_ENDPOINT}?q=${encodeURIComponent(query)}&page=${page}&pageSize=${PAGE_SIZE}`;
      const res = await fetch(fetchUrl, { signal });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const message =
          errorData.error?.message || `Server responded with status code ${res.status}`;
        showError(message);
        return;
      }

      const data = await res.json();
      renderSearchResults(data);
    } catch (err) {
      if (err.name === 'AbortError') {
        return;
      }
      showError(
        'Unable to reach OpenSearch API server. Ensure API service is running on port 3000.',
      );
    } finally {
      if (loadingIndicator) loadingIndicator.style.display = 'none';
      activeAbortController = null;
    }
  }

  function renderSearchResults(data) {
    hideAllStates();

    const hits = data.results || [];
    const totalHits = data.meta?.totalHits || 0;
    const durationMs = data.meta?.durationMs || 0;
    const pagination = data.pagination;

    if (hits.length === 0) {
      if (emptyQueryText) {
        emptyQueryText.textContent = currentQuery;
      }
      if (emptyState) emptyState.style.display = 'block';
      if (resultsMeta) resultsMeta.textContent = '';
      if (resultsArea) resultsArea.innerHTML = '';
      if (paginationArea) paginationArea.innerHTML = '';
      announceA11y(`No search results found for ${currentQuery}.`);
      return;
    }

    const plural = totalHits === 1 ? 'hit' : 'hits';
    const summaryText = `[status: 200 OK] ${totalHits.toLocaleString()} ${plural} (${durationMs}ms)`;
    if (resultsMeta) {
      resultsMeta.textContent = summaryText;
    }
    announceA11y(
      `${summaryText} for query ${currentQuery}. Showing page ${pagination?.page || 1}.`,
    );

    // Render terminal result cards
    let resultsHtml = '';
    const startIdx = pagination ? (pagination.page - 1) * pagination.pageSize : 0;

    hits.forEach((item, index) => {
      const safeUrl = escapeHtml(item.url || '#');
      const safeDisplayUrl = escapeHtml(item.displayUrl || item.url || '');
      const itemNum = startIdx + index + 1;

      const displayTitle = item.highlightedTitle
        ? sanitizeHighlightedHtml(item.highlightedTitle)
        : escapeHtml(item.title) || 'Untitled Document';

      const displaySnippet = item.highlightedSnippet
        ? sanitizeHighlightedHtml(item.highlightedSnippet)
        : escapeHtml(item.snippet || 'No snippet description available.');

      resultsHtml += `
        <article class="terminal-result-item" data-document-id="${escapeHtml(item.documentId || '')}">
          <div class="result-index-title">
            <span class="result-index">[${itemNum}]</span>
            <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="result-title-link">${displayTitle}</a>
          </div>
          <div class="result-url-line">&gt; ${safeDisplayUrl}</div>
          <p class="result-snippet">${displaySnippet}</p>
        </article>
      `;
    });

    if (resultsArea) {
      resultsArea.innerHTML = resultsHtml;
    }

    // Render terminal pagination bar
    if (paginationArea && pagination) {
      paginationArea.innerHTML = renderPaginationBar(pagination);
    }
  }

  function renderPaginationBar(pagination) {
    if (!pagination || pagination.totalPages <= 1) {
      return '';
    }

    const { page, totalPages, hasPrevPage, hasNextPage, prevPage, nextPage } = pagination;

    return `
      <button
        type="button"
        class="pagination-btn"
        data-page="${prevPage || 1}"
        ${!hasPrevPage ? 'disabled' : ''}
        aria-label="Previous page"
      >
        &lt; prev
      </button>
      <span class="pagination-info">page ${page} of ${totalPages}</span>
      <button
        type="button"
        class="pagination-btn"
        data-page="${nextPage || totalPages}"
        ${!hasNextPage ? 'disabled' : ''}
        aria-label="Next page"
      >
        next &gt;
      </button>
    `;
  }

  function showError(msg) {
    hideAllStates();
    if (errorMessage) {
      errorMessage.textContent = msg;
    }
    if (errorState) errorState.style.display = 'block';
    if (resultsArea) resultsArea.innerHTML = '';
    if (resultsMeta) resultsMeta.textContent = '';
    if (paginationArea) paginationArea.innerHTML = '';
    announceA11y(`Search request error: ${msg}`);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function sanitizeHighlightedHtml(rawText) {
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

  // Initialize on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
