import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  HttpTransport,
  InfoClient,
  ExchangeClient,
} from '@nktkas/hyperliquid';
import { privateKeyToAccount } from 'viem/accounts';
import { TradeJournalDB } from './trade-journal-db.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_PATH = path.join(__dirname, 'bot-config.json');
const STATE_PATH = path.join(__dirname, 'bot-state.json');

const DEFAULT_CONFIG = {
  isActive: false,
  walletAddress: '',
  agentPrivateKey: '',
  capitalPerTrade: 10, // $10 capital (con 10x apalancamiento = $100 nocional)
  leverage: 10,
  maxConcurrentTrades: 5, // Límite de trades simultáneos (configurable de 1 a 10)
  minRiskReward: 1.6, // Mínimo 1:1.6 de relación Riesgo/Beneficio
  allowedSymbols: [], // Empty = TOP Volumen Perps & Memes
  timeframe: '5m', // Velas de 5m
  scanIntervalSeconds: 10, // Escaneo cada 10 segundos
  minSignalScore: 60, // Convicción mínima (60/100)
  tp1Percent: 0.018, // +1.8% movimiento (+18% ROE = +$1.80 USD bruto)
  tp2Percent: 0.028, // +2.8% movimiento (+28% ROE = +$2.80 USD bruto)
  slPercent: 0.009, // -0.9% movimiento (-9% ROE = -$0.90 USD max pérdida)
  instantProfitTake: true, // Proteger y cerrar si alcanza el objetivo neto
  minInstantProfitUSD: 2.25, // AUDITORÍA DITTO: Mínimo +$2.25 USD netos (aplaza comisiones de $0.09)
  maxDrawdownPercent: 0.08, // 8% drawdown límite de seguridad (Circuit Breaker Kill-Switch)
  longOnly: false, // AUDITORÍA DITTO: Cortos tienen 78% winrate vs 0% en largos durante caídas
  requireMacroTrendConfirmation: true, // JERARQUÍA MTF: solo operar si el timeframe macro confirma
};

const MEME_REGEX = /PEPE|DOGE|SHIB|BONK|WIF|POPCAT|FART|TRUMP|PENGU|MOODENG|GOAT|BRETT|PURR|MELANIA|CHILL|PNUT|ACT|BOME|MEME|CAT|NEIRO|MOG|GIGA|SPX/i;

/**
 * Jerarquía de Tendencias Multitemporal (MTF):
 * 1. Gráfico Diario (1D): Solo se permiten operaciones si respeta la tendencia macro del Gráfico Semanal (1W).
 * 2. Gráfico de 4H / 1H: Solo se permiten operaciones si respeta la tendencia del Gráfico Diario (1D).
 * 3. Gráfico de 15m / 30m: Solo se permiten operaciones si respeta la tendencia del Gráfico de 4H.
 * 4. Gráfico de 1m / 5m (ejecución rápida / scalping): Solo se permiten entradas si respeta la tendencia del Gráfico de 15m - 30m.
 */
export function getMacroTimeframe(baseTf) {
  switch (baseTf) {
    case '1m':
    case '5m':
      return '15m'; // Nivel 4: Scalping 1m/5m respeta 15m
    case '15m':
    case '30m':
      return '4h';  // Nivel 3: 15m/30m respeta 4h
    case '1h':
    case '4h':
      return '1d';  // Nivel 2: 1h/4h respeta 1d
    case '1d':
    case '1D':
      return '1w';  // Nivel 1: 1D respeta 1w
    default:
      return '15m';
  }
}

// Technical indicator math functions
function calculateEMA(closes, period) {
  if (closes.length < period) return [];
  const k = 2 / (period + 1);
  const result = [];
  let sum = 0;
  for (let i = 0; i < period; i++) sum += closes[i];
  let prevEMA = sum / period;
  result.push(prevEMA);
  for (let i = period; i < closes.length; i++) {
    const cur = (closes[i] - prevEMA) * k + prevEMA;
    result.push(cur);
    prevEMA = cur;
  }
  return result;
}

function calculateRSI(closes, period = 14) {
  if (closes.length <= period) return [];
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  const result = [];
  const firstRS = avgLoss === 0 ? 100 : avgGain / avgLoss;
  result.push(100 - 100 / (1 + firstRS));

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const curGain = diff >= 0 ? diff : 0;
    const curLoss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + curGain) / period;
    avgLoss = (avgLoss * (period - 1) + curLoss) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push(100 - 100 / (1 + rs));
  }
  return result;
}

function calculateATR(highs, lows, closes, period = 14) {
  if (closes.length <= period) return [];
  const trs = [];
  for (let i = 1; i < closes.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trs.push(tr);
  }
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const result = [atr];
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
    result.push(atr);
  }
  return result;
}

function calculateBollingerBands(closes, period = 20, multiplier = 2) {
  if (closes.length < period) return [];
  const result = [];
  for (let i = period - 1; i < closes.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    result.push({
      upper: mean + stdDev * multiplier,
      middle: mean,
      lower: mean - stdDev * multiplier,
    });
  }
  return result;
}

// Oscilador Estocástico (%K, %D)
function calculateStochastic(highs, lows, closes, periodK = 14, smoothK = 3, periodD = 3) {
  if (closes.length < periodK) {
    return { currentK: 50, currentD: 50, prevK: 50, prevD: 50 };
  }
  const rawK = [];
  for (let i = periodK - 1; i < closes.length; i++) {
    const highSlice = highs.slice(i - periodK + 1, i + 1);
    const lowSlice = lows.slice(i - periodK + 1, i + 1);
    const highestHigh = Math.max(...highSlice);
    const lowestLow = Math.min(...lowSlice);
    const range = highestHigh - lowestLow;
    const currentClose = closes[i];
    const val = range === 0 ? 50 : ((currentClose - lowestLow) / range) * 100;
    rawK.push(Math.max(0, Math.min(100, val)));
  }

  // Smooth %K (Slow Stochastic)
  const smoothedK = [];
  for (let i = smoothK - 1; i < rawK.length; i++) {
    const slice = rawK.slice(i - smoothK + 1, i + 1);
    const avg = slice.reduce((a, b) => a + b, 0) / smoothK;
    smoothedK.push(avg);
  }

  // %D (SMA de %K)
  const d = [];
  for (let i = periodD - 1; i < smoothedK.length; i++) {
    const slice = smoothedK.slice(i - periodD + 1, i + 1);
    const avg = slice.reduce((a, b) => a + b, 0) / periodD;
    d.push(avg);
  }

  const currentK = smoothedK.length > 0 ? smoothedK[smoothedK.length - 1] : 50;
  const currentD = d.length > 0 ? d[d.length - 1] : 50;
  const prevK = smoothedK.length > 1 ? smoothedK[smoothedK.length - 2] : currentK;
  const prevD = d.length > 1 ? d[d.length - 2] : currentD;

  return {
    k: smoothedK,
    d,
    currentK,
    currentD,
    prevK,
    prevD,
  };
}

export class ServerBotDaemon {
  constructor() {
    this.config = this.loadConfig();
    this.state = this.loadState();
    this.transport = new HttpTransport({ timeout: 25000 });
    this.infoClient = new InfoClient({ transport: this.transport });
    this.cachedMeta = null;
    this.metaTimestamp = 0;
    this.isCycleRunning = false;
    this.loopTimer = null;
    this.fastMonitorTimer = null;
    this.isFastMonitorRunning = false;
    this.closingCoins = new Set();
    this.macroTrendCache = new Map(); // Cache en memoria TTL 60s para evitar 429 en llamadas macro

    this.addLog('SYSTEM', '🚀 Servidor Scalper 24/7 inicializado (Perps, Memes y Predictions en 1m a 5m con Cierre Inmediato en Verde cada 1.5s).');
    this.reconstructTradesFromLogs();

    // Fase 1: Inicializar Diario de Trading SQLite con WAL mode y migrar trades existentes
    try {
      this.journalDb = new TradeJournalDB();
      this.journalDb.migrateFromStateFile(STATE_PATH);
      // Sincronizar automáticamente la historia on-chain completa
      setTimeout(() => this.syncOnChainHistory(), 1500);
    } catch (err) {
      console.warn('[ServerBotDaemon] TradeJournalDB initialization fallback:', err.message);
      this.journalDb = null;
    }

    // Auto-resume if isActive was saved as true
    if (this.config.isActive && this.config.agentPrivateKey) {
      this.start();
    }
  }

  loadConfig() {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        // Enforce 5m timeframe for high-conviction signals
        parsed.timeframe = '5m';
        parsed.scanIntervalSeconds = 12;
        parsed.capitalPerTrade = 10;
        parsed.maxConcurrentTrades = parsed.maxConcurrentTrades ? Math.max(1, Math.min(10, Number(parsed.maxConcurrentTrades))) : 5;
        parsed.minRiskReward = 1.6;
        parsed.tp1Percent = 0.016;
        parsed.tp2Percent = 0.026;
        parsed.slPercent = 0.009;
        parsed.minInstantProfitUSD = Math.max(1.50, parsed.minInstantProfitUSD || 1.50);
        parsed.maxDrawdownPercent = parsed.maxDrawdownPercent ? Number(parsed.maxDrawdownPercent) : 0.08;
        parsed.longOnly = parsed.longOnly !== undefined ? Boolean(parsed.longOnly) : true;
        parsed.requireMacroTrendConfirmation = parsed.requireMacroTrendConfirmation !== false;
        // Set allowedSymbols to [] if it was restricted to the 4 coins
        if (
          Array.isArray(parsed.allowedSymbols) &&
          parsed.allowedSymbols.length === 4 &&
          parsed.allowedSymbols.includes('BTC-PERP') &&
          parsed.allowedSymbols.includes('HYPE-PERP')
        ) {
          parsed.allowedSymbols = [];
        }
        return { ...DEFAULT_CONFIG, ...parsed };
      }
    } catch (e) {
      console.warn('Error reading bot config:', e);
    }
    return { ...DEFAULT_CONFIG };
  }

  saveConfig(newConfig) {
    if (newConfig.agentPrivateKey) {
      let k = newConfig.agentPrivateKey.trim().replace(/^['"]|['"]$/g, '');
      if (k && !k.startsWith('0x') && /^[0-9a-fA-F]{64}$/.test(k)) {
        k = '0x' + k;
      }
      newConfig.agentPrivateKey = k;
      try {
        const acc = privateKeyToAccount(k);
        if (!newConfig.walletAddress && !this.config.walletAddress) {
          newConfig.walletAddress = acc.address;
        }
      } catch (e) {}
    }
    if (newConfig.walletAddress) {
      let w = newConfig.walletAddress.trim().replace(/^['"]|['"]$/g, '');
      if (w && !w.startsWith('0x') && /^[0-9a-fA-F]{40}$/.test(w)) {
        w = '0x' + w;
      }
      newConfig.walletAddress = w;
    }
    this.config = { ...this.config, ...newConfig };
    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2), 'utf8');
    } catch (e) {
      console.error('Error saving bot config:', e);
    }
  }

  loadState() {
    try {
      if (fs.existsSync(STATE_PATH)) {
        const raw = fs.readFileSync(STATE_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed.closedTrades)) {
          parsed.closedTrades = [];
        }
        if (!parsed.sessionStartBalanceUSD) parsed.sessionStartBalanceUSD = 0;
        if (!parsed.currentBalanceUSD) parsed.currentBalanceUSD = 0;
        if (parsed.circuitBreakerTriggered === undefined) parsed.circuitBreakerTriggered = false;
        return parsed;
      }
    } catch (e) {
      console.warn('Error reading bot state:', e);
    }
    return {
      positions: [],
      stats: {
        totalTrades: 0,
        totalVolumeUSD: 0,
        winningTrades: 0,
        losingTrades: 0,
        totalProfitUSD: 0,
      },
      logs: [],
      closedTrades: [],
      sessionStartBalanceUSD: 0,
      currentBalanceUSD: 0,
      circuitBreakerTriggered: false,
    };
  }

  saveState() {
    try {
      fs.writeFileSync(STATE_PATH, JSON.stringify(this.state, null, 2), 'utf8');
    } catch (e) {
      console.error('Error saving bot state:', e);
    }
  }

  addLog(type, message, details = null) {
    const entry = {
      id: `srv-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: Date.now(),
      type,
      message,
      details,
    };
    this.state.logs = [entry, ...(this.state.logs || [])].slice(0, 100);
    console.log(`[BOT 24/7][${type}] ${message}`);
    this.saveState();
  }

  recordClosedTrade(trade) {
    if (!Array.isArray(this.state.closedTrades)) {
      this.state.closedTrades = [];
    }
    const fullTrade = {
      ...trade,
      ...(trade.telemetry || {}),
    };
    this.state.closedTrades = [fullTrade, ...this.state.closedTrades].slice(0, 300);
    this.saveState();

    // Guardar en la base de datos persistente SQLite con telemetría completa
    if (this.journalDb) {
      try {
        this.journalDb.insertTrade(fullTrade);
      } catch (err) {
        console.warn('[ServerBotDaemon] Error guardando trade en SQLite:', err.message);
      }
    }
  }

  getJournalClosedTrades(opts = {}) {
    if (this.journalDb) {
      try {
        const dbTrades = this.journalDb.getClosedTrades(opts);
        if (dbTrades && dbTrades.length > 0) return dbTrades;
      } catch (err) {
        console.warn('[ServerBotDaemon] Error consultando SQLite:', err.message);
      }
    }
    return this.state.closedTrades || [];
  }

  getJournalAnalytics() {
    if (this.journalDb) {
      try {
        return this.journalDb.getAnalytics();
      } catch (err) {
        console.warn('[ServerBotDaemon] Error consultando analíticas en SQLite:', err.message);
      }
    }
    return null;
  }

  async syncOnChainHistory() {
    if (!this.journalDb) return 0;
    const wallet = this.config.walletAddress;
    if (!wallet || !wallet.startsWith('0x')) return 0;
    try {
      const fills = await this.infoClient.userFills({ user: wallet });
      if (Array.isArray(fills) && fills.length > 0) {
        let totalVol = 0;
        for (const f of fills) {
          const px = parseFloat(f.px || '0');
          const sz = parseFloat(f.sz || '0');
          totalVol += px * sz;
        }
        if (totalVol > 0) {
          this.state.stats.totalVolumeUSD = Math.round(totalVol);
          this.saveState();
        }
        const count = this.journalDb.importOnChainFills(fills);
        if (count > 0) {
          this.addLog('SYSTEM', `📦 Sincronizados ${count} trades on-chain en SQLite (Volumen acumulado: $${Math.round(totalVol).toLocaleString()} USD).`);
        }
        return count;
      }
    } catch (err) {
      console.warn('[ServerBotDaemon] Fallo al sincronizar fills on-chain a SQLite:', err.message);
    }
    return 0;
  }

  reconstructTradesFromLogs() {
    if (Array.isArray(this.state.closedTrades) && this.state.closedTrades.length > 0) {
      return;
    }
    const reconstructed = [];
    const logs = this.state.logs || [];

    for (const l of logs) {
      if (l.type === 'TP1_HIT') {
        const m = l.message.match(/\[TAKE PROFIT 1 SCALP\] (\w+) alcanzó \$([0-9.]+).*?TP1: \$([0-9.]+).*?Break-Even \(\$([0-9.]+)\)/i);
        if (m) {
          const coin = m[1];
          const exitPrice = parseFloat(m[2]);
          const entryPrice = parseFloat(m[4]);
          const pnlPct = entryPrice > 0 ? ((Math.abs(exitPrice - entryPrice) / entryPrice) * (this.config.leverage || 10) * 100) : 1.2;
          const pnlUSD = ((this.config.capitalPerTrade || 10) * 0.5 * pnlPct) / 100;
          reconstructed.push({
            id: `rec-${l.timestamp}-${coin}-tp1`,
            coin,
            symbol: `${coin}-PERP`,
            side: 'BUY',
            entryPrice,
            exitPrice,
            size: 1,
            notionalUSD: (this.config.capitalPerTrade || 10) * (this.config.leverage || 10),
            pnlUSD: Number(pnlUSD.toFixed(4)),
            pnlPercent: Number(pnlPct.toFixed(2)),
            exitReason: '🎯 TP1 TOCADO (50% asegurado)',
            entryTime: l.timestamp - 35000,
            exitTime: l.timestamp,
            durationSeconds: 35,
            isWin: true,
            executionVenue: this.isDittoKey() ? 'DITTO_NETWORK' : 'HYPERLIQUID',
          });
        }
      } else if (l.type === 'TP2_HIT') {
        const m = l.message.match(/\[TAKE PROFIT 2 SCALP\] (\w+) alcanzó \$([0-9.]+).*?TP2: \$([0-9.]+)/i);
        if (m) {
          const coin = m[1];
          const exitPrice = parseFloat(m[2]);
          const pnlPct = 2.5 * (this.config.leverage || 10);
          const pnlUSD = ((this.config.capitalPerTrade || 10) * pnlPct) / 100;
          reconstructed.push({
            id: `rec-${l.timestamp}-${coin}-tp2`,
            coin,
            symbol: `${coin}-PERP`,
            side: 'BUY',
            entryPrice: exitPrice * 0.995,
            exitPrice,
            size: 1,
            notionalUSD: (this.config.capitalPerTrade || 10) * (this.config.leverage || 10),
            pnlUSD: Number(pnlUSD.toFixed(4)),
            pnlPercent: Number(pnlPct.toFixed(2)),
            exitReason: '🚀 TP2 TOCADO (100% Ganancia)',
            entryTime: l.timestamp - 50000,
            exitTime: l.timestamp,
            durationSeconds: 50,
            isWin: true,
            executionVenue: this.isDittoKey() ? 'DITTO_NETWORK' : 'HYPERLIQUID',
          });
        }
      } else if (l.type === 'SL_HIT') {
        const m = l.message.match(/\[STOP LOSS SCALP\] (\w+) alcanzó \$([0-9.]+).*?SL: \$([0-9.]+)/i);
        if (m) {
          const coin = m[1];
          const exitPrice = parseFloat(m[2]);
          const slPrice = parseFloat(m[3]);
          const pnlPct = -1.0 * (this.config.leverage || 10);
          const pnlUSD = ((this.config.capitalPerTrade || 10) * pnlPct) / 100;
          reconstructed.push({
            id: `rec-${l.timestamp}-${coin}-sl`,
            coin,
            symbol: `${coin}-PERP`,
            side: 'BUY',
            entryPrice: slPrice * 1.005,
            exitPrice,
            size: 1,
            notionalUSD: (this.config.capitalPerTrade || 10) * (this.config.leverage || 10),
            pnlUSD: Number(pnlUSD.toFixed(4)),
            pnlPercent: Number(pnlPct.toFixed(2)),
            exitReason: '🛑 STOP LOSS (Corte rápido)',
            entryTime: l.timestamp - 25000,
            exitTime: l.timestamp,
            durationSeconds: 25,
            isWin: false,
            executionVenue: this.isDittoKey() ? 'DITTO_NETWORK' : 'HYPERLIQUID',
          });
        }
      }
    }

    if (reconstructed.length > 0) {
      this.state.closedTrades = reconstructed;
      this.saveState();
    }
  }

  async getUserFills(walletAddress) {
    const user = walletAddress || this.config.walletAddress;
    if (!user || !user.startsWith('0x')) return [];
    try {
      const fills = await this.infoClient.userFills({ user: user });
      return Array.isArray(fills) ? fills : [];
    } catch (e) {
      console.warn('Error fetching userFills:', e.message);
      return [];
    }
  }

  async getMeta() {
    const now = Date.now();
    if (this.cachedMeta && now - this.metaTimestamp < 60000) {
      return this.cachedMeta;
    }
    try {
      const meta = await this.infoClient.meta();
      this.cachedMeta = meta;
      this.metaTimestamp = now;
      return meta;
    } catch (e) {
      return this.cachedMeta || { universe: [] };
    }
  }

  isDittoKey() {
    const k = (this.config.agentPrivateKey || '').trim();
    return k.startsWith('ditto_sk_') || k.startsWith('ditto_');
  }

  isHyperliquidKey() {
    const k = (this.config.agentPrivateKey || '').trim();
    return k.startsWith('0x') || /^[0-9a-fA-F]{64}$/.test(k);
  }

  async executeDittoOrder({ coin, isBuy, sizeUsd, leverage, stopLoss, takeProfit1 }) {
    const cleanCoin = coin.replace(/(-PERP|USDT|\/USD)$/i, '').toUpperCase();
    const payload = {
      venue: 'hyperliquid',
      asset: cleanCoin,
      side: isBuy ? 'buy' : 'sell',
      sizeUsd: Math.max(10, Math.round(sizeUsd)),
      leverage: leverage || this.config.leverage || 10,
      marginMode: 'cross',
      orderType: 'market',
      ...(takeProfit1 ? { tpPrice: Number(takeProfit1.toFixed(5)) } : {}),
      ...(stopLoss ? { slPrice: Number(stopLoss.toFixed(5)) } : {}),
    };
    const res = await fetch('https://app.dittonetwork.io/execution/order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.config.agentPrivateKey.trim(),
      },
      body: JSON.stringify(payload),
    });
    return await res.json();
  }

  async closeDittoPosition(coin, fraction = 1.0) {
    const cleanCoin = coin.replace(/(-PERP|USDT|\/USD)$/i, '').toUpperCase();
    const res = await fetch('https://app.dittonetwork.io/execution/agent/close', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.config.agentPrivateKey.trim(),
      },
      body: JSON.stringify({
        asset: cleanCoin,
        fraction: fraction,
      }),
    });
    return await res.json();
  }

  async getDittoPortfolio() {
    try {
      const res = await fetch('https://app.dittonetwork.io/execution/agent/portfolio', {
        headers: {
          'X-API-Key': this.config.agentPrivateKey.trim(),
        },
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      // quiet
    }
    return null;
  }

  getExchangeClient() {
    let key = (this.config.agentPrivateKey || '').trim().replace(/^['"]|['"]$/g, '');
    if (key && !key.startsWith('0x') && /^[0-9a-fA-F]{64}$/.test(key)) {
      key = '0x' + key;
      this.config.agentPrivateKey = key;
    }
    if (!key || !key.startsWith('0x')) {
      return null;
    }
    try {
      const account = privateKeyToAccount(key);
      if (!this.config.walletAddress || !this.config.walletAddress.startsWith('0x')) {
        this.config.walletAddress = account.address;
      }
      return new ExchangeClient({ transport: this.transport, wallet: account });
    } catch (e) {
      this.addLog('ERROR', `Error al crear cliente de Exchange con clave de agente: ${e.message}`);
      return null;
    }
  }

  async getAccountNetWorth() {
    if (this.isDittoKey()) {
      try {
        const port = await this.getDittoPortfolio();
        if (port) {
          const nw = parseFloat(port.netWorthUsd || port.totalUsd || port.spotUsdcBalanceUsd || '0');
          if (nw > 0) return nw;
        }
      } catch (_) {}
    } else if (this.config.walletAddress && this.config.walletAddress.startsWith('0x')) {
      try {
        const ch = await this.infoClient.clearinghouseState({ user: this.config.walletAddress });
        const val = parseFloat(ch?.crossMarginSummary?.accountValue || ch?.marginSummary?.accountValue || '0');
        if (val > 0) return val;
      } catch (_) {}
    }
    return 0;
  }

  async checkCircuitBreaker(currentNetWorth) {
    if (!this.config.isActive) return false;
    const maxDrawdownPct = this.config.maxDrawdownPercent || 0.08; // 8% límite de pérdida máxima
    const baseline = this.state.sessionStartBalanceUSD || 0;

    if (baseline > 0 && currentNetWorth > 0) {
      this.state.currentBalanceUSD = currentNetWorth;
      const lossUSD = baseline - currentNetWorth;
      const lossPct = lossUSD / baseline;

      if (lossPct >= maxDrawdownPct) {
        this.state.circuitBreakerTriggered = true;
        this.addLog(
          'CIRCUIT_BREAKER',
          `🚨 [KILL-SWITCH ACTIVADO] La pérdida del balance alcanzó ${(lossPct * 100).toFixed(2)}% (-$${lossUSD.toFixed(2)} USD sobre balance inicial de $${baseline.toFixed(2)} USD). Superó el límite de seguridad del ${(maxDrawdownPct * 100).toFixed(0)}%. EL BOT SE HA PAUSADO AUTOMÁTICAMENTE para proteger el 92% de tu capital.`
        );
        this.stop();
        this.saveState();
        return true;
      }
    }
    return false;
  }

  async start() {
    this.saveConfig({ isActive: true });
    this.state.circuitBreakerTriggered = false;

    // Establecer balance de referencia inicial para el Circuit Breaker (-8%)
    try {
      const netWorth = await this.getAccountNetWorth();
      if (netWorth > 0) {
        this.state.sessionStartBalanceUSD = netWorth;
        this.state.currentBalanceUSD = netWorth;
        this.saveState();
        const maxLoss = netWorth * (this.config.maxDrawdownPercent || 0.08);
        const stopFloor = netWorth - maxLoss;
        this.addLog(
          'SECURITY',
          `🛡️ [PROTECCIÓN DRAWDOWN 8% ACTIVA] Balance inicial: $${netWorth.toFixed(2)} USD. Pérdida máx tolerada: -$${maxLoss.toFixed(2)} USD (8%). Si el balance cae a $${stopFloor.toFixed(2)} USD, el bot se pausará de inmediato.`
        );
      }
    } catch (e) {
      console.warn('Error fetching balance baseline for circuit breaker:', e.message);
    }

    if (this.loopTimer) clearInterval(this.loopTimer);
    if (this.fastMonitorTimer) clearInterval(this.fastMonitorTimer);

    const intervalMs = Math.max(4, this.config.scanIntervalSeconds || 12) * 1000;
    this.loopTimer = setInterval(() => this.runCycle(), intervalMs);

    // Bucle ultra-rápido de supervisión y toma de ganancias cada 1.5s
    this.fastMonitorTimer = setInterval(() => this.runFastPositionMonitor(), 1500);

    const minP = this.config.minInstantProfitUSD ?? 1.50;
    const scope = !this.config.allowedSymbols || this.config.allowedSymbols.length === 0 || this.config.allowedSymbols.includes('ALL')
      ? 'TODOS los Perps y Memes'
      : this.config.allowedSymbols.join(', ');
    const modeStr = this.config.longOnly !== false ? ' [MODO SOLO COMPRAS / LONG ONLY]' : '';
    this.addLog(
      'STATUS',
      `🟢 Bot 24/7 ACTIVADO${modeStr}. Escaneando ${scope} en velas de 5m cada ${intervalMs / 1000}s. Monitoreo cada 1.5s con objetivo +$${minP} USD netos y Circuit Breaker (-8% de balance).`
    );
    setTimeout(() => this.runFastPositionMonitor(), 500);
    setTimeout(() => this.runCycle(), 1200);
  }

  stop() {
    this.saveConfig({ isActive: false });
    if (this.loopTimer) {
      clearInterval(this.loopTimer);
      this.loopTimer = null;
    }
    if (this.fastMonitorTimer) {
      clearInterval(this.fastMonitorTimer);
      this.fastMonitorTimer = null;
    }
    this.addLog('STATUS', '⏸️ Bot 24/7 PAUSADO por el usuario.');
  }

  async closeAllPositions() {
    if (this.isDittoKey()) {
      const results = [];
      for (const p of [...this.state.positions]) {
        try {
          const res = await this.closeDittoPosition(p.coin, 1.0);
          results.push({ coin: p.coin, res });
          this.addLog('CLOSE', `🚨 [CIERRE TOTAL DITTO] Posición en ${p.coin} cerrada a mercado`);
        } catch (err) {
          this.addLog('ERROR', `Fallo al cerrar ${p.coin} en Ditto: ${err.message}`);
        }
      }
      this.state.positions = [];
      this.saveState();
      return results;
    }

    const exClient = this.getExchangeClient();
    if (!exClient) {
      throw new Error('Clave de agente no configurada');
    }
    if (!this.config.walletAddress) {
      throw new Error('Dirección de billetera no configurada');
    }

    const state = await this.infoClient.clearinghouseState({ user: this.config.walletAddress });
    const meta = await this.getMeta();
    const results = [];

    if (state?.assetPositions) {
      for (const item of state.assetPositions) {
        const p = item.position;
        const szi = parseFloat(p?.szi || '0');
        if (szi === 0) continue;

        const coin = p.coin;
        const assetIndex = meta.universe.findIndex((u) => u.name === coin);
        if (assetIndex === -1) continue;

        const isLong = szi > 0;
        const closeBuy = !isLong;
        const sz = Math.abs(szi);
        const universeItem = meta.universe[assetIndex];
        const formattedSz = Number(sz.toFixed(universeItem.szDecimals ?? 4));

        const assetCtxs = await this.infoClient.metaAndAssetCtxs();
        const ctx = assetCtxs[1]?.[assetIndex];
        const mid = parseFloat(ctx?.midPx || ctx?.markPx || '0');
        const slippage = 0.02;
        const execPx = closeBuy ? mid * (1 + slippage) : mid * (1 - slippage);

        const formattedPx = execPx > 1000 ? execPx.toFixed(1) : execPx > 10 ? execPx.toFixed(2) : execPx.toFixed(4);

        try {
          const res = await exClient.order({
            orders: [
              {
                a: assetIndex,
                b: closeBuy,
                p: formattedPx,
                s: formattedSz.toString(),
                r: true,
                t: { limit: { tif: 'Ioc' } },
              },
            ],
            grouping: 'na',
          });
          results.push({ coin, res });
          this.addLog('CLOSE', `🚨 [CIERRE TOTAL] Posición en ${coin} cerrada a mercado ($${mid})`);
        } catch (err) {
          this.addLog('ERROR', `Fallo al cerrar ${coin}: ${err.message}`);
        }
      }
    }

    this.state.positions = [];
    this.saveState();
    return results;
  }

  /**
   * Bucle ultra-rápido de supervisión ejecutado cada 1.5 segundos.
   * REGLA DEL USUARIO:
   * 1. Si en CUALQUIER SEGUNDO una operación está en positiva (PnL >= +0.03 USD o más),
   *    se ejecuta automáticamente el cierre a mercado al instante para tomar ganancias.
   * 2. Si en ningún momento está en positivo, NO se cierra y se mantiene hasta tocar su Stop Loss.
   */
  async runFastPositionMonitor() {
    if (!this.config.isActive) return;
    if (this.isFastMonitorRunning) return;

    const isDitto = this.isDittoKey();
    const isHl = this.isHyperliquidKey();
    if (!isDitto && !isHl) return;

    this.isFastMonitorRunning = true;
    try {
      // 0. VERIFICAR PROTECCIÓN DE DRAWDOWN MÁXIMO (-8% DEL BALANCE)
      const currentNetWorth = await this.getAccountNetWorth();
      if (currentNetWorth > 0) {
        const tripped = await this.checkCircuitBreaker(currentNetWorth);
        if (tripped) {
          this.isFastMonitorRunning = false;
          return;
        }
      }

      const wallet = this.config.walletAddress;
      if (!wallet || !wallet.startsWith('0x')) return;

      const chState = await this.infoClient.clearinghouseState({ user: wallet });
      if (!chState?.assetPositions) return;

      const activePositions = chState.assetPositions
        .map((a) => a.position)
        .filter((p) => p && parseFloat(p.szi || '0') !== 0);

      if (activePositions.length === 0) {
        if (this.state.positions.length > 0) {
          this.state.positions = [];
          this.saveState();
        }
        return;
      }

      // Reconciliación estricta: limpiar posiciones fantasma que ya cerraron on-chain
      const activeCoins = new Set(activePositions.map((p) => p.coin));
      if (this.state.positions.length > 0) {
        const remaining = this.state.positions.filter((p) => activeCoins.has(p.coin));
        if (remaining.length !== this.state.positions.length) {
          this.state.positions = remaining;
          this.saveState();
        }
      }

      const meta = await this.getMeta();
      let exClient = null;
      if (isHl) {
        exClient = this.getExchangeClient();
      }

      const minProfit = this.config.minInstantProfitUSD ?? 0.03;
      const isInstantProfitEnabled = this.config.instantProfitTake ?? true;

      for (const pos of activePositions) {
        const coin = pos.coin;
        const szi = parseFloat(pos.szi || '0');
        if (szi === 0) continue;
        if (this.closingCoins.has(coin)) continue; // Protección contra doble ejecución en el mismo segundo

        const upnl = parseFloat(pos.unrealizedPnl || '0');
        const entryPx = parseFloat(pos.entryPx || '0');
        const isLong = szi > 0;
        const sz = Math.abs(szi);
        const roe = parseFloat(pos.returnOnEquity || '0') * 100;

        // Auto-registro en memoria si la posición fue abierta externamente
        let tracked = this.state.positions.find((p) => p.coin === coin);
        if (!tracked) {
          const slDistance = entryPx * 0.009; // 0.9% SL de protección
          const tp1Distance = entryPx * 0.016; // +1.6% TP1 (+16% ROE = +$1.60 USD bruto, ~+$1.50 neto)
          const tp2Distance = entryPx * 0.026; // +2.6% TP2 (+26% ROE = +$2.60 USD bruto, ~+$2.50 neto)
          tracked = {
            coin,
            side: isLong ? 'BUY' : 'SELL',
            entryPrice: entryPx,
            currentPrice: entryPx,
            stopLoss: isLong ? entryPx - slDistance : entryPx + slDistance,
            takeProfit1: isLong ? entryPx + tp1Distance : entryPx - tp1Distance,
            takeProfit2: isLong ? entryPx + tp2Distance : entryPx - tp2Distance,
            sz,
            initialSz: sz,
            capitalUSD: this.config.capitalPerTrade,
            leverage: pos.leverage?.value || this.config.leverage || 10,
            isTP1Hit: false,
            entryTime: Date.now() - 20000,
          };
          this.state.positions.push(tracked);
          this.saveState();
        }

        // Obtener precio Mark actual
        const assetIndex = meta.universe.findIndex((u) => u.name === coin);
        let currentPrice = entryPx;
        if (assetIndex !== -1) {
          try {
            const assetCtxs = await this.infoClient.metaAndAssetCtxs();
            const ctx = assetCtxs[1]?.[assetIndex];
            const p = parseFloat(ctx?.markPx || ctx?.midPx || '0');
            if (p > 0) currentPrice = p;
          } catch (_) {}
        }
        tracked.currentPrice = currentPrice;

        // -------------------------------------------------------------
        // REGLA: TOMA DE GANANCIAS REALES (Mínimo +$1.50 a +$2.50 USD Netos)
        // NUNCA cierra por céntimos. Solo ejecuta salida si la ganancia cubre comisiones y deja +$1.50+ netos
        // -------------------------------------------------------------
        const minNetProfitTarget = Math.max(1.80, this.config.minInstantProfitUSD ?? 2.25);
        if (isInstantProfitEnabled && upnl >= minNetProfitTarget) {
          this.closingCoins.add(coin);
          this.addLog(
            'INSTANT_PROFIT',
            `🎯 [OBJETIVO ALCANZADO] ${coin} alcanzó +$${upnl.toFixed(2)} USD netos (${roe.toFixed(2)}% ROE >= +$${minNetProfitTarget}). Ganancia asegurada!`
          );

          try {
            if (isDitto) {
              await this.closeDittoPosition(coin, 1.0);
            } else if (exClient && assetIndex !== -1) {
              await this.closePositionPart(exClient, meta, assetIndex, coin, !isLong, sz, currentPrice);
            }

            this.state.stats.totalTrades++;
            this.state.stats.winningTrades++;
            this.state.stats.totalProfitUSD += upnl;

            this.recordClosedTrade({
              id: `ct-${Date.now()}-${coin}-quick-${Math.random().toString(36).substr(2, 4)}`,
              coin,
              symbol: `${coin}-PERP`,
              side: isLong ? 'BUY' : 'SELL',
              entryPrice: entryPx,
              exitPrice: currentPrice,
              stopLoss: tracked.stopLoss,
              takeProfit1: tracked.takeProfit1,
              takeProfit2: tracked.takeProfit2,
              sz,
              capitalUSD: tracked.capitalUSD || this.config.capitalPerTrade,
              leverage: tracked.leverage || this.config.leverage,
              pnlUSD: Number(upnl.toFixed(4)),
              pnlPercent: Number(roe.toFixed(2)),
              exitReason: `⚡ Toma Rápida en Verde (+$${upnl.toFixed(3)} USD)`,
              entryTime: tracked.entryTime || (Date.now() - 30000),
              exitTime: Date.now(),
              durationSeconds: Math.max(1, Math.round((Date.now() - (tracked.entryTime || Date.now() - 30000)) / 1000)),
              isWin: true,
              executionVenue: isDitto ? 'DITTO_NETWORK' : 'HYPERLIQUID_DEX',
              telemetry: tracked.telemetry || null,
            });

            this.state.positions = this.state.positions.filter((p) => p.coin !== coin);
            this.saveState();
          } catch (err) {
            this.addLog('ERROR', `Fallo al cerrar ${coin} en ganancia: ${err.message}`);
          } finally {
            setTimeout(() => this.closingCoins.delete(coin), 3000);
          }
          continue;
        }

        // -------------------------------------------------------------
        // REGLA 2: SI NUNCA ESTÁ EN POSITIVO, AGUANTAR HASTA STOP LOSS
        // -------------------------------------------------------------
        const isSLHit = isLong ? currentPrice <= tracked.stopLoss : currentPrice >= tracked.stopLoss;
        if (isSLHit) {
          this.closingCoins.add(coin);
          this.addLog(
            'SL_HIT',
            `🛑 [STOP LOSS SCALP] ${coin} tocó SL: $${tracked.stopLoss} (Precio: $${currentPrice}). Cortando pérdida...`
          );

          try {
            if (isDitto) {
              await this.closeDittoPosition(coin, 1.0);
            } else if (exClient && assetIndex !== -1) {
              await this.closePositionPart(exClient, meta, assetIndex, coin, !isLong, sz, currentPrice);
            }

            const lossUSD = Math.abs(upnl) > 0 ? Math.abs(upnl) : (tracked.capitalUSD || this.config.capitalPerTrade) * (Math.abs(currentPrice - entryPx) / entryPx) * (tracked.leverage || 10);
            this.state.stats.totalTrades++;
            this.state.stats.losingTrades++;
            this.state.stats.totalProfitUSD -= lossUSD;

            this.recordClosedTrade({
              id: `ct-${Date.now()}-${coin}-sl-${Math.random().toString(36).substr(2, 4)}`,
              coin,
              symbol: `${coin}-PERP`,
              side: isLong ? 'BUY' : 'SELL',
              entryPrice: entryPx,
              exitPrice: currentPrice,
              stopLoss: tracked.stopLoss,
              takeProfit1: tracked.takeProfit1,
              takeProfit2: tracked.takeProfit2,
              sz,
              capitalUSD: tracked.capitalUSD || this.config.capitalPerTrade,
              leverage: tracked.leverage || this.config.leverage,
              pnlUSD: -Number(lossUSD.toFixed(4)),
              pnlPercent: Number(roe.toFixed(2)),
              exitReason: '🛑 STOP LOSS (Corte rápido)',
              entryTime: tracked.entryTime || (Date.now() - 30000),
              exitTime: Date.now(),
              durationSeconds: Math.max(1, Math.round((Date.now() - (tracked.entryTime || Date.now() - 30000)) / 1000)),
              isWin: false,
              executionVenue: isDitto ? 'DITTO_NETWORK' : 'HYPERLIQUID_DEX',
              telemetry: tracked.telemetry || null,
            });

            this.state.positions = this.state.positions.filter((p) => p.coin !== coin);
            this.saveState();
          } catch (err) {
            this.addLog('ERROR', `Fallo al ejecutar SL en ${coin}: ${err.message}`);
          } finally {
            setTimeout(() => this.closingCoins.delete(coin), 3000);
          }
          continue;
        }
      }
    } catch (err) {
      console.warn('Warning in runFastPositionMonitor:', err.message);
    } finally {
      this.isFastMonitorRunning = false;
    }
  }

  /**
   * Consulta y evalúa la tendencia del timeframe macro superior jerárquico.
   * Cuenta con caché en memoria (TTL 60s) para evitar 429 Too Many Requests.
   * Regla de Tendencia Macro Alcista:
   * 1. EMA 20 >= EMA 50 en velas del timeframe macro.
   * 2. Último precio de cierre >= EMA 50.
   */
  async getMacroTrend(coin, baseTf = '5m') {
    const macroTf = getMacroTimeframe(baseTf);
    const now = Date.now();
    const cacheKey = `${coin}:${macroTf}`;
    const cached = this.macroTrendCache.get(cacheKey);

    if (cached && now - cached.timestamp < 60000) {
      return cached.data;
    }

    try {
      const tfMinutesMap = {
        '1m': 1,
        '5m': 5,
        '15m': 15,
        '30m': 30,
        '1h': 60,
        '4h': 240,
        '1d': 1440,
        '1w': 10080,
      };
      const tfMins = tfMinutesMap[macroTf] || 15;
      const durationMs = 60 * tfMins * 60 * 1000;

      const candlesRaw = await this.infoClient.candleSnapshot({
        coin,
        interval: macroTf,
        startTime: now - durationMs,
        endTime: now,
      });

      if (!Array.isArray(candlesRaw) || candlesRaw.length < 25) {
        const fallback = {
          isBullish: false,
          trend: 'NEUTRAL',
          macroTf,
          reason: `Velas insuficientes en timeframe macro ${macroTf} (${candlesRaw?.length || 0})`,
          ema20: 0,
          ema50: 0,
        };
        this.macroTrendCache.set(cacheKey, { timestamp: now, data: fallback });
        return fallback;
      }

      const closes = candlesRaw.map((c) => parseFloat(c.c));
      const lastClose = closes[closes.length - 1];

      const ema20Series = calculateEMA(closes, Math.min(20, Math.floor(closes.length / 2)));
      const ema50Series = calculateEMA(closes, Math.min(50, closes.length));

      const ema20 = ema20Series[ema20Series.length - 1] || lastClose;
      const ema50 = ema50Series.length > 0 ? ema50Series[ema50Series.length - 1] : ema20;

      let trend = 'NEUTRAL';
      let isBullish = false;
      let reason = '';

      if (ema20 >= ema50 && lastClose >= ema50) {
        trend = 'BULLISH';
        isBullish = true;
        reason = `Tendencia macro alcista en ${macroTf} (Precio $${lastClose} > EMA50 $${ema50.toFixed(4)} y EMA20 >= EMA50)`;
      } else if (ema20 < ema50 && lastClose < ema50) {
        trend = 'BEARISH';
        isBullish = false;
        reason = `Tendencia macro bajista en ${macroTf} (Precio $${lastClose} < EMA50 $${ema50.toFixed(4)} y EMA20 < EMA50)`;
      } else {
        trend = 'NEUTRAL';
        isBullish = false;
        reason = `Consolidación o transición en ${macroTf} (EMA20 $${ema20.toFixed(4)} vs EMA50 $${ema50.toFixed(4)})`;
      }

      const result = {
        isBullish,
        trend,
        macroTf,
        reason,
        ema20: Number(ema20.toFixed(4)),
        ema50: Number(ema50.toFixed(4)),
        lastClose: Number(lastClose.toFixed(4)),
      };

      this.macroTrendCache.set(cacheKey, { timestamp: now, data: result });
      return result;
    } catch (err) {
      console.warn(`[ServerBotDaemon] Error al consultar velas macro ${macroTf} para ${coin}:`, err.message);
      if (cached) {
        return cached.data;
      }
      return {
        isBullish: false,
        trend: 'NEUTRAL',
        macroTf,
        reason: `Excepción API en ${macroTf}: ${err.message}`,
        ema20: 0,
        ema50: 0,
      };
    }
  }

  async runCycle() {
    if (this.isCycleRunning) return;
    if (!this.config.isActive) return;

    const isDitto = this.isDittoKey();
    const isHl = this.isHyperliquidKey();
    if (!isDitto && !isHl) {
      return;
    }

    this.isCycleRunning = true;
    try {
      // 0. VERIFICAR PROTECCIÓN DE DRAWDOWN MÁXIMO (-8% DEL BALANCE)
      const currentNetWorth = await this.getAccountNetWorth();
      if (currentNetWorth > 0) {
        const tripped = await this.checkCircuitBreaker(currentNetWorth);
        if (tripped) {
          this.isCycleRunning = false;
          return;
        }
      }

      const meta = await this.getMeta();
      let exClient = null;
      if (isHl) {
        exClient = this.getExchangeClient();
        if (!exClient) return;
      }

      // 1. Check open positions on Ditto or Hyperliquid
      let hlPositions = [];
      if (isDitto) {
        try {
          const portfolio = await this.getDittoPortfolio();
          if (portfolio && Array.isArray(portfolio.positions)) {
            hlPositions = portfolio.positions;
          }
        } catch (_) {}
      } else if (this.config.walletAddress && this.config.walletAddress.startsWith('0x')) {
        try {
          const chState = await this.infoClient.clearinghouseState({ user: this.config.walletAddress });
          if (chState?.assetPositions) {
            hlPositions = chState.assetPositions
              .map((a) => a.position)
              .filter((p) => p && parseFloat(p.szi || '0') !== 0);
          }
        } catch (err) {
          console.warn('Warning fetching clearinghouse state:', err.message);
        }
      }

      // Reconciliación estricta: limpiar posiciones fantasma que ya cerraron on-chain
      const onChainCoins = new Set(hlPositions.map((p) => p.coin));
      if (this.state.positions.length > 0) {
        const remaining = this.state.positions.filter((p) => onChainCoins.has(p.coin));
        if (remaining.length !== this.state.positions.length) {
          this.state.positions = remaining;
          this.saveState();
        }
      }

      const [_, assetCtxs] = await this.infoClient.metaAndAssetCtxs();

      // Check Stop Loss & Take Profits for tracked positions (Fast Scalping exits)
      for (const tracked of [...this.state.positions]) {
        const assetIndex = meta.universe.findIndex((u) => u.name === tracked.coin);
        if (assetIndex === -1) continue;

        const ctx = assetCtxs[assetIndex];
        const markPx = parseFloat(ctx?.markPx || ctx?.midPx || '0');
        if (markPx <= 0) continue;

        tracked.currentPrice = markPx;
        const isBuy = tracked.side === 'BUY';

        // A. STOP LOSS TRIGGER
        const isSLHit = isBuy ? markPx <= tracked.stopLoss : markPx >= tracked.stopLoss;
        if (isSLHit) {
          this.addLog(
            'SL_HIT',
            `🛑 [STOP LOSS SCALP] ${tracked.coin} alcanzó $${markPx} (SL: $${tracked.stopLoss}). Cortando pérdida rápida...`
          );

          if (isDitto) {
            await this.closeDittoPosition(tracked.coin, 1.0);
          } else if (exClient) {
            await this.closePositionPart(exClient, meta, assetIndex, tracked.coin, !isBuy, tracked.sz, markPx);
          }

          const lossUSD = (tracked.capitalUSD || this.config.capitalPerTrade) * (Math.abs(markPx - tracked.entryPrice) / tracked.entryPrice) * (tracked.leverage || this.config.leverage);
          const pnlPct = -((Math.abs(markPx - tracked.entryPrice) / tracked.entryPrice) * (tracked.leverage || this.config.leverage) * 100);
          this.state.stats.totalTrades++;
          this.state.stats.losingTrades++;
          this.state.stats.totalProfitUSD -= lossUSD;

          this.recordClosedTrade({
            id: `ct-${Date.now()}-${tracked.coin}-${Math.random().toString(36).substr(2, 4)}`,
            coin: tracked.coin,
            symbol: `${tracked.coin}-PERP`,
            side: tracked.side,
            entryPrice: tracked.entryPrice,
            exitPrice: markPx,
            stopLoss: tracked.stopLoss,
            takeProfit1: tracked.takeProfit1,
            takeProfit2: tracked.takeProfit2,
            sz: tracked.initialSz || tracked.sz,
            capitalUSD: tracked.capitalUSD || this.config.capitalPerTrade,
            leverage: tracked.leverage || this.config.leverage,
            pnlUSD: -Number(lossUSD.toFixed(4)),
            pnlPercent: Number(pnlPct.toFixed(2)),
            exitReason: '🛑 STOP LOSS (Corte rápido)',
            entryTime: tracked.entryTime || (Date.now() - 30000),
            exitTime: Date.now(),
            durationSeconds: Math.max(1, Math.round((Date.now() - (tracked.entryTime || Date.now() - 30000)) / 1000)),
            isWin: false,
            executionVenue: isDitto ? 'DITTO_NETWORK' : 'HYPERLIQUID_DEX',
            telemetry: tracked.telemetry || null,
          });

          this.state.positions = this.state.positions.filter((p) => p.coin !== tracked.coin);
          this.saveState();
          continue;
        }

        // B. TAKE PROFIT 2 TRIGGER (Final target)
        if (tracked.isTP1Hit) {
          const isTP2Hit = isBuy ? markPx >= tracked.takeProfit2 : markPx <= tracked.takeProfit2;
          if (isTP2Hit) {
            this.addLog(
              'TP2_HIT',
              `🚀 [TAKE PROFIT 2 SCALP] ${tracked.coin} alcanzó $${markPx} (TP2: $${tracked.takeProfit2}). 100% ganancias aseguradas!`
            );

            if (isDitto) {
              await this.closeDittoPosition(tracked.coin, 1.0);
            } else if (exClient) {
              await this.closePositionPart(exClient, meta, assetIndex, tracked.coin, !isBuy, tracked.sz, markPx);
            }

            const gainUSD = (tracked.capitalUSD || this.config.capitalPerTrade) * (Math.abs(markPx - tracked.entryPrice) / tracked.entryPrice) * (tracked.leverage || this.config.leverage);
            const pnlPct = ((Math.abs(markPx - tracked.entryPrice) / tracked.entryPrice) * (tracked.leverage || this.config.leverage) * 100);
            this.state.stats.totalTrades++;
            this.state.stats.winningTrades++;
            this.state.stats.totalProfitUSD += gainUSD;

            this.recordClosedTrade({
              id: `ct-${Date.now()}-${tracked.coin}-${Math.random().toString(36).substr(2, 4)}`,
              coin: tracked.coin,
              symbol: `${tracked.coin}-PERP`,
              side: tracked.side,
              entryPrice: tracked.entryPrice,
              exitPrice: markPx,
              stopLoss: tracked.stopLoss,
              takeProfit1: tracked.takeProfit1,
              takeProfit2: tracked.takeProfit2,
              sz: tracked.initialSz || tracked.sz,
              capitalUSD: tracked.capitalUSD || this.config.capitalPerTrade,
              leverage: tracked.leverage || this.config.leverage,
              pnlUSD: Number(gainUSD.toFixed(4)),
              pnlPercent: Number(pnlPct.toFixed(2)),
              exitReason: '🚀 TP2 TOCADO (100% Ganancia)',
              entryTime: tracked.entryTime || (Date.now() - 60000),
              exitTime: Date.now(),
              durationSeconds: Math.max(1, Math.round((Date.now() - (tracked.entryTime || Date.now() - 60000)) / 1000)),
              isWin: true,
              executionVenue: isDitto ? 'DITTO_NETWORK' : 'HYPERLIQUID_DEX',
              telemetry: tracked.telemetry || null,
            });

            this.state.positions = this.state.positions.filter((p) => p.coin !== tracked.coin);
            this.saveState();
            continue;
          }
        }

        // C. TAKE PROFIT 1 TRIGGER (50% scale out + move SL to Break-Even)
        const isTP1Hit = isBuy ? markPx >= tracked.takeProfit1 : markPx <= tracked.takeProfit1;
        if (isTP1Hit && !tracked.isTP1Hit) {
          this.addLog(
            'TP1_HIT',
            `🎯 [TAKE PROFIT 1 SCALP] ${tracked.coin} alcanzó $${markPx} (TP1: $${tracked.takeProfit1}). Cerrando 50% y moviendo SL a Break-Even ($${tracked.entryPrice})`
          );

          if (isDitto) {
            await this.closeDittoPosition(tracked.coin, 0.5);
          } else if (exClient) {
            const halfSz = tracked.sz * 0.5;
            await this.closePositionPart(exClient, meta, assetIndex, tracked.coin, !isBuy, halfSz, markPx);
          }

          tracked.isTP1Hit = true;
          tracked.sz = tracked.sz * 0.5;
          tracked.stopLoss = tracked.entryPrice; // Break-Even protection!

          const partialGain = (tracked.capitalUSD || this.config.capitalPerTrade) * 0.5 * (Math.abs(markPx - tracked.entryPrice) / tracked.entryPrice) * (tracked.leverage || this.config.leverage);
          const pnlPct = ((Math.abs(markPx - tracked.entryPrice) / tracked.entryPrice) * (tracked.leverage || this.config.leverage) * 100);
          this.state.stats.winningTrades++;
          this.state.stats.totalProfitUSD += partialGain;

          this.recordClosedTrade({
            id: `ct-${Date.now()}-${tracked.coin}-tp1-${Math.random().toString(36).substr(2, 4)}`,
            coin: tracked.coin,
            symbol: `${tracked.coin}-PERP`,
            side: tracked.side,
            entryPrice: tracked.entryPrice,
            exitPrice: markPx,
            stopLoss: tracked.stopLoss,
            takeProfit1: tracked.takeProfit1,
            takeProfit2: tracked.takeProfit2,
            sz: (tracked.initialSz || tracked.sz) * 0.5,
            capitalUSD: (tracked.capitalUSD || this.config.capitalPerTrade) * 0.5,
            leverage: tracked.leverage || this.config.leverage,
            pnlUSD: Number(partialGain.toFixed(4)),
            pnlPercent: Number(pnlPct.toFixed(2)),
            exitReason: '🎯 TP1 TOCADO (50% asegurado)',
            entryTime: tracked.entryTime || (Date.now() - 35000),
            exitTime: Date.now(),
            durationSeconds: Math.max(1, Math.round((Date.now() - (tracked.entryTime || Date.now() - 35000)) / 1000)),
            isWin: true,
            executionVenue: isDitto ? 'DITTO_NETWORK' : 'HYPERLIQUID_DEX',
            telemetry: tracked.telemetry || null,
          });

          this.saveState();
        }
      }

      // Reset tracking if no positions exist on-chain
      if (hlPositions.length === 0 && this.state.positions.length > 0) {
        for (const p of this.state.positions) {
          const mark = p.currentPrice || p.entryPrice;
          const isBuy = p.side === 'BUY';
          const pnlPct = ((mark - p.entryPrice) / p.entryPrice) * (isBuy ? 1 : -1) * (p.leverage || 10) * 100;
          const pnlUSD = ((p.capitalUSD || 10) * pnlPct) / 100;
          this.recordClosedTrade({
            id: `ct-${Date.now()}-${p.coin}-${Math.random().toString(36).substr(2, 4)}`,
            coin: p.coin,
            symbol: `${p.coin}-PERP`,
            side: p.side,
            entryPrice: p.entryPrice,
            exitPrice: mark,
            stopLoss: p.stopLoss,
            takeProfit1: p.takeProfit1,
            takeProfit2: p.takeProfit2,
            sz: p.sz,
            capitalUSD: p.capitalUSD || this.config.capitalPerTrade,
            leverage: p.leverage || this.config.leverage,
            pnlUSD: Number(pnlUSD.toFixed(4)),
            pnlPercent: Number(pnlPct.toFixed(2)),
            exitReason: pnlUSD >= 0 ? '🎯 Cierre Exitoso On-Chain' : '🛑 Cierre SL On-Chain',
            entryTime: p.entryTime || (Date.now() - 60000),
            exitTime: Date.now(),
            durationSeconds: Math.max(1, Math.round((Date.now() - (p.entryTime || Date.now() - 60000)) / 1000)),
            isWin: pnlUSD >= 0,
            executionVenue: isDitto ? 'DITTO_NETWORK' : 'HYPERLIQUID_DEX',
            telemetry: p.telemetry || null,
          });
        }
        this.state.positions = [];
        this.saveState();
      }

      // 2. Scan for Technical Entry Signals if active positions < maxConcurrentTrades
      const maxPositions = this.config.maxConcurrentTrades || 4;
      const currentPositionsCount = hlPositions.length > 0 ? hlPositions.length : this.state.positions.length;
      if (currentPositionsCount >= maxPositions) {
        return;
      }

      // Build target coins list:
      // If allowedSymbols is empty or has 'ALL', include top 35 volume perps + ALL meme coins!
      let targetCoins = [];
      const isAllAllowed =
        !this.config.allowedSymbols ||
        this.config.allowedSymbols.length === 0 ||
        this.config.allowedSymbols.includes('ALL');

      if (isAllAllowed) {
        // Sort universe by 24h volume
        const sortedByVol = meta.universe
          .map((u, idx) => ({
            name: u.name,
            vol: parseFloat(assetCtxs[idx]?.dayNtlVlm || '0'),
            isMeme: MEME_REGEX.test(u.name),
          }))
          .sort((a, b) => b.vol - a.vol);

        // Take top 35 by volume
        const topVolume = sortedByVol.slice(0, 35).map((c) => c.name);
        // Add all meme coins (DOGE, PEPE, FARTCOIN, PUMP, TRUMP, PENGU, PURR, etc.)
        const memes = sortedByVol.filter((c) => c.isMeme).map((c) => c.name);

        targetCoins = Array.from(new Set([...topVolume, ...memes]));
      } else {
        targetCoins = this.config.allowedSymbols.map((s) =>
          s.replace(/(-PERP|USDT|\/USD)$/i, '').toUpperCase()
        );
      }

      // Randomize or rotate coins slightly so all perps and memes get analyzed
      targetCoins = targetCoins.sort(() => Math.random() - 0.5);

      const targetTimeframe = '5m';

      for (const coin of targetCoins) {
        if (this.state.positions.length >= maxPositions) break;

        // AUDITORÍA DITTO MEJORA #4: Excluir activos tóxicos (XMR dio pérdidas netas y no aporta edge)
        if (coin === 'XMR' || coin.startsWith('XMR')) continue;

        // Skip if already in position for this coin
        const alreadyInPosition =
          hlPositions.some((p) => p.coin === coin) ||
          this.state.positions.some((p) => p.coin === coin);
        if (alreadyInPosition) continue;

        const assetIndex = meta.universe.findIndex((u) => u.name === coin);
        if (assetIndex === -1) continue;

        // Fetch recent candles (at least 70-100 candles)
        const durationMinutes = targetTimeframe === '1m' ? 120 : targetTimeframe === '3m' ? 300 : 500;
        let candlesRaw = [];
        try {
          candlesRaw = await this.infoClient.candleSnapshot({
            coin,
            interval: targetTimeframe,
            startTime: Date.now() - durationMinutes * 60 * 1000,
            endTime: Date.now(),
          });
        } catch (candErr) {
          continue;
        }

        if (!Array.isArray(candlesRaw) || candlesRaw.length < 55) continue;

        const opens = candlesRaw.map((c) => parseFloat(c.o));
        const closes = candlesRaw.map((c) => parseFloat(c.c));
        const highs = candlesRaw.map((c) => parseFloat(c.h));
        const lows = candlesRaw.map((c) => parseFloat(c.l));
        const volumes = candlesRaw.map((c) => parseFloat(c.v));

        // High-Conviction Indicators on 5m candles:
        const ema9Series = calculateEMA(closes, 9);
        const ema21Series = calculateEMA(closes, 21);
        const ema50Series = calculateEMA(closes, 50);
        const rsiSeries = calculateRSI(closes, 14);
        const atrSeries = calculateATR(highs, lows, closes, 14);
        const stoch = calculateStochastic(highs, lows, closes, 14, 3, 3);

        if (
          ema9Series.length < 2 ||
          ema21Series.length < 2 ||
          ema50Series.length < 2 ||
          rsiSeries.length < 2 ||
          atrSeries.length < 1 ||
          stoch.k.length < 2 ||
          stoch.d.length < 2
        ) {
          continue;
        }

        const ema9Curr = ema9Series[ema9Series.length - 1];
        const ema9Prev = ema9Series[ema9Series.length - 2];
        const ema21Curr = ema21Series[ema21Series.length - 1];
        const ema21Prev = ema21Series[ema21Series.length - 2];
        const ema50Curr = ema50Series[ema50Series.length - 1];
        const rsiCurr = rsiSeries[rsiSeries.length - 1];
        const rsiPrev = rsiSeries[rsiSeries.length - 2];
        const atr = atrSeries[atrSeries.length - 1];
        const stochK = stoch.currentK;
        const stochD = stoch.currentD;
        const prevStochK = stoch.prevK;
        const prevStochD = stoch.prevD;

        const lastClose = closes[closes.length - 1];
        const lastOpen = opens[opens.length - 1];
        const lastHigh = highs[highs.length - 1];
        const lastLow = lows[lows.length - 1];
        const lastCandleRange = lastHigh - lastLow;
        const lastBody = Math.abs(lastClose - lastOpen);

        // Volume expansion check against 20-period average
        const recentVolumes = volumes.slice(-20);
        const avgVol = recentVolumes.reduce((acc, v) => acc + v, 0) / (recentVolumes.length || 1);
        const lastVol = volumes[volumes.length - 1];
        const isVolExpansion = avgVol > 0 && lastVol >= avgVol * 1.15;

        const assetCtx = assetCtxs[assetIndex] || {};
        const fundingRateRaw = parseFloat(assetCtx.funding || '0');
        const dayVol = parseFloat(assetCtx.dayNtlVlm || '0');
        const markPx = parseFloat(assetCtx.markPx || assetCtx.midPx || lastClose);
        if (markPx <= 0) continue;

        // AUDITORÍA DITTO MEJORA #2: Cálculo exacto de variación 24h
        const prevDayPx = parseFloat(assetCtx.prevDayPx || '0');
        const change24hPct = prevDayPx > 0 ? ((markPx - prevDayPx) / prevDayPx) * 100 : 0;

        let spreadPct = 0.02;
        if (Array.isArray(assetCtx.impactPxs) && assetCtx.impactPxs.length >= 2) {
          const bidImpact = parseFloat(assetCtx.impactPxs[0] || '0');
          const askImpact = parseFloat(assetCtx.impactPxs[1] || '0');
          if (bidImpact > 0 && askImpact > 0 && markPx > 0) {
            spreadPct = Math.abs((askImpact - bidImpact) / markPx) * 100;
          }
        } else if (assetCtx.midPx && assetCtx.markPx) {
          const mid = parseFloat(assetCtx.midPx);
          if (mid > 0) {
            spreadPct = Math.abs((markPx - mid) / mid) * 100;
          }
        }

        // PRE-FLIGHT SCREENER: Descartar activos con spread excesivo o volumen ilíquido
        if (spreadPct > 0.25 || (dayVol > 0 && dayVol < 25000)) {
          continue;
        }

        // -------------------------------------------------------------
        // HIGH-CONVICTION CONFLUENCE ENGINE: RSI + OSCILADOR ESTOCÁSTICO (%K, %D)
        // Regla: Solo señales con Puntuación >= 70 se ejecutan
        // -------------------------------------------------------------
        let buyScore = 0;
        let sellScore = 0;
        const buyReasons = [];
        const sellReasons = [];

        // 1. Alineación de Medias Móviles EMA 9, 21 y 50 (Hasta 30 pts)
        if (ema9Curr > ema21Curr && ema21Curr > ema50Curr && markPx > ema9Curr) {
          buyScore += 30;
          buyReasons.push('Tendencia Alcista (EMA 9 > 21 > 50)');
        } else if (ema9Prev <= ema21Prev && ema9Curr > ema21Curr && markPx > ema50Curr) {
          buyScore += 30;
          buyReasons.push('Cruce de Oro EMA 9/21 sobre EMA 50');
        } else if (ema9Curr > ema21Curr && markPx > ema50Curr) {
          buyScore += 15;
          buyReasons.push('Precio sobre EMA 50');
        }

        if (ema9Curr < ema21Curr && ema21Curr < ema50Curr && markPx < ema9Curr) {
          sellScore += 30;
          sellReasons.push('Tendencia Bajista (EMA 9 < 21 < 50)');
        } else if (ema9Prev >= ema21Prev && ema9Curr < ema21Curr && markPx < ema50Curr) {
          sellScore += 30;
          sellReasons.push('Cruce de Muerte EMA 9/21 bajo EMA 50');
        } else if (ema9Curr < ema21Curr && markPx < ema50Curr) {
          sellScore += 15;
          sellReasons.push('Precio bajo EMA 50');
        }

        // 2. Oscilador Estocástico (%K, %D) - Sobrecompra y Sobreventa (Hasta 25 pts)
        // COMPRA: Cruce alcista desde sobreventa o rebote favorable
        if (stochK <= 30 && prevStochK <= prevStochD && stochK > stochD) {
          buyScore += 25;
          buyReasons.push(`Cruce Alcista Estocástico en Sobreventa (%K:${stochK.toFixed(1)} > %D:${stochD.toFixed(1)})`);
        } else if (stochK <= 40 && stochK > stochD && stochK > prevStochK) {
          buyScore += 18;
          buyReasons.push(`Rebote Estocástico (%K:${stochK.toFixed(1)} ↗)`);
        } else if (stochK > 20 && prevStochK <= 20) {
          buyScore += 15;
          buyReasons.push(`Salida de Sobreventa Estocástica (%K:${stochK.toFixed(1)})`);
        }

        // VENTA: Cruce bajista desde sobrecompra o rechazo favorable
        if (stochK >= 70 && prevStochK >= prevStochD && stochK < stochD) {
          sellScore += 25;
          sellReasons.push(`Cruce Bajista Estocástico en Sobrecompra (%K:${stochK.toFixed(1)} < %D:${stochD.toFixed(1)})`);
        } else if (stochK >= 60 && stochK < stochD && stochK < prevStochK) {
          sellScore += 18;
          sellReasons.push(`Rechazo Estocástico (%K:${stochK.toFixed(1)} ↘)`);
        } else if (stochK < 80 && prevStochK >= 80) {
          sellScore += 15;
          sellReasons.push(`Salida de Sobrecompra Estocástica (%K:${stochK.toFixed(1)})`);
        }

        // 3. Momentum y Espacio de Recorrido RSI (Hasta 20 pts)
        if (rsiCurr >= 38 && rsiCurr <= 58 && rsiCurr > rsiPrev) {
          buyScore += 20;
          buyReasons.push(`RSI con recorrido alcista (${rsiCurr.toFixed(1)} ↗)`);
        } else if (rsiCurr >= 30 && rsiCurr < 38 && rsiCurr > rsiPrev) {
          buyScore += 15;
          buyReasons.push(`Rebote RSI Sobreventa (${rsiCurr.toFixed(1)})`);
        }

        if (rsiCurr >= 42 && rsiCurr <= 62 && rsiCurr < rsiPrev) {
          sellScore += 20;
          sellReasons.push(`RSI con recorrido bajista (${rsiCurr.toFixed(1)} ↘)`);
        } else if (rsiCurr > 62 && rsiCurr <= 70 && rsiCurr < rsiPrev) {
          sellScore += 15;
          sellReasons.push(`Rechazo RSI Sobrecompra (${rsiCurr.toFixed(1)})`);
        }

        // 4. Calidad de Vela / Price Action en 5m (Hasta 15 pts)
        if (lastClose > lastOpen && lastCandleRange > 0 && (lastBody / lastCandleRange) >= 0.40) {
          buyScore += 15;
          buyReasons.push('Vela 5m cuerpo sólido alcista');
        }
        if (lastClose < lastOpen && lastCandleRange > 0 && (lastBody / lastCandleRange) >= 0.40) {
          sellScore += 15;
          sellReasons.push('Vela 5m cuerpo sólido bajista');
        }

        // 5. Expansión de Volumen Relativo (Hasta 15 pts)
        if (isVolExpansion) {
          if (lastClose > lastOpen) {
            buyScore += 15;
            buyReasons.push(`Volumen alcista (+${Math.round(((lastVol / avgVol) - 1) * 100)}%)`);
          } else if (lastClose < lastOpen) {
            sellScore += 15;
            sellReasons.push(`Volumen bajista (+${Math.round(((lastVol / avgVol) - 1) * 100)}%)`);
          }
        }

        // -------------------------------------------------------------
        // VETOS ESTRICTOS ANTI-TRAMPA (No comprar en techos, no vender en fondos)
        // -------------------------------------------------------------
        if (stochK >= 80 || rsiCurr >= 72) {
          buyScore = 0; // VETO: Sobrecompra severa, alta probabilidad de trampa
        }
        if (stochK <= 20 || rsiCurr <= 28) {
          sellScore = 0; // VETO: Sobreventa severa, alta probabilidad de rebote
        }

        // -------------------------------------------------------------
        // AUDITORÍA DITTO MEJORA #2: Cuando el activo cae en 24h, VETAR LARGOS
        // Ditto auditoría: 0 de 3 en largos (-$3.52, 17% histórico) vs 7 de 9 en cortos (+77.7% winrate, +$3.53)
        // -------------------------------------------------------------
        if (change24hPct < 0) {
          buyScore = 0; // Prohibir compras si el activo viene cayendo en 24h
        }
        if (change24hPct > 2.0) {
          sellScore = 0; // Prohibir ventas en corto si el activo sube fuertemente (> +2.0%)
        }

        const isLongOnly = this.config.longOnly === true;
        if (isLongOnly) {
          sellScore = 0; // Solo vetar cortos si el usuario activó explícitamente MODO SOLO COMPRAS
        }

        let signalType = null;
        let signalReason = '';
        let signalScore = 0;

        const minScore = this.config.minSignalScore || 55;

        // Filtro de alta convicción configurable (default 55 para mayor frecuencia de órdenes)
        if (buyScore >= minScore && buyScore > sellScore) {
          signalType = 'BUY';
          signalReason = buyReasons.join(' + ');
          signalScore = buyScore;
        } else if (!isLongOnly && sellScore >= minScore && sellScore > buyScore) {
          signalType = 'SELL';
          signalReason = sellReasons.join(' + ');
          signalScore = sellScore;
        }

        if (signalType) {
          // =========================================================================
          // JERARQUÍA DE TENDENCIAS MULTITEMPORAL (MTF) ESTRICTA
          // =========================================================================
          let macroInfo = null;
          if (this.config.requireMacroTrendConfirmation !== false) {
            macroInfo = await this.getMacroTrend(coin, targetTimeframe);
            const isBullish = macroInfo.isBullish;
            const isMacroAligned = (signalType === 'BUY' && isBullish) || (signalType === 'SELL' && !isBullish);
            if (!isMacroAligned) {
              this.addLog(
                'MTF_VETO',
                `🛡️ [MTF VETO] Entrada ${signalType} en ${coin} bloqueada. ${targetTimeframe} Convicción: ${signalScore}/100 pero ${macroInfo.macroTf} Macro NO confirma (${macroInfo.reason}).`
              );
              continue; // Descartar entrada
            }
          }

          const isBuy = signalType === 'BUY';
          const entryPrice = markPx;

          // Parámetros matemáticos para ganar el Torneo Ditto:
          // Capital $10 con apalancamiento 10x = $100 nocional
          // Comisiones Ditto round-trip: ~0.10% = $0.10 USD
          // TP1: +1.6% movimiento (+16% ROE = +$1.60 USD bruto, ~+$1.50 neto)
          // TP2: +2.6% movimiento (+26% ROE = +$2.60 USD bruto, ~+$2.50 neto)
          // SL: -0.9% movimiento (-9% ROE = -$0.90 USD máx riesgo)
          const tp1Pct = Math.max(0.016, this.config.tp1Percent || 0.016);
          const tp2Pct = Math.max(0.026, this.config.tp2Percent || 0.026);
          const slPct = Math.min(0.009, this.config.slPercent || 0.009);

          const stopLoss = isBuy ? entryPrice * (1 - slPct) : entryPrice * (1 + slPct);
          const takeProfit1 = isBuy ? entryPrice * (1 + tp1Pct) : entryPrice * (1 - tp1Pct);
          const takeProfit2 = isBuy ? entryPrice * (1 + tp2Pct) : entryPrice * (1 - tp2Pct);

          // Validar relación Riesgo/Beneficio (mínimo 1.6)
          const risk = Math.abs(entryPrice - stopLoss);
          const reward = Math.abs(takeProfit1 - entryPrice);
          const rr = reward / risk;

          if (rr < (this.config.minRiskReward || 1.6)) {
            continue;
          }

          // Calculate size
          const universeItem = meta.universe[assetIndex];
          const szDecimals = universeItem.szDecimals ?? 4;
          const targetLeverage = Math.min(this.config.leverage || 10, universeItem.maxLeverage || 20);

          // Update Leverage on Hyperliquid if using native exchange client
          if (exClient) {
            try {
              await exClient.updateLeverage({
                asset: assetIndex,
                isCross: true,
                leverage: targetLeverage,
              });
            } catch (levErr) {
              console.warn(`Leverage update for ${coin}:`, levErr.message);
            }
          }

          const notionalUSD = this.config.capitalPerTrade * targetLeverage;
          const rawSz = notionalUSD / entryPrice;
          const formattedSz = Number(rawSz.toFixed(szDecimals));

          if (formattedSz <= 0) continue;

          // Slippage target price for IOC market order
          const slippage = 0.015; // 1.5%
          const targetPx = isBuy ? entryPrice * (1 + slippage) : entryPrice * (1 - slippage);
          const formattedPx = targetPx > 1000 ? targetPx.toFixed(1) : targetPx > 10 ? targetPx.toFixed(2) : targetPx.toFixed(4);

          const isMemeTag = MEME_REGEX.test(coin) ? '🎭 [MEME]' : '⚡ [PERP]';

          const entryTelemetry = {
            rsi14: Number(rsiCurr.toFixed(2)),
            stochK: Number(stochK.toFixed(2)),
            stochD: Number(stochD.toFixed(2)),
            atr14: Number(atr.toFixed(5)),
            fundingRate: Number((fundingRateRaw * 100).toFixed(4)),
            spreadPct: Number(spreadPct.toFixed(4)),
            emaTrend: markPx >= ema50Curr ? 'BULLISH' : 'BEARISH',
            macroTf: macroInfo?.macroTf || getMacroTimeframe(targetTimeframe),
            macroTrend: macroInfo?.trend || 'BULLISH',
            macroReason: macroInfo?.reason || 'Alineación alcista confirmada',
            volume24hUSD: Number(dayVol.toFixed(2)),
            confluenceScore: signalScore,
            confluenceReasons: signalReason,
          };

          this.addLog(
            'SIGNAL',
            `${isMemeTag} [CONVICCIÓN ${signalScore}/100 + MTF ✅ ${entryTelemetry.macroTf} ${entryTelemetry.macroTrend}] Señal ${signalType} en ${coin} @ $${entryPrice} (5m). RSI: ${entryTelemetry.rsi14}, Stoch: %K ${entryTelemetry.stochK} / %D ${entryTelemetry.stochD}. Confluencia: ${signalReason}. TP1: +1.6% (+$1.50 neto), TP2: +2.6% (+$2.50 neto), SL: -0.9%`
          );

          if (isDitto) {
            try {
              const dittoRes = await this.executeDittoOrder({
                coin,
                isBuy,
                sizeUsd: notionalUSD,
                leverage: targetLeverage,
                stopLoss,
                takeProfit1,
              });

              if (dittoRes && dittoRes.ok !== false && !dittoRes.error) {
                this.addLog(
                  'EXECUTION',
                  `⚡ [DITTO EJECUTADO] ${signalType} $${Math.round(notionalUSD)} USD en ${coin} @ $${entryPrice} (${targetLeverage}x Cross, Convicción ${signalScore}/100). SL: $${stopLoss.toFixed(4)} (-0.9%), TP1: $${takeProfit1.toFixed(4)} (+1.6%), TP2: $${takeProfit2.toFixed(4)} (+2.6%)`
                );

                this.state.stats.totalTrades++;
                this.state.stats.totalVolumeUSD += notionalUSD;

                this.state.positions.push({
                  coin,
                  side: signalType,
                  entryPrice,
                  currentPrice: entryPrice,
                  stopLoss: Number(stopLoss.toFixed(5)),
                  takeProfit1: Number(takeProfit1.toFixed(5)),
                  takeProfit2: Number(takeProfit2.toFixed(5)),
                  sz: formattedSz,
                  initialSz: formattedSz,
                  capitalUSD: this.config.capitalPerTrade,
                  leverage: targetLeverage,
                  isTP1Hit: false,
                  entryTime: Date.now(),
                  macroTf: entryTelemetry.macroTf,
                  macroTrend: entryTelemetry.macroTrend,
                  telemetry: entryTelemetry,
                });
                this.saveState();
              } else {
                this.addLog('ERROR', `Error en Ditto al ejecutar ${coin}: ${dittoRes?.error || JSON.stringify(dittoRes)}`);
              }
            } catch (err) {
              this.addLog('ERROR', `Excepción al ejecutar orden Ditto en ${coin}: ${err.message}`);
            }
          } else if (exClient) {
            try {
              const orderRes = await exClient.order({
                orders: [
                  {
                    a: assetIndex,
                    b: isBuy,
                    p: formattedPx,
                    s: formattedSz.toString(),
                    r: false,
                    t: { limit: { tif: 'Ioc' } },
                  },
                ],
                grouping: 'na',
              });

              if (orderRes?.status === 'ok') {
                this.addLog(
                  'EXECUTION',
                  `⚡ [EJECUTADO] ${signalType} ${formattedSz} ${coin} @ $${entryPrice} (${targetLeverage}x Cross, Convicción ${signalScore}/100). SL: $${stopLoss.toFixed(4)} (-0.9%), TP1: $${takeProfit1.toFixed(4)} (+1.6%), TP2: $${takeProfit2.toFixed(4)} (+2.6%)`
                );

                // Accumulate Ditto tournament volume!
                this.state.stats.totalTrades++;
                this.state.stats.totalVolumeUSD += notionalUSD;

                // Track in memory
                this.state.positions.push({
                  coin,
                  side: signalType,
                  entryPrice,
                  currentPrice: entryPrice,
                  stopLoss: Number(stopLoss.toFixed(5)),
                  takeProfit1: Number(takeProfit1.toFixed(5)),
                  takeProfit2: Number(takeProfit2.toFixed(5)),
                  sz: formattedSz,
                  initialSz: formattedSz,
                  capitalUSD: this.config.capitalPerTrade,
                  leverage: targetLeverage,
                  isTP1Hit: false,
                  entryTime: Date.now(),
                  macroTf: entryTelemetry.macroTf,
                  macroTrend: entryTelemetry.macroTrend,
                  telemetry: entryTelemetry,
                });
                this.saveState();
              } else {
                this.addLog('ERROR', `Error en DEX al ejecutar ${coin}: ${JSON.stringify(orderRes)}`);
              }
            } catch (ordErr) {
              this.addLog('ERROR', `Excepción al ejecutar orden ${coin}: ${ordErr.message}`);
            }
          }
        }
      }
    } catch (cycleErr) {
      console.error('Error in daemon runCycle:', cycleErr);
    } finally {
      this.isCycleRunning = false;
    }
  }

  async closePositionPart(exClient, meta, assetIndex, coin, closeBuy, sz, currentPrice) {
    const universeItem = meta.universe[assetIndex];
    const szDecimals = universeItem.szDecimals ?? 4;
    const formattedSz = Number(sz.toFixed(szDecimals));
    if (formattedSz <= 0) return;

    const slippage = 0.02;
    const targetPx = closeBuy ? currentPrice * (1 + slippage) : currentPrice * (1 - slippage);
    const formattedPx = targetPx > 1000 ? targetPx.toFixed(1) : targetPx > 10 ? targetPx.toFixed(2) : targetPx.toFixed(4);

    try {
      await exClient.order({
        orders: [
          {
            a: assetIndex,
            b: closeBuy,
            p: formattedPx,
            s: formattedSz.toString(),
            r: true, // Reduce only
            t: { limit: { tif: 'Ioc' } },
          },
        ],
        grouping: 'na',
      });
    } catch (err) {
      this.addLog('ERROR', `Error cerrando posición ${coin}: ${err.message}`);
    }
  }

  getStatus() {
    const isDitto = this.isDittoKey();
    const hasKey = Boolean(
      this.config.agentPrivateKey &&
      (isDitto || this.config.agentPrivateKey.startsWith('0x'))
    );
    const maskedKey = this.config.agentPrivateKey
      ? `${this.config.agentPrivateKey.slice(0, 8)}...${this.config.agentPrivateKey.slice(-4)}`
      : 'No configurada';

    const isAll =
      !this.config.allowedSymbols ||
      this.config.allowedSymbols.length === 0 ||
      this.config.allowedSymbols.includes('ALL');

    return {
      isActive: this.config.isActive,
      walletAddress: this.config.walletAddress || '',
      hasAgentKey: hasKey,
      agentKeyType: isDitto ? 'DITTO_NETWORK' : 'HYPERLIQUID_DIRECT',
      maskedAgentKey: maskedKey,
      capitalPerTrade: this.config.capitalPerTrade,
      leverage: this.config.leverage,
      allowedSymbols: isAll ? ['TODOS (Perps, Memes y Predictions)'] : this.config.allowedSymbols,
      isAllMarkets: isAll,
      maxConcurrentTrades: this.config.maxConcurrentTrades,
      timeframe: this.config.timeframe || '1m',
      scanIntervalSeconds: this.config.scanIntervalSeconds || 6,
      minSignalScore: this.config.minSignalScore || 55,
      instantProfitTake: this.config.instantProfitTake ?? true,
      minInstantProfitUSD: this.config.minInstantProfitUSD ?? 1.50,
      maxDrawdownPercent: this.config.maxDrawdownPercent || 0.08,
      longOnly: this.config.longOnly !== false,
      requireMacroTrendConfirmation: this.config.requireMacroTrendConfirmation !== false,
      macroHierarchy: {
        baseTimeframe: this.config.timeframe || '1m',
        macroTimeframe: getMacroTimeframe(this.config.timeframe || '1m'),
        rule: `Scalping ${this.config.timeframe || '1m'} requiere confirmación con ${getMacroTimeframe(this.config.timeframe || '1m')}`,
        active: this.config.requireMacroTrendConfirmation !== false,
      },
      sessionStartBalanceUSD: this.state.sessionStartBalanceUSD || 0,
      currentBalanceUSD: this.state.currentBalanceUSD || 0,
      circuitBreakerTriggered: Boolean(this.state.circuitBreakerTriggered),
      activePositions: this.state.positions || [],
      closedTrades: (this.state.closedTrades || []).slice(0, 100),
      stats: this.state.stats,
      recentLogs: (this.state.logs || []).slice(0, 40),
      serverTime: Date.now(),
    };
  }
}

// Singleton daemon instance for the server
export const botDaemon = new ServerBotDaemon();
