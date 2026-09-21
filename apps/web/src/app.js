/**
 * OpenSearch Public Web Client (Terminal UI)
 *
 * Provides event handling, search query execution, terminal result rendering,
 * dot-leader pagination, states (loading, empty, error), keyboard navigation (Vim mode),
 * and URL synchronization.
 */

(function () {
  'use strict';

  // DOM Elements
  const searchForm = document.getElementById('search-form');
  const searchInput = document.getElementById('search-input');
  const autocompleteDropdown = document.getElementById('autocomplete-dropdown');
  const loadingIndicator = document.getElementById('loading-indicator');
  const emptyState = document.getElementById('empty-state');
  const emptyQueryText = document.getElementById('empty-query-text');
  const errorState = document.getElementById('error-state');
  const errorMessage = document.getElementById('error-message');
  const errorRetryBtn = document.getElementById('error-retry-btn');
  const resultsArea = document.getElementById('results-area');
  const resultsMeta = document.getElementById('results-meta');
  const instantAnswerCard = document.getElementById('instant-answer-card');
  const didYouMeanBanner = document.getElementById('did-you-mean-banner');
  const paginationArea = document.getElementById('pagination-area');
  const a11yAnnouncer = document.getElementById('a11y-announcer');
  const shortcutsModal = document.getElementById('shortcuts-modal');
  const shortcutsToggleBtn = document.getElementById('shortcuts-toggle-btn');
  const shortcutsCloseBtn = document.getElementById('shortcuts-close-btn');

  // Configuration
  const rawApiUrl = window.__OPENSEARCH_API_URL__ || '';
  const API_ENDPOINT = rawApiUrl
    ? rawApiUrl.endsWith('/api/v1/search')
      ? rawApiUrl
      : `${rawApiUrl.replace(/\/+$/, '')}/api/v1/search`
    : '/api/v1/search';
  const SUGGEST_ENDPOINT = API_ENDPOINT.replace('/search', '/suggest');
  const PAGE_SIZE = 10;

  // State
  let currentQuery = '';
  let currentPage = 1;
  let activeAbortController = null;
  let activeSuggestAbortController = null;
  let suggestDebounceTimer = null;
  let activeSuggestionIndex = -1;
  let currentSuggestions = [];
  let currentActiveResultIndex = -1;
  let currentResultItems = [];

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
      closeAutocomplete();
      const query = searchInput.value.trim();
      if (!query) return;
      currentPage = 1;
      updateUrl(query, currentPage);
      performSearch(query, currentPage);
    });

    // Autocomplete Input Handling (debounced 150ms)
    searchInput.addEventListener('input', function () {
      const query = searchInput.value.trim();
      if (suggestDebounceTimer) {
        clearTimeout(suggestDebounceTimer);
      }
      if (!query) {
        closeAutocomplete();
        return;
      }
      suggestDebounceTimer = setTimeout(function () {
        fetchSuggestions(query);
      }, 150);
    });

    // Close autocomplete on click outside
    document.addEventListener('click', function (e) {
      if (!searchForm.contains(e.target)) {
        closeAutocomplete();
      }
      if (
        shortcutsModal &&
        shortcutsModal.style.display === 'flex' &&
        e.target === shortcutsModal
      ) {
        closeShortcutsModal();
      }
    });

    // Error retry button
    if (errorRetryBtn) {
      errorRetryBtn.addEventListener('click', function () {
        if (currentQuery) {
          performSearch(currentQuery, currentPage);
        }
      });
    }

    // Shortcuts modal open/close triggers
    if (shortcutsToggleBtn) {
      shortcutsToggleBtn.addEventListener('click', function () {
        openShortcutsModal();
      });
    }
    if (shortcutsCloseBtn) {
      shortcutsCloseBtn.addEventListener('click', function () {
        closeShortcutsModal();
      });
    }

    // Keyboard navigation (Autocomplete & search input keys)
    searchInput.addEventListener('keydown', function (e) {
      if (!autocompleteDropdown || autocompleteDropdown.style.display === 'none') {
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        navigateSuggestions(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        navigateSuggestions(-1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeAutocomplete();
      } else if (e.key === 'Tab' && currentSuggestions.length > 0) {
        if (activeSuggestionIndex >= 0 && currentSuggestions[activeSuggestionIndex]) {
          e.preventDefault();
          selectSuggestion(currentSuggestions[activeSuggestionIndex].text);
        }
      }
    });

    // Global keyboard navigation (Phase 39: Vim/Terminal Mode)
    window.addEventListener('keydown', function (e) {
      const isInputFocused =
        document.activeElement === searchInput ||
        ['input', 'textarea', 'select'].includes(
          document.activeElement?.tagName?.toLowerCase() || '',
        );

      // Escape key handles multiple contexts
      if (e.key === 'Escape') {
        if (shortcutsModal && shortcutsModal.style.display === 'flex') {
          e.preventDefault();
          closeShortcutsModal();
          return;
        }

        if (autocompleteDropdown && autocompleteDropdown.style.display === 'flex') {
          closeAutocomplete();
          return;
        }

        if (document.activeElement === searchInput) {
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
          return;
        }

        if (currentActiveResultIndex >= 0) {
          clearActiveResultHighlight();
          return;
        }
      }

      // If user is actively typing in an input field, do NOT intercept single-letter hotkeys
      if (isInputFocused) {
        return;
      }

      // '/' key: focus search input and select text
      if (e.key === '/') {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
        return;
      }

      // '?' key: toggle keyboard shortcuts modal
      if (e.key === '?') {
        e.preventDefault();
        if (shortcutsModal && shortcutsModal.style.display === 'flex') {
          closeShortcutsModal();
        } else {
          openShortcutsModal();
        }
        return;
      }

      // If modal is open, ignore other navigation keys
      if (shortcutsModal && shortcutsModal.style.display === 'flex') {
        return;
      }

      // 'j' or 'ArrowDown': Move to next result card
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        navigateResultCards(1);
        return;
      }

      // 'k' or 'ArrowUp': Move to previous result card
      if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        navigateResultCards(-1);
        return;
      }

      // 'Enter': Open currently active result card URL
      if (e.key === 'Enter') {
        if (currentActiveResultIndex >= 0 && currentResultItems[currentActiveResultIndex]) {
          const itemEl = currentResultItems[currentActiveResultIndex];
          const link = itemEl.querySelector('.result-title-link');
          if (link && link.href) {
            e.preventDefault();
            window.open(link.href, '_blank', 'noopener,noreferrer');
          }
        }
        return;
      }

      // 'v': Toggle expanded snippet view
      if (e.key === 'v') {
        if (currentActiveResultIndex >= 0 && currentResultItems[currentActiveResultIndex]) {
          e.preventDefault();
          toggleExpandedDetails(currentResultItems[currentActiveResultIndex]);
        }
        return;
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

  function openShortcutsModal() {
    if (!shortcutsModal) return;
    shortcutsModal.style.display = 'flex';
    announceA11y('Keyboard shortcuts dialog opened. Press Escape to close.');
  }

  function closeShortcutsModal() {
    if (!shortcutsModal) return;
    shortcutsModal.style.display = 'none';
    announceA11y('Keyboard shortcuts dialog closed.');
  }

  function navigateResultCards(delta) {
    if (!resultsArea) return;
    currentResultItems = Array.from(resultsArea.querySelectorAll('.terminal-result-item'));
    if (!currentResultItems.length) return;

    if (currentActiveResultIndex >= 0 && currentResultItems[currentActiveResultIndex]) {
      currentResultItems[currentActiveResultIndex].classList.remove('active-item');
      currentResultItems[currentActiveResultIndex].setAttribute('aria-selected', 'false');
    }

    currentActiveResultIndex += delta;
    if (currentActiveResultIndex >= currentResultItems.length) {
      currentActiveResultIndex = 0;
    } else if (currentActiveResultIndex < 0) {
      currentActiveResultIndex = currentResultItems.length - 1;
    }

    const activeEl = currentResultItems[currentActiveResultIndex];
    if (activeEl) {
      activeEl.classList.add('active-item');
      activeEl.setAttribute('aria-selected', 'true');
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const titleLink = activeEl.querySelector('.result-title-link');
      const titleText = titleLink ? titleLink.textContent : `Result ${currentActiveResultIndex + 1}`;
      announceA11y(`Selected result ${currentActiveResultIndex + 1}: ${titleText}`);
    }
  }

  function clearActiveResultHighlight() {
    if (!resultsArea) return;
    const items = resultsArea.querySelectorAll('.terminal-result-item');
    items.forEach(function (el) {
      el.classList.remove('active-item');
      el.setAttribute('aria-selected', 'false');
    });
    currentActiveResultIndex = -1;
  }

  function toggleExpandedDetails(itemEl) {
    if (!itemEl) return;
    let detailsEl = itemEl.querySelector('.result-expanded-details');
    if (detailsEl) {
      detailsEl.remove();
      announceA11y('Details view collapsed.');
    } else {
      const docId = itemEl.getAttribute('data-document-id') || 'N/A';
      const linkEl = itemEl.querySelector('.result-title-link');
      const urlText = linkEl ? linkEl.href : 'N/A';

      detailsEl = document.createElement('div');
      detailsEl.className = 'result-expanded-details';
      detailsEl.innerHTML = `
        <div class="result-expanded-row">
          <span class="result-expanded-key">[doc-id]</span>
          <span class="result-expanded-val">${escapeHtml(docId)}</span>
        </div>
        <div class="result-expanded-row">
          <span class="result-expanded-key">[target-url]</span>
          <span class="result-expanded-val">${escapeHtml(urlText)}</span>
        </div>
        <div class="result-expanded-row">
          <span class="result-expanded-key">[preview-hint]</span>
          <span class="result-expanded-val">Press Enter to open in new tab | Press v to collapse</span>
        </div>
      `;
      itemEl.appendChild(detailsEl);
      announceA11y(`Expanded details for document ${docId}.`);
    }
  }

  async function fetchSuggestions(query) {
    if (activeSuggestAbortController) {
      activeSuggestAbortController.abort();
      activeSuggestAbortController = null;
    }

    activeSuggestAbortController = new AbortController();
    const signal = activeSuggestAbortController.signal;

    try {
      const fetchUrl = `${SUGGEST_ENDPOINT}?q=${encodeURIComponent(query)}&limit=5`;
      const res = await fetch(fetchUrl, { signal });
      if (!res.ok) {
        closeAutocomplete();
        return;
      }
      const data = await res.json();
      if (data.suggestions && data.suggestions.length > 0) {
        renderSuggestions(data.suggestions, query);
      } else {
        closeAutocomplete();
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        closeAutocomplete();
      }
    } finally {
      activeSuggestAbortController = null;
    }
  }

  function renderSuggestions(suggestions, query) {
    if (!autocompleteDropdown) return;
    currentSuggestions = suggestions;
    activeSuggestionIndex = -1;

    let html = '';
    suggestions.forEach(function (item, idx) {
      const text = item.text;
      const lowerText = text.toLowerCase();
      const lowerQuery = query.toLowerCase();

      let displayHtml = escapeHtml(text);
      if (lowerText.startsWith(lowerQuery)) {
        const matched = escapeHtml(text.slice(0, query.length));
        const rest = escapeHtml(text.slice(query.length));
        displayHtml = `<strong>${matched}</strong>${rest}`;
      }

      html += `
        <div
          class="autocomplete-item"
          role="option"
          data-index="${idx}"
          data-text="${escapeHtml(text)}"
          id="suggest-item-${idx}"
          aria-selected="false"
        >
          <span class="autocomplete-item-prefix">&gt;</span>
          <span class="autocomplete-item-text">${displayHtml}</span>
          <span class="autocomplete-item-hint">[suggest]</span>
        </div>
      `;
    });

    autocompleteDropdown.innerHTML = html;
    autocompleteDropdown.style.display = 'flex';
    searchInput.setAttribute('aria-expanded', 'true');

    // Attach click listeners to suggestions
    const items = autocompleteDropdown.querySelectorAll('.autocomplete-item');
    items.forEach(function (el) {
      el.addEventListener('click', function () {
        const text = el.getAttribute('data-text');
        if (text) {
          selectSuggestion(text);
        }
      });
    });
  }

  function navigateSuggestions(delta) {
    if (!currentSuggestions.length || !autocompleteDropdown) return;
    const items = autocompleteDropdown.querySelectorAll('.autocomplete-item');
    if (!items.length) return;

    if (activeSuggestionIndex >= 0 && items[activeSuggestionIndex]) {
      items[activeSuggestionIndex].classList.remove('active');
      items[activeSuggestionIndex].setAttribute('aria-selected', 'false');
    }

    activeSuggestionIndex += delta;
    if (activeSuggestionIndex >= items.length) {
      activeSuggestionIndex = 0;
    } else if (activeSuggestionIndex < 0) {
      activeSuggestionIndex = items.length - 1;
    }

    const activeItem = items[activeSuggestionIndex];
    if (activeItem) {
      activeItem.classList.add('active');
      activeItem.setAttribute('aria-selected', 'true');
      const text = activeItem.getAttribute('data-text');
      if (text) {
        searchInput.value = text;
      }
    }
  }

  function selectSuggestion(text) {
    searchInput.value = text;
    closeAutocomplete();
    currentPage = 1;
    updateUrl(text, currentPage);
    performSearch(text, currentPage);
  }

  function closeAutocomplete() {
    if (autocompleteDropdown) {
      autocompleteDropdown.style.display = 'none';
      autocompleteDropdown.innerHTML = '';
    }
    if (searchInput) {
      searchInput.setAttribute('aria-expanded', 'false');
    }
    currentSuggestions = [];
    activeSuggestionIndex = -1;
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
    if (instantAnswerCard) {
      instantAnswerCard.style.display = 'none';
      instantAnswerCard.innerHTML = '';
    }
    if (didYouMeanBanner) {
      didYouMeanBanner.style.display = 'none';
      didYouMeanBanner.innerHTML = '';
    }
    clearActiveResultHighlight();
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
    const didYouMean = data.didYouMean;
    const instantAnswer = data.instantAnswer;

    // Phase 38: Render Instant Answer / Bang Card if present
    if (instantAnswer && instantAnswerCard) {
      let swatchHtml = '';
      if (instantAnswer.previewCss) {
        swatchHtml = `<span class="instant-answer-swatch" style="background-color: ${escapeHtml(instantAnswer.previewCss)};"></span>`;
      }

      let detailsHtml = '';
      if (instantAnswer.secondaryDetails) {
        detailsHtml = '<div class="instant-answer-details">';
        for (const [key, val] of Object.entries(instantAnswer.secondaryDetails)) {
          detailsHtml += `
            <div class="instant-answer-detail-row">
              <span class="instant-answer-detail-key">${escapeHtml(key)}:</span>
              <span class="instant-answer-detail-val">${escapeHtml(String(val))}</span>
            </div>
          `;
        }
        detailsHtml += '</div>';
      }

      let actionHtml = '';
      if (instantAnswer.redirectUrl) {
        const safeRedirect = escapeHtml(instantAnswer.redirectUrl);
        actionHtml = `
          <div>
            <a href="${safeRedirect}" target="_blank" rel="noopener noreferrer" class="instant-answer-redirect-btn" id="bang-redirect-btn">
              &gt; Open in ${escapeHtml(instantAnswer.secondaryDetails?.['Target Service'] || 'External Service')}
            </a>
          </div>
        `;
      }

      instantAnswerCard.innerHTML = `
        <div class="instant-answer-header">
          <span class="instant-answer-badge">${escapeHtml(instantAnswer.badge || '[instant-answer]')}</span>
          <span class="instant-answer-title">${escapeHtml(instantAnswer.title || '')}</span>
        </div>
        <div class="instant-answer-result">
          ${swatchHtml}
          <span>${escapeHtml(instantAnswer.primaryResult || '')}</span>
        </div>
        ${detailsHtml}
        ${actionHtml}
      `;
      instantAnswerCard.style.display = 'block';
      announceA11y(`Instant answer: ${instantAnswer.primaryResult}`);
    }

    // Render Did You Mean banner if present
    if (didYouMean && didYouMean.suggestedQuery && didYouMeanBanner) {
      const safeSuggested = escapeHtml(didYouMean.suggestedQuery);
      didYouMeanBanner.innerHTML = `
        <span class="did-you-mean-prefix">[suggestion]</span>
        Did you mean: <a href="?q=${encodeURIComponent(didYouMean.suggestedQuery)}" class="did-you-mean-link" id="did-you-mean-link">${safeSuggested}</a> ?
      `;
      didYouMeanBanner.style.display = 'block';

      const dymLink = document.getElementById('did-you-mean-link');
      if (dymLink) {
        dymLink.addEventListener('click', function (e) {
          e.preventDefault();
          searchInput.value = didYouMean.suggestedQuery;
          currentPage = 1;
          updateUrl(didYouMean.suggestedQuery, currentPage);
          performSearch(didYouMean.suggestedQuery, currentPage);
        });
      }
    }

    if (hits.length === 0) {
      if (!instantAnswer) {
        if (emptyQueryText) {
          emptyQueryText.textContent = currentQuery;
        }
        if (emptyState) emptyState.style.display = 'block';
        announceA11y(`No search results found for ${currentQuery}.`);
      }
      if (resultsMeta) resultsMeta.textContent = '';
      if (resultsArea) resultsArea.innerHTML = '';
      if (paginationArea) paginationArea.innerHTML = '';
      return;
    }

    const plural = totalHits === 1 ? 'hit' : 'hits';
    let summaryText = `[status: 200 OK] ${totalHits.toLocaleString()} ${plural} (${durationMs}ms)`;

    // Display active filters in the search summary meta line (Phase 37)
    const filters = data.query?.filters;
    const filterTokens = [];
    if (filters) {
      if (filters.site) filterTokens.push(`site:${filters.site}`);
      if (filters.intitle && filters.intitle.length > 0) {
        filters.intitle.forEach(function (t) {
          filterTokens.push(`intitle:${t}`);
        });
      }
      if (filters.filetype) filterTokens.push(`filetype:${filters.filetype}`);
      if (filters.exact && filters.exact.length > 0) {
        filters.exact.forEach(function (e) {
          filterTokens.push(`exact:${e}`);
        });
      }
    }
    if (filterTokens.length > 0) {
      summaryText += ` [filters: ${filterTokens.join(', ')}]`;
    }

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
