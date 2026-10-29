# OpenSearch Web — Browser Search Integration Guide

This guide explains how to install and configure **OpenSearch Web** as your browser's primary address bar search engine across all major desktop and mobile browsers.

---

## 1. Product Identity Notice

> [!NOTE]
> **OpenSearch Web** is an independent, open-source, privacy-preserving web search engine developed from scratch in TypeScript. It maintains its own crawler, inverted index, and ranking system with **zero user tracking, zero query logging, and zero cookies**.
> 
> OpenSearch Web is **not affiliated with, endorsed by, or related to** Amazon Web Services (AWS) or the Amazon OpenSearch Service (the Elasticsearch fork).

---

## 2. Standards & Autodiscovery

OpenSearch Web implements the official **OpenSearch 1.1 Draft 6 specification**:
- **Description Document Path**: `/opensearch.xml` (alias: `/opensearchdescription.xml`)
- **MIME Type**: `application/opensearchdescription+xml; charset=utf-8`
- **Autodiscovery Tag**: Embedded in all HTML pages (`<link rel="search" type="application/opensearchdescription+xml" title="OpenSearch Web" href="/opensearch.xml">`)
- **Search URL Template**: `{baseUrl}/?q={searchTerms}`
- **Interactive Suggestion Autocompletion**: `{baseUrl}/api/v1/suggest?q={searchTerms}&format=opensearch`

---

## 3. Browser-by-Browser Installation

### 🦊 Mozilla Firefox (Desktop & Mobile)

#### Method A: One-Click Address Bar Installation
1. Navigate to your OpenSearch instance (e.g. `http://localhost:3000` or your custom domain).
2. Right-click anywhere in the Firefox address bar, or click the **Page Actions (•••)** menu.
3. Click **Add "OpenSearch Web"**.
4. To make it default: Go to `Settings` > `Search` > `Default Search Engine` > select **OpenSearch Web**.

#### Method B: Manual Shortcut Setup
1. Open Firefox `Settings` > `Search`.
2. Scroll down to **Search Shortcuts** and click **Add**.
3. Fill in:
   - **Name**: `OpenSearch Web`
   - **URL**: `https://your-domain/?q=%s`
   - **Keyword**: `@os`

---

### 🌐 Google Chrome, Brave & Chromium-based Browsers

#### Method A: Automatic Autodiscovery
1. Visit your OpenSearch instance (`http://localhost:3000`).
2. Chrome automatically parses the `<link rel="search">` tag and adds the engine under inactive site searches.
3. Open `chrome://settings/searchEngines` (or `Settings` > `Search engine` > `Manage search engines and site search`).
4. Find **OpenSearch Web** under *Site search*, click the three dots (`⋮`), and select **Make default**.

#### Method B: Manual Engine Addition
1. Open `Settings` > `Search engine` > `Manage search engines and site search`.
2. Under **Site search**, click **Add**:
   - **Search engine**: `OpenSearch Web`
   - **Shortcut**: `@os` or `os`
   - **URL with %s in place of query**: `http://localhost:3000/?q=%s`
3. Click **Add**, then click `⋮` > **Make default**.

---

### 🦁 Brave Browser

1. Navigate to `brave://settings/searchEngines`.
2. Under **Site search**, click **Add**:
   - **Search engine**: `OpenSearch Web`
   - **Shortcut**: `:os`
   - **URL**: `http://localhost:3000/?q=%s`
3. Click `⋮` and select **Make default**.
4. Enjoy privacy-first search with zero tracking scripts.

---

### 🌊 Microsoft Edge

1. Visit your OpenSearch deployment in Edge.
2. Open `edge://settings/searchEngines` (or `Settings` > `Privacy, search, and services` > `Address bar and search` > `Manage search engines`).
3. OpenSearch Web will be listed automatically under discovered engines. Click `⋮` > **Make default**.
4. Alternatively, click **Add** manually with template `http://localhost:3000/?q=%s`.

---

### 🧭 Apple Safari (macOS & iOS)

Safari does not support the open OpenSearch XML standard for direct address-bar integration out of the box. You have two options:
1. **Keyword Bookmark**:
   - Create a bookmark named `os` pointing to `http://localhost:3000/?q=`.
   - In Safari's URL bar, type your bookmark keyword followed by your search terms.
2. **Safari Extension**:
   - Use an open-source Safari search redirect extension (e.g. *Keyword Search* or *Searchium*) configured with `http://localhost:3000/?q=%s`.

---

### 🔴 Vivaldi Browser

1. Navigate to your OpenSearch instance.
2. Right-click the search input field or the search bar on the homepage.
3. Click **Add as Search Engine...** from the context menu.
4. Set the nickname to `os` and check **Use as Default Search**.

---

## 4. Search Suggestion Autocompletion

OpenSearch Web provides live search-as-you-type completions directly inside supporting browser URL bars:
- **Endpoint**: `GET /api/v1/suggest?q={searchTerms}&format=opensearch`
- **Output**: OpenSearch JSON array format:
  ```json
  [
    "type",
    ["typescript", "typescript tutorial", "types"]
  ]
  ```
- Fast in-memory Prefix Trie lookup ensures zero-latency completions without logging user queries.

---

## 5. Verification Checklist

| Check | Expected Result |
|-------|-----------------|
| `GET /opensearch.xml` | Returns HTTP 200 with MIME type `application/opensearchdescription+xml; charset=utf-8`. |
| ShortName Length | 14 characters (`OpenSearch Web`), strictly within the 16-character maximum. |
| URL Template | Contains valid `{searchTerms}` placeholder with query parameter `q`. |
| Suggestions URL | Contains valid OpenSearch JSON format parameter `&format=opensearch`. |
| Privacy Guarantee | Distinct product identity clearly declared to avoid Amazon OpenSearch confusion. |
| HTML Discovery | `<link rel="search">` tag embedded in all HTML layouts. |
