import { describe, it, expect } from 'vitest';
import { createLogger, redactSensitiveData, LogLevel } from '../src/index.js';

describe('Shared Logging Foundation', () => {
  it('should format logs as human-readable strings in pretty mode', () => {
    const logs: string[] = [];
    const logger = createLogger('TestModule', {
      format: 'pretty',
      level: 'debug',
      sink: line => logs.push(line),
    });

    logger.info('System initialized', { port: 3000 });
    expect(logs.length).toBe(1);
    expect(logs[0]).toContain('[INFO]');
    expect(logs[0]).toContain('[TestModule]: System initialized');
    expect(logs[0]).toContain('{"port":3000}');
  });

  it('should format logs as structured JSON in json mode', () => {
    const logs: string[] = [];
    const logger = createLogger('ApiModule', {
      format: 'json',
      level: 'info',
      sink: line => logs.push(line),
    });

    logger.info('Request processed', { durationMs: 42 });
    expect(logs.length).toBe(1);

    const parsed = JSON.parse(logs[0] ?? '{}') as {
      level: string;
      module: string;
      message: string;
      metadata: { durationMs: number };
    };

    expect(parsed.level).toBe('info');
    expect(parsed.module).toBe('ApiModule');
    expect(parsed.message).toBe('Request processed');
    expect(parsed.metadata.durationMs).toBe(42);
  });

  it('should respect log level filtering', () => {
    const logs: string[] = [];
    const logger = createLogger('FilterTest', {
      level: 'warn',
      sink: line => logs.push(line),
    });

    logger.debug('should not appear');
    logger.info('should not appear');
    logger.warn('warning message');
    logger.error('error message');

    expect(logs.length).toBe(2);
    expect(logs[0]).toContain('warning message');
    expect(logs[1]).toContain('error message');
  });

  it('should redact sensitive keys in log metadata', () => {
    const data = {
      user: 'alice',
      password: 'superSecretPassword123',
      apiKey: 'xyz-secret-key-99',
      nested: {
        token: 'jwt-bearer-token',
        normalField: 'ok',
      },
    };

    const redacted = redactSensitiveData(data) as {
      user: string;
      password: string;
      apiKey: string;
      nested: { token: string; normalField: string };
    };

    expect(redacted.user).toBe('alice');
    expect(redacted.password).toBe('[REDACTED]');
    expect(redacted.apiKey).toBe('[REDACTED]');
    expect(redacted.nested.token).toBe('[REDACTED]');
    expect(redacted.nested.normalField).toBe('ok');
  });

  it('should create child loggers with namespaced module names', () => {
    const logs: string[] = [];
    const parent = createLogger('Parent', {
      sink: (line: string, _level: LogLevel) => logs.push(line),
    });
    const child = parent.child('Child');

    child.info('Child operation completed');
    expect(logs.length).toBe(1);
    expect(logs[0]).toContain('[Parent:Child]: Child operation completed');
  });
});
