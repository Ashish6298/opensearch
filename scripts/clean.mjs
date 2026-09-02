import fs from 'node:fs';
import path from 'node:path';

const dirsToClean = [
  'dist',
  'build',
  'coverage',
  'apps/api/dist',
  'apps/web/dist',
  'packages/shared/dist',
  'packages/storage/dist',
  'packages/crawler/dist',
  'packages/indexer/dist',
  'packages/ranking/dist',
];

for (const relPath of dirsToClean) {
  const fullPath = path.resolve(process.cwd(), relPath);
  if (fs.existsSync(fullPath)) {
    fs.rmSync(fullPath, { recursive: true, force: true });
    console.log(`Cleaned: ${relPath}`);
  }
}
console.log('Clean complete.');
