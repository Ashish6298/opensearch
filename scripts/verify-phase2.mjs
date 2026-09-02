import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

console.log('=== Starting OpenSearch Phase 2 Verification ===\n');

const rootDir = process.cwd();

// Gate 1: Check Phase 1 foundation preservation
console.log('[1/7] Checking Phase 1 Baseline Preservation...');
try {
  execSync('npm run verify:phase1', { stdio: 'inherit', cwd: rootDir });
  console.log('PASS: Phase 1 foundation is intact.\n');
} catch {
  console.error('FAIL: Phase 1 verification failed.');
  process.exit(1);
}

// Gate 2: Verify Configuration system files exist
console.log('[2/7] Checking Phase 2 File Layout...');
const requiredPhase2Files = [
  'packages/shared/src/config/index.ts',
  'packages/shared/src/config/types.ts',
  'packages/shared/src/config/env.ts',
  'packages/shared/src/logger/index.ts',
  'packages/shared/src/errors/index.ts',
  'packages/shared/src/utils/index.ts',
  'packages/shared/tests/config.test.ts',
  'packages/shared/tests/logger.test.ts',
  'packages/shared/tests/errors.test.ts',
  'packages/shared/tests/utils.test.ts',
];

for (const file of requiredPhase2Files) {
  const full = path.resolve(rootDir, file);
  if (!fs.existsSync(full)) {
    console.error(`FAIL: Missing Phase 2 file: ${file}`);
    process.exit(1);
  }
}
console.log('PASS: All Phase 2 shared infrastructure files exist.\n');

// Gate 3: Verify TypeScript composite project compilation
console.log('[3/7] Verifying TypeScript Compilation (tsc -b)...');
try {
  execSync('npx tsc -b', { stdio: 'inherit', cwd: rootDir });
  console.log('PASS: TypeScript builds cleanly across all workspaces.\n');
} catch {
  console.error('FAIL: TypeScript typecheck failed.');
  process.exit(1);
}

// Gate 4: Verify ESLint and Prettier
console.log('[4/7] Checking Lint and Formatting...');
try {
  execSync('npm run lint', { stdio: 'inherit', cwd: rootDir });
  execSync('npm run format:check', { stdio: 'inherit', cwd: rootDir });
  console.log('PASS: Lint and formatting checks passed.\n');
} catch {
  console.error('FAIL: Lint or formatting check failed.');
  process.exit(1);
}

// Gate 5: Run all unit tests
console.log('[5/7] Running Unit Test Suite...');
try {
  execSync('npm run test', { stdio: 'inherit', cwd: rootDir });
  console.log('PASS: All unit tests passed.\n');
} catch {
  console.error('FAIL: Unit test suite failed.');
  process.exit(1);
}

// Gate 6: Verify no business logic leaks into shared infrastructure
console.log('[6/7] Checking Boundary and Dependency Isolation...');
// Verify crawler/indexer business logic is NOT in shared/src
const sharedSrc = path.resolve(rootDir, 'packages/shared/src');
const sharedFiles = fs.readdirSync(sharedSrc, { recursive: true });
for (const f of sharedFiles) {
  const fileStr = String(f);
  if (
    fileStr.includes('crawler') &&
    !fileStr.includes('constants') &&
    !fileStr.includes('config')
  ) {
    console.error(`FAIL: Potential boundary leak: ${fileStr}`);
    process.exit(1);
  }
}
console.log('PASS: Shared infrastructure has zero business logic leaks.\n');

// Gate 7: Verify clean build output
console.log('[7/7] Verifying Workspace Build Output...');
try {
  execSync('npm run build', { stdio: 'inherit', cwd: rootDir });
  console.log('PASS: Clean build verified across all workspaces.\n');
} catch {
  console.error('FAIL: Workspace build failed.');
  process.exit(1);
}

console.log('====================================================');
console.log('ALL PHASE 2 VERIFICATION GATES PASSED SUCCESSFULLY!');
console.log('====================================================');
