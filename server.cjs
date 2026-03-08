// Local development server — pure Node http, no Express, no dotenv dependency.
// Serves static files from the project root and proxies POST /api/generate
// directly to the Anthropic API using the key from .env.

const http = require('http');
const fs   = require('fs');
const path = require('path');

// ── Parse .env without any npm packages ─────────────────────────────────────
function loadEnv(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      // Strip optional surrounding quotes from the value
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (key && !process.env[key]) process.env[key] = val;
    }
  } catch {
    console.warn('[env] .env file not found — falling back to shell environment');
  }
}
loadEnv(path.join(__dirname, '.env'));

// ── Helpers ──────────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// ── Anthropic proxy ──────────────────────────────────────────────────────────
async function proxyToAnthropic(req, res) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return sendJson(res, 500, { error: 'ANTHROPIC_API_KEY is not set in .env or environment' });
  }

  let bodyText;
  try {
    bodyText = await readBody(req);
  } catch (e) {
    return sendJson(res, 400, { error: 'Failed to read request body' });
  }

  let payload;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    return sendJson(res, 400, { error: 'Invalid JSON in request body' });
  }

  const { system, messages, max_tokens } = payload;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return sendJson(res, 400, { error: 'messages array is required and must not be empty' });
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: max_tokens || 4000,
        system,
        messages,
      }),
    });

    const ct   = upstream.headers.get('content-type') || '';
    const data = ct.includes('application/json')
      ? await upstream.json()
      : { error: await upstream.text() };

    console.log(`[anthropic] ${upstream.status} ${upstream.statusText}`);

    if (!upstream.ok) {
      return sendJson(res, upstream.status, {
        error:   data?.error?.message || data?.error || 'Anthropic API error',
        details: data,
      });
    }

    return sendJson(res, 200, data);
  } catch (e) {
    console.error('[anthropic] fetch error:', e.message);
    return sendJson(res, 500, { error: `Upstream request failed: ${e.message}` });
  }
}

// ── HTTP server ───────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  // API proxy
  if (req.url === '/api/generate') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    return proxyToAnthropic(req, res);
  }

  // Static files
  if (req.method === 'GET') {
    const urlPath  = req.url.split('?')[0];
    const filePath = path.join(__dirname, urlPath === '/' ? 'index.html' : urlPath);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext  = path.extname(filePath);
      const mime = MIME[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime });
      return fs.createReadStream(filePath).pipe(res);
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }

  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Method not allowed');
});

server.listen(3000, () => {
  const keyStatus = process.env.ANTHROPIC_API_KEY ? '✓ loaded' : '✗ MISSING';
  console.log('\n🚀  Dev server running at http://localhost:3000');
  console.log(`    ANTHROPIC_API_KEY: ${keyStatus}`);
  console.log('    Ctrl+C to stop\n');
});
