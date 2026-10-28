/**
 * @opensearch/ranking — Focus Lens Advanced Rule Editor (Phase 102)
 *
 * Provides an interactive, transactional editor for managing Focus Lens profiles:
 * - Granular manipulation of boost domains, demote domains, and domain exclusions
 * - Fine-grained ranking weight tuning
 * - Immediate domain syntax validation, bound checks, and size checks
 * - Safe rollback / restore to default profile (Phase 102 acceptance criteria)
 * - Safe schema-validated JSON import and export integration
 * - Zero mutation of underlying search index
 */

import { GENERAL_LENS } from './builtin-lenses.js';
import { exportLensToJson, importLensFromJson } from './lens-import-export.js';
import { isValidDomainPattern, validateLensProfile } from './lens-schema.js';
import {
  DomainMultiplierRule,
  FocusLensProfile,
  FocusLensRankingWeights,
  HEALTH_LENS_DISCLAIMER,
  LENS_BOOST_MAX,
  LENS_BOOST_MIN,
  LENS_DEMOTE_MAX,
  LENS_DEMOTE_MIN,
  LENS_WEIGHT_MAX,
  LENS_WEIGHT_MIN,
  LensValidationResult,
  MAX_LENS_FILE_SIZE_BYTES,
} from './lens-types.js';

export interface LensEditorOptions {
  /** Optional custom baseline profile used when restoring default (defaults to GENERAL_LENS) */
  defaultBaseline?: FocusLensProfile;
}

export class FocusLensEditor {
  private currentProfile: FocusLensProfile;
  private readonly defaultBaseline: FocusLensProfile;
  private initialSnapshot: string;

  constructor(initialProfile?: FocusLensProfile, options: LensEditorOptions = {}) {
    this.defaultBaseline = options.defaultBaseline
      ? JSON.parse(JSON.stringify(options.defaultBaseline))
      : JSON.parse(JSON.stringify(GENERAL_LENS));

    if (initialProfile) {
      this.currentProfile = JSON.parse(JSON.stringify(initialProfile));
    } else {
      this.currentProfile = JSON.parse(JSON.stringify(this.defaultBaseline));
      // Give a new custom profile defaults if starting fresh
      if (this.currentProfile.id === 'general') {
        this.currentProfile.id = 'custom-lens';
        this.currentProfile.name = 'Custom Focus Lens';
        this.currentProfile.description = 'User-customized search lens profile.';
        this.currentProfile.isBuiltin = false;
      }
    }

    this.initialSnapshot = JSON.stringify(this.currentProfile);
  }

  /**
   * Returns an immutable copy of the active profile being edited.
   */
  getProfile(): FocusLensProfile {
    return JSON.parse(JSON.stringify(this.currentProfile));
  }

  /**
   * Checks whether the current profile has unsaved modifications relative to initial state.
   */
  isDirty(): boolean {
    return JSON.stringify(this.currentProfile) !== this.initialSnapshot;
  }

  /**
   * Restores the editor state back to the default baseline profile (General profile or configured baseline).
   * Fulfills acceptance criterion: "Users can restore the default profile."
   */
  restoreDefault(): FocusLensProfile {
    this.currentProfile = JSON.parse(JSON.stringify(this.defaultBaseline));
    return this.getProfile();
  }

  /**
   * Resets the editor state back to the initial snapshot when the editor was created.
   */
  resetToInitial(): FocusLensProfile {
    this.currentProfile = JSON.parse(this.initialSnapshot);
    return this.getProfile();
  }

  /**
   * Updates basic metadata for the profile.
   */
  setMetadata(metadata: {
    id?: string;
    name?: string;
    description?: string;
    icon?: string;
    author?: string;
    license?: string;
    tags?: string[];
  }): LensValidationResult {
    const backup = JSON.stringify(this.currentProfile);

    if (metadata.id !== undefined) {
      const cleanId = metadata.id.trim().toLowerCase();
      if (!/^[a-z0-9-_]{1,64}$/.test(cleanId)) {
        return {
          valid: false,
          errors: ['Lens ID must be 1-64 characters matching /^[a-z0-9-_]+$/.'],
        };
      }
      this.currentProfile.id = cleanId;
    }

    if (metadata.name !== undefined) {
      this.currentProfile.name = metadata.name.trim();
    }
    if (metadata.description !== undefined) {
      this.currentProfile.description = metadata.description.trim();
    }
    if (metadata.icon !== undefined) {
      this.currentProfile.icon = metadata.icon.trim();
    }

    if (metadata.author || metadata.license || metadata.tags) {
      this.currentProfile.metadata = {
        ...this.currentProfile.metadata,
        ...(metadata.author ? { author: metadata.author.trim() } : {}),
        ...(metadata.license ? { license: metadata.license.trim() } : {}),
        ...(metadata.tags ? { tags: metadata.tags.map(t => t.trim().toLowerCase()) } : {}),
        updatedAt: new Date().toISOString(),
      };
    }

    // Health safety verification
    if (this.currentProfile.id.includes('health') || this.currentProfile.name.toLowerCase().includes('health')) {
      this.currentProfile.disclaimer = HEALTH_LENS_DISCLAIMER;
      this.currentProfile.isMedicalEndorsement = false;
    }

    const validation = this.validate();
    if (!validation.valid) {
      this.currentProfile = JSON.parse(backup);
      return validation;
    }

    return { valid: true, errors: [], profile: this.getProfile() };
  }

  /**
   * Adds or updates a domain pattern in the boost list.
   * Multiplier must be between LENS_BOOST_MIN (1.0) and LENS_BOOST_MAX (3.0).
   */
  addBoostDomain(pattern: string, multiplier: number, reason?: string): LensValidationResult {
    if (!isValidDomainPattern(pattern)) {
      return {
        valid: false,
        errors: [`Invalid domain pattern syntax: "${pattern}". Domains must not include protocols, paths, or spaces.`],
      };
    }

    if (typeof multiplier !== 'number' || isNaN(multiplier) || multiplier < LENS_BOOST_MIN || multiplier > LENS_BOOST_MAX) {
      return {
        valid: false,
        errors: [`Boost multiplier must be a number between ${LENS_BOOST_MIN} and ${LENS_BOOST_MAX}. Received: ${multiplier}.`],
      };
    }

    const cleanPattern = pattern.trim().toLowerCase();
    const cleanMultiplier = Math.round(multiplier * 1000) / 1000;

    // Disallow contradictory exclusion
    if (this.currentProfile.excludeDomains.includes(cleanPattern)) {
      return {
        valid: false,
        errors: [`Cannot boost "${cleanPattern}": it is already present in excluded domains.`],
      };
    }

    // Remove from demoteDomains if present to avoid conflicting rules
    this.removeDemoteDomain(cleanPattern);

    const existingIndex = this.currentProfile.boostDomains.findIndex(r => r.pattern === cleanPattern);
    const rule: DomainMultiplierRule = {
      pattern: cleanPattern,
      multiplier: cleanMultiplier,
      ...(reason ? { reason: reason.trim() } : {}),
    };

    if (existingIndex >= 0) {
      this.currentProfile.boostDomains[existingIndex] = rule;
    } else {
      this.currentProfile.boostDomains.push(rule);
    }

    return this.validate();
  }

  /**
   * Updates an existing boost domain's multiplier.
   */
  updateBoostMultiplier(pattern: string, multiplier: number, reason?: string): LensValidationResult {
    const cleanPattern = pattern.trim().toLowerCase();
    const exists = this.currentProfile.boostDomains.some(r => r.pattern === cleanPattern);
    if (!exists) {
      return {
        valid: false,
        errors: [`Boost rule for pattern "${pattern}" not found.`],
      };
    }
    return this.addBoostDomain(cleanPattern, multiplier, reason);
  }

  /**
   * Removes a domain pattern from the boost list.
   */
  removeBoostDomain(pattern: string): boolean {
    const cleanPattern = pattern.trim().toLowerCase();
    const prevLen = this.currentProfile.boostDomains.length;
    this.currentProfile.boostDomains = this.currentProfile.boostDomains.filter(r => r.pattern !== cleanPattern);
    return this.currentProfile.boostDomains.length < prevLen;
  }

  /**
   * Adds or updates a domain pattern in the demote list.
   * Multiplier must be between LENS_DEMOTE_MIN (0.05) and LENS_DEMOTE_MAX (1.0).
   */
  addDemoteDomain(pattern: string, multiplier: number, reason?: string): LensValidationResult {
    if (!isValidDomainPattern(pattern)) {
      return {
        valid: false,
        errors: [`Invalid domain pattern syntax: "${pattern}". Domains must not include protocols, paths, or spaces.`],
      };
    }

    if (typeof multiplier !== 'number' || isNaN(multiplier) || multiplier < LENS_DEMOTE_MIN || multiplier > LENS_DEMOTE_MAX) {
      return {
        valid: false,
        errors: [`Demote multiplier must be a number between ${LENS_DEMOTE_MIN} and ${LENS_DEMOTE_MAX}. Received: ${multiplier}.`],
      };
    }

    const cleanPattern = pattern.trim().toLowerCase();
    const cleanMultiplier = Math.round(multiplier * 1000) / 1000;

    // Disallow contradictory exclusion
    if (this.currentProfile.excludeDomains.includes(cleanPattern)) {
      return {
        valid: false,
        errors: [`Cannot demote "${cleanPattern}": it is already present in excluded domains.`],
      };
    }

    // Remove from boostDomains if present to avoid conflicting rules
    this.removeBoostDomain(cleanPattern);

    const existingIndex = this.currentProfile.demoteDomains.findIndex(r => r.pattern === cleanPattern);
    const rule: DomainMultiplierRule = {
      pattern: cleanPattern,
      multiplier: cleanMultiplier,
      ...(reason ? { reason: reason.trim() } : {}),
    };

    if (existingIndex >= 0) {
      this.currentProfile.demoteDomains[existingIndex] = rule;
    } else {
      this.currentProfile.demoteDomains.push(rule);
    }

    return this.validate();
  }

  /**
   * Updates an existing demote domain's multiplier.
   */
  updateDemoteMultiplier(pattern: string, multiplier: number, reason?: string): LensValidationResult {
    const cleanPattern = pattern.trim().toLowerCase();
    const exists = this.currentProfile.demoteDomains.some(r => r.pattern === cleanPattern);
    if (!exists) {
      return {
        valid: false,
        errors: [`Demote rule for pattern "${pattern}" not found.`],
      };
    }
    return this.addDemoteDomain(cleanPattern, multiplier, reason);
  }

  /**
   * Removes a domain pattern from the demote list.
   */
  removeDemoteDomain(pattern: string): boolean {
    const cleanPattern = pattern.trim().toLowerCase();
    const prevLen = this.currentProfile.demoteDomains.length;
    this.currentProfile.demoteDomains = this.currentProfile.demoteDomains.filter(r => r.pattern !== cleanPattern);
    return this.currentProfile.demoteDomains.length < prevLen;
  }

  /**
   * Adds a domain pattern to the exclusion list (blocklist).
   */
  addExcludeDomain(pattern: string): LensValidationResult {
    if (!isValidDomainPattern(pattern)) {
      return {
        valid: false,
        errors: [`Invalid domain pattern syntax: "${pattern}". Domains must not include protocols, paths, or spaces.`],
      };
    }

    const cleanPattern = pattern.trim().toLowerCase();

    // Remove from boost and demote lists to prevent contradictions
    this.removeBoostDomain(cleanPattern);
    this.removeDemoteDomain(cleanPattern);

    if (!this.currentProfile.excludeDomains.includes(cleanPattern)) {
      this.currentProfile.excludeDomains.push(cleanPattern);
    }

    return this.validate();
  }

  /**
   * Removes a domain pattern from the exclusion list.
   */
  removeExcludeDomain(pattern: string): boolean {
    const cleanPattern = pattern.trim().toLowerCase();
    const prevLen = this.currentProfile.excludeDomains.length;
    this.currentProfile.excludeDomains = this.currentProfile.excludeDomains.filter(d => d !== cleanPattern);
    return this.currentProfile.excludeDomains.length < prevLen;
  }

  /**
   * Sets ranking weight tuning overrides.
   * All weights must be bounded within [LENS_WEIGHT_MIN, LENS_WEIGHT_MAX].
   */
  setRankingWeights(weights: FocusLensRankingWeights): LensValidationResult {
    const checkBound = (name: string, val: number | undefined): string | null => {
      if (val === undefined) return null;
      if (typeof val !== 'number' || isNaN(val) || val < LENS_WEIGHT_MIN || val > LENS_WEIGHT_MAX) {
        return `Weight "${name}" must be between ${LENS_WEIGHT_MIN} and ${LENS_WEIGHT_MAX} (got ${val}).`;
      }
      return null;
    };

    const errors: string[] = [];
    const e1 = checkBound('freshnessWeight', weights.freshnessWeight);
    if (e1) errors.push(e1);
    const e2 = checkBound('domainAuthorityWeight', weights.domainAuthorityWeight);
    if (e2) errors.push(e2);
    const e3 = checkBound('pageRankWeight', weights.pageRankWeight);
    if (e3) errors.push(e3);
    const e4 = checkBound('trackerSignalWeight', weights.trackerSignalWeight);
    if (e4) errors.push(e4);

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    this.currentProfile.rankingWeights = {
      ...(weights.freshnessWeight !== undefined ? { freshnessWeight: weights.freshnessWeight } : {}),
      ...(weights.domainAuthorityWeight !== undefined ? { domainAuthorityWeight: weights.domainAuthorityWeight } : {}),
      ...(weights.pageRankWeight !== undefined ? { pageRankWeight: weights.pageRankWeight } : {}),
      ...(weights.trackerSignalWeight !== undefined ? { trackerSignalWeight: weights.trackerSignalWeight } : {}),
      ...(weights.enableTrackerSignal !== undefined ? { enableTrackerSignal: weights.enableTrackerSignal } : {}),
    };

    return this.validate();
  }

  /**
   * Clears all custom ranking weight overrides.
   */
  clearRankingWeights(): void {
    delete this.currentProfile.rankingWeights;
  }

  /**
   * Validates the entire current profile draft against schema constraints and size limits.
   */
  validate(): LensValidationResult {
    // Check size limit
    const jsonStr = JSON.stringify(this.currentProfile);
    if (Buffer.byteLength(jsonStr, 'utf8') > MAX_LENS_FILE_SIZE_BYTES) {
      return {
        valid: false,
        errors: [`Profile exceeds maximum file size limit of ${MAX_LENS_FILE_SIZE_BYTES} bytes.`],
      };
    }

    return validateLensProfile(this.currentProfile);
  }

  /**
   * Exports the edited profile as a JSON string.
   */
  exportJson(pretty: boolean = true): string {
    return exportLensToJson(this.currentProfile, { pretty });
  }

  /**
   * Safely imports a JSON profile into this editor.
   * If the imported JSON is invalid, the editor state is preserved and error details returned.
   */
  importJson(rawJson: string): LensValidationResult {
    const result = importLensFromJson(rawJson);
    if (!result.valid || !result.profile) {
      return result;
    }

    // Apply the validated profile
    this.currentProfile = result.profile;
    return {
      valid: true,
      errors: [],
      profile: this.getProfile(),
    };
  }
}
