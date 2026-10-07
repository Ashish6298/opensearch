# OpenSearch REST & Streaming API Documentation (v1.4.0)

OpenSearch exposes a high-performance, zero-tracking, standalone HTTP & Streaming Search API implemented with zero external runtime dependencies using native Node.js HTTP servers.

## Base URL
- Local: `http://localhost:3000`
- Interactive OpenAPI Docs: `http://localhost:3000/docs`
- OpenAPI 3.1.0 Specification: `http://localhost:3000/api/v1/openapi.json`

---

## Endpoints

### 1. Standard Search
`GET /api/v1/search`

Executes deterministic relevance ranking over the in-memory inverted index, incorporating BM25 ranking, PageRank authority scores, temporal freshness decay, synonym expansion, and zero-API instant answers.

#### Query Parameters
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `q` | `string` | **Yes** | — | Search query string |
| `limit` | `integer` | No | `10` | Max results to return (1–100) |
| `offset` | `integer` | No | `0` | Pagination offset |
| `explain` | `boolean` | No | `false` | When true, returns the Query Explain Plan breakdown |

#### Sample Request
```bash
curl -G "http://localhost:3000/api/v1/search" --data-urlencode "q=python async await" --data-urlencode "explain=true"
```

#### Sample Response
```json
{
  "query": "python async await",
  "total": 42,
  "limit": 10,
  "offset": 0,
  "durationMs": 0.45,
  "answer": null,
  "results": [
    {
      "url": "https://docs.python.org/3/library/asyncio-task.html",
      "title": "Coroutines and Tasks — Python 3 Documentation",
      "snippet": "...in Python <mark>async</mark> and <mark>await</mark> syntax is used to declare concurrent coroutines...",
      "score": 0.942,
      "pageRank": 0.88,
      "explain": {
        "matchedTerms": ["python", "async", "await"],
        "expandedSynonyms": ["py", "python3"],
        "bm25Score": 4.12,
        "pageRankScore": 0.88,
        "freshnessScore": 0.95,
        "authorityScore": 1.0,
        "finalScore": 0.942
      }
    }
  ],
  "explainPlan": {
    "parsedQuery": "python async await",
    "expandedSynonyms": ["py", "python3"],
    "retrieval": {
      "candidateCount": 42,
      "matchedPostingLists": 3
    },
    "scoringBreakdown": {
      "bm25Weight": 0.6,
      "pageRankWeight": 0.2,
      "freshnessWeight": 0.1,
      "authorityWeight": 0.1
    },
    "timingsMs": {
      "synonymExpansion": 0.05,
      "retrieval": 0.15,
      "scoring": 0.20,
      "total": 0.45
    }
  }
}
```

---

### 2. Server-Sent Events (SSE) Streaming Search
`GET /api/v1/search/stream`

Progressively streams search events over a single HTTP connection. Instant answers are dispatched immediately (`answer` event), followed by progressive document batches (`results` event), and concluding with execution metrics (`done` event).

#### Query Parameters
| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `q` | `string` | **Yes** | — | Search query string |
| `limit` | `integer` | No | `10` | Max results to return |
| `offset` | `integer` | No | `0` | Result offset |
| `explain` | `boolean` | No | `false` | Include explain plan |

#### Sample Request
```bash
curl -N -H "Accept: text/event-stream" "http://localhost:3000/api/v1/search/stream?q=time+in+tokyo"
```

#### Event Stream Protocol
```text
event: answer
data: {"type":"timezone","title":"Current Time in Tokyo","data":{"time":"03:45 AM","date":"Wednesday, Oct 7, 2026","tz":"Asia/Tokyo","offset":"+09:00"}}

event: results
data: [{"url":"https://time.is/Tokyo","title":"Time in Tokyo, Japan now","snippet":"Exact local time in Tokyo, Japan with timezone offset...","score":0.89}]

event: done
data: {"totalResults":1,"durationMs":0.38}
```

---

### 3. Autocomplete / Suggestions
`GET /api/v1/suggest?q=<prefix>`

Returns instantaneous prefix-matched query suggestions from the indexed vocabulary.

---

### 4. Health & Engine Status
`GET /api/v1/health`

Returns engine status, total indexed documents, vocabulary size, and memory usage.
