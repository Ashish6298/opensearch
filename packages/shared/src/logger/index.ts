import { LogLevel, LogFormat } from '../constants.js';

export interface LoggerOptions {
  level?: LogLevel;
  format?: LogFormat;
  redactKeys?: string[];
  sink?: (line: string, level: LogLevel) => void;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface Logger {
  debug(message: string, metadata?: Record<string, unknown>): void;
  info(message: string, metadata?: Record<string, unknown>): void;
  warn(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, metadata?: Record<string, unknown>): void;
  child(subModuleName: string): Logger;
  getLevel(): LogLevel;
  setLevel(level: LogLevel): void;
}

const DEFAULT_SENSITIVE_KEYS = [
  'password',
  'secret',
  'token',
  'key',
  'authorization',
  'cookie',
  'credential',
  'auth',
  'apikey',
  'private',
];

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

/**
 * Sanitizes metadata to redact sensitive values before logging.
 */
export function redactSensitiveData(
  obj: unknown,
  sensitiveKeys: string[] = DEFAULT_SENSITIVE_KEYS,
): unknown {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => redactSensitiveData(item, sensitiveKeys));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const isSensitive = sensitiveKeys.some(s => key.toLowerCase().includes(s.toLowerCase()));
    if (isSensitive) {
      result[key] = '[REDACTED]';
    } else if (value !== null && typeof value === 'object') {
      result[key] = redactSensitiveData(value, sensitiveKeys);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Creates a structured logger instance for a given module.
 */
export function createLogger(moduleName: string, options: LoggerOptions = {}): Logger {
  let currentLevel: LogLevel = options.level ?? 'info';
  const format: LogFormat = options.format ?? 'pretty';
  const redactKeys = options.redactKeys ?? DEFAULT_SENSITIVE_KEYS;
  const sink = options.sink ?? ((line: string) => console.log(line));

  function shouldLog(level: LogLevel): boolean {
    if (currentLevel === 'silent') return false;
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[currentLevel];
  }

  function write(level: LogLevel, message: string, metadata?: Record<string, unknown>): void {
    if (!shouldLog(level)) return;

    const sanitizedMeta = metadata
      ? (redactSensitiveData(metadata, redactKeys) as Record<string, unknown>)
      : undefined;

    const timestamp = new Date().toISOString();

    if (format === 'json') {
      const entry: LogEntry = {
        timestamp,
        level,
        module: moduleName,
        message,
        ...(sanitizedMeta ? { metadata: sanitizedMeta } : {}),
      };
      sink(JSON.stringify(entry), level);
    } else {
      const metaStr =
        sanitizedMeta && Object.keys(sanitizedMeta).length > 0
          ? ` ${JSON.stringify(sanitizedMeta)}`
          : '';
      const line = `[${timestamp}] [${level.toUpperCase()}] [${moduleName}]: ${message}${metaStr}`;
      sink(line, level);
    }
  }

  return {
    debug(message: string, metadata?: Record<string, unknown>): void {
      write('debug', message, metadata);
    },
    info(message: string, metadata?: Record<string, unknown>): void {
      write('info', message, metadata);
    },
    warn(message: string, metadata?: Record<string, unknown>): void {
      write('warn', message, metadata);
    },
    error(message: string, metadata?: Record<string, unknown>): void {
      write('error', message, metadata);
    },
    child(subModuleName: string): Logger {
      return createLogger(`${moduleName}:${subModuleName}`, {
        level: currentLevel,
        format,
        redactKeys,
        sink,
      });
    },
    getLevel(): LogLevel {
      return currentLevel;
    },
    setLevel(level: LogLevel): void {
      currentLevel = level;
    },
  };
}
