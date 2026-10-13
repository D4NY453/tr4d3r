const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT, 10) || 3001;
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
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const reqPath = decodeURI(req.url.split('?')[0]);

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
        let key = (body.agentPrivateKey || botDaemon.config.agentPrivateKey || '').trim().replace(/^['"]|['"]$/g, '');
        let wallet = (body.walletAddress || botDaemon.config.walletAddress || '').trim().replace(/^['"]|['"]$/g, '');

        if (key.startsWith('ditto_sk_') || key.startsWith('ditto_')) {
          key = key.replace(/\s+/g, '-');
        } else if (key && !key.startsWith('0x') && /^[0-9a-fA-F]{64}$/.test(key)) {
          key = '0x' + key;
        }
        if (wallet && !wallet.startsWith('0x') && /^[0-9a-fA-F]{40}$/.test(wallet)) {
          wallet = '0x' + wallet;
        }

        botDaemon.saveConfig({
          walletAddress: wallet,
          agentPrivateKey: key,
          capitalPerTrade: body.capitalPerTrade ? Number(body.capitalPerTrade) : botDaemon.config.capitalPerTrade,
          leverage: body.leverage ? Number(body.leverage) : botDaemon.config.leverage,
          allowedSymbols: Array.isArray(body.allowedSymbols) ? body.allowedSymbols : [],
          timeframe: '5m',
          maxConcurrentTrades: body.maxConcurrentTrades !== undefined ? Number(body.maxConcurrentTrades) : (botDaemon.config.maxConcurrentTrades || 5),
          instantProfitTake: body.instantProfitTake !== undefined ? Boolean(body.instantProfitTake) : (botDaemon.config.instantProfitTake ?? true),
          minInstantProfitUSD: body.minInstantProfitUSD !== undefined ? Number(body.minInstantProfitUSD) : (botDaemon.config.minInstantProfitUSD ?? 1.50),
          maxDrawdownPercent: body.maxDrawdownPercent !== undefined ? Number(body.maxDrawdownPercent) : (botDaemon.config.maxDrawdownPercent ?? 0.08),
          longOnly: body.longOnly !== undefined ? Boolean(body.longOnly) : (botDaemon.config.longOnly ?? true),
        });

        botDaemon.start();
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, message: 'Bot de Alta Convicción 24/7 activado [Solo Compras / Long Only] (Velas 5m, TP +$1.50 a +$2.50 netos)', status: botDaemon.getStatus() }));
        return;
      }

      if (reqPath === '/api/bot/stop' && req.method === 'POST') {
        botDaemon.stop();
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, message: 'Bot 24/7 pausado', status: botDaemon.getStatus() }));
        return;
      }

      if (reqPath === '/api/bot/config' && req.method === 'POST') {
        const body = await parseRequestBody(req);
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

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 HIK453 Terminal con Bot 24/7 corriendo en http://0.0.0.0:${PORT}`);
});
