import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getDataDir() {
  const custom = (process.env.BOT_DATA_DIR || '').trim();
  if (custom) {
    if (!fs.existsSync(custom)) {
      try {
        fs.mkdirSync(custom, { recursive: true });
      } catch {}
    }
    return custom;
  }
  return path.join(__dirname, '..');
}

/**
 * Normaliza y fuerza los límites estrictos de gestión de riesgo institucional:
 * - leverage = 1 fijo
 * - maxConcurrentTrades = 1 fijo
 * - riskPerTradePct en [0.005, 0.01] (0.5% - 1.0%), default 0.005
 * - dailyLossCapPct <= 0.03 (3.0%)
 * - maxConsecutiveLosses <= 3
 * - timeframe in {'5m', '15m', '1h'}, default '1h'
 * - allowedSymbols filtrado a {'BTC', 'ETH'}
 * - atrStopMult = 1.5, atrTargetMult = 3.0 por defecto
 */
export function clampRiskConfig(cfg = {}) {
  const clamped = { ...cfg };

  clamped.leverage = 1;
  clamped.maxConcurrentTrades = 1;

  let risk = typeof cfg.riskPerTradePct === 'number' ? cfg.riskPerTradePct : 0.005;
  if (risk < 0.005) risk = 0.005;
  if (risk > 0.01) risk = 0.01;
  clamped.riskPerTradePct = risk;

  let dailyCap = typeof cfg.dailyLossCapPct === 'number' ? cfg.dailyLossCapPct : 0.03;
  if (dailyCap > 0.03) dailyCap = 0.03;
  if (dailyCap <= 0) dailyCap = 0.03;
  clamped.dailyLossCapPct = dailyCap;

  let maxLosses = typeof cfg.maxConsecutiveLosses === 'number' ? Math.floor(cfg.maxConsecutiveLosses) : 3;
  if (maxLosses > 3 || maxLosses < 1) maxLosses = 3;
  clamped.maxConsecutiveLosses = maxLosses;

  const validTfs = ['5m', '15m', '1h'];
  clamped.timeframe = validTfs.includes(cfg.timeframe) ? cfg.timeframe : '1h';

  const validSymbols = new Set(['BTC', 'ETH']);
  const rawSymbols = Array.isArray(cfg.allowedSymbols) ? cfg.allowedSymbols : ['BTC', 'ETH'];
  const filtered = rawSymbols
    .map((s) => String(s || '').toUpperCase().trim().replace(/[-_]?(PERP|USDT)$/i, ''))
    .filter((s) => validSymbols.has(s));

  clamped.allowedSymbols = filtered.length > 0 ? Array.from(new Set(filtered)) : ['BTC', 'ETH'];

  clamped.atrStopMult = typeof cfg.atrStopMult === 'number' && cfg.atrStopMult > 0 ? cfg.atrStopMult : 1.5;
  clamped.atrTargetMult = typeof cfg.atrTargetMult === 'number' && cfg.atrTargetMult > 0 ? cfg.atrTargetMult : 3.0;

  // Desactivar instant profit take por defecto (cerraba ganancias en ~$2 y dejaba correr pérdidas)
  clamped.instantProfitTake = false;
  clamped.usePatternSignals = false;

  return clamped;
}

/**
 * Calcula el tamaño de posición exacto en base al riesgo:
 * size = (equity * riskPct) / |entry - stop|
 * Limitado a apalancamiento 1x (nocional <= equity).
 * Si el nocional es menor de $10 USD, se omite la operación (devuelve 0).
 */
export function positionSize(equity, entryPrice, stopPrice, riskPct = 0.005) {
  if (!equity || equity <= 0 || !entryPrice || entryPrice <= 0 || !stopPrice || stopPrice <= 0) {
    return 0;
  }
  const riskAmount = equity * riskPct;
  const dist = Math.abs(entryPrice - stopPrice);
  if (dist <= 0) return 0;

  const rawSize = riskAmount / dist;
  const maxNotional = equity * 1;
  const maxSize = maxNotional / entryPrice;
  const size = Math.min(rawSize, maxSize);

  const notional = size * entryPrice;
  if (notional < 10) {
    return 0;
  }
  return size;
}

/**
 * RiskGuard: Guarda y aplica los límites diarios y de pérdidas consecutivas.
 * Persiste en bot-risk-state.json y se reinicia a las 00:00 UTC.
 */
export class RiskGuard {
  constructor(filePath) {
    this.filePath = filePath || path.join(getDataDir(), 'bot-risk-state.json');
    this.state = {
      currentDate: new Date().toISOString().slice(0, 10),
      consecutiveLosses: 0,
      dailyRealizedPnl: 0,
      dayStartEquity: 0,
    };
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          this.state = { ...this.state, ...parsed };
        }
      }
    } catch (e) {
      console.warn('[RiskGuard] Error cargando bot-risk-state.json:', e.message);
    }
  }

  save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf8');
    } catch (e) {
      console.error('[RiskGuard] Error guardando bot-risk-state.json:', e.message);
    }
  }

  checkDateReset(currentEquity) {
    const today = new Date().toISOString().slice(0, 10);
    if (this.state.currentDate !== today) {
      this.state.currentDate = today;
      this.state.dailyRealizedPnl = 0;
      this.state.consecutiveLosses = 0;
      if (currentEquity && currentEquity > 0) {
        this.state.dayStartEquity = currentEquity;
      }
      this.save();
    } else if ((!this.state.dayStartEquity || this.state.dayStartEquity <= 0) && currentEquity && currentEquity > 0) {
      this.state.dayStartEquity = currentEquity;
      this.save();
    }
  }

  canTrade(currentEquity) {
    if (typeof currentEquity !== 'number' || isNaN(currentEquity) || currentEquity <= 0) {
      return { allowed: false, reason: 'No se puede leer el capital de la cuenta' };
    }

    this.checkDateReset(currentEquity);

    if (this.state.consecutiveLosses >= 3) {
      return { allowed: false, reason: 'Bloqueado por 3 pérdidas consecutivas' };
    }

    const startEquity = this.state.dayStartEquity || currentEquity;
    if (startEquity > 0) {
      // Pérdida diaria realizada >= 3%
      if (this.state.dailyRealizedPnl <= -0.03 * startEquity) {
        return { allowed: false, reason: 'Bloqueado por pérdida diaria realizada >= 3%' };
      }
      // Pérdida total por caída de capital intra-día >= 3%
      const equityDrop = startEquity - currentEquity;
      if (equityDrop >= 0.03 * startEquity) {
        return { allowed: false, reason: 'Bloqueado por caída de capital intra-día >= 3%' };
      }
      // Kill-switch general de -8%
      if (equityDrop >= 0.08 * startEquity) {
        return { allowed: false, reason: 'Kill-switch activado (-8% de caída)' };
      }
    }

    return { allowed: true };
  }

  recordTrade(pnlUSD) {
    const pnl = Number(pnlUSD) || 0;
    this.state.dailyRealizedPnl += pnl;
    if (pnl < 0) {
      this.state.consecutiveLosses += 1;
    } else if (pnl > 0) {
      this.state.consecutiveLosses = 0;
    }
    this.save();
  }
}
