/**
 * OpenSearch Public Web Client (Phase 19)
 *
 * Provides reactive event handling, state transitions (loading, empty, error, results),
 * accessible keyboard interactions, and API communication.
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

  // Configuration
  const API_ENDPOINT = window.__OPENSEARCH_API_URL__ || '/api/v1/search';

  // State
  let currentQuery = '';
  let isLoading = false;

  function init() {
    // Check URL parameters for pre-filled query (e.g. ?q=test)
    const params = new URLSearchParams(window.location.search);
    const initialQuery = params.get('q') || '';

    if (initialQuery) {
      searchInput.value = initialQuery;
      updateClearButtonVisibility();
      performSearch(initialQuery);
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
      updateUrl(query);
      performSearch(query);
    });

    // Input events (clear button toggle & input validation)
    searchInput.addEventListener('input', function () {
      updateClearButtonVisibility();
    });

    // Clear button click
    clearBtn.addEventListener('click', function () {
      searchInput.value = '';
      updateClearButtonVisibility();
      searchInput.focus();
      setUiMode('home');
      updateUrl('');
    });

    // Error retry button
    if (errorRetryBtn) {
      errorRetryBtn.addEventListener('click', function () {
        if (currentQuery) {
          performSearch(currentQuery);
        }
      });
    }

    // Handle browser back/forward history navigation
    window.addEventListener('popstate', function (event) {
      const params = new URLSearchParams(window.location.search);
      const query = params.get('q') || '';
      searchInput.value = query;
      updateClearButtonVisibility();
      if (query) {
        performSearch(query, false);
      } else {
        setUiMode('home');
      }
    });
  }

  function updateClearButtonVisibility() {
    if (searchInput.value.length > 0) {
      clearBtn.classList.add('visible');
    } else {
      clearBtn.classList.remove('visible');
    }
  }

  function updateUrl(query) {
    const url = new URL(window.location.href);
    if (query) {
      url.searchParams.set('q', query);
    } else {
      url.searchParams.delete('q');
    }
    window.history.pushState({ q: query }, '', url.toString());
  }

  function setUiMode(mode) {
    if (mode === 'home') {
      mainContent.classList.add('center-mode');
      appHeader.classList.remove('has-searched');
      hideAllStates();
      if (resultsArea) resultsArea.innerHTML = '';
      if (resultsMeta) resultsMeta.textContent = '';
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

  async function performSearch(query, updateState = true) {
    if (isLoading) return;
    currentQuery = query;

    // Transition UI to search mode
    setUiMode('results');
    hideAllStates();
    loadingIndicator.classList.add('active');
    isLoading = true;

    try {
      const fetchUrl = `${API_ENDPOINT}?q=${encodeURIComponent(query)}`;
      const res = await fetch(fetchUrl);

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
      showError(
        'Unable to reach OpenSearch API server. Please ensure the API service is running and check your connection.',
      );
    } finally {
      loadingIndicator.classList.remove('active');
      isLoading = false;
    }
  }

  function renderSearchResults(data) {
    hideAllStates();

    const hits = data.results || [];
    const totalHits = data.meta?.totalHits || hits.length;
    const durationMs = data.meta?.durationMs || 0;

    if (hits.length === 0) {
      if (emptyQueryText) {
        emptyQueryText.textContent = currentQuery;
      }
      emptyState.classList.add('active');
      if (resultsMeta) resultsMeta.textContent = '';
      if (resultsArea) resultsArea.innerHTML = '';
      return;
    }

    if (resultsMeta) {
      resultsMeta.textContent = `Found ${totalHits} result${totalHits === 1 ? '' : 's'} (${durationMs}ms)`;
    }

    // Results rendering will be enhanced in Phase 20, for Phase 19 we provide clean accessible output
    let html = '';
    hits.forEach(item => {
      const displayTitle = item.highlightedTitle || escapeHtml(item.title) || 'Untitled';
      const displayUrl = escapeHtml(item.displayUrl || item.url);
      const snippet = item.highlightedSnippet || escapeHtml(item.snippet || '');

      html += `
        <article class="skeleton-card" style="animation:none;">
          <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" style="font-weight:600; color:var(--accent-primary); text-decoration:none; font-size:1.1rem;">
            ${displayTitle}
          </a>
          <div style="font-size:0.8rem; color:var(--text-secondary); word-break:break-all;">
            ${displayUrl}
          </div>
          <p style="font-size:0.9rem; color:var(--text-primary); margin-top:0.25rem;">
            ${snippet}
          </p>
        </article>
      `;
    });

    if (resultsArea) {
      resultsArea.innerHTML = html;
    }
  }

  function showError(msg) {
    hideAllStates();
    if (errorMessage) {
      errorMessage.textContent = msg;
    }
    errorState.classList.add('active');
    if (resultsArea) resultsArea.innerHTML = '';
    if (resultsMeta) resultsMeta.textContent = '';
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

  // Initialize once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
