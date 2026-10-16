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
import { clampRiskConfig, positionSize, RiskGuard, getDataDir } from './lib/risk-manager.mjs';
import { executeLimitOrderHyperliquid, executeDittoOrder, getBestBidAsk, formatHyperliquidPrice, formatHyperliquidSize } from './lib/order-execution.mjs';
import { detectPatternSignal } from './lib/patterns-bridge.mjs';
import { getAgentKey } from './lib/env.cjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_PATH = path.join(getDataDir(), 'bot-config.json');
const STATE_PATH = path.join(getDataDir(), 'bot-state.json');

const DEFAULT_CONFIG = clampRiskConfig({
  isActive: false,
  walletAddress: '',
  agentPrivateKey: '',
  capitalPerTrade: 10,
  leverage: 1,
  maxConcurrentTrades: 1,
  riskPerTradePct: 0.005,
  dailyLossCapPct: 0.03,
  maxConsecutiveLosses: 3,
  minRiskReward: 1.6,
  allowedSymbols: ['BTC', 'ETH'],
  timeframe: '1h',
  scanIntervalSeconds: 60,
  minSignalScore: 60,
  atrStopMult: 1.5,
  atrTargetMult: 3.0,
  fallbackStopPct: 0.02,
  instantProfitTake: false,
  minInstantProfitUSD: 2.25,
  maxDrawdownPercent: 0.08,
  longOnly: false,
  requireMacroTrendConfirmation: true,
  usePatternSignals: false,
});

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
    this.riskGuard = new RiskGuard(path.join(getDataDir(), 'bot-risk-state.json'));
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

    this.addLog('SYSTEM', '🚀 Servidor institucional con gestión de riesgo (BTC/ETH 1x) inicializado.');

    // Inicializar Diario de Trading SQLite con WAL mode y migrar trades existentes
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
      let parsed = {};
      if (fs.existsSync(CONFIG_PATH)) {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
        try { parsed = JSON.parse(raw) || {}; } catch {}
        // Si el archivo viejo contenía agentPrivateKey, se elimina del disco
        if (parsed.agentPrivateKey) {
          delete parsed.agentPrivateKey;
          try {
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(parsed, null, 2), 'utf8');
          } catch {}
        }
      }
      parsed.agentPrivateKey = getAgentKey();
      parsed.walletAddress = (process.env.WALLET_ADDRESS || parsed.walletAddress || '').trim();
      return clampRiskConfig({ ...DEFAULT_CONFIG, ...parsed });
    } catch (e) {
      console.warn('Error reading bot config:', e);
    }
    return clampRiskConfig({ ...DEFAULT_CONFIG, agentPrivateKey: getAgentKey(), walletAddress: (process.env.WALLET_ADDRESS || '').trim() });
  }

  saveConfig(newConfig) {
    const configToPersist = { ...newConfig };
    // Seguridad: bot-config.json NUNCA guarda la clave privada
    delete configToPersist.agentPrivateKey;

    if (configToPersist.walletAddress) {
      let w = configToPersist.walletAddress.trim().replace(/^['"]|['"]$/g, '');
      if (w && !w.startsWith('0x') && /^[0-9a-fA-F]{40}$/.test(w)) {
        w = '0x' + w;
      }
      configToPersist.walletAddress = w;
    }

    const merged = { ...this.config, ...configToPersist };
    this.config = clampRiskConfig({
      ...merged,
      agentPrivateKey: getAgentKey(),
      walletAddress: (process.env.WALLET_ADDRESS || merged.walletAddress || '').trim(),
    });

    try {
      const diskData = { ...this.config };
      delete diskData.agentPrivateKey;
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(diskData, null, 2), 'utf8');
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

    // Actualizar límites y pérdidas en RiskGuard
    if (this.riskGuard) {
      this.riskGuard.recordTrade(trade.pnlUSD || 0);
    }

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

    if (this.loopTimer) clearTimeout(this.loopTimer);
    if (this.fastMonitorTimer) clearInterval(this.fastMonitorTimer);

    // Bucle ultra-rápido de supervisión de posiciones cada 1.5s
    this.fastMonitorTimer = setInterval(() => this.runFastPositionMonitor(), 1500);

    const symbols = (this.config.allowedSymbols || ['BTC', 'ETH']).join(', ');
    this.addLog(
      'STATUS',
      `🟢 Bot 24/7 ACTIVADO. Operando ${symbols} en timeframe ${this.config.timeframe} al cierre de vela (Apalancamiento 1x, Gestión ATR y Circuit Breaker -3% diario / -8% total).`
    );
    setTimeout(() => this.runFastPositionMonitor(), 500);
    setTimeout(async () => {
      await this.runCycle();
      this.scheduleNextCandleCycle();
    }, 1200);
  }

  getMsUntilNextCandleClose(timeframe = '1h') {
    const minutes = timeframe === '1h' ? 60 : timeframe === '15m' ? 15 : 5;
    const intervalMs = minutes * 60 * 1000;
    const now = Date.now();
    const remainder = now % intervalMs;
    const msLeft = intervalMs - remainder;
    return msLeft + 3000; // 3 segundos tras el cierre para que la vela esté consolidada en el exchange
  }

  scheduleNextCandleCycle() {
    if (!this.config.isActive) return;
    if (this.loopTimer) clearTimeout(this.loopTimer);
    const ms = this.getMsUntilNextCandleClose(this.config.timeframe);
    this.loopTimer = setTimeout(async () => {
      try {
        await this.runCycle();
      } catch (err) {
        console.error('[ServerBotDaemon] Error en ciclo:', err.message);
      } finally {
        this.scheduleNextCandleCycle();
      }
    }, ms);
  }

  closedCandlesOnly(candles) {
    if (!Array.isArray(candles) || candles.length === 0) return [];
    // Descartar la última vela que sigue en formación
    return candles.slice(0, -1);
  }

  stop() {
    this.saveConfig({ isActive: false });
    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
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
          const fallbackStopPct = this.config.fallbackStopPct || 0.02; // 2% fallback para posiciones externas
          const slDistance = entryPx * fallbackStopPct;
          const tp1Distance = entryPx * fallbackStopPct;
          const tp2Distance = entryPx * (fallbackStopPct * 2);
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
            capitalUSD: sz * entryPx,
            leverage: pos.leverage?.value || this.config.leverage || 1,
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
      const maxPositions = this.config.maxConcurrentTrades || 1;
      const currentPositionsCount = hlPositions.length > 0 ? hlPositions.length : this.state.positions.length;
      if (currentPositionsCount >= maxPositions) {
        return;
      }

      // 0. Comprobar límites de riesgo institucional con RiskGuard
      if (typeof currentNetWorth !== 'number' || currentNetWorth <= 0) {
        this.addLog('RISK', '⚠️ [RIESGO] No se puede leer el capital de la cuenta. Operación omitida.');
        return;
      }
      const riskCheck = this.riskGuard.canTrade(currentNetWorth);
      if (!riskCheck.allowed) {
        this.addLog('RISK', `🛑 [RIESGO BLOQUEADO] ${riskCheck.reason}`);
        return;
      }

      // Target coins = allowedSymbols filtrados estrictamente a BTC / ETH
      const targetCoins = (this.config.allowedSymbols || ['BTC', 'ETH']).map((s) =>
        s.replace(/(-PERP|USDT|\/USD)$/i, '').toUpperCase()
      );
      const targetTimeframe = this.config.timeframe || '1h';

      for (const coin of targetCoins) {
        if (this.state.positions.length >= maxPositions) break;

        // Skip if already in position for this coin
        const alreadyInPosition =
          hlPositions.some((p) => p.coin === coin) ||
          this.state.positions.some((p) => p.coin === coin);
        if (alreadyInPosition) continue;

        const assetIndex = meta.universe.findIndex((u) => u.name === coin);
        if (assetIndex === -1) continue;

        // Fetch recent candles (~400 candles del timeframe configurado)
        const durationMinutes = targetTimeframe === '1h' ? 400 * 60 : targetTimeframe === '15m' ? 400 * 15 : 400 * 5;
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

        // Descarta la vela en formación para evitar repainting / lookahead
        const closedCandles = this.closedCandlesOnly(candlesRaw);
        if (!Array.isArray(closedCandles) || closedCandles.length < 55) continue;

        const opens = closedCandles.map((c) => parseFloat(c.o));
        const closes = closedCandles.map((c) => parseFloat(c.c));
        const highs = closedCandles.map((c) => parseFloat(c.h));
        const lows = closedCandles.map((c) => parseFloat(c.l));
        const volumes = closedCandles.map((c) => parseFloat(c.v));

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

          const currentAtr = atr || (entryPrice * 0.015);
          const atrStopMult = this.config.atrStopMult || 1.5;
          const atrTargetMult = this.config.atrTargetMult || 3.0;
          const stopDist = atrStopMult * currentAtr;
          const targetDist = atrTargetMult * currentAtr;

          const stopLoss = isBuy ? entryPrice - stopDist : entryPrice + stopDist;
          const takeProfit1 = isBuy ? entryPrice + stopDist : entryPrice - stopDist; // TP1 = 1R
          const takeProfit2 = isBuy ? entryPrice + targetDist : entryPrice - targetDist; // TP2 = 3.0 ATR

          // Validar relación Riesgo/Beneficio (mínimo 1.6)
          const risk = Math.abs(entryPrice - stopLoss);
          const reward = Math.abs(takeProfit2 - entryPrice);
          const rr = risk > 0 ? reward / risk : 0;

          if (rr < (this.config.minRiskReward || 1.6)) {
            continue;
          }

          // Calculate size en base a gestión de riesgo institucional
          const universeItem = meta.universe[assetIndex];
          const szDecimals = universeItem.szDecimals ?? 4;
          const targetLeverage = 1; // Apalancamiento 1x estricto

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

          const calculatedSize = positionSize(currentNetWorth, entryPrice, stopLoss, this.config.riskPerTradePct || 0.005);
          const formattedSz = formatHyperliquidSize(calculatedSize, szDecimals);

          if (formattedSz <= 0) {
            this.addLog('RISK', `⚠️ [OMITIDO] Nocional < $10 USD para ${coin} (${calculatedSize} calculado).`);
            continue;
          }

          const notionalUSD = formattedSz * entryPrice;

          const entryTelemetry = {
            rsi14: Number(rsiCurr.toFixed(2)),
            stochK: Number(stochK.toFixed(2)),
            stochD: Number(stochD.toFixed(2)),
            atr14: Number(currentAtr.toFixed(5)),
            fundingRate: Number((fundingRateRaw * 100).toFixed(4)),
            spreadPct: Number(spreadPct.toFixed(4)),
            emaTrend: markPx >= ema50Curr ? 'BULLISH' : 'BEARISH',
            macroTf: macroInfo?.macroTf || getMacroTimeframe(targetTimeframe),
            macroTrend: macroInfo?.trend || 'BULLISH',
            macroReason: macroInfo?.reason || 'Alineación confirmada',
            volume24hUSD: Number(dayVol.toFixed(2)),
            confluenceScore: signalScore,
            confluenceReasons: signalReason,
          };

          this.addLog(
            'SIGNAL',
            `⚡ [CONVICCIÓN ${signalScore}/100 + MTF ✅ ${entryTelemetry.macroTf}] Señal ${signalType} en ${coin} @ $${entryPrice} (${targetTimeframe}). ATR: $${currentAtr.toFixed(2)}. SL: $${stopLoss.toFixed(2)} (${atrStopMult}x ATR), TP1: $${takeProfit1.toFixed(2)} (1R), TP2: $${takeProfit2.toFixed(2)} (${atrTargetMult}x ATR). Sizing: ${formattedSz} ($${notionalUSD.toFixed(1)} USD, 1x).`
          );

          if (isDitto) {
            try {
              let limitPx = entryPrice;
              try {
                const book = await getBestBidAsk(coin);
                if (book) {
                  limitPx = isBuy ? (book.bestBid || entryPrice) : (book.bestAsk || entryPrice);
                }
              } catch (_) {}

              const dittoRes = await executeDittoOrder({
                apiKey: this.config.agentPrivateKey,
                coin,
                isBuy,
                sizeUsd: notionalUSD,
                leverage: targetLeverage,
                stopLoss,
                takeProfit1,
                limitPrice: limitPx,
              });

              if (dittoRes && dittoRes.ok !== false && !dittoRes.error) {
                this.addLog(
                  'EXECUTION',
                  `⚡ [DITTO EJECUTADO] ${signalType} $${Math.round(notionalUSD)} USD en ${coin} @ $${entryPrice} (1x Cross). SL: $${stopLoss.toFixed(2)}, TP1: $${takeProfit1.toFixed(2)}, TP2: $${takeProfit2.toFixed(2)}`
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
                  capitalUSD: notionalUSD,
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
              let limitPx = entryPrice;
              try {
                const book = await getBestBidAsk(coin);
                if (book) {
                  limitPx = isBuy ? (book.bestBid || entryPrice) : (book.bestAsk || entryPrice);
                }
              } catch (_) {}

              const execResult = await executeLimitOrderHyperliquid({
                exClient,
                assetIndex,
                coin,
                isBuy,
                size: formattedSz,
                limitPrice: limitPx,
                szDecimals,
                timeoutSec: 60,
                logFn: (msg) => this.addLog('EXECUTION', msg),
              });

              if (execResult.success) {
                const finalPx = parseFloat(execResult.formattedPx) || entryPrice;
                this.addLog(
                  'EXECUTION',
                  `⚡ [LIMIT ALO/GTC EJECUTADO] ${signalType} ${formattedSz} ${coin} @ $${execResult.formattedPx} (1x Cross). SL: $${stopLoss.toFixed(2)}, TP1: $${takeProfit1.toFixed(2)}, TP2: $${takeProfit2.toFixed(2)}`
                );

                this.state.stats.totalTrades++;
                this.state.stats.totalVolumeUSD += notionalUSD;

                this.state.positions.push({
                  coin,
                  side: signalType,
                  entryPrice: finalPx,
                  currentPrice: finalPx,
                  stopLoss: Number(stopLoss.toFixed(5)),
                  takeProfit1: Number(takeProfit1.toFixed(5)),
                  takeProfit2: Number(takeProfit2.toFixed(5)),
                  sz: formattedSz,
                  initialSz: formattedSz,
                  capitalUSD: notionalUSD,
                  leverage: targetLeverage,
                  isTP1Hit: false,
                  entryTime: Date.now(),
                  macroTf: entryTelemetry.macroTf,
                  macroTrend: entryTelemetry.macroTrend,
                  telemetry: entryTelemetry,
                });
                this.saveState();
              } else {
                this.addLog('ERROR', `Error en DEX al ejecutar ${coin}: ${execResult.error}`);
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

    return {
      isActive: this.config.isActive,
      walletAddress: this.config.walletAddress || '',
      hasAgentKey: hasKey,
      agentKeyType: isDitto ? 'DITTO_NETWORK' : 'HYPERLIQUID_DIRECT',
      maskedAgentKey: maskedKey,
      capitalPerTrade: this.config.capitalPerTrade,
      leverage: this.config.leverage,
      allowedSymbols: this.config.allowedSymbols,
      maxConcurrentTrades: this.config.maxConcurrentTrades,
      timeframe: this.config.timeframe || '1h',
      scanIntervalSeconds: this.config.scanIntervalSeconds || 60,
      minSignalScore: this.config.minSignalScore || 60,
      instantProfitTake: this.config.instantProfitTake ?? false,
      minInstantProfitUSD: this.config.minInstantProfitUSD ?? 2.25,
      maxDrawdownPercent: this.config.maxDrawdownPercent || 0.08,
      longOnly: this.config.longOnly !== false,
      requireMacroTrendConfirmation: this.config.requireMacroTrendConfirmation !== false,
      macroHierarchy: {
        baseTimeframe: this.config.timeframe || '1h',
        macroTimeframe: getMacroTimeframe(this.config.timeframe || '1h'),
        rule: `Timeframe ${this.config.timeframe || '1h'} requiere confirmación con ${getMacroTimeframe(this.config.timeframe || '1h')}`,
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
