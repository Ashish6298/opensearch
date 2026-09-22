#!/usr/bin/env node

/**
 * @opensearch/cli — Binary Entrypoint (Phase 44)
 */

import { runCli } from './cli.js';

const args = process.argv.slice(2);

runCli(args)
  .then(result => {
    if (result.stdout) {
      process.stdout.write(result.stdout + '\n');
    }
    if (result.stderr) {
      process.stderr.write(result.stderr + '\n');
    }
    process.exit(result.exitCode);
  })
  .catch(err => {
    process.stderr.write(`\x1b[31m[FATAL] ${err.message}\x1b[39m\n`);
    process.exit(1);
  });
