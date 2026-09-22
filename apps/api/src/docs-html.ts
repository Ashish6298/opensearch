/**
 * @opensearch/api — Zero-Dependency Developer Documentation UI (Phase 43)
 *
 * Renders an interactive, terminal-styled OpenAPI documentation portal
 * at GET /docs with a live "Try It" sandbox, copy-ready multi-language code
 * snippets (cURL, JS, Python, Go, Rust), and complete schema references.
 */

import { PROJECT_NAME, PROJECT_VERSION } from '@opensearch/shared';

export interface DocsHtmlOptions {
  apiUrl?: string;
  openapiUrl?: string;
}

export function generateDocsHtml(options: DocsHtmlOptions = {}): string {
  const apiUrl = options.apiUrl ?? '/api/v1/search';
  const openapiUrl = options.openapiUrl ?? '/api/v1/openapi.json';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="OpenSearch REST API Documentation & Interactive Developer Sandbox. Zero-tracking search API reference.">
  <title>Developer Docs & API Sandbox — OpenSearch</title>
  <style>
    :root {
      --bg-primary: #050505;
      --bg-secondary: #0d1117;
      --bg-card: #161b22;
      --bg-card-hover: #1c2128;
      --accent-green: #22c55e;
      --accent-green-dim: #15803d;
      --accent-cyan: #38bdf8;
      --accent-amber: #f59e0b;
      --accent-purple: #c084fc;
      --text-main: #f0f6fc;
      --text-muted: #8b949e;
      --border-color: #30363d;
      --font-mono: 'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, Menlo, monospace;
      --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background-color: var(--bg-primary);
      color: var(--text-main);
      font-family: var(--font-mono);
      line-height: 1.6;
      font-size: 14px;
      padding-bottom: 4rem;
    }

    a { color: var(--accent-cyan); text-decoration: none; }
    a:hover { text-decoration: underline; }

    .header {
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
      padding: 1.25rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 50;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--accent-green);
      letter-spacing: -0.5px;
    }

    .badge {
      font-size: 0.75rem;
      background: rgba(34, 197, 94, 0.15);
      color: var(--accent-green);
      border: 1px solid var(--accent-green-dim);
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
    }

    .header-links {
      display: flex;
      gap: 1.25rem;
      font-size: 0.85rem;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
    }

    .hero {
      margin-bottom: 2.5rem;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid var(--border-color);
    }

    .hero h1 {
      font-size: 2rem;
      color: var(--text-main);
      margin-bottom: 0.5rem;
    }

    .hero p {
      color: var(--text-muted);
      max-width: 800px;
    }

    .section-title {
      font-size: 1.25rem;
      color: var(--accent-cyan);
      margin: 2rem 0 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .endpoint-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      margin-bottom: 2rem;
      overflow: hidden;
    }

    .endpoint-header {
      padding: 1rem 1.5rem;
      background: var(--bg-card);
      border-bottom: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 1rem;
    }

    .method-tag {
      font-weight: 700;
      font-size: 0.8rem;
      padding: 0.25rem 0.6rem;
      border-radius: 4px;
      text-transform: uppercase;
    }

    .method-get { background: rgba(34, 197, 94, 0.2); color: var(--accent-green); border: 1px solid var(--accent-green); }
    .method-post { background: rgba(56, 189, 248, 0.2); color: var(--accent-cyan); border: 1px solid var(--accent-cyan); }

    .endpoint-path {
      font-size: 1.05rem;
      font-weight: 600;
      color: var(--text-main);
    }

    .endpoint-desc {
      padding: 1.25rem 1.5rem;
      color: var(--text-muted);
      border-bottom: 1px solid var(--border-color);
    }

    /* Sandbox Form */
    .sandbox-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.5rem;
      padding: 1.5rem;
    }

    @media (max-width: 900px) {
      .sandbox-grid { grid-template-columns: 1fr; }
    }

    .sandbox-panel {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .panel-heading {
      font-size: 0.9rem;
      color: var(--accent-green);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }

    .form-label {
      font-size: 0.8rem;
      color: var(--text-muted);
    }

    .form-input {
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      color: var(--text-main);
      font-family: var(--font-mono);
      font-size: 0.85rem;
      padding: 0.6rem 0.8rem;
      border-radius: 4px;
      outline: none;
      transition: border-color 0.15s ease;
    }

    .form-input:focus {
      border-color: var(--accent-green);
      box-shadow: 0 0 0 1px var(--accent-green);
    }

    .btn-send {
      background: var(--accent-green);
      color: #000;
      font-weight: 700;
      border: none;
      padding: 0.75rem 1.25rem;
      border-radius: 4px;
      cursor: pointer;
      font-family: var(--font-mono);
      font-size: 0.9rem;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      transition: background 0.2s ease, transform 0.1s ease;
      margin-top: 0.5rem;
    }

    .btn-send:hover { background: #16a34a; }
    .btn-send:active { transform: scale(0.98); }

    /* Code Snippets & Response Viewer */
    .tabs-nav {
      display: flex;
      border-bottom: 1px solid var(--border-color);
      background: var(--bg-primary);
      overflow-x: auto;
    }

    .tab-btn {
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--text-muted);
      padding: 0.6rem 1rem;
      font-family: var(--font-mono);
      font-size: 0.8rem;
      cursor: pointer;
      white-space: nowrap;
    }

    .tab-btn.active {
      color: var(--accent-green);
      border-bottom-color: var(--accent-green);
      background: var(--bg-secondary);
    }

    .code-container {
      position: relative;
      background: #020408;
      border: 1px solid var(--border-color);
      border-radius: 4px;
      overflow: hidden;
    }

    .copy-btn {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      color: var(--text-muted);
      font-family: var(--font-mono);
      font-size: 0.75rem;
      padding: 0.3rem 0.6rem;
      border-radius: 4px;
      cursor: pointer;
      z-index: 10;
    }

    .copy-btn:hover { color: var(--text-main); border-color: var(--text-muted); }

    pre {
      padding: 1rem;
      overflow-x: auto;
      font-size: 0.82rem;
      color: #e6edf3;
      max-height: 420px;
    }

    .response-meta {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-size: 0.75rem;
      margin-bottom: 0.5rem;
    }

    .status-pill {
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-weight: 700;
    }
    .status-200 { background: rgba(34, 197, 94, 0.2); color: var(--accent-green); border: 1px solid var(--accent-green); }
    .status-400 { background: rgba(245, 158, 11, 0.2); color: var(--accent-amber); border: 1px solid var(--accent-amber); }
    .status-429 { background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid #ef4444; }

    /* Schema Tables */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1rem 0;
      font-size: 0.85rem;
    }

    th, td {
      border: 1px solid var(--border-color);
      padding: 0.75rem 1rem;
      text-align: left;
    }

    th {
      background: var(--bg-card);
      color: var(--accent-cyan);
      font-weight: 600;
    }

    td code {
      background: var(--bg-primary);
      padding: 0.15rem 0.35rem;
      border-radius: 3px;
      color: var(--accent-purple);
    }
  </style>
</head>
<body>

  <header class="header">
    <div class="brand">
      <a href="/" style="color: inherit;">⚡ ${PROJECT_NAME}</a>
      <span class="badge">v${PROJECT_VERSION}</span>
      <span class="badge" style="background: rgba(56, 189, 248, 0.15); color: var(--accent-cyan); border-color: var(--accent-cyan);">OpenAPI 3.1.0</span>
    </div>
    <div class="header-links">
      <a href="/">← Web Search</a>
      <a href="${openapiUrl}" target="_blank">openapi.json ↗</a>
      <a href="https://github.com/Ashish6298/opensearch" target="_blank" rel="noopener noreferrer">GitHub ↗</a>
    </div>
  </header>

  <main class="container">
    <section class="hero">
      <h1>Developer API Reference & Sandbox</h1>
      <p>
        The OpenSearch REST API provides privacy-first, zero-telemetry lexical and hybrid search, instant answers, developer bangs, typo corrections, prefix autocomplete, and cluster health telemetry.
      </p>
    </section>

    <!-- SEARCH ENDPOINT -->
    <h2 class="section-title"><span>🔍</span> 1. Search Query API</h2>
    <div class="endpoint-card">
      <div class="endpoint-header">
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <span class="method-tag method-get">GET</span>
          <span class="endpoint-path">/api/v1/search</span>
        </div>
        <span style="color: var(--text-muted); font-size: 0.85rem;">Rate Limit: 60 req/min</span>
      </div>
      <div class="endpoint-desc">
        Executes a lexical BM25 search across the inverted index. Supports quoted phrases, exclusions (<code style="color: var(--accent-purple);">-term</code>), domain filtering (<code style="color: var(--accent-purple);">site:</code>), filetype filters, calculations, and 50+ developer bangs (<code style="color: var(--accent-purple);">!gh</code>, <code style="color: var(--accent-purple);">!npm</code>).
      </div>

      <div class="sandbox-grid">
        <!-- Input Sandbox Form -->
        <div class="sandbox-panel">
          <div class="panel-heading">⚡ Live Request Sandbox</div>
          <div class="form-group">
            <label class="form-label">Query (q) *</label>
            <input type="text" id="input-search-q" class="form-input" value="typescript async await" placeholder="e.g. typescript tutorial or !gh react">
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div class="form-group">
              <label class="form-label">Page</label>
              <input type="number" id="input-search-page" class="form-input" value="1" min="1">
            </div>
            <div class="form-group">
              <label class="form-label">Limit (1–100)</label>
              <input type="number" id="input-search-limit" class="form-input" value="5" min="1" max="100">
            </div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div class="form-group">
              <label class="form-label">Domain / Site Filter</label>
              <input type="text" id="input-search-domain" class="form-input" placeholder="e.g. nodejs.org">
            </div>
            <div class="form-group">
              <label class="form-label">Category Filter</label>
              <input type="text" id="input-search-category" class="form-input" placeholder="e.g. Technology">
            </div>
          </div>
          <button type="button" id="btn-run-search" class="btn-send">
            <span>▶</span> Execute Request
          </button>

          <!-- Code Snippets Tabs -->
          <div style="margin-top: 1rem;">
            <div class="panel-heading" style="margin-bottom: 0.5rem;">💻 Copy-Ready Snippets</div>
            <div class="tabs-nav" id="search-code-tabs">
              <button class="tab-btn active" data-lang="curl">cURL</button>
              <button class="tab-btn" data-lang="js">JavaScript</button>
              <button class="tab-btn" data-lang="python">Python</button>
              <button class="tab-btn" data-lang="go">Go</button>
              <button class="tab-btn" data-lang="rust">Rust</button>
            </div>
            <div class="code-container">
              <button class="copy-btn" onclick="copySnippet('search-code-snippet')">Copy</button>
              <pre><code id="search-code-snippet">curl -X GET "http://localhost:3001/api/v1/search?q=typescript+async+await&limit=5"</code></pre>
            </div>
          </div>
        </div>

        <!-- Output / Response Viewer -->
        <div class="sandbox-panel">
          <div class="panel-heading">📦 Real-Time Response</div>
          <div class="response-meta" id="search-response-meta" style="display: none;">
            <span class="status-pill status-200" id="search-status-pill">200 OK</span>
            <span style="color: var(--text-muted);" id="search-latency-pill">0 ms</span>
            <span style="color: var(--text-muted);" id="search-size-pill">0 bytes</span>
          </div>
          <div class="code-container">
            <button class="copy-btn" onclick="copySnippet('search-response-body')">Copy JSON</button>
            <pre><code id="search-response-body">// Click "Execute Request" to test live API response...</code></pre>
          </div>
        </div>
      </div>
    </div>

    <!-- SUGGEST / AUTOCOMPLETE ENDPOINT -->
    <h2 class="section-title"><span>⚡</span> 2. Prefix Autocomplete API</h2>
    <div class="endpoint-card">
      <div class="endpoint-header">
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <span class="method-tag method-get">GET</span>
          <span class="endpoint-path">/api/v1/suggest</span>
        </div>
        <span style="color: var(--text-muted); font-size: 0.85rem;">Rate Limit: 60 req/min</span>
      </div>
      <div class="endpoint-desc">
        Returns instant search-as-you-type completions matching the input prefix from the prefix-trie vocabulary.
      </div>

      <div class="sandbox-grid">
        <div class="sandbox-panel">
          <div class="panel-heading">⚡ Live Suggest Sandbox</div>
          <div class="form-group">
            <label class="form-label">Prefix (q) *</label>
            <input type="text" id="input-suggest-q" class="form-input" value="type" placeholder="e.g. type or pyt">
          </div>
          <div class="form-group">
            <label class="form-label">Limit (1–20)</label>
            <input type="number" id="input-suggest-limit" class="form-input" value="5" min="1" max="20">
          </div>
          <button type="button" id="btn-run-suggest" class="btn-send">
            <span>▶</span> Fetch Suggestions
          </button>
        </div>

        <div class="sandbox-panel">
          <div class="panel-heading">📦 Real-Time Response</div>
          <div class="response-meta" id="suggest-response-meta" style="display: none;">
            <span class="status-pill status-200" id="suggest-status-pill">200 OK</span>
            <span style="color: var(--text-muted);" id="suggest-latency-pill">0 ms</span>
          </div>
          <div class="code-container">
            <button class="copy-btn" onclick="copySnippet('suggest-response-body')">Copy JSON</button>
            <pre><code id="suggest-response-body">// Click "Fetch Suggestions" to test live autocomplete...</code></pre>
          </div>
        </div>
      </div>
    </div>

    <!-- HEALTH & DIAGNOSTICS ENDPOINT -->
    <h2 class="section-title"><span>💓</span> 3. Health & Diagnostics API</h2>
    <div class="endpoint-card">
      <div class="endpoint-header">
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <span class="method-tag method-get">GET</span>
          <span class="endpoint-path">/health</span>
        </div>
        <span style="color: var(--text-muted); font-size: 0.85rem;">Public Diagnostic</span>
      </div>
      <div class="endpoint-desc">
        Provides real-time health telemetry including document & term counts, memory usage (MB), rate limiter stats, and query cache efficiency.
      </div>
      <div style="padding: 1.5rem;">
        <button type="button" id="btn-run-health" class="btn-send" style="display: inline-flex; width: auto;">
          <span>▶</span> Probe /health Status
        </button>
        <div class="code-container" style="margin-top: 1rem;">
          <button class="copy-btn" onclick="copySnippet('health-response-body')">Copy JSON</button>
          <pre><code id="health-response-body">// Probe cluster health to view system metrics...</code></pre>
        </div>
      </div>
    </div>

    <!-- SCHEMA REFERENCE TABLES -->
    <h2 class="section-title"><span>📋</span> 4. Status Codes & Error Reference</h2>
    <table>
      <thead>
        <tr>
          <th>HTTP Status</th>
          <th>Code Name</th>
          <th>Description & Resolution</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><span class="status-pill status-200">200 OK</span></td>
          <td><code>SUCCESS</code></td>
          <td>Request succeeded. Returns ranked search results, suggestions, or diagnostic telemetry.</td>
        </tr>
        <tr>
          <td><span class="status-pill status-400">400 Bad Request</span></td>
          <td><code>VALIDATION_ERROR</code></td>
          <td>Query parameter missing or out of valid constraints (e.g. empty <code>q</code> or <code>limit &gt; 100</code>).</td>
        </tr>
        <tr>
          <td><span class="status-pill status-429">429 Too Many Requests</span></td>
          <td><code>RATE_LIMIT_EXCEEDED</code></td>
          <td>Client IP exceeded the sliding-window rate limit (default: 60 requests / minute).</td>
        </tr>
        <tr>
          <td><span class="status-pill" style="background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid #ef4444;">500 Internal Error</span></td>
          <td><code>INTERNAL_ERROR</code></td>
          <td>Server error during index traversal or candidate retrieval.</td>
        </tr>
      </tbody>
    </table>
  </main>

  <script>
    let currentSearchLang = 'curl';

    function getSearchUrl() {
      const q = encodeURIComponent(document.getElementById('input-search-q').value.trim());
      const page = document.getElementById('input-search-page').value;
      const limit = document.getElementById('input-search-limit').value;
      const domain = encodeURIComponent(document.getElementById('input-search-domain').value.trim());
      const category = encodeURIComponent(document.getElementById('input-search-category').value.trim());

      let params = [];
      if (q) params.push('q=' + q);
      if (page && page !== '1') params.push('page=' + page);
      if (limit && limit !== '10') params.push('limit=' + limit);
      if (domain) params.push('domain=' + domain);
      if (category) params.push('category=' + category);

      const qs = params.length ? '?' + params.join('&') : '';
      const baseEndpoint = ${JSON.stringify(apiUrl)};
      const basePrefix = baseEndpoint.startsWith('http') ? baseEndpoint : (window.location.origin + baseEndpoint);
      return basePrefix + qs;
    }

    function updateCodeSnippets() {
      const url = getSearchUrl();
      const snippetEl = document.getElementById('search-code-snippet');

      if (currentSearchLang === 'curl') {
        snippetEl.textContent = 'curl -X GET "' + url + '"';
      } else if (currentSearchLang === 'js') {
        snippetEl.textContent = 'const response = await fetch("' + url + '");\\nconst data = await response.json();\\nconsole.log(data.results);';
      } else if (currentSearchLang === 'python') {
        snippetEl.textContent = 'import requests\\n\\nres = requests.get("' + url + '")\\ndata = res.json()\\nprint(data["results"])';
      } else if (currentSearchLang === 'go') {
        snippetEl.textContent = 'package main\\n\\nimport (\\n\\t"fmt"\\n\\t"net/http"\\n\\t"io"\\n)\\n\\nfunc main() {\\n\\tres, _ := http.Get("' + url + '")\\n\\tbody, _ := io.ReadAll(res.Body)\\n\\tfmt.Println(string(body))\\n}';
      } else if (currentSearchLang === 'rust') {
        snippetEl.textContent = '#[tokio::main]\\nasync fn main() -> Result<(), reqwest::Error> {\\n    let res = reqwest::get("' + url + '")\\n        .await?\\n        .text()\\n        .await?;\\n    println!("{}", res);\\n    Ok(())\\n}';
      }
    }

    // Tab switching for code snippets
    document.querySelectorAll('#search-code-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#search-code-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentSearchLang = btn.dataset.lang;
        updateCodeSnippets();
      });
    });

    ['input-search-q', 'input-search-page', 'input-search-limit', 'input-search-domain', 'input-search-category'].forEach(id => {
      document.getElementById(id).addEventListener('input', updateCodeSnippets);
    });

    // Execute Search API
    document.getElementById('btn-run-search').addEventListener('click', async () => {
      const url = getSearchUrl();
      const metaEl = document.getElementById('search-response-meta');
      const statusPill = document.getElementById('search-status-pill');
      const latencyPill = document.getElementById('search-latency-pill');
      const sizePill = document.getElementById('search-size-pill');
      const bodyEl = document.getElementById('search-response-body');

      bodyEl.textContent = '// Sending request...';
      metaEl.style.display = 'none';

      const t0 = performance.now();
      try {
        const res = await fetch(url);
        const t1 = performance.now();
        const json = await res.json();
        const text = JSON.stringify(json, null, 2);

        metaEl.style.display = 'flex';
        statusPill.textContent = res.status + ' ' + res.statusText;
        statusPill.className = 'status-pill status-' + (res.ok ? '200' : res.status === 429 ? '429' : '400');
        latencyPill.textContent = (t1 - t0).toFixed(1) + ' ms';
        sizePill.textContent = new Blob([text]).size + ' bytes';
        bodyEl.textContent = text;
      } catch (err) {
        metaEl.style.display = 'flex';
        statusPill.textContent = 'Error';
        statusPill.className = 'status-pill status-400';
        bodyEl.textContent = '// Network error: ' + err.message;
      }
    });

    // Execute Suggest API
    document.getElementById('btn-run-suggest').addEventListener('click', async () => {
      const q = encodeURIComponent(document.getElementById('input-suggest-q').value.trim());
      const limit = document.getElementById('input-suggest-limit').value;
      const url = window.location.origin + '/api/v1/suggest?q=' + q + '&limit=' + limit;

      const metaEl = document.getElementById('suggest-response-meta');
      const statusPill = document.getElementById('suggest-status-pill');
      const latencyPill = document.getElementById('suggest-latency-pill');
      const bodyEl = document.getElementById('suggest-response-body');

      bodyEl.textContent = '// Fetching suggestions...';
      metaEl.style.display = 'none';

      const t0 = performance.now();
      try {
        const res = await fetch(url);
        const t1 = performance.now();
        const json = await res.json();
        const text = JSON.stringify(json, null, 2);

        metaEl.style.display = 'flex';
        statusPill.textContent = res.status + ' ' + res.statusText;
        statusPill.className = 'status-pill status-' + (res.ok ? '200' : '400');
        latencyPill.textContent = (t1 - t0).toFixed(1) + ' ms';
        bodyEl.textContent = text;
      } catch (err) {
        metaEl.style.display = 'flex';
        statusPill.textContent = 'Error';
        statusPill.className = 'status-pill status-400';
        bodyEl.textContent = '// Error: ' + err.message;
      }
    });

    // Probe Health
    document.getElementById('btn-run-health').addEventListener('click', async () => {
      const bodyEl = document.getElementById('health-response-body');
      bodyEl.textContent = '// Probing /health...';
      try {
        const res = await fetch(window.location.origin + '/health');
        const json = await res.json();
        bodyEl.textContent = JSON.stringify(json, null, 2);
      } catch (err) {
        bodyEl.textContent = '// Error: ' + err.message;
      }
    });

    function copySnippet(elementId) {
      const text = document.getElementById(elementId).textContent;
      navigator.clipboard.writeText(text).then(() => {
        const btn = event.target;
        const orig = btn.textContent;
        btn.textContent = '✓ Copied!';
        setTimeout(() => btn.textContent = orig, 1500);
      });
    }

    updateCodeSnippets();
  </script>
</body>
</html>`;
}
