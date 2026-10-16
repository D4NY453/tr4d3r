const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadEnv } = require('./lib/env.cjs');
loadEnv();

const PORT = parseInt(process.env.PORT, 10) || 3001;
// Seguridad: por defecto solo escucha en localhost. Para exponerlo hay que definir HOST explícitamente.
const HOST = process.env.HOST || '127.0.0.1';
const API_TOKEN = (process.env.BOT_API_TOKEN || '').trim();
const ALLOWED_ORIGINS = new Set([
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`,
  'http://localhost:3000', // next dev
  'http://127.0.0.1:3000',
]);

function isAuthorized(req) {
  if (!API_TOKEN) return true;
  const h = req.headers['authorization'] || '';
  const given = h.startsWith('Bearer ') ? h.slice(7).trim() : String(req.headers['x-api-token'] || '').trim();
  const a = Buffer.from(given);
  const b = Buffer.from(API_TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const STATIC_DIR = path.join(__dirname, 'out');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

// Asynchronously load the 24/7 background Bot Daemon
let botDaemon = null;
import('./server-bot-daemon.mjs')
  .then((mod) => {
    botDaemon = mod.botDaemon;
    console.log('✅ [Server] 24/7 Autonomous Bot Daemon attached.');
  })
  .catch((err) => {
    console.error('❌ [Server] Failed to load Bot Daemon:', err);
  });

function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Body too large'));
      }
    });
    req.on('end', () => {
      try {
        const json = body ? JSON.parse(body) : {};
        resolve(json);
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  // CORS: solo orígenes locales (antes era '*', cualquier web podía controlar el bot)
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Token');
  }
  const isApi = req.url.startsWith('/api/');
  // Bloquear peticiones API desde orígenes no permitidos (protección CSRF desde otras webs)
  if (isApi && origin && !ALLOWED_ORIGINS.has(origin)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Origen no permitido' }));
    return;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const reqPath = decodeURI(req.url.split('?')[0]);

  if (isApi && !isAuthorized(req)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'No autorizado: falta o es incorrecto BOT_API_TOKEN' }));
    return;
  }

  // ==========================================
  // 🤖 24/7 AUTONOMOUS BOT REST API ENDPOINTS
  // ==========================================
  if (reqPath.startsWith('/api/bot/')) {
    res.setHeader('Content-Type', 'application/json');

    if (!botDaemon) {
      res.writeHead(503);
      res.end(JSON.stringify({ error: 'El demonio del bot aún está inicializando...' }));
      return;
    }

    try {
      if (reqPath === '/api/bot/status' && req.method === 'GET') {
        res.writeHead(200);
        res.end(JSON.stringify(botDaemon.getStatus()));
        return;
      }

      if (reqPath === '/api/bot/start' && req.method === 'POST') {
        const body = await parseRequestBody(req);
        if (body.agentPrivateKey) {
          console.warn('[Server] Se ignoró agentPrivateKey enviada por API: las claves solo se leen de .env');
        }
        const tf = body.timeframe || botDaemon.config.timeframe || '1h';
        const isLongOnly = body.longOnly !== undefined ? Boolean(body.longOnly) : (botDaemon.config.longOnly ?? false);

        // saveConfig aplica los límites de riesgo (apalancamiento 1x, 1 posición, BTC/ETH...)
        const { agentPrivateKey: _ignored, ...rest } = body;
        botDaemon.saveConfig({ ...rest, timeframe: tf, longOnly: isLongOnly });

        botDaemon.start();
        res.writeHead(200);
        res.end(JSON.stringify({
          success: true,
          message: `Bot 24/7 activado [${isLongOnly ? 'Solo Compras' : 'Compras y Ventas'}] (Velas ${tf}, análisis al cierre de cada vela)`,
          status: botDaemon.getStatus(),
        }));
        return;
      }

      if (reqPath === '/api/bot/stop' && req.method === 'POST') {
        botDaemon.stop();
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, message: 'Bot 24/7 pausado', status: botDaemon.getStatus() }));
        return;
      }

      if (reqPath === '/api/bot/config' && req.method === 'POST') {
        const { agentPrivateKey: _ignored, ...body } = await parseRequestBody(req);
        botDaemon.saveConfig(body);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, status: botDaemon.getStatus() }));
        return;
      }

      if (reqPath === '/api/bot/close-all' && req.method === 'POST') {
        const result = await botDaemon.closeAllPositions();
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, result, status: botDaemon.getStatus() }));
        return;
      }

      if (reqPath === '/api/bot/closed-trades' && req.method === 'GET') {
        const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const limit = parseInt(parsedUrl.searchParams.get('limit') || '300', 10);
        const offset = parseInt(parsedUrl.searchParams.get('offset') || '0', 10);
        const coin = parsedUrl.searchParams.get('coin') || null;
        const isWinParam = parsedUrl.searchParams.get('isWin');
        const isWin = isWinParam !== null ? isWinParam === 'true' || isWinParam === '1' : null;

        const closed = botDaemon.getJournalClosedTrades
          ? botDaemon.getJournalClosedTrades({ limit, offset, coin, isWin })
          : (botDaemon.state.closedTrades || []);
        const analytics = botDaemon.getJournalAnalytics ? botDaemon.getJournalAnalytics() : null;

        res.writeHead(200);
        res.end(
          JSON.stringify({
            success: true,
            closedTrades: closed,
            stats: analytics || botDaemon.state.stats,
          })
        );
        return;
      }

      if (reqPath === '/api/bot/journal/analytics' && req.method === 'GET') {
        const analytics = botDaemon.getJournalAnalytics ? botDaemon.getJournalAnalytics() : null;
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, analytics }));
        return;
      }

      if (reqPath === '/api/bot/sync-onchain' && req.method === 'POST') {
        const count = await botDaemon.syncOnChainHistory();
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, count, analytics: botDaemon.getJournalAnalytics() }));
        return;
      }

      if (reqPath === '/api/bot/user-fills' && req.method === 'GET') {
        const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const user = parsedUrl.searchParams.get('user') || botDaemon.config.walletAddress;
        const fills = await botDaemon.getUserFills(user);
        res.writeHead(200);
        res.end(
          JSON.stringify({
            success: true,
            fills,
          })
        );
        return;
      }

      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Endpoint de bot no encontrado' }));
      return;
    } catch (apiErr) {
      console.error('API Error:', apiErr);
      res.writeHead(500);
      res.end(JSON.stringify({ error: apiErr.message }));
      return;
    }
  }

  // ==========================================
  // 🌐 STATIC FILES SERVING (NEXT.JS /out)
  // ==========================================
  let staticSubPath = reqPath;
  if (staticSubPath.endsWith('/')) {
    staticSubPath += 'index.html';
  }

  let filePath = path.join(STATIC_DIR, staticSubPath);

  if (!path.extname(filePath)) {
    if (fs.existsSync(filePath + '.html')) {
      filePath += '.html';
    } else if (fs.existsSync(path.join(filePath, 'index.html'))) {
      filePath = path.join(filePath, 'index.html');
    }
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      const notFoundPath = path.join(STATIC_DIR, '404.html');
      const indexPath = path.join(STATIC_DIR, 'index.html');
      const fallbackPath = fs.existsSync(notFoundPath) ? notFoundPath : indexPath;

      fs.readFile(fallbackPath, (readErr, data) => {
        if (readErr) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(data);
        }
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    });

    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`🚀 HIK453 Terminal con Bot 24/7 corriendo en http://${HOST}:${PORT}`);
  if (HOST !== '127.0.0.1' && HOST !== 'localhost' && !API_TOKEN) {
    console.warn('⚠️  El servidor está expuesto fuera de localhost SIN BOT_API_TOKEN. Define BOT_API_TOKEN en .env.');
  }
});
