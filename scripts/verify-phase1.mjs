import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

console.log('=== Starting OpenSearch Phase 1 Verification ===\n');

const rootDir = process.cwd();

// Gate 1: Check required directory structure
const expectedDirs = [
  'apps/api',
  'apps/web',
  'packages/shared',
  'packages/storage',
  'packages/crawler',
  'packages/indexer',
  'packages/ranking',
  'scripts',
  'report',
];

console.log('[1/5] Checking Directory Structure...');
for (const dir of expectedDirs) {
  const full = path.resolve(rootDir, dir);
  if (!fs.existsSync(full) || !fs.statSync(full).isDirectory()) {
    console.error(`FAIL: Missing directory: ${dir}`);
    process.exit(1);
  }
}
console.log('PASS: All base directories and module boundaries exist.\n');

// Gate 2: Verify no secret .env files committed
console.log('[2/5] Checking Secret Environment Files...');
const forbiddenFiles = ['.env', '.env.local', '.env.production', 'apps/api/.env', 'apps/web/.env'];

for (const file of forbiddenFiles) {
  const full = path.resolve(rootDir, file);
  if (fs.existsSync(full)) {
    console.error(`FAIL: Secret environment file found: ${file}`);
    process.exit(1);
  }
}

const requiredEnvExamples = ['.env.example', 'apps/api/.env.example', 'apps/web/.env.example'];
for (const file of requiredEnvExamples) {
  const full = path.resolve(rootDir, file);
  if (!fs.existsSync(full)) {
    console.error(`FAIL: Missing environment template: ${file}`);
    process.exit(1);
  }
}
console.log('PASS: Environment configurations are safe and templates exist.\n');

// Gate 3: Verify TypeScript compilation across workspaces
console.log('[3/5] Running TypeScript Project References Check (tsc -b)...');
try {
  execSync('npx tsc -b', { stdio: 'inherit', cwd: rootDir });
  console.log('PASS: TypeScript builds without errors.\n');
} catch {
  console.error('FAIL: TypeScript typecheck failed.');
  process.exit(1);
}

// Gate 4: Verify ESLint & Prettier
console.log('[4/5] Checking Lint and Code Formatting...');
try {
  execSync('npm run lint', { stdio: 'inherit', cwd: rootDir });
  execSync('npm run format:check', { stdio: 'inherit', cwd: rootDir });
  console.log('PASS: Lint and formatting checks passed.\n');
} catch {
  console.error('FAIL: Lint or formatting check failed.');
  process.exit(1);
}

// Gate 5: Run Vitest unit tests
console.log('[5/5] Running Unit Tests...');
try {
  execSync('npm run test', { stdio: 'inherit', cwd: rootDir });
  console.log('PASS: All unit tests passed.\n');
} catch {
  console.error('FAIL: Unit tests failed.');
  process.exit(1);
}

console.log('====================================================');
console.log('ALL PHASE 1 VERIFICATION GATES PASSED SUCCESSFULLY!');
console.log('====================================================');
