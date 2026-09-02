import { ConfigError } from '../errors/index.js';

export interface EnvReaderOptions<T> {
  envKey: string;
  defaultValue?: T;
  required?: boolean;
}

/**
 * Safely reads a string from the environment or dictionary.
 */
export function readString(
  env: Record<string, string | undefined>,
  options: EnvReaderOptions<string>,
): string {
  const value = env[options.envKey]?.trim();

  if (value !== undefined && value.length > 0) {
    return value;
  }

  if (options.defaultValue !== undefined) {
    return options.defaultValue;
  }

  if (options.required) {
    throw new ConfigError(`Missing required environment variable: ${options.envKey}`, {
      context: { envKey: options.envKey },
    });
  }

  return '';
}

/**
 * Safely reads an integer within optional bounds from the environment.
 */
export function readInt(
  env: Record<string, string | undefined>,
  options: EnvReaderOptions<number> & { min?: number; max?: number },
): number {
  const raw = env[options.envKey]?.trim();

  if (raw === undefined || raw.length === 0) {
    if (options.defaultValue !== undefined) {
      return options.defaultValue;
    }
    if (options.required) {
      throw new ConfigError(`Missing required environment variable: ${options.envKey}`, {
        context: { envKey: options.envKey },
      });
    }
    return 0;
  }

  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new ConfigError(
      `Invalid integer for environment variable ${options.envKey}: received "${raw}"`,
      { context: { envKey: options.envKey, rawValue: raw } },
    );
  }

  if (options.min !== undefined && parsed < options.min) {
    throw new ConfigError(
      `Environment variable ${options.envKey} (${parsed}) is below minimum allowed (${options.min})`,
      { context: { envKey: options.envKey, value: parsed, min: options.min } },
    );
  }

  if (options.max !== undefined && parsed > options.max) {
    throw new ConfigError(
      `Environment variable ${options.envKey} (${parsed}) exceeds maximum allowed (${options.max})`,
      { context: { envKey: options.envKey, value: parsed, max: options.max } },
    );
  }

  return parsed;
}

/**
 * Safely reads a boolean from the environment.
 */
export function readBoolean(
  env: Record<string, string | undefined>,
  options: EnvReaderOptions<boolean>,
): boolean {
  const raw = env[options.envKey]?.trim().toLowerCase();

  if (raw === undefined || raw.length === 0) {
    if (options.defaultValue !== undefined) {
      return options.defaultValue;
    }
    return false;
  }

  if (['true', '1', 'yes'].includes(raw)) {
    return true;
  }

  if (['false', '0', 'no'].includes(raw)) {
    return false;
  }

  throw new ConfigError(
    `Invalid boolean for environment variable ${options.envKey}: received "${raw}" (expected true/false/1/0/yes/no)`,
    { context: { envKey: options.envKey, rawValue: raw } },
  );
}

/**
 * Safely reads an enum value from the environment.
 */
export function readEnum<T extends string>(
  env: Record<string, string | undefined>,
  options: EnvReaderOptions<T> & { allowed: readonly T[] },
): T {
  const raw = env[options.envKey]?.trim();

  if (raw === undefined || raw.length === 0) {
    if (options.defaultValue !== undefined) {
      return options.defaultValue;
    }
    if (options.required) {
      throw new ConfigError(`Missing required environment variable: ${options.envKey}`, {
        context: { envKey: options.envKey, allowed: options.allowed },
      });
    }
    throw new ConfigError(`Missing value for enum variable: ${options.envKey}`);
  }

  if (!options.allowed.includes(raw as T)) {
    throw new ConfigError(
      `Invalid value for ${options.envKey}: "${raw}". Allowed values: [${options.allowed.join(', ')}]`,
      { context: { envKey: options.envKey, received: raw, allowed: options.allowed } },
    );
  }

  return raw as T;
}
