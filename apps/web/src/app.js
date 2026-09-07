/**
 * OpenSearch Public Web Client (Phase 19 & 20)
 *
 * Provides reactive event handling, search query execution, result card rendering,
 * query term highlights, multi-page pagination navigation, loading/empty/error states,
 * and browser URL synchronization.
 */

(function () {
  'use strict';

  // DOM Elements
  const searchForm = document.getElementById('search-form');
  const searchInput = document.getElementById('search-input');
  const clearBtn = document.getElementById('search-clear-btn');
  const loadingIndicator = document.getElementById('loading-indicator');
  const emptyState = document.getElementById('empty-state');
  const emptyQueryText = document.getElementById('empty-query-text');
  const errorState = document.getElementById('error-state');
  const errorMessage = document.getElementById('error-message');
  const errorRetryBtn = document.getElementById('error-retry-btn');
  const mainContent = document.getElementById('main-content');
  const appHeader = document.getElementById('app-header');
  const resultsArea = document.getElementById('results-area');
  const resultsMeta = document.getElementById('results-meta');
  const paginationArea = document.getElementById('pagination-area');
  const a11yAnnouncer = document.getElementById('a11y-announcer');

  // Configuration
  const API_ENDPOINT = window.__OPENSEARCH_API_URL__ || '/api/v1/search';
  const PAGE_SIZE = 10;

  // State
  let currentQuery = '';
  let currentPage = 1;
  let activeAbortController = null;
  let _isLoading = false;

  function init() {
    // Check URL parameters for pre-filled query and page (e.g. ?q=test&page=2)
    const params = new URLSearchParams(window.location.search);
    const initialQuery = params.get('q') || '';
    const initialPage = parseInt(params.get('page') || '1', 10) || 1;

    if (initialQuery) {
      searchInput.value = initialQuery;
      updateClearButtonVisibility();
      performSearch(initialQuery, initialPage, false);
    } else {
      setUiMode('home');
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

    // Input events (clear button toggle)
    searchInput.addEventListener('input', function () {
      updateClearButtonVisibility();
    });

    // Clear button click
    clearBtn.addEventListener('click', function () {
      searchInput.value = '';
      updateClearButtonVisibility();
      searchInput.focus();
      setUiMode('home');
      updateUrl('', 1);
      announceA11y('Search input cleared.');
    });

    // Error retry button
    if (errorRetryBtn) {
      errorRetryBtn.addEventListener('click', function () {
        if (currentQuery) {
          performSearch(currentQuery, currentPage);
        }
      });
    }

    // Global keyboard shortcuts (Phase 21)
    window.addEventListener('keydown', function (e) {
      // '/' key: focus search input if not already typing in an input
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

      // 'Escape' key inside search input: clear query or blur
      if (e.key === 'Escape' && document.activeElement === searchInput) {
        if (searchInput.value.length > 0) {
          searchInput.value = '';
          updateClearButtonVisibility();
          announceA11y('Search cleared.');
        } else {
          searchInput.blur();
        }
      }
    });

    // Pagination button clicks (event delegation)
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

    // Handle browser back/forward history navigation
    window.addEventListener('popstate', function () {
      const params = new URLSearchParams(window.location.search);
      const query = params.get('q') || '';
      const page = parseInt(params.get('page') || '1', 10) || 1;

      searchInput.value = query;
      updateClearButtonVisibility();
      currentPage = page;

      if (query) {
        performSearch(query, page, false);
      } else {
        setUiMode('home');
      }
    });
  }

  function announceA11y(message) {
    if (a11yAnnouncer) {
      a11yAnnouncer.textContent = message;
    }
  }

  function updateClearButtonVisibility() {
    if (searchInput.value.length > 0) {
      clearBtn.classList.add('visible');
    } else {
      clearBtn.classList.remove('visible');
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

  function setUiMode(mode) {
    if (mode === 'home') {
      mainContent.classList.add('center-mode');
      appHeader.classList.remove('has-searched');
      hideAllStates();
      if (resultsArea) resultsArea.innerHTML = '';
      if (resultsMeta) resultsMeta.textContent = '';
      if (paginationArea) paginationArea.innerHTML = '';
    } else {
      mainContent.classList.remove('center-mode');
      appHeader.classList.add('has-searched');
    }
  }

  function hideAllStates() {
    loadingIndicator.classList.remove('active');
    emptyState.classList.remove('active');
    errorState.classList.remove('active');
  }

  async function performSearch(query, page = 1) {
    // Cancel any previous inflight search request to avoid race conditions and wasted resources
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }

    currentQuery = query;
    currentPage = page;

    // Transition UI to search results mode
    setUiMode('results');
    hideAllStates();
    if (paginationArea) paginationArea.innerHTML = '';
    loadingIndicator.classList.add('active');
    _isLoading = true;
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
        // Request was aborted by newer search, ignore silently
        return;
      }
      showError(
        'Unable to reach OpenSearch API server. Please ensure the API service is running and check your connection.',
      );
    } finally {
      loadingIndicator.classList.remove('active');
      _isLoading = false;
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
      emptyState.classList.add('active');
      if (resultsMeta) resultsMeta.textContent = '';
      if (resultsArea) resultsArea.innerHTML = '';
      if (paginationArea) paginationArea.innerHTML = '';
      announceA11y(`No search results found for ${currentQuery}.`);
      return;
    }

    const plural = totalHits === 1 ? 'result' : 'results';
    const summaryText = `About ${totalHits.toLocaleString()} ${plural} (${durationMs}ms)`;
    if (resultsMeta) {
      resultsMeta.textContent = summaryText;
    }
    announceA11y(`${summaryText} for query ${currentQuery}. Showing page ${pagination?.page || 1}.`);

    // Render result cards
    let resultsHtml = '';
    hits.forEach(item => {
      const safeUrl = escapeHtml(item.url || '#');
      const safeDomain = escapeHtml(item.domain || '');
      const safeDisplayUrl = escapeHtml(item.displayUrl || item.url || '');

      const displayTitle = item.highlightedTitle
        ? sanitizeHighlightedHtml(item.highlightedTitle)
        : escapeHtml(item.title) || 'Untitled Document';

      const displaySnippet = item.highlightedSnippet
        ? sanitizeHighlightedHtml(item.highlightedSnippet)
        : escapeHtml(item.snippet || 'No description available.');

      resultsHtml += `
        <article class="result-card" data-document-id="${escapeHtml(item.documentId)}">
          <div class="result-header">
            ${safeDomain ? `<span class="result-domain-badge">${safeDomain}</span>` : ''}
            <cite class="result-url" title="${safeUrl}">${safeDisplayUrl}</cite>
          </div>
          <h2 class="result-title">
            <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="result-link">
              ${displayTitle}
            </a>
          </h2>
          <p class="result-snippet">
            ${displaySnippet}
          </p>
        </article>
      `;
    });

    if (resultsArea) {
      resultsArea.innerHTML = resultsHtml;
    }

    // Render pagination controls
    if (paginationArea && pagination) {
      paginationArea.innerHTML = renderPaginationBar(pagination);
    }
  }

  function renderPaginationBar(pagination) {
    if (!pagination || pagination.totalPages <= 1) {
      return '';
    }

    const { page, totalPages, hasPrevPage, hasNextPage, prevPage, nextPage } = pagination;

    let pagesHtml = '';
    const maxButtons = 5;
    let startPage = Math.max(1, page - Math.floor(maxButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);

    if (endPage - startPage + 1 < maxButtons) {
      startPage = Math.max(1, endPage - maxButtons + 1);
    }

    for (let p = startPage; p <= endPage; p++) {
      const isCurrent = p === page;
      pagesHtml += `
        <button
          type="button"
          class="pagination-btn ${isCurrent ? 'active' : ''}"
          data-page="${p}"
          aria-label="Go to page ${p}"
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
          aria-label="Previous page"
        >
          ← Previous
        </button>
        <div class="pagination-pages">
          ${pagesHtml}
        </div>
        <button
          type="button"
          class="pagination-btn pagination-next"
          id="pagination-next-btn"
          data-page="${nextPage || totalPages}"
          ${!hasNextPage ? 'disabled aria-disabled="true"' : ''}
          aria-label="Next page"
        >
          Next →
        </button>
      </nav>
    `;
  }

  function showError(msg) {
    hideAllStates();
    if (errorMessage) {
      errorMessage.textContent = msg;
    }
    errorState.classList.add('active');
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

  // Initialize once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
