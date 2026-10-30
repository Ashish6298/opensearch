# Demo Experience & Accessibility Review Guide

**Milestone 39 — Documentation, Repository Hygiene, and Demo**  
**Phase 116 — Demo experience and accessibility review**  
**Date:** 2026-10-30  
**Status:** Verified & Complete  

---

## 1. Overview & Objectives

Phase 116 delivers an accessible, zero-cost **Demo Experience** that operates completely offline without paid API services, cloud credentials, or external network requests. It includes:
1. An offline curated demo corpus with honest labeling (`isDemo: true`, `source: 'demo'`).
2. Representative everyday and developer queries with instant results.
3. Resilience against provider failure to ensure the UI never leaves a blank screen.
4. Comprehensive accessibility review (WCAG AA visible focus indicators, reduced motion media queries, keyboard navigation, skip links, and ARIA landmarks).

---

## 2. Zero-Paid-Service Demo Mode

### Activating Demo Mode
Demo Mode can be activated via:
- **Web UI**: Check the **🧪 Demo** chip located right under the search input.
- **Query Parameter**: Add `?demo=true` or `?demo_mode=true` to any search request.
- **HTTP Header**: Send `X-Demo-Mode: true`.
- **Environment Variable**: Set `DEMO_MODE=true` in `.env`.

### Truthful Data Labeling
When Demo Mode is active:
- Results are marked with an amber badge: `[Demo]`.
- Response metadata includes `demoMode: true` and `demoNotice: "OpenSearch Web Demo Mode: Results served from offline curated demo corpus without external network calls."`.
- Results are never misrepresented as real-time, live global web coverage.

### Suppressing External Network Calls
Demo Mode completely disables outbound network requests to external providers (e.g. Wikipedia, DuckDuckGo, ArXiv).
The Privacy Receipt reflects:
```json
{
  "mode": "demo",
  "networkDispatch": {
    "totalOutboundRequests": 0,
    "externalProvidersContacted": [],
    "externalProvidersSkipped": [
      {
        "providerId": "wikipedia",
        "reason": "demo-mode",
        "details": "External search provider suppressed because Demo mode is active."
      }
    ]
  }
}
```

---

## 3. Representative Everyday and Developer Queries

OpenSearch Web provides pre-curated demo documents for 10 representative queries across everyday and developer domains:

### Everyday Queries
| Query | Topic | Source Domain |
| :--- | :--- | :--- |
| `weather` | Atmospheric observation & forecast modeling | `weather.gov` |
| `healthy recipe` | Mediterranean vegetable quinoa bowl | `recipes.openfood.org` |
| `solar system` | Planetary science & NASA space missions | `science.nasa.gov` |
| `world news` | Independent global journalism | `news.openpress.org` |
| `unit converter` | Metric & imperial conversion factors | `units.nist.reference.org` |

### Developer Queries
| Query | Topic | Source Domain |
| :--- | :--- | :--- |
| `typescript compiler` | Parser, typechecker & AST emitter | `typescriptlang.org` |
| `bm25 ranking algorithm` | Okapi BM25 scoring with $k_1$ and $b$ | `nlp.stanford.edu` |
| `inverted index postings` | Term dictionary & postings compression | `cs.princeton.edu` |
| `rest api cors headers` | Cross-Origin Resource Sharing security | `developer.mozilla.org` |
| `git rebase interactive` | History rewriting, squash & fixup | `git-scm.com` |

---

## 4. Accessibility Review & WCAG AA Compliance

### A. Reduced Motion (`prefers-reduced-motion: reduce`)
Users with vestibular motion sensitivity can enable reduced motion in their OS.
The stylesheet (`apps/web/src/style.css`) contains:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

### B. Visible Keyboard Focus (`:focus-visible`)
All interactive elements (inputs, buttons, links, selects, checkboxes) feature high-visibility phosphor-green outlines with 2px offset:
```css
:focus-visible {
  outline: 2px solid var(--accent-green, #00ff66) !important;
  outline-offset: 2px !important;
}
```

### C. Screen Reader & Landmark Structure
- **Skip Links**: Accessible at the very top of the DOM: `<a href="#search-input" class="skip-link">Skip to search</a>` and `<a href="#results-area" class="skip-link">Skip to results</a>`.
- **Live Regions**: Dynamic announcements use `<div id="a11y-announcer" class="sr-only" role="status" aria-live="polite">`.
- **Explicit Labels**: All search fields, filters, lenses, and buttons feature descriptive `aria-label` or `<label>` associations.

---

## 5. Resilience Against Provider Failure

If upstream search providers fail, time out (HTTP 504), or return HTTP 429/500:
- The UI **never leaves a blank page**.
- The page renders a structured `provider-failure-state` card with:
  1. Explanation of the provider failure.
  2. `[ retry provider ]` button.
  3. `[ switch to offline demo ]` button.
  4. Notice that local index search remains active.
