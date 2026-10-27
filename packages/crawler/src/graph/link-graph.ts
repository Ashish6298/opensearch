/**
 * @opensearch/crawler — Link Graph Extraction & Representation (Phase 87)
 *
 * Implements a memory-bounded, versioned, reproducible web link graph:
 * - Safe link extraction with SSRF and scheme safeguards
 * - URL canonicalization and redirect resolution
 * - Deterministic duplicate edge elimination
 * - Bounded node capacity and per-node outbound edge limits
 * - Forward adjacency and reverse backlink indexing for PageRank
 * - Full JSON snapshot serialization & deterministic rebuild from crawl corpus
 */

import { validateUrl } from '../url/url-validator.js';
import { normalizeUrl } from '../url/url-normalizer.js';
import { validateTargetHostSync } from '../fetcher/ssrf-guard.js';
import {
  LinkGraphData,
  LinkGraphDocumentInput,
  LinkGraphEdge,
  LinkGraphNode,
  LinkGraphOptions,
  LinkGraphSummary,
} from './graph-types.js';

export const DEFAULT_LINK_GRAPH_OPTIONS: Required<LinkGraphOptions> = {
  maxNodes: 50_000,
  maxOutboundEdgesPerNode: 500,
  allowSelfLoops: false,
  includeNofollow: false,
  includeExternal: true,
  canonicalizeRedirects: true,
};

export class LinkGraph {
  private readonly options: Required<LinkGraphOptions>;
  private readonly nodes = new Map<string, LinkGraphNode>();
  private readonly adjacency = new Map<string, Set<string>>();
  private readonly reverseAdjacency = new Map<string, Set<string>>();
  private readonly edges = new Map<string, LinkGraphEdge>();
  private readonly redirects = new Map<string, string>();

  // Diagnostic metrics
  private droppedSelfLoops = 0;
  private droppedUnsafeUrls = 0;
  private droppedDuplicates = 0;
  private truncatedEdges = 0;

  constructor(options: LinkGraphOptions = {}) {
    this.options = {
      ...DEFAULT_LINK_GRAPH_OPTIONS,
      ...options,
    };
  }

  /**
   * Registers a known HTTP redirect (fromUrl -> toUrl) to resolve canonical targets.
   */
  registerRedirect(fromUrl: string, toUrl: string): void {
    const normFrom = this.sanitizeAndNormalizeUrl(fromUrl);
    const normTo = this.sanitizeAndNormalizeUrl(toUrl);
    if (normFrom && normTo && normFrom !== normTo) {
      this.redirects.set(normFrom, normTo);
    }
  }

  /**
   * Resolves a URL through the redirect mapping chain (capped to prevent loops).
   */
  resolveCanonicalUrl(url: string): string {
    if (!this.options.canonicalizeRedirects) {
      return url;
    }
    let current = url;
    let hops = 0;
    while (this.redirects.has(current) && hops < 10) {
      const next = this.redirects.get(current)!;
      if (next === current) break;
      current = next;
      hops++;
    }
    return current;
  }

  /**
   * Sanitizes, validates scheme, and normalizes a candidate URL string.
   * Returns null if URL is malformed, unsafe, or violates SSRF policies.
   */
  sanitizeAndNormalizeUrl(rawUrl: string): string | null {
    if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.length > 2048) {
      this.droppedUnsafeUrls++;
      return null;
    }

    const trimmed = rawUrl.trim();
    const lower = trimmed.toLowerCase();

    // Fast-reject unsafe schemes
    if (
      lower.startsWith('javascript:') ||
      lower.startsWith('data:') ||
      lower.startsWith('mailto:') ||
      lower.startsWith('tel:') ||
      lower.startsWith('file:') ||
      lower.startsWith('ftp:') ||
      lower.startsWith('about:') ||
      lower.startsWith('chrome:') ||
      lower.startsWith('#')
    ) {
      this.droppedUnsafeUrls++;
      return null;
    }

    // Validate scheme & syntactic safety
    const validation = validateUrl(trimmed);
    if (!validation.ok) {
      this.droppedUnsafeUrls++;
      return null;
    }

    // SSRF hostname check
    try {
      const parsed = new URL(trimmed);
      const hostCheck = validateTargetHostSync(parsed.hostname);
      if (!hostCheck.allowed) {
        this.droppedUnsafeUrls++;
        return null;
      }
    } catch {
      this.droppedUnsafeUrls++;
      return null;
    }

    // Normalize canonical representation
    const norm = normalizeUrl(trimmed);
    if (!norm.ok || !norm.normalized) {
      this.droppedUnsafeUrls++;
      return null;
    }

    return norm.normalized;
  }

  /**
   * Adds or retrieves a node in the link graph.
   * Returns true if node exists or was created; false if maxNodes limit reached.
   */
  ensureNode(canonicalUrl: string, title?: string): boolean {
    if (this.nodes.has(canonicalUrl)) {
      if (title && !this.nodes.get(canonicalUrl)!.title) {
        this.nodes.get(canonicalUrl)!.title = title;
      }
      return true;
    }

    if (this.nodes.size >= this.options.maxNodes) {
      return false;
    }

    this.nodes.set(canonicalUrl, {
      url: canonicalUrl,
      inDegree: 0,
      outDegree: 0,
      title,
    });
    this.adjacency.set(canonicalUrl, new Set());
    this.reverseAdjacency.set(canonicalUrl, new Set());
    return true;
  }

  /**
   * Ingests a crawled document and extracts all valid outbound edges.
   */
  addDocument(doc: LinkGraphDocumentInput): void {
    if (!doc || !doc.url) return;

    // Determine primary source URL (preferring canonical tag or redirect resolution)
    const rawSource = doc.canonicalUrl || doc.url;
    const normSource = this.sanitizeAndNormalizeUrl(rawSource);
    if (!normSource) return;

    const sourceUrl = this.resolveCanonicalUrl(normSource);

    // If source URL was redirected from doc.url, register it
    if (doc.url !== sourceUrl) {
      this.registerRedirect(doc.url, sourceUrl);
    }

    if (!this.ensureNode(sourceUrl, doc.title)) {
      return; // Node limit reached
    }

    let sourceOrigin = '';
    try {
      sourceOrigin = new URL(sourceUrl).origin;
    } catch {
      // ignore
    }

    // Collect outbound links from either outboundLinks or discoveredUrls
    const linksToProcess = doc.outboundLinks ?? doc.discoveredUrls ?? [];

    for (const linkItem of linksToProcess) {
      let targetRaw = '';
      let anchorText: string | undefined;
      let isNofollow = false;
      let relAttributes: string[] | undefined;

      if (typeof linkItem === 'string') {
        targetRaw = linkItem;
      } else if (linkItem && typeof linkItem === 'object') {
        targetRaw = linkItem.normalizedUrl || linkItem.rawHref || '';
        anchorText = linkItem.anchorText;
        isNofollow = Boolean(linkItem.isNofollow);
        relAttributes = linkItem.relAttributes;
      }

      if (!targetRaw) continue;

      // Handle nofollow policy
      if (isNofollow && !this.options.includeNofollow) {
        continue;
      }

      this.addEdge(sourceUrl, targetRaw, {
        anchorText,
        isNofollow,
        relAttributes,
        sourceOrigin,
      });
    }
  }

  /**
   * Adds a directed edge from sourceUrl to targetUrl.
   */
  addEdge(
    rawSourceUrl: string,
    rawTargetUrl: string,
    edgeOpts: {
      anchorText?: string;
      isNofollow?: boolean;
      relAttributes?: string[];
      sourceOrigin?: string;
    } = {},
  ): boolean {
    const normSource = this.sanitizeAndNormalizeUrl(rawSourceUrl);
    if (!normSource) return false;
    const sourceUrl = this.resolveCanonicalUrl(normSource);

    const normTarget = this.sanitizeAndNormalizeUrl(rawTargetUrl);
    if (!normTarget) return false;

    const targetUrl = this.resolveCanonicalUrl(normTarget);

    // Filter self-loops if disallowed
    if (sourceUrl === targetUrl && !this.options.allowSelfLoops) {
      this.droppedSelfLoops++;
      return false;
    }

    // Check internal vs external origin
    let isInternal = false;
    try {
      const srcOrigin = edgeOpts.sourceOrigin || new URL(sourceUrl).origin;
      const tgtOrigin = new URL(targetUrl).origin;
      isInternal = srcOrigin === tgtOrigin;
    } catch {
      // ignore
    }

    if (!isInternal && !this.options.includeExternal) {
      return false;
    }

    // Ensure source node exists
    if (!this.ensureNode(sourceUrl)) {
      return false; // maxNodes limit reached
    }

    // Check per-node outbound edge bounds
    const currentOutbound = this.adjacency.get(sourceUrl);
    if (currentOutbound && currentOutbound.size >= this.options.maxOutboundEdgesPerNode) {
      this.truncatedEdges++;
      return false;
    }

    // Ensure target node exists
    if (!this.ensureNode(targetUrl)) {
      return false; // maxNodes limit reached
    }

    // Check for duplicate edge
    const edgeKey = `${sourceUrl}|${targetUrl}`;
    const existingEdge = this.edges.get(edgeKey);

    if (existingEdge) {
      this.droppedDuplicates++;
      existingEdge.count = (existingEdge.count ?? 1) + 1;
      if (edgeOpts.anchorText && !existingEdge.anchorText) {
        existingEdge.anchorText = edgeOpts.anchorText;
      }
      return true;
    }

    // Register new edge
    const newEdge: LinkGraphEdge = {
      source: sourceUrl,
      target: targetUrl,
      anchorText: edgeOpts.anchorText,
      isInternal,
      isNofollow: edgeOpts.isNofollow,
      relAttributes: edgeOpts.relAttributes,
      weight: 1.0,
      count: 1,
    };

    this.edges.set(edgeKey, newEdge);

    // Update forward and reverse adjacency
    this.adjacency.get(sourceUrl)!.add(targetUrl);
    this.reverseAdjacency.get(targetUrl)!.add(sourceUrl);

    // Update degrees
    this.nodes.get(sourceUrl)!.outDegree = this.adjacency.get(sourceUrl)!.size;
    this.nodes.get(targetUrl)!.inDegree = this.reverseAdjacency.get(targetUrl)!.size;

    return true;
  }

  /**
   * Checks if a canonical URL exists as a node in the graph.
   */
  hasNode(url: string): boolean {
    return this.nodes.has(url);
  }

  /**
   * Retrieves node metadata by canonical URL.
   */
  getNode(url: string): LinkGraphNode | undefined {
    return this.nodes.get(url);
  }

  /**
   * Returns all canonical node URLs sorted deterministically.
   */
  getNodeUrls(): string[] {
    return Array.from(this.nodes.keys()).sort();
  }

  /**
   * Checks whether a directed edge exists from sourceUrl to targetUrl.
   */
  hasEdge(sourceUrl: string, targetUrl: string): boolean {
    return this.edges.has(`${sourceUrl}|${targetUrl}`);
  }

  /**
   * Retrieves edge details for a directed link.
   */
  getEdge(sourceUrl: string, targetUrl: string): LinkGraphEdge | undefined {
    return this.edges.get(`${sourceUrl}|${targetUrl}`);
  }

  /**
   * Returns all outbound target URLs for a given source node (sorted deterministically).
   */
  getOutbound(url: string): string[] {
    const targets = this.adjacency.get(url);
    if (!targets) return [];
    return Array.from(targets).sort();
  }

  /**
   * Returns all inbound source URLs (backlinks) pointing to a target node (sorted deterministically).
   * Essential for fast PageRank power iteration.
   */
  getInbound(url: string): string[] {
    const sources = this.reverseAdjacency.get(url);
    if (!sources) return [];
    return Array.from(sources).sort();
  }

  /**
   * Returns in-degree (number of backlinks) for a node.
   */
  getInDegree(url: string): number {
    return this.reverseAdjacency.get(url)?.size ?? 0;
  }

  /**
   * Returns out-degree (number of forward links) for a node.
   */
  getOutDegree(url: string): number {
    return this.adjacency.get(url)?.size ?? 0;
  }

  /**
   * Returns all dangling nodes (nodes with 0 outbound links).
   * Critical for handling rank sinkholes in PageRank (Phase 88).
   */
  getDanglingNodes(): string[] {
    const dangling: string[] = [];
    for (const [url, targets] of this.adjacency.entries()) {
      if (targets.size === 0) {
        dangling.push(url);
      }
    }
    return dangling.sort();
  }

  /**
   * Returns high-level topology summary statistics.
   */
  getSummary(): LinkGraphSummary {
    const nodeCount = this.nodes.size;
    const edgeCount = this.edges.size;

    let maxIn = 0;
    let maxOut = 0;
    let danglingCount = 0;

    for (const node of this.nodes.values()) {
      if (node.inDegree > maxIn) maxIn = node.inDegree;
      if (node.outDegree > maxOut) maxOut = node.outDegree;
      if (node.outDegree === 0) danglingCount++;
    }

    const avgOutDegree = nodeCount > 0 ? edgeCount / nodeCount : 0;
    const maxPossibleEdges = nodeCount > 1 ? nodeCount * (nodeCount - 1) : 1;
    const density = nodeCount > 1 ? edgeCount / maxPossibleEdges : 0;

    return {
      nodeCount,
      edgeCount,
      danglingNodeCount: danglingCount,
      avgOutDegree: Math.round(avgOutDegree * 1000) / 1000,
      maxInDegree: maxIn,
      maxOutDegree: maxOut,
      density: Math.round(density * 100000) / 100000,
    };
  }

  /**
   * Serializes link graph to a deterministic, versioned snapshot conforming to schema v1.0.0.
   */
  toJSON(customTimestamp?: string): LinkGraphData {
    const nodesRecord: Record<string, LinkGraphNode> = {};
    const adjRecord: Record<string, string[]> = {};
    const revAdjRecord: Record<string, string[]> = {};
    const edgesRecord: Record<string, LinkGraphEdge> = {};

    const sortedNodeUrls = this.getNodeUrls();

    for (const url of sortedNodeUrls) {
      nodesRecord[url] = { ...this.nodes.get(url)! };
      adjRecord[url] = this.getOutbound(url);
      revAdjRecord[url] = this.getInbound(url);
    }

    for (const [key, edge] of this.edges.entries()) {
      edgesRecord[key] = { ...edge };
    }

    const ts = customTimestamp ?? new Date().toISOString();

    return {
      schemaVersion: '1.0.0',
      timestamp: ts,
      nodeCount: this.nodes.size,
      edgeCount: this.edges.size,
      nodes: nodesRecord,
      adjacencyList: adjRecord,
      reverseAdjacencyList: revAdjRecord,
      edges: edgesRecord,
      metadata: {
        timestamp: ts,
        nodeCount: this.nodes.size,
        edgeCount: this.edges.size,
        droppedSelfLoops: this.droppedSelfLoops,
        droppedUnsafeUrls: this.droppedUnsafeUrls,
        droppedDuplicates: this.droppedDuplicates,
        truncatedEdges: this.truncatedEdges,
        maxNodes: this.options.maxNodes,
        maxOutboundEdgesPerNode: this.options.maxOutboundEdgesPerNode,
      },
    };
  }

  /**
   * Exports link graph to a formatted JSON string.
   */
  exportJson(indent = 2): string {
    return JSON.stringify(this.toJSON(), null, indent);
  }

  /**
   * Deserializes a LinkGraph from a validated LinkGraphData snapshot.
   */
  static fromJSON(data: LinkGraphData, options?: LinkGraphOptions): LinkGraph {
    if (!data || data.schemaVersion !== '1.0.0') {
      throw new Error(`Unsupported link graph schema version: "${data?.schemaVersion}"`);
    }

    const graph = new LinkGraph(options);

    // Ingest all nodes
    for (const [url, node] of Object.entries(data.nodes || {})) {
      graph.ensureNode(url, node.title);
    }

    // Ingest all edges
    if (data.edges && Object.keys(data.edges).length > 0) {
      for (const edge of Object.values(data.edges)) {
        graph.addEdge(edge.source, edge.target, {
          anchorText: edge.anchorText,
          isNofollow: edge.isNofollow,
          relAttributes: edge.relAttributes,
        });
      }
    } else {
      for (const [source, targets] of Object.entries(data.adjacencyList || {})) {
        for (const target of targets) {
          graph.addEdge(source, target);
        }
      }
    }

    return graph;
  }

  /**
   * Imports a JSON string into a new LinkGraph instance.
   */
  static importJson(jsonString: string, options?: LinkGraphOptions): LinkGraph {
    const parsed = JSON.parse(jsonString) as LinkGraphData;
    return LinkGraph.fromJSON(parsed, options);
  }

  /**
   * Deterministically rebuilds a LinkGraph from a collection of crawled documents.
   * Guarantees 100% reproducible topology from crawl data.
   */
  static rebuildFromCrawlData(
    documents: Iterable<LinkGraphDocumentInput>,
    options?: LinkGraphOptions,
  ): LinkGraph {
    const graph = new LinkGraph(options);
    for (const doc of documents) {
      graph.addDocument(doc);
    }
    return graph;
  }

  /**
   * Resets all internal graph storage and diagnostic counters.
   */
  clear(): void {
    this.nodes.clear();
    this.adjacency.clear();
    this.reverseAdjacency.clear();
    this.edges.clear();
    this.redirects.clear();
    this.droppedSelfLoops = 0;
    this.droppedUnsafeUrls = 0;
    this.droppedDuplicates = 0;
    this.truncatedEdges = 0;
  }
}
