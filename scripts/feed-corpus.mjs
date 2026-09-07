import { getAllCuratedSeeds } from '../packages/crawler/dist/index.js';
import { createStorageAdapter } from '../packages/storage/dist/index.js';
import { createIndexBuilder } from '../packages/indexer/dist/index.js';
import { loadConfig } from '../packages/shared/dist/index.js';
import { createHash, randomUUID } from 'node:crypto';

async function indexAll() {
  const config = loadConfig();
  const storage = createStorageAdapter({ config });
  await storage.initialize();

  const seeds = getAllCuratedSeeds();
  console.log(`Seeding corpus entries: ${seeds.length}`);

  for (const s of seeds) {
    const existing = await storage.documents.findByUrl(s.url);
    const urlHash = createHash('sha256').update(s.url.trim().toLowerCase()).digest('hex');

    const docData = {
      url: s.url,
      urlHash,
      title: s.title,
      description: s.description,
      headings: s.tags.join(' ') + ' ' + s.title,
      bodyText: `${s.title}. ${s.description} Search tags and common keywords: ${s.tags.join(', ')}. Complete guide, information retrieval entry, overview, and encyclopedia reference article.`,
      language: 'en',
      contentType: 'text/html; charset=utf-8',
      contentLength: 600,
      httpStatus: 200,
      outboundLinks: [],
    };

    if (existing) {
      await storage.documents.update(existing.id, docData);
    } else {
      await storage.documents.create({
        id: randomUUID(),
        ...docData,
      });
    }
  }

  const indexBuilder = createIndexBuilder({
    storage,
    indexDir: config.storage.indexDir || './data/index',
  });

  const summary = await indexBuilder.build({ mode: 'full' });
  console.log('Index successfully built and updated!');
  console.log(`Total Docs Indexed: ${summary.documentCount}`);
  console.log(`Total Terms Indexed: ${summary.termCount}`);
  await storage.close();
}

indexAll().catch(console.error);
