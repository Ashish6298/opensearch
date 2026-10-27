/**
 * @opensearch/crawler — Link Graph Domain Models & Schema (Phase 87)
 *
 * Defines the versioned, typed schema for the web link graph:
 * - Nodes: Canonical URLs with in-degree, out-degree, and provenance
 * - Edges: Directed links (source -> target) with anchor text, internal/external, and nofollow classification
 * - Adjacency & Reverse Adjacency: Forward links and backlink topologies
 * - Serialization: Rebuildable, deterministic, versioned snapshot format
 */

export interface LinkGraphNode {
  /** Canonical normalized URL serving as the unique node identifier */
  url: string;
  /** Number of incoming links pointing to this node */
  inDegree: number;
  /** Number of outgoing links departing from this node */
  outDegree: number;
  /** Page title if known from crawl data */
  title?: string;
  /** Whether this node is internal to the primary crawl domain */
  isInternal?: boolean;
}

export interface LinkGraphEdge {
  /** Normalized canonical source document URL */
  source: string;
  /** Normalized canonical target document URL */
  target: string;
  /** Anchor text if present on the link */
  anchorText?: string;
  /** Whether source and target share the same origin */
  isInternal: boolean;
  /** Whether the link or page specifies rel="nofollow" */
  isNofollow?: boolean;
  /** Additional rel attributes if present */
  relAttributes?: string[];
  /** Relative edge weight (default: 1.0) */
  weight?: number;
  /** Number of times this edge was observed between the pair */
  count?: number;
}

export interface LinkGraphMetadata {
  /** Timestamp when graph was generated or updated */
  timestamp: string;
  /** Total nodes registered in graph */
  nodeCount: number;
  /** Total directed edges registered in graph */
  edgeCount: number;
  /** Number of self-loops dropped */
  droppedSelfLoops: number;
  /** Number of unsafe/SSRF/malformed URLs rejected */
  droppedUnsafeUrls: number;
  /** Number of duplicate edges collapsed */
  droppedDuplicates: number;
  /** Number of edges truncated by per-node bounds */
  truncatedEdges: number;
  /** Maximum node limit enforced */
  maxNodes: number;
  /** Maximum outbound edges per node enforced */
  maxOutboundEdgesPerNode: number;
}

export interface LinkGraphData {
  /** Schema version */
  schemaVersion: '1.0.0';
  /** Graph creation timestamp */
  timestamp: string;
  /** Total number of unique nodes */
  nodeCount: number;
  /** Total number of unique directed edges */
  edgeCount: number;
  /** Mapping of canonical URL -> LinkGraphNode */
  nodes: Record<string, LinkGraphNode>;
  /** Forward adjacency list: sourceUrl -> targetUrls[] (sorted deterministically) */
  adjacencyList: Record<string, string[]>;
  /** Reverse adjacency list (backlinks): targetUrl -> sourceUrls[] (sorted deterministically) */
  reverseAdjacencyList: Record<string, string[]>;
  /** Detailed edge records if serialized */
  edges?: Record<string, LinkGraphEdge>;
  /** Graph execution and boundary metadata */
  metadata: LinkGraphMetadata;
}

export interface LinkGraphOptions {
  /** Maximum number of unique nodes allowed in memory (default: 50,000) */
  maxNodes?: number;
  /** Maximum outbound edges stored per source node (default: 500) */
  maxOutboundEdgesPerNode?: number;
  /** Whether to allow self-referential edges (A -> A) (default: false) */
  allowSelfLoops?: boolean;
  /** Whether to include rel="nofollow" links in the graph (default: false) */
  includeNofollow?: boolean;
  /** Whether to include cross-domain external links (default: true) */
  includeExternal?: boolean;
  /** Whether to automatically resolve redirects to target canonical URLs (default: true) */
  canonicalizeRedirects?: boolean;
}

export interface LinkGraphDocumentInput {
  /** Document URL */
  url: string;
  /** Canonical URL from <link rel="canonical"> or redirect destination */
  canonicalUrl?: string;
  /** Page title */
  title?: string;
  /** Discovered outbound URL strings or structured link objects */
  outboundLinks?: Array<
    | string
    | {
        normalizedUrl: string;
        rawHref?: string;
        anchorText?: string;
        isInternal?: boolean;
        isNofollow?: boolean;
        relAttributes?: string[];
      }
  >;
  /** Raw discovered URLs array */
  discoveredUrls?: string[];
}

export interface LinkGraphSummary {
  nodeCount: number;
  edgeCount: number;
  danglingNodeCount: number;
  avgOutDegree: number;
  maxInDegree: number;
  maxOutDegree: number;
  density: number;
}
