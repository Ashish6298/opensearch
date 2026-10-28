/**
 * @opensearch/ranking — Focus Lens Registry (Phase 101)
 *
 * Manages local Focus Lens profiles with defensive error handling:
 * - Keeps profiles local by default (strictly zero remote telemetry or uploads)
 * - Pre-loads all 6 system builtin profiles
 * - Validates all incoming custom profiles via validateLensProfile()
 * - Protects builtin lenses from deletion or mutation
 * - Provides graceful fallback to General lens on invalid, missing, or corrupt inputs
 */

import { BUILTIN_LENSES, GENERAL_LENS, getBuiltinLens } from './builtin-lenses.js';
import { validateLensProfile } from './lens-schema.js';
import { FocusLensProfile, LensValidationResult } from './lens-types.js';

export interface FocusLensRegistryOptions {
  initialProfiles?: FocusLensProfile[];
}

export class FocusLensRegistry {
  private readonly customProfiles = new Map<string, FocusLensProfile>();

  constructor(options: FocusLensRegistryOptions = {}) {
    if (options.initialProfiles) {
      for (const p of options.initialProfiles) {
        this.registerProfile(p);
      }
    }
  }

  /**
   * Registers a new or updated custom Focus Lens profile.
   * Rejects built-in profile overrides to prevent tampering.
   */
  registerProfile(rawProfile: unknown): LensValidationResult {
    const validation = validateLensProfile(rawProfile);
    if (!validation.valid || !validation.profile) {
      return validation;
    }

    const profile = validation.profile;
    const existingBuiltin = getBuiltinLens(profile.id);
    if (existingBuiltin) {
      return {
        valid: false,
        errors: [`Cannot override system builtin lens "${profile.id}". Custom profiles must use a distinct id.`],
      };
    }

    // Mark custom profiles as non-builtin
    profile.isBuiltin = false;
    this.customProfiles.set(profile.id, profile);

    return {
      valid: true,
      errors: [],
      profile,
    };
  }

  /**
   * Safely resolves a Focus Lens profile by ID or object.
   * Guarantee: Never throws and never returns null/undefined;
   * invalid or unresolvable inputs cleanly fall back to GENERAL_LENS.
   */
  resolveLens(identifierOrProfile?: string | FocusLensProfile | null): FocusLensProfile {
    if (!identifierOrProfile) {
      return GENERAL_LENS;
    }

    // 1. If passed an existing profile object
    if (typeof identifierOrProfile === 'object') {
      const validation = validateLensProfile(identifierOrProfile);
      if (validation.valid && validation.profile) {
        return validation.profile;
      }
      return GENERAL_LENS;
    }

    // 2. If passed a string ID
    if (typeof identifierOrProfile === 'string') {
      const cleanId = identifierOrProfile.trim().toLowerCase();
      // Check builtins first
      const builtin = getBuiltinLens(cleanId);
      if (builtin) {
        return builtin;
      }

      // Check registered custom profiles
      const custom = this.customProfiles.get(cleanId);
      if (custom) {
        return custom;
      }
    }

    // Safe fallback to general
    return GENERAL_LENS;
  }

  /**
   * Retrieves a lens by ID, or undefined if not found.
   */
  getLens(id: string): FocusLensProfile | undefined {
    if (!id || typeof id !== 'string') return undefined;
    const cleanId = id.trim().toLowerCase();
    return getBuiltinLens(cleanId) ?? this.customProfiles.get(cleanId);
  }

  /**
   * Lists all available Focus Lenses (builtins followed by custom profiles).
   */
  listLenses(): FocusLensProfile[] {
    const list: FocusLensProfile[] = [...BUILTIN_LENSES];
    for (const custom of this.customProfiles.values()) {
      list.push(custom);
    }
    return list;
  }

  /**
   * Removes a custom profile. Builtin profiles cannot be removed.
   */
  removeProfile(id: string): boolean {
    if (!id || typeof id !== 'string') return false;
    const cleanId = id.trim().toLowerCase();
    if (getBuiltinLens(cleanId)) {
      return false; // Protected
    }
    return this.customProfiles.delete(cleanId);
  }

  /**
   * Clears all custom profiles while preserving built-in lenses.
   */
  clearCustomProfiles(): void {
    this.customProfiles.clear();
  }

  /**
   * Total count of available lenses.
   */
  get size(): number {
    return BUILTIN_LENSES.length + this.customProfiles.size;
  }
}

// Global default singleton registry
let defaultRegistryInstance: FocusLensRegistry | null = null;

export function getDefaultLensRegistry(): FocusLensRegistry {
  if (!defaultRegistryInstance) {
    defaultRegistryInstance = new FocusLensRegistry();
  }
  return defaultRegistryInstance;
}
