#!/usr/bin/env node
/**
 * @opensearch/scripts — Phase 31 Production Deployment Automation & Seed Initializer
 *
 * Automatically bootstraps a production-ready search engine instance:
 * 1. Initializes durable storage adapter
 * 2. Seeds high-quality curated seed corpus if document collection is empty
 * 3. Builds and optimizes the production inverted index
 * 4. Activates atomic zero-downtime index deployment
 * 5. Logs verification summary and readiness status
 */

import { loadConfig } from '../packages/shared/dist/index.js';
import { createStorageAdapter } from '../packages/storage/dist/index.js';
import { createIndexBuilder } from '../packages/indexer/dist/index.js';
import { CURATED_SEED_CORPUS } from '../packages/crawler/dist/index.js';

export async function deployProductionCorpusAndIndex(customConfig) {
  const config = customConfig ?? loadConfig();
  console.log(`[DEPLOY] Starting production deployment pipeline (Env: ${config.env})...`);

  const storage = createStorageAdapter({ config });
  await storage.initialize();

  const docCount = await storage.documents.count();
  console.log(`[DEPLOY] Current document storage count: ${docCount}`);

  if (docCount === 0) {
    console.log('[DEPLOY] Seeding initial curated corpus into storage...');
    let seededCount = 0;
    for (const category of CURATED_SEED_CORPUS) {
      for (const seed of category.seeds) {
        await storage.documents.create({
          url: seed.url,
          urlHash: `seed-${category.id}-${seededCount}`,
          title: seed.title,
          description: seed.description,
          headings: `${category.name} ${seed.tags.join(' ')}`,
          bodyText: `${seed.title}. ${seed.description}. Tags: ${seed.tags.join(', ')}. Category: ${category.description}`,
          language: 'en',
          contentType: 'text/html',
          contentLength: seed.description.length + 150,
          httpStatus: 200,
          outboundLinks: [],
        });
        seededCount++;
      }
    }
    console.log(`[DEPLOY] Successfully seeded ${seededCount} curated documents.`);
  }

  console.log('[DEPLOY] Building production inverted index from storage...');
  const builder = createIndexBuilder({ config, storage });
  const buildResult = await builder.build();

  if (buildResult.status !== 'success') {
    throw new Error(`[DEPLOY] Index build failed: ${JSON.stringify(buildResult)}`);
  }

  console.log(
    `[DEPLOY] Inverted index built successfully: ${buildResult.stats?.documentsIndexed} docs, ${buildResult.stats?.termsIndexed} terms in ${buildResult.stats?.durationMs}ms.`,
  );

  await storage.close();
  console.log('[DEPLOY] Production corpus & index initialization complete.');
  return {
    documentsIndexed: buildResult.stats?.documentsIndexed || 0,
    termsIndexed: buildResult.stats?.termsIndexed || 0,
  };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  deployProductionCorpusAndIndex()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('[DEPLOY] Fatal deployment error:', err);
      process.exit(1);
    });
}
