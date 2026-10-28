/**
 * @opensearch/ranking — Focus Lens Import/Export & Safe Deserialization (Phase 102)
 *
 * Implements schema-validated JSON import and export for Focus Lens profiles:
 * - Safe JSON deserialization: never throws on malformed or invalid input
 * - Enforces file size limits (<= 256 KB) to prevent denial of service
 * - Enforces prototype pollution protection (__proto__, constructor, prototype)
 * - Validates schema version, domain syntax, bounds, and medical non-endorsements
 * - Outputs clean, formatted, reproducible JSON representations
 */

import {
  FocusLensProfile,
  LensValidationResult,
  MAX_LENS_FILE_SIZE_BYTES,
} from './lens-types.js';
import { validateLensProfile } from './lens-schema.js';

export interface LensExportOptions {
  /** Pretty-print with 2-space indentation (default: true) */
  pretty?: boolean;
}

/**
 * Serializes a Focus Lens profile to a schema-compliant JSON string.
 */
export function exportLensToJson(
  profile: FocusLensProfile,
  options: LensExportOptions = {},
): string {
  const pretty = options.pretty ?? true;
  // Deep clone and clean undefined values
  const sanitized = JSON.parse(JSON.stringify(profile));
  return pretty ? JSON.stringify(sanitized, null, 2) : JSON.stringify(sanitized);
}

/**
 * Safely imports and validates a Focus Lens profile from a JSON string.
 *
 * Guarantees:
 * 1. Never throws an unhandled exception on malformed JSON or invalid syntax.
 * 2. Enforces maximum size bounds (<= 256 KB).
 * 3. Rejects prototype pollution vectors.
 * 4. Returns `{ valid: false, errors: [...] }` if validation fails.
 * 5. Returns `{ valid: true, profile: FocusLensProfile }` on success.
 */
export function importLensFromJson(rawJson: unknown): LensValidationResult {
  if (typeof rawJson !== 'string') {
    return {
      valid: false,
      errors: ['Input must be a valid JSON string.'],
    };
  }

  // 1. Verify byte/character length limit (DoS protection)
  const byteLength = Buffer.byteLength(rawJson, 'utf8');
  if (byteLength > MAX_LENS_FILE_SIZE_BYTES) {
    return {
      valid: false,
      errors: [
        `Lens file size (${byteLength} bytes) exceeds maximum allowed limit of ${MAX_LENS_FILE_SIZE_BYTES} bytes.`,
      ],
    };
  }

  if (rawJson.trim().length === 0) {
    return {
      valid: false,
      errors: ['Input JSON string is empty.'],
    };
  }

  // 2. Safe parse with explicit error capture
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      valid: false,
      errors: [`Malformed JSON syntax: ${errorMsg}`],
    };
  }

  // 3. Reject primitive types (numbers, booleans, arrays, strings)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      valid: false,
      errors: ['Focus Lens root definition must be a valid JSON object.'],
    };
  }

  // 4. Strict check for prototype pollution keys in raw payload
  const rawObj = parsed as Record<string, unknown>;
  if (
    Object.prototype.hasOwnProperty.call(rawObj, '__proto__') ||
    Object.prototype.hasOwnProperty.call(rawObj, 'constructor') ||
    Object.prototype.hasOwnProperty.call(rawObj, 'prototype')
  ) {
    return {
      valid: false,
      errors: ['Forbidden object properties detected (prototype pollution guard).'],
    };
  }

  // 5. Delegate to comprehensive schema validator
  return validateLensProfile(rawObj);
}
