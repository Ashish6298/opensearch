/**
 * @opensearch/crawler — Tracker and Privacy Metadata Classifier (Phase 99)
 *
 * Implements deterministic classification of document privacy metadata:
 * - Identifies third-party tracking origins using the reviewable registry
 * - Stores verifiable classification evidence and confidence levels
 * - Enforces unknown/unverified fallback states when evidence is incomplete
 * - Guarantees zero script execution and zero unsafe network requests
 *
 * Acceptance criteria satisfied:
 * 1. Classification is deterministic.
 * 2. No site is labeled tracker-free without adequate evidence.
 * 3. Classification does not introduce unsafe network requests.
 */

import { extractRegistrableDomain } from './domain-utils.js';
import { extractSubresources } from './resource-extractor.js';
import { getDefaultTrackerRegistry, TrackerRegistry } from './tracker-registry.js';
import {
  ClassificationConfidence,
  ClassificationEvidence,
  TrackerCategory,
  TrackerClassificationResult,
  TrackerClassificationStatus,
  TrackerMatch,
} from './tracker-types.js';

export interface TrackerClassifierOptions {
  registry?: TrackerRegistry;
  minHtmlLengthForVerification?: number;
}

export class TrackerClassifier {
  private readonly registry: TrackerRegistry;
  private readonly minHtmlLength: number;

  constructor(options: TrackerClassifierOptions = {}) {
    this.registry = options.registry || getDefaultTrackerRegistry();
    this.minHtmlLength = options.minHtmlLengthForVerification ?? 50;
  }

  /**
   * Analyzes an HTML document and classifies its tracker metadata.
   * Completely static and deterministic; performs NO network requests and executes NO scripts.
   */
  classify(html: string, documentUrl: string): TrackerClassificationResult {
    const classifiedAt = new Date().toISOString();

    let docOrigin = '';
    let docRegDomain = '';
    try {
      const parsed = new URL(documentUrl);
      docOrigin = parsed.origin;
      docRegDomain = extractRegistrableDomain(parsed.hostname);
    } catch {
      // Malformed document URL cannot produce verified classification
      return this.createIncompleteResult(
        documentUrl,
        docOrigin,
        docRegDomain,
        'unknown',
        'none',
        'Document URL is invalid or malformed; unable to establish origin boundaries.',
        html ? html.length : 0,
        classifiedAt,
      );
    }

    // ── 1. Structural Evidence Assessment ──────────────────────────────────
    if (!html || typeof html !== 'string' || html.trim().length === 0) {
      return this.createIncompleteResult(
        documentUrl,
        docOrigin,
        docRegDomain,
        'unknown',
        'none',
        'Document body is empty; no HTML content available to evaluate.',
        0,
        classifiedAt,
      );
    }

    const trimmedHtml = html.trim();
    const hasHead = /<head\b[^>]*>/i.test(trimmedHtml) || /<\/head>/i.test(trimmedHtml);
    const hasBody = /<body\b[^>]*>/i.test(trimmedHtml) || /<\/body>/i.test(trimmedHtml);
    const hasHtmlTag = /<html\b[^>]*>/i.test(trimmedHtml);
    const hasDoctype = /<!doctype\s+html/i.test(trimmedHtml);
    const hasValidStructure = (hasHead && hasBody) || (hasHtmlTag && (hasHead || hasBody)) || (hasDoctype && hasBody);

    // If HTML is too short or lacks basic document markup structure:
    // INVARIANT: "No site is labeled tracker-free without adequate evidence."
    if (trimmedHtml.length < this.minHtmlLength || !hasValidStructure) {
      return this.createIncompleteResult(
        documentUrl,
        docOrigin,
        docRegDomain,
        'unverified',
        'low',
        `Markup lacks complete document structure (<head>/<body>) or length (${trimmedHtml.length} chars) is below verification threshold (${this.minHtmlLength}); cannot verify tracker status.`,
        trimmedHtml.length,
        classifiedAt,
        { hasHead, hasBody, hasValidStructure },
      );
    }

    // ── 2. Parse Subresources ──────────────────────────────────────────────
    const resources = extractSubresources(trimmedHtml, documentUrl);

    let firstPartyCount = 0;
    let thirdPartyCount = 0;
    let beaconCount = 0;
    const firstPartyOriginsSet = new Set<string>();
    const thirdPartyOriginsSet = new Set<string>();
    const tagCounts: Record<string, number> = {};

    for (const res of resources) {
      tagCounts[res.tagName] = (tagCounts[res.tagName] || 0) + 1;
      if (res.isPixelBeacon) beaconCount++;

      if (res.originCategory === 'first-party') {
        firstPartyCount++;
        if (res.origin) firstPartyOriginsSet.add(res.origin);
      } else {
        thirdPartyCount++;
        if (res.origin) thirdPartyOriginsSet.add(res.origin);
      }
    }

    // ── 3. Match Third-Party Trackers ───────────────────────────────────────
    const trackerMatches: TrackerMatch[] = [];
    const categoriesSet = new Set<TrackerCategory>();

    for (const res of resources) {
      // Trackers are classified on third-party resources (or known third-party tracking hostnames)
      if (res.originCategory === 'third-party') {
        const match = this.registry.matchDomain(res.hostname);
        if (match) {
          trackerMatches.push({
            matchedDomain: match.domain,
            trackerName: match.name,
            category: match.category,
            owner: match.owner,
            provenance: match.provenance,
            license: match.license,
            updatedAt: match.updatedAt,
            resource: res,
          });
          categoriesSet.add(match.category);
        }
      }
    }

    // Sort tracker matches deterministically by matched domain then resolved URL
    trackerMatches.sort((a, b) => {
      const cmp = a.matchedDomain.localeCompare(b.matchedDomain);
      if (cmp !== 0) return cmp;
      return a.resource.resolvedUrl.localeCompare(b.resource.resolvedUrl);
    });

    const firstPartyOrigins = Array.from(firstPartyOriginsSet).sort();
    const thirdPartyOrigins = Array.from(thirdPartyOriginsSet).sort();
    const categoriesDetected = Array.from(categoriesSet).sort();

    // ── 4. Deterministic State & Confidence Resolution ─────────────────────
    let status: TrackerClassificationStatus;
    let confidence: ClassificationConfidence;
    let rationale: string;

    if (trackerMatches.length > 0) {
      status = 'trackers_detected';
      confidence = 'high';
      const categoryNames = categoriesDetected.join(', ');
      rationale = `Detected ${trackerMatches.length} known third-party tracker reference(s) spanning ${categoriesDetected.length} category(ies): [${categoryNames}]. Evidence verified from static DOM references.`;
    } else {
      status = 'no_trackers_detected';
      if (resources.length === 0) {
        // Document has valid structure but 0 external subresources
        confidence = 'medium';
        rationale = 'Complete HTML structure analyzed with zero external subresources detected; no third-party tracking references identified.';
      } else if (thirdPartyCount === 0) {
        confidence = 'high';
        rationale = `All ${resources.length} subresource(s) originate from first-party origins; zero third-party telemetry detected.`;
      } else {
        confidence = 'high';
        rationale = `Analyzed ${resources.length} subresource reference(s) (${thirdPartyCount} third-party); zero known tracker origins matched the reviewable registry.`;
      }
    }

    const evidence: ClassificationEvidence = {
      htmlLength: trimmedHtml.length,
      hasHead,
      hasBody,
      hasValidStructure,
      analyzedTagCounts: tagCounts,
      beaconCount,
      rationale,
    };

    return {
      documentUrl,
      documentOrigin: docOrigin,
      documentRegistrableDomain: docRegDomain,
      status,
      confidence,
      totalResources: resources.length,
      firstPartyCount,
      thirdPartyCount,
      trackerCount: trackerMatches.length,
      trackers: trackerMatches,
      thirdPartyOrigins,
      firstPartyOrigins,
      categoriesDetected,
      evidence,
      classifiedAt,
    };
  }

  private createIncompleteResult(
    documentUrl: string,
    documentOrigin: string,
    documentRegistrableDomain: string,
    status: TrackerClassificationStatus,
    confidence: ClassificationConfidence,
    rationale: string,
    htmlLength: number,
    classifiedAt: string,
    structuralHints: { hasHead?: boolean; hasBody?: boolean; hasValidStructure?: boolean } = {},
  ): TrackerClassificationResult {
    return {
      documentUrl,
      documentOrigin,
      documentRegistrableDomain,
      status,
      confidence,
      totalResources: 0,
      firstPartyCount: 0,
      thirdPartyCount: 0,
      trackerCount: 0,
      trackers: [],
      thirdPartyOrigins: [],
      firstPartyOrigins: [],
      categoriesDetected: [],
      evidence: {
        htmlLength,
        hasHead: structuralHints.hasHead ?? false,
        hasBody: structuralHints.hasBody ?? false,
        hasValidStructure: structuralHints.hasValidStructure ?? false,
        analyzedTagCounts: {},
        beaconCount: 0,
        rationale,
      },
      classifiedAt,
    };
  }
}

let defaultClassifierInstance: TrackerClassifier | null = null;

export function getDefaultTrackerClassifier(): TrackerClassifier {
  if (!defaultClassifierInstance) {
    defaultClassifierInstance = new TrackerClassifier();
  }
  return defaultClassifierInstance;
}

export function classifyDocumentResources(
  html: string,
  documentUrl: string,
  options?: TrackerClassifierOptions,
): TrackerClassificationResult {
  const classifier = options ? new TrackerClassifier(options) : getDefaultTrackerClassifier();
  return classifier.classify(html, documentUrl);
}
