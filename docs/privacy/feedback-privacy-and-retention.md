# Privacy-Conscious Feedback & Retention Policy

**OpenSearch Specification**  
**Version:** 1.0.0  
**Status:** Canonical Privacy Policy & Technical Standard  

---

## 1. Core Principles

OpenSearch is designed from the ground up as a decentralized, privacy-first search engine. Our search quality feedback system is built upon four fundamental guarantees:

1. **Explicit Consent Required**: No search quality rating or telemetry is ever transmitted without affirmative, explicit user consent.
2. **Zero Sensitive Data Collection**: We strictly prohibit and programmatically reject raw queries, client IP addresses, account identifiers, session tokens, browser/device fingerprints, and click histories.
3. **Bounded Lifetime & Right to Erasure**: Consented feedback entries are stored in a bounded FIFO ring buffer (maximum 1,000 records) with an automatic 30-day expiration policy, after which records are permanently deleted. Users can also purge all records at any time.
4. **Transparent Network Realism**: We refuse to market feedback transmission as magically "anonymous." While OpenSearch strips and refuses to log IP addresses at the application layer, intermediate transport-layer network packets inevitably traverse hosting providers and network routers.

---

## 2. What Is and Is Not Collected

| Dimension | Policy | Technical Implementation |
|-----------|--------|--------------------------|
| **Search Query** | 🚫 **NEVER COLLECTED** | The validator rejects any payload containing `query`, `rawQuery`, `q`, or `searchQuery`. |
| **IP Address** | 🚫 **NEVER COLLECTED** | The validator rejects payload `ip` fields; the server omits client IP from stored records. |
| **User / Account IDs** | 🚫 **NEVER COLLECTED** | No cookies, accounts, sessions, or usernames are recorded. |
| **Device Fingerprints** | 🚫 **NEVER COLLECTED** | User agent, canvas, WebGL, or hardware fingerprints are strictly forbidden. |
| **Click History** | 🚫 **NEVER COLLECTED** | Clicked links, dwell times, and navigation histories are rejected by the validator. |
| **Rating** | ✅ Minimal | Categorical: `helpful` or `not_helpful`. |
| **Category** | ✅ Coarse | Coarse topic e.g. `general`, `developer`, `news`, `images`. |
| **Result Count Bucket** | ✅ Coarse | Binned buckets: `0`, `1-5`, `6-10`, `10+`. Never individual URLs or documents. |
| **Reason Code** | ✅ Standardized (Optional) | Standardized codes e.g. `accurate_answer`, `outdated_results`, `broken_links`. |
| **Consent Container** | ✅ Mandatory | Explicit consent flag, timestamp, and mode (`local_only` vs. `consented_aggregate`). |

---

## 3. Data Retention and Automatic Purging

- **30-Day Expiration**: Every feedback entry is tagged with an `expiresAt` timestamp set to exactly 30 days from creation (`Date.now() + 30 * 24 * 60 * 60 * 1000`).
- **Automatic Purging**: Stale records exceeding `expiresAt` are automatically scrubbed during ring-buffer operations.
- **Capacity Bounds**: Storage is capped at a maximum of 1,000 records. Once the limit is reached, older records are evicted using a strict FIFO ring buffer.
- **Immediate Deletion Right**: Users and operators can immediately purge all feedback records using the `DELETE /api/v1/feedback` HTTP endpoint or via local browser cache clearance.

---

## 4. Network Metadata Limitations Disclosure

> [!IMPORTANT]
> **Notice on Network Metadata**:  
> Although the OpenSearch application code strips and refuses to persist your IP address or client identifiers, all Internet communications rely on TCP/IP transport packets. Intermediate network infrastructure—including your Internet Service Provider (ISP), intermediate routing backbones, cloud edge proxies, and server operating system kernels—temporarily handle packet headers containing your source IP address.
> 
> Therefore, OpenSearch **does not describe remote feedback as "anonymous."**
> For maximum privacy, you may choose **Local-Only Storage Mode** (which records your rating exclusively within your browser's local device storage and emits zero network packets), or route your traffic through Tor or a trusted VPN.
