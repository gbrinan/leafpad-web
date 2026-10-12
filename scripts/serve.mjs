import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer(async (request, response) => {
  try { const url = new URL(request.url, 'http://localhost'); const file = path.resolve(root, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
    if (!file.startsWith(root + path.sep)) throw new Error('Bad path');
    const body = await fs.readFile(file); response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'text/plain', 'Cache-Control': 'no-store' }); response.end(body);
  } catch { response.writeHead(404); response.end('Not found'); }
});
server.listen(Number(process.env.PORT || 4197), '127.0.0.1', () => console.log('LeafPad preview: http://127.0.0.1:4197'));
