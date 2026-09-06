/**
 * OpenSearch — Web HTML Shell Generator (Phase 19 & 20)
 *
 * Generates the semantic HTML5 application shell including:
 * - Search header & brand title
 * - Search input box & submit button
 * - State placeholders (Loading skeleton, Empty state, Error state)
 * - Result list container & pagination area
 * - Accessibility attributes (ARIA landmarks, labels, focus rings)
 */

export interface HtmlTemplateOptions {
  title?: string;
  apiUrl?: string;
  cssContent?: string;
  jsContent?: string;
}

export function generateHtmlShell(options: HtmlTemplateOptions = {}): string {
  const title = options.title || 'OpenSearch — Privacy-First Web Search';
  const apiUrl = options.apiUrl || 'http://localhost:3000/api/v1/search';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="OpenSearch is a public, privacy-first web search engine built from scratch.">
  <meta name="theme-color" content="#0f172a">
  <title>${title}</title>
  <style>
    ${options.cssContent || '/* Inlined CSS */'}
  </style>
</head>
<body>
  <!-- Header -->
  <header class="app-header" id="app-header" role="banner">
    <a href="/" class="brand-link" aria-label="OpenSearch Home">
      <span style="color:var(--accent-primary);">⚡</span> OpenSearch
      <span class="brand-badge">V1.0.0</span>
    </a>
    <div class="header-meta">
      <span class="privacy-pill" title="No tracking, no user profiling">
        🛡️ Privacy First
      </span>
    </div>
  </header>

  <!-- Main Content Area -->
  <main class="main-content center-mode" id="main-content" role="main">
    <!-- Hero (Visible in home mode) -->
    <div class="hero-container" id="hero-container">
      <h1 class="hero-title">OpenSearch</h1>
      <p class="hero-tagline">Search the web independently. Fast, reliable, and strictly private.</p>
    </div>

    <!-- Search Form -->
    <form class="search-form" id="search-form" role="search" aria-label="Web Search Form">
      <div class="search-input-wrapper">
        <svg class="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input
          type="search"
          id="search-input"
          class="search-input"
          placeholder="Search the web or type a query..."
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          maxlength="200"
          aria-label="Search query"
          required
        />
        <button
          type="button"
          id="search-clear-btn"
          class="search-clear-btn"
          aria-label="Clear search input"
          title="Clear"
        >
          ✕
        </button>
        <button
          type="submit"
          id="search-submit-btn"
          class="search-submit-btn"
          aria-label="Submit search"
        >
          Search
        </button>
      </div>
    </form>

    <!-- Value Props in Home Mode -->
    <div class="privacy-features" id="privacy-features" aria-label="Search Engine Features">
      <div class="feature-item">
        <span class="feature-icon">✓</span> No Accounts Required
      </div>
      <div class="feature-item">
        <span class="feature-icon">✓</span> Zero Tracking & Profiling
      </div>
      <div class="feature-item">
        <span class="feature-icon">✓</span> Lexical BM25 Ranking
      </div>
    </div>

    <!-- UI State Containers -->
    <div class="state-container" id="state-container">
      <!-- Loading State -->
      <div class="loading-indicator" id="loading-indicator" role="status" aria-live="polite" aria-label="Loading search results">
        <div class="progress-bar-container">
          <div class="progress-bar-fill"></div>
        </div>
        <div class="skeleton-card">
          <div class="skeleton-line short"></div>
          <div class="skeleton-line medium"></div>
          <div class="skeleton-line long"></div>
        </div>
        <div class="skeleton-card">
          <div class="skeleton-line short"></div>
          <div class="skeleton-line medium"></div>
          <div class="skeleton-line long"></div>
        </div>
      </div>

      <!-- Empty State -->
      <div class="empty-state" id="empty-state" role="status" aria-live="polite">
        <div class="empty-icon" aria-hidden="true">🔍</div>
        <h2 class="empty-title">No search results found</h2>
        <p>No indexed documents matched your search for "<strong id="empty-query-text"></strong>".</p>
        <ul class="empty-tips">
          <li>Check your spelling for any typos.</li>
          <li>Try using fewer or more general keywords.</li>
          <li>Remove quotation marks or minus (-) operators.</li>
        </ul>
      </div>

      <!-- Error State -->
      <div class="error-state" id="error-state" role="alert" aria-live="assertive">
        <div class="error-header">
          <span aria-hidden="true">⚠️</span> Search Request Error
        </div>
        <div class="error-message" id="error-message">
          An error occurred while fetching search results.
        </div>
        <button type="button" class="error-retry-btn" id="error-retry-btn">
          Try Again
        </button>
      </div>

      <!-- Results Area -->
      <div class="results-meta" id="results-meta" aria-live="polite"></div>
      <section class="results-container" id="results-area" aria-label="Search Results"></section>
      <div id="pagination-area"></div>
    </div>
  </main>

  <!-- Footer -->
  <footer class="app-footer" role="contentinfo">
    <div class="footer-links">
      <a href="/about">About</a>
      <a href="/privacy">Privacy</a>
      <a href="/health" target="_blank">Status</a>
      <a href="https://github.com/Ashish6298/opensearch" target="_blank" rel="noopener noreferrer">Source Code</a>
    </div>
    <p>OpenSearch V1.0.0 — Public Independent Search Engine</p>
  </footer>

  <script>
    window.__OPENSEARCH_API_URL__ = ${JSON.stringify(apiUrl)};
    ${options.jsContent || '/* Inlined JS */'}
  </script>
</body>
</html>`;
}
