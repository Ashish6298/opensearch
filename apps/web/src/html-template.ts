/**
 * OpenSearch — Web HTML Shell Generator
 */

export interface HtmlTemplateOptions {
  title?: string;
  apiUrl?: string;
  cssContent?: string;
  jsContent?: string;
}

const ASCII_LOGO = `  ___                    ____                      _     
 / _ \\ _ __   ___ _ __  / ___|  ___  __ _ _ __ ___| |__  
| | | | '_ \\ / _ \\ '_ \\ \\___ \\ / _ \\/ _\` | '__/ __| '_ \\ 
| |_| | |_) |  __/ | | | ___) |  __/ (_| | | | (__| | | |
 \\___/| .__/ \\___|_| |_||____/ \\___|\\__,_|_|  \\___|_| |_|
      |_|                                                `;

export function generateHtmlShell(options: HtmlTemplateOptions = {}): string {
  const title = options.title || 'OpenSearch — Privacy-First Web Search';
  const apiUrl = options.apiUrl || 'http://localhost:3000/api/v1/search';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="OpenSearch is a public, privacy-first search engine built from scratch.">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <meta name="theme-color" content="#0d0d0d">
  <link rel="manifest" href="/manifest.json">
  <title>${title}</title>
  <style>
    ${options.cssContent || '/* Inlined CSS */'}
  </style>
  <script>
    (function () {
      try {
        var theme = localStorage.getItem('opensearch_theme') || 'dark';
        if (theme === 'system' || !localStorage.getItem('opensearch_theme')) {
          theme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
        }
        document.documentElement.setAttribute('data-theme', theme);
      } catch (e) {}
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
          navigator.serviceWorker.register('/sw.js').catch(function () {});
        });
      }
    })();
  </script>
</head>
<body>
  <a href="#search-input" id="skip-to-search" class="skip-link">Skip to search</a>
  <a href="#results-area" id="skip-to-results" class="skip-link">Skip to results</a>
  <div id="a11y-announcer" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></div>

  <div class="terminal-app" id="terminal-window" role="main">
    <!-- Header Controls in Top Corner (Theme Switcher & Version) -->
    <div class="corner-header-controls">
      <button type="button" class="theme-switcher-btn" id="theme-switcher-btn" aria-label="Toggle color theme" title="Click to cycle theme (Dark, Light, Matrix, Amber, Dracula, Nord, Monokai)">[theme: dark]</button>
      <button type="button" class="settings-toggle-btn" id="settings-toggle-btn" aria-label="Open settings and preferences" title="Search settings and privacy options">⚙️ settings</button>
      <div class="corner-version">v1.4.0</div>
    </div>

    <!-- Main Content Area -->
    <main class="terminal-main">
      <div class="terminal-container">
        <!-- ASCII Wordmark centered -->
        <!-- Modern Everyday Brand Wordmark (Active in Dark & Light themes) -->
        <header class="brand-wordmark-container" id="brand-header">
          <div class="brand-logo-badge">
            <span class="brand-icon" aria-hidden="true">🔍</span>
          </div>
          <h1 class="brand-title">OpenSearch</h1>
          <p class="brand-subtitle">Privacy-first, independent web search</p>
          <div class="home-privacy-badge" role="note" aria-label="Privacy Guarantees">
            <span class="badge-item"><span class="badge-icon" aria-hidden="true">🔒</span> No tracking</span>
            <span class="badge-separator" aria-hidden="true">·</span>
            <span class="badge-item"><span class="badge-icon" aria-hidden="true">🚫</span> No accounts</span>
            <span class="badge-separator" aria-hidden="true">·</span>
            <span class="badge-item"><span class="badge-icon" aria-hidden="true">⚡</span> Pure relevance</span>
          </div>
        </header>

        <!-- Phase 79: Non-blocking Privacy & Provider Onboarding -->
        <div class="onboarding-card" id="onboarding-card" role="region" aria-label="Privacy and search engine guide" style="display:none;">
          <div class="onboarding-content">
            <div class="onboarding-header">
              <span class="onboarding-badge">🔒 Privacy &amp; Provider Transparency</span>
              <button type="button" class="onboarding-close-btn" id="onboarding-dismiss-x" aria-label="Dismiss privacy guide">✕</button>
            </div>
            <p class="onboarding-desc">
              OpenSearch is built from first principles for zero-tracking search. We never store search queries, user identifiers, or profiling cookies.
            </p>
            <div class="onboarding-grid">
              <div class="onboarding-item">
                <div class="onboarding-item-title">🌐 External Search Providers</div>
                <div class="onboarding-item-desc">Queries local indexes alongside privacy-friendly sources (Wikipedia, DuckDuckGo) without third-party ad networks.</div>
              </div>
              <div class="onboarding-item">
                <div class="onboarding-item-title">🛡️ Local-Only Mode</div>
                <div class="onboarding-item-desc">Disable all outbound network calls to search strictly within local documents for 100% air-gapped privacy.</div>
              </div>
            </div>
            <div class="onboarding-actions">
              <button type="button" class="onboarding-btn primary" id="onboarding-got-it-btn">Got it</button>
              <button type="button" class="onboarding-btn secondary" id="onboarding-settings-link">Configure Settings</button>
            </div>
          </div>
        </div>

        <div class="ascii-wrapper">
          <pre class="ascii-art" aria-label="OpenSearch">${ASCII_LOGO}</pre>
        </div>

        <!-- Status Command & Dot Leaders with clean line spacing -->
        <div class="cli-section status-section">
          <div class="cli-cmd">$ status --privacy</div>
          <div class="cli-output">
            <div class="dot-leader-row">
              <span class="dot-key">accounts</span>
              <span class="dot-fill"></span>
              <span class="dot-val">none</span>
            </div>
            <div class="dot-leader-row">
              <span class="dot-key">tracking</span>
              <span class="dot-fill"></span>
              <span class="dot-val">disabled</span>
            </div>
            <div class="dot-leader-row">
              <span class="dot-key">ranking</span>
              <span class="dot-fill"></span>
              <span class="dot-val">lexical / bm25</span>
            </div>
          </div>
        </div>

        <!-- Search Command Prompt & Input Form -->
        <div class="cli-section search-section">
          <div class="cli-cmd">$ search ""</div>
          <form class="terminal-search-form" id="search-form" role="search" aria-label="Web Search Form">
            <div id="search-hint" class="sr-only">Type a search query and press Enter</div>
            <div class="terminal-search-box">
              <span class="search-prompt-symbol" aria-hidden="true">&gt;</span>
              <input
                type="text"
                id="search-input"
                class="terminal-search-input"
                placeholder="Search the web privately..."
                autocomplete="off"
                autocorrect="off"
                autocapitalize="off"
                spellcheck="false"
                aria-label="Search query"
                aria-describedby="search-hint"
                aria-autocomplete="list"
                aria-controls="autocomplete-dropdown"
                aria-expanded="false"
                required
              />
              <button type="button" id="search-clear-btn" class="sr-only" aria-label="Clear search input">Clear</button>
              <button type="submit" id="search-submit-btn" class="run-btn" aria-label="Submit search">Search</button>
            </div>
            <!-- Phase 83: Visible Local-Only Control & Hosted Transparency -->
            <div class="search-mode-controls" id="search-mode-controls">
              <label class="local-only-chip" for="local-only-checkbox" title="Toggle Local-only mode: Disables external providers, searches only the local index">
                <input type="checkbox" id="local-only-checkbox" class="local-only-checkbox" />
                <span class="local-only-icon" aria-hidden="true">🔒</span>
                <span class="local-only-label">Local-only</span>
              </label>
              <!-- Phase 102: Accessible Focus Lens Selector -->
              <div class="lens-control-container" title="Select a Focus Lens ranking profile">
                <label for="lens-selector" class="lens-selector-label" title="Focus Lens">
                  <span class="lens-icon" aria-hidden="true">🎯</span>
                  <span class="sr-only">Focus Lens:</span>
                </label>
                <select id="lens-selector" class="lens-selector" aria-label="Focus Lens ranking profile" title="Select Focus Lens profile">
                  <option value="general" selected>General Lens</option>
                  <option value="student">🎓 Student</option>
                  <option value="developer">💻 Developer</option>
                  <option value="research">🔬 Research</option>
                  <option value="trusted-health">🏥 Health Sources</option>
                  <option value="no-trackers">🛡️ No-Trackers</option>
                </select>
              </div>
              <span class="hosted-transparency-note" id="hosted-transparency-note" title="Note: If using a hosted server, the host receives the query at its own endpoint, but contacts zero third-party providers.">
                (zero external providers)
              </span>
            </div>
            <!-- Quick Suggestions for approachable discovery -->
            <div class="quick-topics-row" id="quick-topics" aria-label="Suggested searches">
              <span class="quick-topics-label">Try:</span>
              <button type="button" class="quick-topic-tag" data-query="privacy guide">privacy guide</button>
              <button type="button" class="quick-topic-tag" data-query="local search engine">local search</button>
              <button type="button" class="quick-topic-tag" data-query="open source">open source</button>
            </div>
            <!-- Phase 35: Terminal Autocomplete Dropdown -->
            <div
              id="autocomplete-dropdown"
              class="autocomplete-dropdown"
              role="listbox"
              aria-label="Search suggestions"
              style="display:none;"
            ></div>
          </form>
        </div>

        <!-- Phase 78: Result Filters (Preserves current search query) -->
        <nav class="result-filters-bar" id="result-filters-bar" aria-label="Search result filters" style="display:none;">
          <button type="button" class="result-filter-btn active" data-filter="all" aria-pressed="true">All</button>
          <button type="button" class="result-filter-btn" data-filter="images" aria-pressed="false">Images</button>
          <button type="button" class="result-filter-btn" data-filter="news" aria-pressed="false">News</button>
          <button type="button" class="result-filter-btn" data-filter="web" aria-pressed="false">Web</button>
          <button type="button" class="result-filter-btn" data-filter="code" aria-pressed="false">Code</button>
          <button type="button" class="result-filter-btn" data-filter="docs" aria-pressed="false">Documents</button>
        </nav>

        <!-- UI State Containers & Results -->
        <div class="state-container" id="state-container">
          <div class="loading-indicator" id="loading-indicator" role="status" aria-live="polite" aria-label="Loading search results" style="display:none;">
            <div class="cli-loading">[...] executing search query...</div>
          </div>

          <div class="empty-state" id="empty-state" role="region" aria-label="No results found" aria-live="polite" style="display:none;">
            <div class="cli-empty">[0 hits] no matches found for "<span id="empty-query-text"></span>"</div>
            <div class="cli-empty-hint">&gt; try broader terms or verify spelling</div>
            <div class="empty-local-only-action" id="empty-local-only-action" style="display:none; margin-top: 0.75rem;">
              <p class="empty-local-only-desc" style="font-size: 0.9rem; opacity: 0.85;">No local documents matched your query. External search providers are currently disabled for privacy.</p>
              <button type="button" class="disable-local-only-btn" id="empty-disable-local-only-btn" style="padding: 0.35rem 0.8rem; cursor: pointer; border-radius: 4px;">Disable Local-Only Mode &amp; Search Web</button>
            </div>
          </div>

          <!-- Phase 80: Category Unavailable Empty State -->
          <div class="category-empty-state-container" id="category-empty-state-container" role="status" aria-live="polite" style="display:none;"></div>

          <div class="error-state" id="error-state" role="alert" aria-live="assertive" style="display:none;">
            <div class="cli-error">[ERROR] search query failed: <span id="error-message">connection refused</span></div>
            <button type="button" class="cli-retry-btn" id="error-retry-btn">[ retry ]</button>
          </div>

          <!-- Phase 83: Local-Only Limited Results Notice -->
          <div class="local-only-notice-banner" id="local-only-notice-banner" role="status" aria-live="polite" style="display:none;">
            <span class="local-only-notice-icon" aria-hidden="true">🔒</span>
            <span class="local-only-notice-text" id="local-only-notice-text">Local-only mode active: Searching local index only.</span>
            <button type="button" class="disable-local-only-btn" id="disable-local-only-btn" title="Disable local-only mode and search global web providers">Search Web</button>
          </div>

          <!-- Phase 78: Partial Results Banner -->
          <div class="partial-results-banner" id="partial-results-banner" role="status" aria-live="polite" style="display:none;">
            <div class="partial-results-content">
              <span class="state-icon" aria-hidden="true">⚡</span>
              <span class="partial-results-text" id="partial-results-text">Partial Results: One or more search providers timed out or were unavailable. Displaying available results.</span>
            </div>
            <button type="button" class="partial-retry-btn" id="partial-retry-btn" aria-label="Retry timed out providers">[ retry provider ]</button>
          </div>

          <!-- Phase 78: Offline Status State -->
          <div class="offline-state" id="offline-state" role="alert" aria-live="assertive" style="display:none;">
            <div class="cli-error cli-offline">
              <span class="state-icon" aria-hidden="true">📶</span>
              [OFFLINE] Network connection is currently offline. Showing cached results if available.
            </div>
            <button type="button" class="cli-retry-btn" id="offline-retry-btn">[ retry connection ]</button>
          </div>

          <!-- Phase 78: Provider Failure State -->
          <div class="provider-failure-state" id="provider-failure-state" role="alert" aria-live="assertive" style="display:none;">
            <div class="cli-error cli-provider-fail">
              <span class="state-icon" aria-hidden="true">⚠️</span>
              [PROVIDER UNAVAILABLE] Search provider is temporarily unreachable. <span id="provider-failure-message">Local index search remains active.</span>
            </div>
            <button type="button" class="cli-retry-btn" id="provider-retry-btn">[ retry provider ]</button>
          </div>

          <!-- Phase 78: Rate Limiting State (HTTP 429) -->
          <div class="rate-limit-state" id="rate-limit-state" role="alert" aria-live="assertive" style="display:none;">
            <div class="cli-error cli-rate-limit">
              <span class="state-icon" aria-hidden="true">⏳</span>
              [RATE LIMITED] Too many search queries. Please wait <span id="rate-limit-countdown">a moment</span> before searching again.
            </div>
            <button type="button" class="cli-retry-btn" id="rate-limit-retry-btn" disabled>[ wait ]</button>
          </div>

          <div class="results-meta" id="results-meta" role="status" aria-live="polite"></div>
          <!-- Phase 38: Instant Answers & Direct Calculation/Bang Card -->
          <div class="instant-answer-card" id="instant-answer-card" role="region" aria-label="Instant answer" style="display:none;"></div>
          <!-- Phase 36: Did You Mean Notification Banner -->
          <div class="did-you-mean-banner" id="did-you-mean-banner" role="status" aria-live="polite" style="display:none;"></div>
          <section class="results-container" id="results-area" role="feed" aria-label="Search Results"></section>
          <div id="pagination-area" role="navigation" aria-label="Search pagination"></div>
        </div>
      </div>
    </main>

    <!-- Terminal Footer -->
    <footer class="terminal-footer">
      <div class="footer-container">
        <span class="footer-text"><a href="/about">about</a> · <a href="/docs">docs</a> · <a href="/privacy">privacy</a> · <a href="/health" target="_blank" rel="noopener noreferrer">status</a> · <button type="button" class="footer-settings-btn" id="footer-settings-btn" aria-label="Open search settings">settings</button> · <button type="button" class="footer-shortcuts-btn" id="shortcuts-toggle-btn" aria-label="Keyboard Shortcuts (Press ?)">shortcuts [?]</button> · <a href="https://github.com/Ashish6298/opensearch" target="_blank" rel="noopener noreferrer">source</a> — v1.2.0</span>
      </div>
    </footer>

    <!-- Phase 39: Keyboard Shortcuts Help Modal Overlay -->
    <div id="shortcuts-modal" class="shortcuts-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title" style="display:none;">
      <div class="shortcuts-modal-dialog">
        <div class="shortcuts-modal-header">
          <span class="shortcuts-modal-title" id="shortcuts-title">&gt; KEYBOARD NAVIGATION SHORTCUTS</span>
          <button type="button" class="shortcuts-modal-close-btn" id="shortcuts-close-btn" aria-label="Close shortcuts modal">[ESC / X]</button>
        </div>
        <div class="shortcuts-modal-body">
          <div class="shortcuts-grid">
            <div class="shortcut-row">
              <span class="shortcut-key"><kbd>j</kbd> / <kbd>↓</kbd></span>
              <span class="shortcut-desc">Move selection to next result card</span>
            </div>
            <div class="shortcut-row">
              <span class="shortcut-key"><kbd>k</kbd> / <kbd>↑</kbd></span>
              <span class="shortcut-desc">Move selection to previous result card</span>
            </div>
            <div class="shortcut-row">
              <span class="shortcut-key"><kbd>Enter</kbd> / <kbd>o</kbd></span>
              <span class="shortcut-desc">Open selected result in new browser tab</span>
            </div>
            <div class="shortcut-row">
              <span class="shortcut-key"><kbd>c</kbd></span>
              <span class="shortcut-desc">Copy URL of selected result to clipboard</span>
            </div>
            <div class="shortcut-row">
              <span class="shortcut-key"><kbd>r</kbd> / <kbd>v</kbd></span>
              <span class="shortcut-desc">Toggle Reader Mode / expanded view</span>
            </div>
            <div class="shortcut-row">
              <span class="shortcut-key"><kbd>/</kbd></span>
              <span class="shortcut-desc">Focus terminal search prompt and select query</span>
            </div>
            <div class="shortcut-row">
              <span class="shortcut-key"><kbd>ESC</kbd></span>
              <span class="shortcut-desc">Clear selection / close modal / blur input</span>
            </div>
            <div class="shortcut-row">
              <span class="shortcut-key"><kbd>t</kbd></span>
              <span class="shortcut-desc">Cycle terminal color theme (Matrix, Amber, Synthwave, Solarized, Nord)</span>
            </div>
            <div class="shortcut-row">
              <span class="shortcut-key"><kbd>?</kbd></span>
              <span class="shortcut-desc">Toggle this keyboard shortcuts cheatsheet</span>
            </div>
          </div>
          <div class="shortcuts-footer-hint">&gt; Tip: Press any key or click outside to dismiss.</div>
        </div>
      </div>
    </div>

    <!-- Phase 79: Settings & Preferences Modal Overlay -->
    <div id="settings-modal" class="settings-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="settings-title" style="display:none;">
      <div class="settings-modal-dialog">
        <div class="settings-modal-header">
          <span class="settings-modal-title" id="settings-title">&gt; SEARCH SETTINGS &amp; PREFERENCES</span>
          <button type="button" class="settings-modal-close-btn" id="settings-close-btn" aria-label="Close settings modal">[ESC / X]</button>
        </div>
        <div class="settings-modal-body">
          <!-- Theme Preference -->
          <div class="settings-section">
            <label class="settings-label" for="setting-theme-select"><strong>Appearance Theme:</strong></label>
            <select id="setting-theme-select" class="settings-select" aria-label="Select color theme">
              <option value="system">System Preference (Auto)</option>
              <option value="dark">Modern Dark</option>
              <option value="light">Modern Light</option>
              <option value="matrix">Matrix Phosphor (CRT Green)</option>
              <option value="amber">Cyberpunk Amber (CRT Amber)</option>
              <option value="dracula">Dracula Neon</option>
              <option value="nord">Nord Arctic Frost</option>
              <option value="monokai">Monokai High Contrast</option>
            </select>
            <p class="settings-hint">System mode automatically follows your operating system's light or dark mode.</p>
          </div>

          <!-- Local-Only Search Mode -->
          <div class="settings-section">
            <div class="settings-toggle-row">
              <label class="settings-label" for="setting-local-only-toggle"><strong>Local-Only Search Mode:</strong></label>
              <input type="checkbox" id="setting-local-only-toggle" class="settings-checkbox" />
            </div>
            <p class="settings-hint">
              <strong>What is Local-only mode?</strong> When enabled, OpenSearch disables all outbound network calls to external web providers. Only queries documents indexed locally on your machine or private server. Provides 100% air-gapped search privacy with no external dependencies.
            </p>
            <p class="settings-hint hosted-transparency-hint" style="color: var(--color-accent-amber, #f59e0b);">
              <strong>Hosted service notice:</strong> If you are accessing OpenSearch on a remote hosted server rather than localhost, the host server receives the query submitted to its endpoint over HTTPS. Local-only mode guarantees the host will not contact external search engines (Wikipedia, Hacker News, Wikimedia Commons). For absolute zero-network privacy, run OpenSearch on your local device.
            </p>
          </div>

          <!-- Phase 81: Safe Search & Content Controls -->
          <div class="settings-section">
            <label class="settings-label" for="setting-safe-search-select"><strong>Safe Search Content Controls:</strong></label>
            <select id="setting-safe-search-select" class="settings-select" aria-label="Select Safe Search level">
              <option value="strict">Strict (Filter titles, URLs, and snippets)</option>
              <option value="moderate" selected>Moderate (Filter explicit titles and domains - Default)</option>
              <option value="off">Off (Disable all content filtering)</option>
            </select>
            <div class="safe-search-disclosure" id="safe-search-disclosure">
              <p class="settings-hint">
                <strong>What Safe Search covers:</strong> OpenSearch applies consistent local filtering to exclude adult, sexually explicit, and mature terms across search results.
              </p>
              <p class="settings-hint">
                <strong>What Safe Search does not cover:</strong> Community-driven external providers (Wikipedia, Hacker News, Wikimedia Commons) do not support upstream server-side safe search parameters. OpenSearch applies post-retrieval filtering locally.
              </p>
            </div>
          </div>

          <!-- Open in new tab -->
          <div class="settings-section">
            <div class="settings-toggle-row">
              <label class="settings-label" for="setting-new-tab-toggle"><strong>Open links in new tab:</strong></label>
              <input type="checkbox" id="setting-new-tab-toggle" class="settings-checkbox" checked />
            </div>
            <p class="settings-hint">Opens search result destinations in a new browser tab with noopener/noreferrer protection.</p>
          </div>

          <!-- Privacy & Data Storage Guarantee Notice -->
          <div class="settings-privacy-box">
            <span class="settings-privacy-badge">🔒 Zero-Tracking Guarantee</span>
            <p>Preferences are stored strictly in your browser's local memory. No user identifiers, cookies, sessions, or queries are stored.</p>
          </div>

          <!-- Actions: Reset Settings & Show Guide -->
          <div class="settings-actions-row">
            <button type="button" class="settings-btn danger" id="reset-settings-btn" title="Reset all UI settings to default without touching indexed data">Reset Preferences</button>
            <button type="button" class="settings-btn" id="show-onboarding-btn">Show Privacy Guide</button>
          </div>
          <div id="settings-status-msg" class="settings-status-msg" role="status" aria-live="polite" style="display:none;"></div>
        </div>
      </div>
    </div>
  </div>

  <script>
    window.__OPENSEARCH_API_URL__ = ${JSON.stringify(apiUrl)};
    ${options.jsContent || '/* Inlined JS */'}
  </script>
</body>
</html>`;
}
