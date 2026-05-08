#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
let singlePage = false;
let port = process.env.PORT ? Number(process.env.PORT) : 3000;
let rootDir = 'build';

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];

  if (arg === '-s' || arg === '--single') {
    singlePage = true;
    continue;
  }

  if (arg === '-p' || arg === '--port') {
    const next = args[i + 1];
    if (!next) {
      console.error('Missing value for port option.');
      process.exit(1);
    }
    port = Number(next);
    i += 1;
    continue;
  }

  if (!arg.startsWith('-')) {
    rootDir = arg;
  }
}

rootDir = path.resolve(process.cwd(), rootDir);

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'application/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.ico':
      return 'image/x-icon';
    case '.txt':
      return 'text/plain; charset=utf-8';
    case '.map':
      return 'application/json; charset=utf-8';
    case '.woff':
      return 'font/woff';
    case '.woff2':
      return 'font/woff2';
    case '.ttf':
      return 'font/ttf';
    case '.eot':
      return 'application/vnd.ms-fontobject';
    case '.webp':
      return 'image/webp';
    case '.avif':
      return 'image/avif';
    default:
      return 'application/octet-stream';
  }
}

function sendFile(res, filePath) {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on('open', () => {
      res.writeHead(200, { 'Content-Type': getContentType(filePath) });
      stream.pipe(res);
    });
    stream.on('error', reject);
    stream.on('end', resolve);
  });
}

async function handleRequest(req, res) {
  const requestPath = decodeURI((req.url || '').split('?')[0]);
  const normalized = path.normalize(requestPath).replace(/^\\+/, '/');
  let target = path.join(rootDir, normalized);

  try {
    const stats = fs.statSync(target);
    if (stats.isDirectory()) {
      target = path.join(target, 'index.html');
    }
    await sendFile(res, target);
    return;
  } catch (error) {
    if (singlePage) {
      try {
        await sendFile(res, path.join(rootDir, 'index.html'));
        return;
      } catch (innerError) {
        console.error(innerError);
      }
    }
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    console.error(error);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    res.end('Internal Server Error');
  });
});

server.listen(port, () => {
  console.log(`Serving ${rootDir} on http://localhost:${port}`);
  if (singlePage) {
    console.log('Single page mode enabled.');
  }
});
