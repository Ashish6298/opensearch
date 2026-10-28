/**
 * @opensearch/ranking — Focus Lens JSON Schema & Validator (Phase 101)
 *
 * Implements strict, defensive validation for Focus Lens profile definitions:
 * - Version verification against SUPPORTED_LENS_SCHEMA_VERSIONS (version 1)
 * - Safe sanitization rejecting prototype pollution, functions, and code execution
 * - Bounded boost/demote multiplier and weight clamps
 * - Domain pattern syntax verification
 * - Medical non-endorsement assertion for health profiles
 */

import {
  CURRENT_LENS_SCHEMA_VERSION,
  DomainMultiplierRule,
  FocusLensProfile,
  HEALTH_LENS_DISCLAIMER,
  LENS_BOOST_MAX,
  LENS_BOOST_MIN,
  LENS_DEMOTE_MAX,
  LENS_DEMOTE_MIN,
  LENS_WEIGHT_MAX,
  LENS_WEIGHT_MIN,
  LensValidationResult,
  MAX_LENS_FILE_SIZE_BYTES,
  SUPPORTED_LENS_SCHEMA_VERSIONS,
} from './lens-types.js';

export const FOCUS_LENS_JSON_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'FocusLensProfile',
  type: 'object',
  required: ['schemaVersion', 'id', 'name', 'description'],
  additionalProperties: false,
  properties: {
    schemaVersion: {
      type: 'integer',
      enum: [1],
      description: 'Lens format schema version number',
    },
    id: {
      type: 'string',
      pattern: '^[a-z0-9-_]{1,64}$',
      description: 'Unique profile slug identifier',
    },
    name: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      description: 'Human-readable lens title',
    },
    description: {
      type: 'string',
      minLength: 1,
      maxLength: 500,
      description: 'Purpose and intent of the lens',
    },
    icon: {
      type: 'string',
      maxLength: 32,
    },
    isBuiltin: {
      type: 'boolean',
    },
    disclaimer: {
      type: 'string',
      maxLength: 1000,
    },
    isMedicalEndorsement: {
      type: 'boolean',
      enum: [false],
    },
    boostDomains: {
      type: 'array',
      items: {
        type: 'object',
        required: ['pattern', 'multiplier'],
        properties: {
          pattern: { type: 'string', maxLength: 253 },
          multiplier: { type: 'number', minimum: 1.0, maximum: 3.0 },
          reason: { type: 'string', maxLength: 200 },
        },
      },
    },
    demoteDomains: {
      type: 'array',
      items: {
        type: 'object',
        required: ['pattern', 'multiplier'],
        properties: {
          pattern: { type: 'string', maxLength: 253 },
          multiplier: { type: 'number', minimum: 0.05, maximum: 1.0 },
          reason: { type: 'string', maxLength: 200 },
        },
      },
    },
    excludeDomains: {
      type: 'array',
      items: {
        type: 'string',
        maxLength: 253,
      },
    },
    rankingWeights: {
      type: 'object',
      properties: {
        freshnessWeight: { type: 'number', minimum: 0.0, maximum: 1.0 },
        domainAuthorityWeight: { type: 'number', minimum: 0.0, maximum: 1.0 },
        pageRankWeight: { type: 'number', minimum: 0.0, maximum: 1.0 },
        trackerSignalWeight: { type: 'number', minimum: 0.0, maximum: 1.0 },
        enableTrackerSignal: { type: 'boolean' },
      },
    },
    metadata: {
      type: 'object',
      properties: {
        author: { type: 'string', maxLength: 100 },
        version: { type: 'string', maxLength: 32 },
        license: { type: 'string', maxLength: 64 },
        createdAt: { type: 'string', maxLength: 64 },
        updatedAt: { type: 'string', maxLength: 64 },
        tags: { type: 'array', items: { type: 'string', maxLength: 32 } },
      },
    },
  },
} as const;

/**
 * Validates domain string pattern (e.g. 'github.com', '*.edu', 'mit.edu', '.gov')
 * Reject protocols (http/https), path slashes, query parameters, spaces, or script tags.
 */
export function isValidDomainPattern(pattern: unknown): boolean {
  if (typeof pattern !== 'string') return false;
  const p = pattern.trim();
  if (p.length === 0 || p.length > 253) return false;

  // Disallow protocols, path characters, whitespace, control characters, scripts
  if (/[/:\\?#\s<>]/.test(p)) return false;

  // Pattern can be wildcard: e.g. '*.edu', '.gov', 'wikipedia.org', 'sub.domain.co.uk'
  const normalized = p.startsWith('*.') ? p.slice(2) : p.startsWith('.') ? p.slice(1) : p;
  if (normalized.length === 0) return false;

  // Basic RFC hostname label validation
  const labels = normalized.split('.');
  for (const label of labels) {
    if (!label || label.length > 63) return false;
    if (!/^[a-z0-9-]+$/i.test(label)) return false;
    if (label.startsWith('-') || label.endsWith('-')) return false;
  }

  return true;
}

/**
 * Defensively validates and sanitizes a raw Focus Lens JSON payload.
 * Guarantee: Never throws; invalid input produces `{ valid: false, errors }`.
 */
export function validateLensProfile(rawInput: unknown): LensValidationResult {
  const errors: string[] = [];

  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
    return { valid: false, errors: ['Profile payload must be a non-null object.'] };
  }

  // Check file / object size if serialized
  try {
    const serialized = JSON.stringify(rawInput);
    if (serialized.length > MAX_LENS_FILE_SIZE_BYTES) {
      return {
        valid: false,
        errors: [`Lens payload size (${serialized.length} bytes) exceeds maximum allowable limit (${MAX_LENS_FILE_SIZE_BYTES} bytes).`],
      };
    }
  } catch {
    return { valid: false, errors: ['Unable to serialize lens profile for verification.'] };
  }

  // Check prototype pollution / code execution vectors
  const raw = rawInput as any;
  if (
    Object.prototype.hasOwnProperty.call(raw, '__proto__') ||
    Object.prototype.hasOwnProperty.call(raw, 'constructor') ||
    Object.prototype.hasOwnProperty.call(raw, 'prototype')
  ) {
    return { valid: false, errors: ['Forbidden object keys detected (prototype pollution protection).'] };
  }

  // 1. Validate schemaVersion
  const version = raw.schemaVersion;
  if (typeof version !== 'number' || !SUPPORTED_LENS_SCHEMA_VERSIONS.includes(version)) {
    errors.push(
      `Unsupported or missing schemaVersion: ${String(version)}. Supported versions: ${SUPPORTED_LENS_SCHEMA_VERSIONS.join(', ')}.`,
    );
  }

  // 2. Validate id
  const id = raw.id;
  if (typeof id !== 'string' || !/^[a-z0-9-_]{1,64}$/.test(id)) {
    errors.push('Lens "id" must be a lowercase alphanumeric slug (1-64 characters, hyphens and underscores permitted).');
  }

  // 3. Validate name
  const name = raw.name;
  if (typeof name !== 'string' || name.trim().length === 0 || name.length > 100) {
    errors.push('Lens "name" must be a non-empty string between 1 and 100 characters.');
  }

  // 4. Validate description
  const description = raw.description;
  if (typeof description !== 'string' || description.trim().length === 0 || description.length > 500) {
    errors.push('Lens "description" must be a non-empty string between 1 and 500 characters.');
  }

  // 5. Validate boostDomains
  const sanitizedBoosts: DomainMultiplierRule[] = [];
  if (raw.boostDomains !== undefined) {
    if (!Array.isArray(raw.boostDomains)) {
      errors.push('boostDomains must be an array of domain multiplier rules.');
    } else {
      for (let i = 0; i < raw.boostDomains.length; i++) {
        const item = raw.boostDomains[i];
        if (!item || typeof item !== 'object') {
          errors.push(`boostDomains[${i}] must be an object with pattern and multiplier.`);
          continue;
        }
        if (!isValidDomainPattern(item.pattern)) {
          errors.push(`boostDomains[${i}].pattern "${String(item.pattern)}" is not a valid domain pattern.`);
        }
        const mult = Number(item.multiplier);
        if (Number.isNaN(mult) || mult < LENS_BOOST_MIN || mult > LENS_BOOST_MAX) {
          errors.push(
            `boostDomains[${i}].multiplier must be a number between ${LENS_BOOST_MIN} and ${LENS_BOOST_MAX} (got ${String(item.multiplier)}).`,
          );
        } else if (isValidDomainPattern(item.pattern)) {
          sanitizedBoosts.push({
            pattern: item.pattern.trim().toLowerCase(),
            multiplier: Math.round(mult * 1000) / 1000,
            reason: typeof item.reason === 'string' ? item.reason.slice(0, 200) : undefined,
          });
        }
      }
    }
  }

  // 6. Validate demoteDomains
  const sanitizedDemotes: DomainMultiplierRule[] = [];
  if (raw.demoteDomains !== undefined) {
    if (!Array.isArray(raw.demoteDomains)) {
      errors.push('demoteDomains must be an array of domain multiplier rules.');
    } else {
      for (let i = 0; i < raw.demoteDomains.length; i++) {
        const item = raw.demoteDomains[i];
        if (!item || typeof item !== 'object') {
          errors.push(`demoteDomains[${i}] must be an object with pattern and multiplier.`);
          continue;
        }
        if (!isValidDomainPattern(item.pattern)) {
          errors.push(`demoteDomains[${i}].pattern "${String(item.pattern)}" is not a valid domain pattern.`);
        }
        const mult = Number(item.multiplier);
        if (Number.isNaN(mult) || mult < LENS_DEMOTE_MIN || mult > LENS_DEMOTE_MAX) {
          errors.push(
            `demoteDomains[${i}].multiplier must be a number between ${LENS_DEMOTE_MIN} and ${LENS_DEMOTE_MAX} (got ${String(item.multiplier)}).`,
          );
        } else if (isValidDomainPattern(item.pattern)) {
          sanitizedDemotes.push({
            pattern: item.pattern.trim().toLowerCase(),
            multiplier: Math.round(mult * 1000) / 1000,
            reason: typeof item.reason === 'string' ? item.reason.slice(0, 200) : undefined,
          });
        }
      }
    }
  }

  // 7. Validate excludeDomains
  const sanitizedExcludes: string[] = [];
  if (raw.excludeDomains !== undefined) {
    if (!Array.isArray(raw.excludeDomains)) {
      errors.push('excludeDomains must be an array of domain strings.');
    } else {
      for (let i = 0; i < raw.excludeDomains.length; i++) {
        const pattern = raw.excludeDomains[i];
        if (!isValidDomainPattern(pattern)) {
          errors.push(`excludeDomains[${i}] "${String(pattern)}" is not a valid domain pattern.`);
        } else {
          sanitizedExcludes.push(pattern.trim().toLowerCase());
        }
      }
    }
  }

  // 8. Validate rankingWeights
  let sanitizedWeights = undefined;
  if (raw.rankingWeights !== undefined) {
    if (typeof raw.rankingWeights !== 'object' || raw.rankingWeights === null || Array.isArray(raw.rankingWeights)) {
      errors.push('rankingWeights must be an object.');
    } else {
      const w = raw.rankingWeights as Record<string, unknown>;
      const checkBounded = (key: string) => {
        if (w[key] !== undefined) {
          const val = Number(w[key]);
          if (Number.isNaN(val) || val < LENS_WEIGHT_MIN || val > LENS_WEIGHT_MAX) {
            errors.push(`rankingWeights.${key} must be a number between ${LENS_WEIGHT_MIN} and ${LENS_WEIGHT_MAX}.`);
            return undefined;
          }
          return Math.round(val * 1000) / 1000;
        }
        return undefined;
      };

      sanitizedWeights = {
        freshnessWeight: checkBounded('freshnessWeight'),
        domainAuthorityWeight: checkBounded('domainAuthorityWeight'),
        pageRankWeight: checkBounded('pageRankWeight'),
        trackerSignalWeight: checkBounded('trackerSignalWeight'),
        enableTrackerSignal: typeof w.enableTrackerSignal === 'boolean' ? w.enableTrackerSignal : undefined,
      };
    }
  }

  // 9. Health source enforcement: health-related lenses require explicit non-endorsement disclaimer
  const isHealthLens = String(id).includes('health') || String(name).toLowerCase().includes('health');
  let disclaimer = typeof raw.disclaimer === 'string' ? raw.disclaimer.slice(0, 1000) : undefined;
  if (isHealthLens) {
    if (!disclaimer) {
      disclaimer = HEALTH_LENS_DISCLAIMER;
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const profile: FocusLensProfile = {
    schemaVersion: (version as number) ?? CURRENT_LENS_SCHEMA_VERSION,
    id: (id as string).trim().toLowerCase(),
    name: (name as string).trim(),
    description: (description as string).trim(),
    icon: typeof raw.icon === 'string' ? raw.icon.slice(0, 32) : undefined,
    isBuiltin: Boolean(raw.isBuiltin),
    disclaimer,
    isMedicalEndorsement: false,
    boostDomains: sanitizedBoosts,
    demoteDomains: sanitizedDemotes,
    excludeDomains: sanitizedExcludes,
    rankingWeights: sanitizedWeights,
    metadata: typeof raw.metadata === 'object' && raw.metadata !== null ? (raw.metadata as any) : undefined,
  };

  return {
    valid: true,
    errors: [],
    profile,
  };
}
