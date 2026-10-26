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
  const themeSwitcherBtn = document.getElementById('theme-switcher-btn');
  const partialResultsBanner = document.getElementById('partial-results-banner');
  const partialResultsText = document.getElementById('partial-results-text');
  const partialRetryBtn = document.getElementById('partial-retry-btn');
  const offlineState = document.getElementById('offline-state');
  const offlineRetryBtn = document.getElementById('offline-retry-btn');
  const providerFailureState = document.getElementById('provider-failure-state');
  const providerFailureMessage = document.getElementById('provider-failure-message');
  const providerRetryBtn = document.getElementById('provider-retry-btn');
  const rateLimitState = document.getElementById('rate-limit-state');
  const rateLimitCountdown = document.getElementById('rate-limit-countdown');
  const rateLimitRetryBtn = document.getElementById('rate-limit-retry-btn');
  const resultFiltersBar = document.getElementById('result-filters-bar');
  const onboardingCard = document.getElementById('onboarding-card');
  const onboardingDismissX = document.getElementById('onboarding-dismiss-x');
  const categoryEmptyStateContainer = document.getElementById('category-empty-state-container');
  const onboardingGotItBtn = document.getElementById('onboarding-got-it-btn');
  const onboardingSettingsLink = document.getElementById('onboarding-settings-link');
  const settingsModal = document.getElementById('settings-modal');
  const settingsToggleBtn = document.getElementById('settings-toggle-btn');
  const footerSettingsBtn = document.getElementById('footer-settings-btn');
  const settingsCloseBtn = document.getElementById('settings-close-btn');
  const settingThemeSelect = document.getElementById('setting-theme-select');
  const settingLocalOnlyToggle = document.getElementById('setting-local-only-toggle');
  const settingNewTabToggle = document.getElementById('setting-new-tab-toggle');
  const settingSafeSearchSelect = document.getElementById('setting-safe-search-select');
  const resetSettingsBtn = document.getElementById('reset-settings-btn');
  const showOnboardingBtn = document.getElementById('show-onboarding-btn');
  const settingsStatusMsg = document.getElementById('settings-status-msg');

  // Configuration
  const rawApiUrl = window.__OPENSEARCH_API_URL__ || '';
  const API_ENDPOINT = rawApiUrl
    ? rawApiUrl.endsWith('/api/v1/search')
      ? rawApiUrl
      : `${rawApiUrl.replace(/\/+$/, '')}/api/v1/search`
    : '/api/v1/search';
  const SUGGEST_ENDPOINT = API_ENDPOINT.replace('/search', '/suggest');
  const PAGE_SIZE = 10;
  const THEMES = ['dark', 'light', 'matrix', 'amber', 'dracula', 'nord', 'monokai'];

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
  let currentTheme = 'dark';
  let currentRequestId = 0;
  let activeFilter = 'all';
  let rateLimitTimer = null;
  let rateLimitSecondsLeft = 0;
  let currentThemePreference = 'system';
  let isLocalOnly = false;
  let openInNewTab = true;
    currentSafeSearch = 'moderate';
  let currentSafeSearch = 'moderate';

  const PREFERENCE_KEYS = {
    THEME: 'opensearch_theme',
    LOCAL_ONLY: 'opensearch_local_only',
    SAFE_SEARCH: 'opensearch_safe_search',
    OPEN_NEW_TAB: 'opensearch_open_new_tab',
    ONBOARDING_DISMISSED: 'opensearch_onboarding_dismissed',
  };

  function init() {
    initPreferences();
    initTheme();

    // Check URL parameters for pre-filled query, page, and filter
    const params = new URLSearchParams(window.location.search);
    const initialQuery = params.get('q') || '';
    const initialPage = parseInt(params.get('page') || '1', 10) || 1;
    const initialFilter = params.get('filter') || 'all';
    activeFilter = initialFilter;
    updateActiveFilterUI(activeFilter);

    if (initialQuery) {
      searchInput.value = initialQuery;
      performSearch(initialQuery, initialPage, false);
    } else {
      searchInput.focus();
    }

    attachEventListeners();
  }

  function initPreferences() {
    try {
      const storedTheme = localStorage.getItem(PREFERENCE_KEYS.THEME) || 'system';
      currentThemePreference = storedTheme;

      isLocalOnly = localStorage.getItem(PREFERENCE_KEYS.LOCAL_ONLY) === 'true';
      if (settingLocalOnlyToggle) {
        settingLocalOnlyToggle.checked = isLocalOnly;
      }

      openInNewTab = localStorage.getItem(PREFERENCE_KEYS.OPEN_NEW_TAB) !== 'false';
      if (settingNewTabToggle) {
        settingNewTabToggle.checked = openInNewTab;
      }

      const dismissed = localStorage.getItem(PREFERENCE_KEYS.ONBOARDING_DISMISSED) === 'true';
      if (!dismissed && onboardingCard) {
        onboardingCard.style.display = 'block';
      }
    } catch {}
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

    // Phase 40: Theme Switcher click trigger
    if (themeSwitcherBtn) {
      themeSwitcherBtn.addEventListener('click', function () {
        cycleTheme();
      });
    }

    // Phase 77: Quick topic pills
    const quickTopicBtns = document.querySelectorAll('.quick-topic-tag');
    quickTopicBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        const query = btn.getAttribute('data-query');
        if (query && searchInput) {
          searchInput.value = query;
          searchInput.focus();
          performSearch(query, 1);
        }
      });
    });

    // Phase 78: Result filters bar button clicks (preserves current query)
    if (resultFiltersBar) {
      resultFiltersBar.addEventListener('click', function (e) {
        const btn = e.target.closest('.result-filter-btn');
        if (!btn) return;
        const filterVal = btn.getAttribute('data-filter') || 'all';
        if (filterVal === activeFilter) return;

        activeFilter = filterVal;
        updateActiveFilterUI(activeFilter);

        const query = currentQuery || searchInput.value.trim();
        if (query) {
          currentPage = 1;
          updateUrl(query, currentPage, activeFilter);
          performSearch(query, currentPage);
        }
      });
    }

    // Phase 78: Network connectivity listeners
    window.addEventListener('offline', function () {
      showOfflineState();
    });

    window.addEventListener('online', function () {
      if (offlineState && offlineState.style.display !== 'none') {
        offlineState.style.display = 'none';
        if (currentQuery) {
          performSearch(currentQuery, currentPage);
        }
      }
    });

    // Phase 78: State retry buttons
    if (offlineRetryBtn) {
      offlineRetryBtn.addEventListener('click', function () {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          showOfflineState();
          announceA11y('Still offline. Please check network connection.');
        } else if (currentQuery) {
          performSearch(currentQuery, currentPage);
        }
      });
    }

    if (providerRetryBtn) {
      providerRetryBtn.addEventListener('click', function () {
        if (currentQuery) {
          performSearch(currentQuery, currentPage);
        }
      });
    }

    if (partialRetryBtn) {
      partialRetryBtn.addEventListener('click', function () {
        if (currentQuery) {
          performSearch(currentQuery, currentPage);
        }
      });
    }

    if (rateLimitRetryBtn) {
      rateLimitRetryBtn.addEventListener('click', function () {
        if (rateLimitSecondsLeft <= 0 && currentQuery) {
          performSearch(currentQuery, currentPage);
        }
      });
    }


    // Phase 79: Onboarding dismissal & configuration
    if (onboardingDismissX) {
      onboardingDismissX.addEventListener('click', function () {
        dismissOnboarding();
      });
    }

    if (onboardingGotItBtn) {
      onboardingGotItBtn.addEventListener('click', function () {
        dismissOnboarding();
      });
    }

    if (onboardingSettingsLink) {
      onboardingSettingsLink.addEventListener('click', function () {
        dismissOnboarding();
        openSettingsModal();
      });
    }

    // Phase 79: Settings modal open/close triggers
    if (settingsToggleBtn) {
      settingsToggleBtn.addEventListener('click', function () {
        openSettingsModal();
      });
    }

    if (footerSettingsBtn) {
      footerSettingsBtn.addEventListener('click', function () {
        openSettingsModal();
      });
    }

    if (settingsCloseBtn) {
      settingsCloseBtn.addEventListener('click', function () {
        closeSettingsModal();
      });
    }

    if (settingThemeSelect) {
      settingThemeSelect.addEventListener('change', function () {
        applyTheme(settingThemeSelect.value, true);
      });
    }

    if (settingLocalOnlyToggle) {
      settingLocalOnlyToggle.addEventListener('change', function () {
        isLocalOnly = settingLocalOnlyToggle.checked;
        try {
          localStorage.setItem(PREFERENCE_KEYS.LOCAL_ONLY, String(isLocalOnly));
        } catch {}
        announceA11y(`Local-only search mode ${isLocalOnly ? 'enabled' : 'disabled'}.`);
        if (currentQuery) {
          performSearch(currentQuery, currentPage);
        }
      });
    }

    if (settingNewTabToggle) {
      settingNewTabToggle.addEventListener('change', function () {
        openInNewTab = settingNewTabToggle.checked;
        try {
          localStorage.setItem(PREFERENCE_KEYS.OPEN_NEW_TAB, String(openInNewTab));
        } catch {}
        announceA11y(`Open in new tab ${openInNewTab ? 'enabled' : 'disabled'}.`);
      });
    }

    if (resetSettingsBtn) {
      resetSettingsBtn.addEventListener('click', function () {
        resetPreferences();
      });
    }

    if (showOnboardingBtn) {
      showOnboardingBtn.addEventListener('click', function () {
        closeSettingsModal();
        if (onboardingCard) {
          onboardingCard.style.display = 'block';
          announceA11y('Privacy guide reopened.');
        }
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

    // Global keyboard navigation (Phase 39: Vim/Terminal Mode & Phase 40: Theme Hotkey)
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

      // 't' key: cycle color theme (Phase 40)
      if (e.key === 't') {
        e.preventDefault();
        cycleTheme();
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

      // 'Enter' or 'o': Open currently active result card URL
      if (e.key === 'Enter' || e.key === 'o') {
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

      // 'c': Copy URL of currently selected result card
      if (e.key === 'c') {
        if (currentActiveResultIndex >= 0 && currentResultItems[currentActiveResultIndex]) {
          const itemEl = currentResultItems[currentActiveResultIndex];
          const link = itemEl.querySelector('.result-title-link');
          if (link && link.href && navigator.clipboard) {
            e.preventDefault();
            navigator.clipboard.writeText(link.href).then(() => {
              announceA11y('Link copied to clipboard.');
            }).catch(() => {});
          }
        }
        return;
      }

      // 'r': Open reader view / toggle details
      if (e.key === 'r') {
        if (currentActiveResultIndex >= 0 && currentResultItems[currentActiveResultIndex]) {
          e.preventDefault();
          toggleExpandedDetails(currentResultItems[currentActiveResultIndex]);
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

  function getSystemTheme() {
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }

  function resolveEffectiveTheme(themeChoice) {
    if (themeChoice === 'system' || !themeChoice) {
      return getSystemTheme();
    }
    return themeChoice;
  }

  function initTheme() {
    try {
      const savedTheme = localStorage.getItem('opensearch_theme');
      if (savedTheme && (THEMES.includes(savedTheme) || savedTheme === 'system')) {
        currentThemePreference = savedTheme;
        currentTheme = savedTheme === 'system' ? getSystemTheme() : savedTheme;
      } else {
        currentThemePreference = 'system';
        currentTheme = getSystemTheme();
      }
    } catch (e) {
      currentThemePreference = 'dark';
      currentTheme = 'dark';
    }
    applyTheme(currentThemePreference, false);

    // Dynamic OS color-scheme watcher
    if (typeof window !== 'undefined' && window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
        if (currentThemePreference === 'system') {
          const effective = e.matches ? 'dark' : 'light';
          document.documentElement.setAttribute('data-theme', effective);
          announceA11y(`System color scheme changed: updated to ${effective} mode.`);
        }
      });
    }
  }

  function applyTheme(themeName, announce = true) {
    const validThemes = [...THEMES, 'system'];
    if (!validThemes.includes(themeName)) return;

    currentThemePreference = themeName;
    const effectiveTheme = resolveEffectiveTheme(themeName);
    currentTheme = effectiveTheme;
    document.documentElement.setAttribute('data-theme', effectiveTheme);

    try {
      localStorage.setItem('opensearch_theme', themeName);
    } catch (_e) {
      // Ignore localStorage write failures in sandboxed contexts
    }

    if (themeSwitcherBtn) {
      themeSwitcherBtn.textContent = `[theme: ${themeName}]`;
      themeSwitcherBtn.setAttribute('aria-label', `Toggle color theme (Current: ${themeName})`);
    }

    if (settingThemeSelect) {
      settingThemeSelect.value = themeName;
    }

    const submitBtn = document.getElementById('search-submit-btn');
    if (submitBtn) {
      const isRetro = ['matrix', 'amber', 'dracula', 'nord', 'monokai'].includes(effectiveTheme);
      submitBtn.textContent = isRetro ? 'RUN' : 'Search';
    }

    if (announce) {
      announceA11y(`Color theme switched to ${themeName}.`);
    }
  }

  function cycleTheme() {
    const currentIndex = THEMES.indexOf(currentTheme);
    const nextIndex = (currentIndex + 1) % THEMES.length;
    applyTheme(THEMES[nextIndex], true);
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

  function dismissOnboarding() {
    if (onboardingCard) {
      onboardingCard.style.display = 'none';
    }
    try {
      localStorage.setItem(PREFERENCE_KEYS.ONBOARDING_DISMISSED, 'true');
    } catch {}
    announceA11y('Privacy guide dismissed.');
  }

  function openSettingsModal() {
    if (!settingsModal) return;
    settingsModal.style.display = 'flex';
    if (settingThemeSelect) settingThemeSelect.value = currentThemePreference;
    if (settingLocalOnlyToggle) settingLocalOnlyToggle.checked = isLocalOnly;
    if (settingNewTabToggle) settingNewTabToggle.checked = openInNewTab;
    if (settingSafeSearchSelect) settingSafeSearchSelect.value = currentSafeSearch;
    announceA11y('Settings dialog opened. Press Escape to close.');
  }

  function closeSettingsModal() {
    if (!settingsModal) return;
    settingsModal.style.display = 'none';
    announceA11y('Settings dialog closed.');
  }

  function resetPreferences() {
    try {
      // Clear ONLY non-sensitive UI settings - NEVER touch server indexes or datasets
      Object.values(PREFERENCE_KEYS).forEach(k => {
        localStorage.removeItem(k);
      });
    } catch {}

    // Reset runtime state
    currentThemePreference = 'system';
    isLocalOnly = false;
    openInNewTab = true;

    applyTheme('system', false);
    if (settingThemeSelect) settingThemeSelect.value = 'system';
    if (settingLocalOnlyToggle) settingLocalOnlyToggle.checked = false;
    if (settingNewTabToggle) settingNewTabToggle.checked = true;
    if (settingSafeSearchSelect) settingSafeSearchSelect.value = 'moderate';

    if (settingsStatusMsg) {
      settingsStatusMsg.textContent = 'Settings reset to default values. Local index data preserved.';
      settingsStatusMsg.style.display = 'block';
      setTimeout(() => {
        if (settingsStatusMsg) settingsStatusMsg.style.display = 'none';
      }, 3000);
    }
    announceA11y('Preferences reset to default values. Index storage preserved.');
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
      const titleText = titleLink
        ? titleLink.textContent
        : `Result ${currentActiveResultIndex + 1}`;
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

  function updateUrl(query, page, filter = activeFilter) {
    const url = new URL(window.location.href);
    if (query) {
      url.searchParams.set('q', query);
      if (page > 1) {
        url.searchParams.set('page', page.toString());
      } else {
        url.searchParams.delete('page');
      }
      if (filter && filter !== 'all') {
        url.searchParams.set('filter', filter);
      } else {
        url.searchParams.delete('filter');
      }
    } else {
      url.searchParams.delete('q');
      url.searchParams.delete('page');
      url.searchParams.delete('filter');
    }
    window.history.pushState({ q: query, page, filter }, '', url.toString());
  }

  function updateActiveFilterUI(filter) {
    if (!resultFiltersBar) return;
    const btns = resultFiltersBar.querySelectorAll('.result-filter-btn');
    btns.forEach(function (btn) {
      const bFilter = btn.getAttribute('data-filter');
      const isActive = bFilter === filter;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  function hideAllStates() {
    if (loadingIndicator) loadingIndicator.style.display = 'none';
    if (emptyState) emptyState.style.display = 'none';
    if (errorState) errorState.style.display = 'none';
    if (partialResultsBanner) partialResultsBanner.style.display = 'none';
    if (offlineState) offlineState.style.display = 'none';
    if (providerFailureState) providerFailureState.style.display = 'none';
    if (rateLimitState) rateLimitState.style.display = 'none';
    if (categoryEmptyStateContainer) {
      categoryEmptyStateContainer.style.display = 'none';
      categoryEmptyStateContainer.innerHTML = '';
    }
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

  function showOfflineState() {
    hideAllStates();
    if (offlineState) offlineState.style.display = 'flex';
    if (resultsArea) resultsArea.innerHTML = '';
    if (resultsMeta) resultsMeta.textContent = '';
    if (paginationArea) paginationArea.innerHTML = '';
    announceA11y('Offline mode: Network connection is down. Please reconnect.');
  }

  function showProviderFailureState(msg) {
    hideAllStates();
    if (providerFailureMessage && msg) {
      providerFailureMessage.textContent = msg;
    }
    if (providerFailureState) providerFailureState.style.display = 'flex';
    if (resultsArea) resultsArea.innerHTML = '';
    if (resultsMeta) resultsMeta.textContent = '';
    if (paginationArea) paginationArea.innerHTML = '';
    announceA11y(`Search provider failure: ${msg || 'Provider unavailable'}`);
  }

  function showRateLimitState(retryAfterSeconds = 5) {
    hideAllStates();
    if (rateLimitTimer) {
      clearInterval(rateLimitTimer);
      rateLimitTimer = null;
    }
    rateLimitSecondsLeft = retryAfterSeconds;
    if (rateLimitCountdown) {
      rateLimitCountdown.textContent = `${rateLimitSecondsLeft}s`;
    }
    if (rateLimitRetryBtn) {
      rateLimitRetryBtn.disabled = true;
      rateLimitRetryBtn.textContent = `[ wait ${rateLimitSecondsLeft}s ]`;
    }
    if (rateLimitState) rateLimitState.style.display = 'flex';
    if (resultsArea) resultsArea.innerHTML = '';
    if (resultsMeta) resultsMeta.textContent = '';
    if (paginationArea) paginationArea.innerHTML = '';

    rateLimitTimer = setInterval(function () {
      rateLimitSecondsLeft--;
      if (rateLimitSecondsLeft <= 0) {
        clearInterval(rateLimitTimer);
        rateLimitTimer = null;
        if (rateLimitCountdown) rateLimitCountdown.textContent = 'ready';
        if (rateLimitRetryBtn) {
          rateLimitRetryBtn.disabled = false;
          rateLimitRetryBtn.textContent = '[ retry now ]';
        }
      } else {
        if (rateLimitCountdown) rateLimitCountdown.textContent = `${rateLimitSecondsLeft}s`;
        if (rateLimitRetryBtn) rateLimitRetryBtn.textContent = `[ wait ${rateLimitSecondsLeft}s ]`;
      }
    }, 1000);

    announceA11y(`Search rate limited. Please wait ${retryAfterSeconds} seconds.`);
  }

  async function performSearch(query, page = 1) {
    const thisRequestId = ++currentRequestId;

    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }

    // Check offline status before network dispatch
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      showOfflineState();
      return;
    }

    currentQuery = query;
    currentPage = page;

    hideAllStates();
    if (paginationArea) paginationArea.innerHTML = '';
    if (loadingIndicator) loadingIndicator.style.display = 'block';
    announceA11y(`Searching for ${query}...`);

    activeAbortController = new AbortController();
    const signal = activeAbortController.signal;
    const requestStartMs = performance.now();

    try {
      let fetchUrl = `${API_ENDPOINT}?q=${encodeURIComponent(query)}&page=${page}&pageSize=${PAGE_SIZE}`;
      if (activeFilter && activeFilter !== 'all') {
        fetchUrl += `&filter=${encodeURIComponent(activeFilter)}&category=${encodeURIComponent(activeFilter)}`;
      }
      if (currentSafeSearch) {
        fetchUrl += `&safeSearch=${encodeURIComponent(currentSafeSearch)}`;
      }
      if (isLocalOnly) {
        fetchUrl += '&localOnly=true';
      }
      const res = await fetch(fetchUrl, { signal });

      // Stale response guard (Race-condition protection)
      if (thisRequestId !== currentRequestId) {
        return;
      }

      if (res.status === 429) {
        const retryHeader = res.headers ? res.headers.get('Retry-After') : null;
        const retrySec = parseInt(retryHeader || '5', 10) || 5;
        showRateLimitState(retrySec);
        return;
      }

      if (res.status === 502 || res.status === 503 || res.status === 504) {
        const errJson = await res.json().catch(() => ({}));
        showProviderFailureState(errJson.error?.message || 'External search provider temporarily unavailable.');
        return;
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const message =
          errorData.error?.message || `Server responded with status code ${res.status}`;
        showError(message);
        return;
      }

      const data = await res.json();

      // Check again after asynchronous JSON parsing
      if (thisRequestId !== currentRequestId) {
        return;
      }

      renderSearchResults(data, requestStartMs);
    } catch (err) {
      if (thisRequestId !== currentRequestId || err.name === 'AbortError') {
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        showOfflineState();
        return;
      }
      showError(
        'Unable to reach OpenSearch API server. Ensure API service is running on port 3000.',
      );
    } finally {
      if (thisRequestId === currentRequestId) {
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        activeAbortController = null;
      }
    }
  }

  function renderSearchResults(data, requestStartMs) {
    hideAllStates();

    // Phase 78: Partial results representation
    const isPartial = Boolean(
      data.meta?.partialResults ||
      (Array.isArray(data.warnings) && data.warnings.some(w => w.toLowerCase().includes('timeout') || w.toLowerCase().includes('timed out'))) ||
      (Array.isArray(data.meta?.providers) && data.meta.providers.some(p => p.status === 'timeout' || p.status === 'degraded'))
    );

    if (isPartial && partialResultsBanner) {
      partialResultsBanner.style.display = 'flex';
      if (partialResultsText && data.warnings && data.warnings.length > 0) {
        partialResultsText.textContent = `Partial Results: ${data.warnings.join('; ')}`;
      }
    }

    if (resultFiltersBar) {
      resultFiltersBar.style.display = 'flex';
    }

    const hits = data.results || [];
    const totalHits = typeof data.meta?.totalHits === 'number' ? data.meta.totalHits : hits.length;
    const durationMs = typeof data.meta?.durationMs === 'number'
      ? data.meta.durationMs
      : Math.round(performance.now() - (requestStartMs || performance.now()));
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

      let descHtml = '';
      if (instantAnswer.description) {
        descHtml = `<div class="instant-answer-desc" style="margin: 0.5rem 0; color: var(--color-text-dim, #8fa1b3); font-size: 0.95rem; line-height: 1.4;">${escapeHtml(instantAnswer.description)}</div>`;
      }

      let actionHtml = '';
      if (instantAnswer.redirectUrl) {
        const safeRedirect = escapeHtml(instantAnswer.redirectUrl);
        const btnLabel = instantAnswer.type === 'knowledge_card' ? '&gt; Authoritative Reference Source' : `&gt; Open in ${escapeHtml(instantAnswer.secondaryDetails?.['Target Service'] || 'External Service')}`;
        actionHtml = `
          <div style="margin-top: 0.5rem;">
            <a href="${safeRedirect}" target="_blank" rel="noopener noreferrer" class="instant-answer-redirect-btn" id="bang-redirect-btn">
              ${btnLabel}
            </a>
          </div>
        `;
      }

      let codeBlockHtml = '';
      if (instantAnswer.codeSnippet || (instantAnswer.type === 'cheatsheet' && instantAnswer.primaryResult)) {
        const snippetText = instantAnswer.codeSnippet || instantAnswer.primaryResult;
        codeBlockHtml = `
          <div class="cheatsheet-code-container" style="position: relative; margin: 0.75rem 0; background: var(--color-surface, #0f141c); border: 1px solid var(--color-border, #1f2937); border-radius: 4px; padding: 0.75rem 1rem; display: flex; align-items: center; justify-content: space-between;">
            <code style="color: var(--color-accent, #38ef7d); font-family: monospace; font-size: 1rem; user-select: all; overflow-x: auto; white-space: pre;">$ ${escapeHtml(snippetText)}</code>
            <button type="button" class="cheatsheet-copy-btn" id="cheatsheet-copy-btn" style="background: transparent; border: 1px solid var(--color-accent, #38ef7d); color: var(--color-accent, #38ef7d); padding: 0.25rem 0.6rem; border-radius: 3px; font-size: 0.8rem; cursor: pointer; margin-left: 0.5rem; transition: all 0.15s ease;">Copy</button>
          </div>
        `;
      }

      instantAnswerCard.innerHTML = `
        <div class="instant-answer-header">
          <span class="instant-answer-badge">${escapeHtml(instantAnswer.badge || '[instant-answer]')}</span>
          <span class="instant-answer-title">${escapeHtml(instantAnswer.title || '')}</span>
        </div>
        ${descHtml}
        ${codeBlockHtml}
        ${instantAnswer.type !== 'knowledge_card' && instantAnswer.type !== 'cheatsheet' ? `
        <div class="instant-answer-result">
          ${swatchHtml}
          <span>${escapeHtml(instantAnswer.primaryResult || '')}</span>
        </div>` : ''}
        ${detailsHtml}
        ${actionHtml}
      `;
      instantAnswerCard.style.display = 'block';

      const copyBtn = document.getElementById('cheatsheet-copy-btn');
      if (copyBtn) {
        copyBtn.addEventListener('click', function () {
          const rawCode = instantAnswer.codeSnippet || instantAnswer.primaryResult;
          if (navigator.clipboard && rawCode) {
            navigator.clipboard.writeText(rawCode).then(() => {
              copyBtn.textContent = 'Copied!';
              setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
            }).catch(() => {});
          }
        });
      }

      announceA11y(`Instant answer: ${instantAnswer.title || instantAnswer.primaryResult}`);
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
        if (activeFilter === 'images' || activeFilter === 'news') {
          if (categoryEmptyStateContainer) {
            categoryEmptyStateContainer.innerHTML = renderCategoryEmptyStateHtml(activeFilter, currentQuery, isLocalOnly);
            categoryEmptyStateContainer.style.display = 'block';
          }
          announceA11y(`No ${activeFilter} results found for ${currentQuery}.`);
        } else {
          if (emptyQueryText) {
            emptyQueryText.textContent = currentQuery;
          }
          if (emptyState) emptyState.style.display = 'block';
          announceA11y(`No search results found for ${currentQuery}.`);
        }
      }
      if (resultsMeta) resultsMeta.textContent = '';
      if (resultsArea) resultsArea.innerHTML = '';
      if (paginationArea) paginationArea.innerHTML = '';
      return;
    }

    const plural = totalHits === 1 ? 'hit' : 'hits';
    let summaryText = `[status: 200 OK] ${totalHits.toLocaleString()} ${plural} (${durationMs}ms)${isLocalOnly ? ' [mode: local-only]' : ''}`;

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
    if (data.meta?.safeSearch?.filteredCount && data.meta.safeSearch.filteredCount > 0) {
      summaryText += ` [safe-search: ${data.meta.safeSearch.filteredCount} filtered]`;
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

    // Phase 80: Category-Specific Rendering & Enforcement (All, Images, News)
    if (activeFilter === 'images' || activeFilter === 'multimedia') {
      const validImageHits = hits.filter(function (it) {
        return Boolean(validateSafeImageUrl(it.thumbnailUrl));
      });

      if (validImageHits.length === 0) {
        if (categoryEmptyStateContainer) {
          categoryEmptyStateContainer.innerHTML = renderCategoryEmptyStateHtml('images', currentQuery, isLocalOnly);
          categoryEmptyStateContainer.style.display = 'block';
        }
        if (resultsArea) resultsArea.innerHTML = '';
        if (paginationArea) paginationArea.innerHTML = '';
        return;
      }

      let imageCardsHtml = '<div class="image-results-grid" role="region" aria-label="Image search results">';
      validImageHits.forEach(function (item) {
        const safeThumb = validateSafeImageUrl(item.thumbnailUrl);
        const safeUrl = escapeHtml(item.url || '#');
        const safeTitle = escapeHtml(item.title || 'Untitled Image');
        const safeAttribution = escapeHtml(item.attribution || (item.source ? 'Source: ' + item.source : 'Wikimedia Commons'));
        const safeLicense = item.license ? escapeHtml(item.license) : '';
        const safeDomain = escapeHtml(item.domain || '');
        const dimensions = (item.imageWidth && item.imageHeight) ? escapeHtml(item.imageWidth + '×' + item.imageHeight) : '';

        imageCardsHtml += `
          <div class="image-card" data-document-id="${escapeHtml(item.documentId || '')}" role="group" aria-label="${safeTitle}">
            <a href="${safeUrl}" ${openInNewTab ? 'target="_blank" rel="noopener noreferrer"' : ''} class="image-card-link" aria-label="${safeTitle} (opens in new tab)">
              <div class="image-card-thumb-container">
                <img src="${escapeHtml(safeThumb)}" alt="${safeTitle}" loading="lazy" class="image-card-thumb" onerror="this.closest('.image-card')?.remove();" />
                ${dimensions ? `<span class="image-card-dimensions">${dimensions}</span>` : ''}
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
        `;
      });
      imageCardsHtml += '</div>';

      if (resultsArea) {
        resultsArea.innerHTML = imageCardsHtml;
      }
      if (paginationArea && pagination) {
        paginationArea.innerHTML = renderPaginationBar(pagination);
      }
      return;
    }

    if (activeFilter === 'news') {
      const validNewsHits = hits.filter(function (it) {
        return it.source === 'hackernews' || Boolean(it.publishedAt);
      });

      if (validNewsHits.length === 0) {
        if (categoryEmptyStateContainer) {
          categoryEmptyStateContainer.innerHTML = renderCategoryEmptyStateHtml('news', currentQuery, isLocalOnly);
          categoryEmptyStateContainer.style.display = 'block';
        }
        if (resultsArea) resultsArea.innerHTML = '';
        if (paginationArea) paginationArea.innerHTML = '';
        return;
      }
    }

    // Render terminal result cards (All / General / News)
    let resultsHtml = '';
    const startIdx = pagination ? (pagination.page - 1) * pagination.pageSize : 0;

    hits.forEach((item, index) => {
      const safeUrl = escapeHtml(item.url || '#');
      const safeDisplayUrl = escapeHtml(item.displayUrl || item.url || '');
      const itemNum = startIdx + index + 1;

      // Safe handling of long titles and missing titles
      const displayTitle = item.highlightedTitle
        ? sanitizeHighlightedHtml(item.highlightedTitle)
        : escapeHtml(item.title) || 'Untitled Document';

      // Safe handling of missing snippets
      const displaySnippet = item.highlightedSnippet
        ? sanitizeHighlightedHtml(item.highlightedSnippet)
        : escapeHtml(item.snippet || 'No description available.');

      const provenanceBadge = item.attribution
        ? `<span class="result-attribution" style="opacity: 0.8; font-size: 0.85em;">[${escapeHtml(item.attribution)}]</span>`
        : (item.source && item.source !== 'local-index' ? `<span class="result-source-badge" style="opacity: 0.8; font-size: 0.85em;">[source: ${escapeHtml(item.source)}]</span>` : '');

      const contentTypeBadge = item.contentType
        ? `<span class="result-content-type-badge" aria-label="Content Type">[${escapeHtml(item.contentType)}]</span>`
        : '';

      const rawDate = item.publishedAt || item.publicationDate;
      let formattedDate = '';
      if (rawDate) {
        try {
          const d = new Date(rawDate);
          if (!isNaN(d.getTime())) {
            formattedDate = d.toISOString().split('T')[0];
          } else {
            formattedDate = escapeHtml(String(rawDate));
          }
        } catch {
          formattedDate = escapeHtml(String(rawDate));
        }
      }

      let recencyBadge = '';
      if (rawDate) {
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
      }

      const dateBadge = formattedDate
        ? `<time class="result-date-badge" datetime="${escapeHtml(rawDate)}" aria-label="Published date">${formattedDate}</time>`
        : '';

      const thumbnailHtml = item.thumbnailUrl
        ? `<div class="result-thumbnail"><img src="${escapeHtml(item.thumbnailUrl)}" alt="" loading="lazy" class="result-thumbnail-img" onerror="this.closest('.result-thumbnail')?.remove();" /></div>`
        : '';

      resultsHtml += `
        <article class="terminal-result-item" data-document-id="${escapeHtml(item.documentId || '')}">
          <div class="result-item-main">
            ${thumbnailHtml}
            <div class="result-item-body">
              <div class="result-index-title">
                <span class="result-index">[${itemNum}]</span>
                <a href="${safeUrl}" ${openInNewTab ? 'target="_blank" rel="noopener noreferrer"' : ''} class="result-title-link">${displayTitle}</a>
              </div>
              <div class="result-url-line">
                <span class="result-prompt-sym">&gt;</span>
                <cite class="result-destination" title="${safeUrl}">${safeDisplayUrl}</cite>
                ${provenanceBadge ? ` ${provenanceBadge}` : ''}
                ${item.license ? ` <span class="result-license-badge" aria-label="License">[${escapeHtml(item.license)}]</span>` : ''}
                ${contentTypeBadge ? ` ${contentTypeBadge}` : ''}
                ${dateBadge ? ` ${dateBadge}` : ''}
                ${recencyBadge ? ` ${recencyBadge}` : ''}
              </div>
              <p class="result-snippet">${displaySnippet}</p>
            </div>
          </div>
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

  // Phase 80: Image URL validation, news recency, and category empty state helpers
  function validateSafeImageUrl(url) {
    if (typeof url !== 'string') return null;
    const trimmed = url.trim();
    if (!trimmed || trimmed.length > 4096) return null;
    if (/[\x00-\x1f\x7f]/.test(trimmed)) return null;
    const lower = trimmed.toLowerCase();
    const disallowed = ['javascript:', 'vbscript:', 'file:', 'ftp:', 'blob:', 'about:'];
    for (let i = 0; i < disallowed.length; i++) {
      if (lower.startsWith(disallowed[i])) return null;
    }
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
      if (!parsed.hostname) return null;
      return parsed.href;
    } catch {
      return null;
    }
  }

  function evaluateNewsRecency(publishedAt, nowMs) {
    if (!publishedAt || typeof publishedAt !== 'string') return null;
    const trimmed = publishedAt.trim();
    if (!trimmed) return null;
    const parsed = new Date(trimmed);
    const timeMs = parsed.getTime();
    if (isNaN(timeMs)) return null;
    const refNow = typeof nowMs === 'number' ? nowMs : Date.now();
    const ageMs = Math.max(0, refNow - timeMs);
    const ageHours = Math.floor(ageMs / (60 * 60 * 1000));
    const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
    const formattedDate = parsed.toISOString().split('T')[0] || '';
    if (ageHours < 24) {
      const ageMinutes = Math.floor(ageMs / (60 * 1000));
      const label = ageHours < 1 ? (ageMinutes <= 1 ? 'Just now' : ageMinutes + 'm ago') : ageHours + 'h ago';
      return { isRecent: true, isStale: false, label: label, formattedDate: formattedDate };
    }
    if (ageDays <= 7) {
      return { isRecent: true, isStale: false, label: ageDays + 'd ago', formattedDate: formattedDate };
    }
    if (ageDays <= 30) {
      return { isRecent: false, isStale: false, label: Math.floor(ageDays / 7) + 'w ago', formattedDate: formattedDate };
    }
    const months = Math.floor(ageDays / 30);
    const staleLabel = ageDays > 365 ? Math.floor(ageDays / 365) + 'y ago' : months + 'mo ago';
    return { isRecent: false, isStale: true, label: staleLabel, formattedDate: formattedDate };
  }

  function renderCategoryEmptyStateHtml(category, query, isLocalOnly) {
    const cat = (category || '').toLowerCase().trim();
    const safeQ = escapeHtml(query);
    if (cat === 'images' || cat === 'multimedia' || cat === 'image') {
      return `
        <div class="category-empty-state" role="status" aria-live="polite">
          <div class="category-empty-title">[0 image results]</div>
          <p class="category-empty-desc">
            ${isLocalOnly
              ? 'Image search is unavailable in Local-only mode because the local index does not contain multimedia assets.'
              : 'No verified image results found for "' + safeQ + '". Only authenticated sources with verified licenses and safe thumbnails are displayed.'}
          </p>
          <div class="category-empty-hint">&gt; Try switching to the "All" tab or searching for broader subjects.</div>
        </div>
      `.trim();
    }
    if (cat === 'news') {
      return `
        <div class="category-empty-state" role="status" aria-live="polite">
          <div class="category-empty-title">[0 news articles]</div>
          <p class="category-empty-desc">
            ${isLocalOnly
              ? 'News category search is unavailable in Local-only mode. No local documents are classified as news.'
              : 'No recent news articles found for "' + safeQ + '". Results are restricted strictly to verified news sources with authentic timestamps.'}
          </p>
          <div class="category-empty-hint">&gt; General web and encyclopedia results can be viewed on the "All" tab.</div>
        </div>
      `.trim();
    }
    return `
      <div class="category-empty-state" role="status" aria-live="polite">
        <div class="category-empty-title">[0 hits]</div>
        <p class="category-empty-desc">No results found in "${escapeHtml(category)}" category for "${safeQ}".</p>
        <div class="category-empty-hint">&gt; Try switching to "All" to view combined general results.</div>
      </div>
    `.trim();
  }

})();
