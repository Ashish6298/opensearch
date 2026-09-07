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
  <meta name="theme-color" content="#0d0d0d">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
  <title>${title}</title>
  <style>
    ${options.cssContent || '/* Inlined CSS */'}
  </style>
</head>
<body>
  <div id="a11y-announcer" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></div>

  <div class="terminal-app" id="terminal-window" role="main">
    <!-- Version indicator in top corner (No navbar) -->
    <div class="corner-version">v1.0.0</div>

    <!-- Main Content Area -->
    <main class="terminal-main">
      <div class="terminal-container">
        <!-- ASCII Wordmark centered -->
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
          <form class="terminal-search-form" id="search-form" role="search" aria-label="OpenSearch Form">
            <div class="terminal-search-box">
              <span class="search-prompt-symbol" aria-hidden="true">&gt;</span>
              <input
                type="text"
                id="search-input"
                class="terminal-search-input"
                placeholder="enter query"
                autocomplete="off"
                autocorrect="off"
                autocapitalize="off"
                spellcheck="false"
                aria-label="Search query"
                required
              />
              <button type="submit" id="search-submit-btn" class="run-btn" aria-label="Run search query">RUN</button>
            </div>
          </form>
        </div>

        <!-- UI State Containers & Results -->
        <div class="state-container" id="state-container">
          <div class="loading-indicator" id="loading-indicator" role="status" aria-live="polite" aria-label="Loading search results" style="display:none;">
            <div class="cli-loading">[...] executing search query...</div>
          </div>

          <div class="empty-state" id="empty-state" role="region" aria-label="No results found" aria-live="polite" style="display:none;">
            <div class="cli-empty">[0 hits] no matches found for "<span id="empty-query-text"></span>"</div>
            <div class="cli-empty-hint">&gt; try broader terms or verify spelling</div>
          </div>

          <div class="error-state" id="error-state" role="alert" aria-live="assertive" style="display:none;">
            <div class="cli-error">[ERROR] search query failed: <span id="error-message">connection refused</span></div>
            <button type="button" class="cli-retry-btn" id="error-retry-btn">[ retry ]</button>
          </div>

          <div class="results-meta" id="results-meta" role="status" aria-live="polite"></div>
          <section class="results-container" id="results-area" aria-label="Search Results"></section>
          <div id="pagination-area" role="navigation" aria-label="Search pagination"></div>
        </div>
      </div>
    </main>

    <!-- Terminal Footer -->
    <footer class="terminal-footer">
      <div class="footer-container">
        <span class="footer-text"><a href="/about">about</a> · <a href="/privacy">privacy</a> · <a href="/health" target="_blank" rel="noopener noreferrer">status</a> · <a href="https://github.com/Ashish6298/opensearch" target="_blank" rel="noopener noreferrer">source</a> — v1.0.0</span>
      </div>
    </footer>
  </div>

  <script>
    window.__OPENSEARCH_API_URL__ = ${JSON.stringify(apiUrl)};
    ${options.jsContent || '/* Inlined JS */'}
  </script>
</body>
</html>`;
}
