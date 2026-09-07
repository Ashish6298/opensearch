import http from 'node:http';
import handler from '../api/index.js';

async function main() {
  const server = http.createServer((req, res) => {
    handler(req, res).catch(err => {
      console.error(err);
      res.statusCode = 500;
      res.end(err.message);
    });
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  console.log('Testing handler on port', port);

  async function test(path) {
    const res = await fetch('http://127.0.0.1:' + port + path);
    console.log(path, '->', res.status, res.headers.get('content-type'));
    const text = await res.text();
    return { status: res.status, text };
  }

  try {
    const r1 = await test('/');
    console.log('Root HTML contains OpenSearch:', r1.text.includes('OpenSearch'));
    const r2 = await test('/health');
    console.log('Health JSON:', r2.text.slice(0, 100));
    const r3 = await test('/api/v1/search?q=typescript');
    console.log('Search JSON:', r3.text.slice(0, 150));
    const r4 = await test('/about');
    console.log('About HTML contains About:', r4.text.includes('About OpenSearch'));
    const r5 = await test('/privacy');
    console.log(
      'Privacy HTML contains Policy:',
      r5.text.includes('Privacy & Data-Minimization Policy'),
    );
  } catch (err) {
    console.error(err);
  } finally {
    server.close();
  }
}

main().catch(console.error);
