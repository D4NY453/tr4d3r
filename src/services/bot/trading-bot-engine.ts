import {
  TradingSignal,
  PaperPosition,
  BotConfig,
  Timeframe,
  MacroTrend,
  MicroCandle,
  SubFund,
  BankTestSummary,
  ClosedTrade,
  MarketRegimeInfo,
  MarketRegimeType,
} from '@/types';
import { roundPriceDynamic } from '../indicators/calculations';

export { roundPriceDynamic };

export interface BotDecisionResult {
  approved: boolean;
  score: number;
  reason: string;
  orderType: 'MARKET' | 'LIMIT';
  numericRR: number;
  macroTimeframe?: Timeframe;
  macroConfirmed?: boolean;
}

/**
 * Jerarquía de Tendencias Multitemporal (MTF):
 * 1. Gráfico Diario (1D): Solo se permiten operaciones si respeta la tendencia macro del Gráfico Semanal (1W).
 * 2. Gráfico de 4H / 1H: Solo se permiten operaciones si respeta la tendencia del Gráfico Diario (1D).
 * 3. Gráfico de 15m / 30m: Solo se permiten operaciones si respeta la tendencia del Gráfico de 4H.
 * 4. Gráfico de 1m / 5m (ejecución rápida / scalping): Solo se permiten entradas si respeta la tendencia del Gráfico de 15m - 30m.
 * 5. Micro-velas en tiempo real:
 *    - 1s y 3s confirman dinámicamente con 15s.
 *    - 5s confirma dinámicamente con 1m (o 15s según fondo).
 *    - Fondo #10 exige doble confirmación (15s + 1m).
 */
export function getMacroTimeframe(baseTf: Timeframe | string): Timeframe {
  switch (baseTf) {
    case '1s':
    case '3s':
      return '15s'; // Micro-scalp 1s/3s confirma con 15s
    case '5s':
      return '1m';  // Micro-scalp 5s confirma con 1m
    case '15s':
      return '1m';  // 15s confirma con 1m
    case '1m':
    case '5m':
      return '15m'; // Nivel 4: 1m/5m respeta 15m
    case '15m':
    case '30m':
      return '4h';  // Nivel 3: 15m/30m respeta 4h
    case '1h':
    case '4h':
      return '1d';  // Nivel 2: 1h/4h respeta 1D
    case '1d':
    case '1D':
      return '1w';  // Nivel 1: 1D respeta 1W
    default:
      return '15m';
  }
}

/**
 * Parsea el ratio R:R a un número decimal para comparación.
 * Ejemplos: "1:1.5" -> 1.5, "1:2.0" -> 2.0, "1:1.5 / 1:2.5" -> 1.5
 */
export function parseRiskRewardRatio(rrString: string): number {
  if (!rrString) return 1.0;
  const match = rrString.match(/1:([0-9.]+)/);
  if (match && match[1]) {
    const val = parseFloat(match[1]);
    return isNaN(val) ? 1.0 : val;
  }
  return 1.0;
}

/**
 * Evalúa una oportunidad técnica para determinar si el Bot debe ejecutarla automáticamente
 */
export function evaluateOpportunityForBot(
  signal: TradingSignal,
  currentPrice: number,
  activePositions: PaperPosition[],
  botConfig: BotConfig
): BotDecisionResult {
  const macroTf = signal.macroTimeframe || getMacroTimeframe(signal.timeframe);

  // 0. Regla de Dirección de Operación (Ambas / Solo Compras / Solo Ventas)
  // En modo test/paper trading por defecto se ejecutan tanto compras (BUY) como ventas (SELL)
  if ((botConfig.tradeDirection === 'LONG_ONLY' || botConfig.longOnly === true) && signal.type === 'SELL') {
    return {
      approved: false,
      score: 0,
      reason: 'Veto Long Only: El bot está configurado exclusivamente para compras (LONG ONLY)',
      orderType: botConfig.autoOrderType,
      numericRR: 1.0,
      macroTimeframe: macroTf,
      macroConfirmed: false,
    };
  } else if (botConfig.tradeDirection === 'SHORT_ONLY' && signal.type === 'BUY') {
    return {
      approved: false,
      score: 0,
      reason: 'Veto Short Only: El bot está configurado exclusivamente para ventas (SHORT ONLY)',
      orderType: botConfig.autoOrderType,
      numericRR: 1.0,
      macroTimeframe: macroTf,
      macroConfirmed: false,
    };
  }

  // 0b. Regla Estricta de Jerarquía Multitemporal (MTF):
  // Valida que el timeframe macro confirme la dirección de la orden:
  // - Para COMPRA (BUY): la macro tendencia debe confirmar dirección alcista (BULLISH)
  // - Para VENTA (SELL): la macro tendencia debe confirmar dirección bajista (BEARISH)
  if (botConfig.requireMacroTrendConfirmation !== false) {
    if (signal.type === 'BUY') {
      if (signal.macroConfirmed === false || (signal.macroTrend && signal.macroTrend !== 'BULLISH')) {
        return {
          approved: false,
          score: 30,
          reason: `Veto Jerarquía MTF: Timeframe macro (${macroTf}) no confirma tendencia alcista para COMPRA (${signal.macroReason || signal.macroTrend || 'Bajista/Neutro'}). Entrada descartada por desalineación temporal`,
          orderType: botConfig.autoOrderType,
          numericRR: parseRiskRewardRatio(signal.riskReward),
          macroTimeframe: macroTf,
          macroConfirmed: false,
        };
      }
    } else if (signal.type === 'SELL') {
      if (signal.macroConfirmed === false || (signal.macroTrend && signal.macroTrend !== 'BEARISH')) {
        return {
          approved: false,
          score: 30,
          reason: `Veto Jerarquía MTF: Timeframe macro (${macroTf}) no confirma tendencia bajista para VENTA (${signal.macroReason || signal.macroTrend || 'Alcista/Neutro'}). Entrada descartada por desalineación temporal`,
          orderType: botConfig.autoOrderType,
          numericRR: parseRiskRewardRatio(signal.riskReward),
          macroTimeframe: macroTf,
          macroConfirmed: false,
        };
      }
    }
  }

  // 1. Verificar si la estrategia está habilitada
  if (botConfig.enabledStrategies.length > 0 && !botConfig.enabledStrategies.includes(signal.strategy)) {
    return {
      approved: false,
      score: 30,
      reason: `Estrategia "${signal.strategy}" no habilitada en la configuración del bot`,
      orderType: botConfig.autoOrderType,
      numericRR: 1.0,
      macroTimeframe: macroTf,
      macroConfirmed: signal.macroConfirmed,
    };
  }

  // 1b. Verificar activos permitidos (si está vacío o contiene 'ALL', permite todos los Perps, Memes y Predictions)
  const allowedList = botConfig.allowedSymbols || [];
  if (allowedList.length > 0 && !allowedList.includes('ALL')) {
    const cleanCoin = signal.symbol.replace(/(-PERP|USDT|\/USD)$/i, '').toUpperCase();
    const isAllowed = allowedList.some((allowed) => {
      const cleanAllowed = allowed.replace(/(-PERP|USDT|\/USD)$/i, '').toUpperCase();
      return cleanAllowed === cleanCoin || allowed.toUpperCase() === signal.symbol.toUpperCase();
    });

    if (!isAllowed) {
      return {
        approved: false,
        score: 0,
        reason: `Activo ${signal.symbol} descartado: sólo permitidos (${allowedList.join(', ')})`,
        orderType: botConfig.autoOrderType,
        numericRR: 1.0,
      };
    }
  }

  // 2. Verificar límite de posiciones simultáneas
  if (activePositions.length >= botConfig.maxConcurrentTrades) {
    return {
      approved: false,
      score: 50,
      reason: `Límite de posiciones activas alcanzado (${activePositions.length}/${botConfig.maxConcurrentTrades} máx)`,
      orderType: botConfig.autoOrderType,
      numericRR: 1.0,
    };
  }

  // 3. Verificar si ya hay una posición abierta en el mismo activo
  const existingPos = activePositions.find((p) => p.symbol === signal.symbol);
  if (existingPos) {
    return {
      approved: false,
      score: 55,
      reason: `Ya tienes una posición ${existingPos.type} abierta en ${signal.symbol}`,
      orderType: botConfig.autoOrderType,
      numericRR: 1.0,
    };
  }

  // 4. Evaluar Ratio Riesgo/Beneficio
  const numericRR = parseRiskRewardRatio(signal.riskReward);
  if (numericRR < botConfig.minRiskReward) {
    return {
      approved: false,
      score: 45,
      reason: `Ratio R:R de 1:${numericRR.toFixed(1)} es inferior al mínimo requerido de 1:${botConfig.minRiskReward.toFixed(1)}`,
      orderType: botConfig.autoOrderType,
      numericRR,
    };
  }

  // 5. Calcular Score de Confluencia Técnica (0 - 100)
  let score = 65; // Base de confianza inicial

  // Bonificación por R:R excelente
  if (numericRR >= 2.0) score += 15;
  else if (numericRR >= 1.5) score += 10;

  // Bonificación por distancia saludable a Take Profit
  const tpDistPct = Math.abs(signal.takeProfit1 - signal.price) / signal.price;
  if (tpDistPct >= 0.008) score += 10; // > 0.8%

  // Bonificación por Stop Loss razonable (< 2.5% para evitar sobre-riesgo)
  const slDistPct = Math.abs(signal.price - signal.stopLoss) / signal.price;
  if (slDistPct > 0.003 && slDistPct < 0.025) score += 10;

  // 6. Verificar si cumple el puntaje mínimo de confianza
  if (score < botConfig.minConfidenceScore) {
    return {
      approved: false,
      score,
      reason: `Confluencia técnica (${score}%) por debajo del umbral mínimo (${botConfig.minConfidenceScore}%)`,
      orderType: botConfig.autoOrderType,
      numericRR,
    };
  }

  // APROBADA
  return {
    approved: true,
    score,
    reason: `Setup verificado (${signal.type === 'BUY' ? 'COMPRA' : 'VENTA'}) con R:R 1:${numericRR.toFixed(1)}, macro ${macroTf} ${signal.type === 'BUY' ? 'ALCISTA' : 'BAJISTA'} y confluencia de ${score}%`,
    orderType: botConfig.autoOrderType,
    numericRR,
    macroTimeframe: macroTf,
    macroConfirmed: true,
  };
}

/* ==========================================================================
   BANCO DE PRUEBAS DE $100,000 USD (10 SUB-FONDOS DE $10,000 A 0% FEE)
   MOTOR DE MICRO-VELAS EN TIEMPO REAL (1s, 3s, 5s, 15s) Y ROLLING WINDOW
   ========================================================================== */

export interface PriceTick {
  price: number;
  volume: number;
  timestamp: number;
}

/**
 * Ventana móvil en vivo (Rolling Window) para construir micro-velas
 * sin esperar a que el exchange cierre la vela.
 */
export class TickRollingWindow {
  private ticks: PriceTick[] = [];
  private maxAgeMs: number;

  constructor(maxAgeSeconds: number = 300) {
    this.maxAgeMs = maxAgeSeconds * 1000;
  }

  public addTick(price: number, volume: number = 1, timestamp: number = Date.now()): void {
    if (!price || isNaN(price) || price <= 0) return;
    this.ticks.push({ price, volume, timestamp });
    const cutoff = timestamp - this.maxAgeMs;
    while (this.ticks.length > 0 && this.ticks[0].timestamp < cutoff) {
      this.ticks.shift();
    }
  }

  public getTicksCount(): number {
    return this.ticks.length;
  }

  public getLatestPrice(): number {
    if (this.ticks.length === 0) return 0;
    return this.ticks[this.ticks.length - 1].price;
  }

  /**
   * Construye micro-velas (1s, 3s, 5s, 15s, 60s) agrupando la ventana móvil de ticks
   */
  public buildCandles(bucketSeconds: number, maxCandles: number = 50): MicroCandle[] {
    if (this.ticks.length === 0) return [];

    const bucketMs = bucketSeconds * 1000;
    const candlesMap = new Map<number, MicroCandle>();

    for (const tick of this.ticks) {
      const bucketTime = Math.floor(tick.timestamp / bucketMs) * bucketMs;
      const existing = candlesMap.get(bucketTime);
      if (!existing) {
        candlesMap.set(bucketTime, {
          time: bucketTime,
          open: tick.price,
          high: tick.price,
          low: tick.price,
          close: tick.price,
          volume: tick.volume,
        });
      } else {
        existing.high = Math.max(existing.high, tick.price);
        existing.low = Math.min(existing.low, tick.price);
        existing.close = tick.price;
        existing.volume += tick.volume;
      }
    }

    const sorted = Array.from(candlesMap.values()).sort((a, b) => a.time - b.time);
    return sorted.slice(-maxCandles);
  }

  /**
   * Calcula la tendencia micro (BULLISH, BEARISH, NEUTRAL) para el bucket dado (15s o 60s)
   */
  public getMicroTrend(bucketSeconds: number): MacroTrend {
    const candles = this.buildCandles(bucketSeconds, 20);
    if (candles.length < 2) {
      if (this.ticks.length >= 2) {
        const first = this.ticks[0].price;
        const last = this.ticks[this.ticks.length - 1].price;
        if (last > first) return 'BULLISH';
        if (last < first) return 'BEARISH';
      }
      return 'NEUTRAL';
    }

    const closes = candles.map((c) => c.close);
    const n = closes.length;
    const latest = closes[n - 1];
    const prev = closes[n - 2];
    const first = closes[0];

    // Media móvil de ventana rápida
    const sum = closes.reduce((a, b) => a + b, 0);
    const sma = sum / n;

    if (latest > sma && latest >= prev && latest > first) {
      return 'BULLISH';
    } else if (latest < sma && latest <= prev && latest < first) {
      return 'BEARISH';
    } else if (latest > sma) {
      return 'BULLISH';
    } else if (latest < sma) {
      return 'BEARISH';
    }
    return 'NEUTRAL';
  }

  /**
   * Filtro de Régimen y Sentimiento (Grok / Heurístico sin latencia)
   * Analiza los últimos 30 segundos de micro-velas y clasifica el mercado en:
   * - TRENDING: Movimiento direccional eficiente y limpio
   * - RANGING: Consolidación lateral con volatilidad normal
   * - TOXIC_CHOP: Alta frecuencia de cruces contradictorios o volatilidad muerta
   */
  public getMarketRegime(): MarketRegimeInfo {
    const candles = this.buildCandles(1, 30);
    if (candles.length < 5) {
      return {
        regime: 'RANGING',
        sentiment: 'NEUTRAL',
        confidence: 50,
        reason: 'Acumulando micro-ticks (muestra < 5s)',
      };
    }

    const closes = candles.map((c) => c.close);
    const n = closes.length;
    const firstClose = closes[0];
    const lastClose = closes[n - 1];

    // 1. Rango de volatilidad en 30s
    const maxHigh = Math.max(...candles.map((c) => c.high));
    const minLow = Math.min(...candles.map((c) => c.low));
    const priceSpan = maxHigh - minLow;
    const avgPrice = lastClose || 1;
    const rangePct = priceSpan / avgPrice;

    // 2. Eficiencia de Kaufman (Net Move vs Total Path) y alternancia de signos
    const netMove = Math.abs(lastClose - firstClose);
    let totalPath = 0;
    let flips = 0;

    for (let i = 1; i < n; i++) {
      const diff = Math.abs(closes[i] - closes[i - 1]);
      totalPath += diff;

      const currentDir = closes[i] - closes[i - 1];
      const prevDir = i >= 2 ? closes[i - 1] - closes[i - 2] : 0;
      if (currentDir * prevDir < 0) {
        flips++;
      }
    }

    const efficiency = totalPath > 0 ? netMove / totalPath : 0;
    const flipRate = n > 2 ? flips / (n - 2) : 0;

    // Detección de TOXIC_CHOP:
    // - Volatilidad muerta (rangePct < 0.00015 en 30s)
    // - O alta alternancia con muy baja eficiencia direccional (flipRate >= 0.55 && efficiency < 0.25)
    // - O eficiencia extremadamente pobre con muestra suficiente (efficiency < 0.15 && n >= 15)
    const isDeadVol = rangePct < 0.00015;
    const isWhipsaw = flipRate >= 0.55 && efficiency < 0.25;
    const isExtremeChop = efficiency < 0.15 && n >= 15;

    if (isDeadVol || isWhipsaw || isExtremeChop) {
      return {
        regime: 'TOXIC_CHOP',
        sentiment: 'NEUTRAL',
        confidence: Math.min(95, Math.round((1 - efficiency) * 100)),
        reason: isDeadVol
          ? 'Volatilidad muerta en micro-rango (< 0.015% en 30s)'
          : 'Alta frecuencia de cruces contradictorios y oscilación errática (Whipsaw)',
      };
    }

    // Detección de TRENDING:
    if (efficiency >= 0.45 && rangePct >= 0.0003) {
      const isBull = lastClose > firstClose;
      return {
        regime: 'TRENDING',
        sentiment: isBull ? 'BULLISH' : 'BEARISH',
        confidence: Math.min(95, Math.round(efficiency * 100)),
        reason: isBull
          ? `Tendencia alcista limpia (Eficiencia ${(efficiency * 100).toFixed(0)}%)`
          : `Tendencia bajista limpia (Eficiencia ${(efficiency * 100).toFixed(0)}%)`,
      };
    }

    // RANGING normal (consolidación balanceada):
    const sentiment = lastClose > firstClose ? 'BULLISH' : lastClose < firstClose ? 'BEARISH' : 'NEUTRAL';
    return {
      regime: 'RANGING',
      sentiment,
      confidence: 65,
      reason: 'Consolidación en rango normal con volatilidad balanceada',
    };
  }

  public clear(): void {
    this.ticks = [];
  }
}

export const globalTickRollingWindow = new TickRollingWindow(300);

/**
 * Inicializa los 10 Sub-Fondos de $10,000 USD cada uno ($100,000 total)
 * con comisiones a 0% (fee = 0) para medir la puntería pura.
 */
export function createInitialSubFunds(): SubFund[] {
  return [
    {
      id: 'fund-1',
      name: 'Fondo #1 - SuperTrend Micro (1s / 15s)',
      initialCapital: 10000,
      currentCapital: 10000,
      executionTimeframe: '1s',
      confirmTimeframe: '15s',
      strategy: 'SuperTrend Trend-Following',
      feeRate: 0,
      activePosition: null,
      closedTrades: [],
      stats: { totalTrades: 0, wins: 0, losses: 0, winRate: 0, purePnL: 0, makerNetPnL: 0, takerNetPnL: 0, peakCapital: 10000, maxDrawdownPercent: 0 },
    },
    {
      id: 'fund-2',
      name: 'Fondo #2 - Bollinger Bands Reversal (1s / 15s)',
      initialCapital: 10000,
      currentCapital: 10000,
      executionTimeframe: '1s',
      confirmTimeframe: '15s',
      strategy: 'Bollinger Bands Reversal',
      feeRate: 0,
      activePosition: null,
      closedTrades: [],
      stats: { totalTrades: 0, wins: 0, losses: 0, winRate: 0, purePnL: 0, makerNetPnL: 0, takerNetPnL: 0, peakCapital: 10000, maxDrawdownPercent: 0 },
    },
    {
      id: 'fund-3',
      name: 'Fondo #3 - EMA Golden Cross (3s / 15s)',
      initialCapital: 10000,
      currentCapital: 10000,
      executionTimeframe: '3s',
      confirmTimeframe: '15s',
      strategy: 'EMA 20/50 Golden Cross',
      feeRate: 0,
      activePosition: null,
      closedTrades: [],
      stats: { totalTrades: 0, wins: 0, losses: 0, winRate: 0, purePnL: 0, makerNetPnL: 0, takerNetPnL: 0, peakCapital: 10000, maxDrawdownPercent: 0 },
    },
    {
      id: 'fund-4',
      name: 'Fondo #4 - MACD Crossover Momentum (3s / 15s)',
      initialCapital: 10000,
      currentCapital: 10000,
      executionTimeframe: '3s',
      confirmTimeframe: '15s',
      strategy: 'MACD Crossover + Momentum',
      feeRate: 0,
      activePosition: null,
      closedTrades: [],
      stats: { totalTrades: 0, wins: 0, losses: 0, winRate: 0, purePnL: 0, makerNetPnL: 0, takerNetPnL: 0, peakCapital: 10000, maxDrawdownPercent: 0 },
    },
    {
      id: 'fund-5',
      name: 'Fondo #5 - RSI + Stoch Confluence (5s / 15s)',
      initialCapital: 10000,
      currentCapital: 10000,
      executionTimeframe: '5s',
      confirmTimeframe: '15s',
      strategy: 'RSI + Stochastic Confluence',
      feeRate: 0,
      activePosition: null,
      closedTrades: [],
      stats: { totalTrades: 0, wins: 0, losses: 0, winRate: 0, purePnL: 0, makerNetPnL: 0, takerNetPnL: 0, peakCapital: 10000, maxDrawdownPercent: 0 },
    },
    {
      id: 'fund-6',
      name: 'Fondo #6 - SuperTrend Micro (1s / 1m)',
      initialCapital: 10000,
      currentCapital: 10000,
      executionTimeframe: '1s',
      confirmTimeframe: '1m',
      strategy: 'SuperTrend Trend-Following',
      feeRate: 0,
      activePosition: null,
      closedTrades: [],
      stats: { totalTrades: 0, wins: 0, losses: 0, winRate: 0, purePnL: 0, makerNetPnL: 0, takerNetPnL: 0, peakCapital: 10000, maxDrawdownPercent: 0 },
    },
    {
      id: 'fund-7',
      name: 'Fondo #7 - Bollinger Bands Reversal (3s / 1m)',
      initialCapital: 10000,
      currentCapital: 10000,
      executionTimeframe: '3s',
      confirmTimeframe: '1m',
      strategy: 'Bollinger Bands Reversal',
      feeRate: 0,
      activePosition: null,
      closedTrades: [],
      stats: { totalTrades: 0, wins: 0, losses: 0, winRate: 0, purePnL: 0, makerNetPnL: 0, takerNetPnL: 0, peakCapital: 10000, maxDrawdownPercent: 0 },
    },
    {
      id: 'fund-8',
      name: 'Fondo #8 - EMA Golden Cross (3s / 1m)',
      initialCapital: 10000,
      currentCapital: 10000,
      executionTimeframe: '3s',
      confirmTimeframe: '1m',
      strategy: 'EMA 20/50 Golden Cross',
      feeRate: 0,
      activePosition: null,
      closedTrades: [],
      stats: { totalTrades: 0, wins: 0, losses: 0, winRate: 0, purePnL: 0, makerNetPnL: 0, takerNetPnL: 0, peakCapital: 10000, maxDrawdownPercent: 0 },
    },
    {
      id: 'fund-9',
      name: 'Fondo #9 - RSI + Stoch Confluence (5s / 1m)',
      initialCapital: 10000,
      currentCapital: 10000,
      executionTimeframe: '5s',
      confirmTimeframe: '1m',
      strategy: 'RSI + Stochastic Confluence',
      feeRate: 0,
      activePosition: null,
      closedTrades: [],
      stats: { totalTrades: 0, wins: 0, losses: 0, winRate: 0, purePnL: 0, makerNetPnL: 0, takerNetPnL: 0, peakCapital: 10000, maxDrawdownPercent: 0 },
    },
    {
      id: 'fund-10',
      name: 'Fondo #10 - Alpha Multi-Confluence (5s / 15s + 1m)',
      initialCapital: 10000,
      currentCapital: 10000,
      executionTimeframe: '5s',
      confirmTimeframe: '15s+1m',
      strategy: 'Alpha Multi-Confluence (EMA + MACD + RSI)',
      feeRate: 0,
      activePosition: null,
      closedTrades: [],
      stats: { totalTrades: 0, wins: 0, losses: 0, winRate: 0, purePnL: 0, makerNetPnL: 0, takerNetPnL: 0, peakCapital: 10000, maxDrawdownPercent: 0 },
    },
  ];
}

/**
 * Evalúa señales técnicas en micro-velas (1s, 3s, 5s) para los sub-fondos
 */
export function evaluateMicroStrategy(
  strategyName: string,
  candles: MicroCandle[],
  currentPrice: number,
  macroTrend1m: MacroTrend = 'NEUTRAL'
): { action: 'BUY' | 'SELL' | 'HOLD'; reason: string; stopLoss: number; takeProfit1: number; takeProfit2: number } {
  if (candles.length < 3 || currentPrice <= 0) {
    return { action: 'HOLD', reason: 'Acumulando micro-ticks', stopLoss: 0, takeProfit1: 0, takeProfit2: 0 };
  }

  const lastCandle = candles[candles.length - 1];
  const closes = candles.map((c) => c.close);
  const n = closes.length;
  const cLast = closes[n - 1];
  const cPrev = closes[n - 2];

  // Estimación de rango de volatilidad micro
  const vol = Math.max(
    Math.abs(lastCandle.high - lastCandle.low),
    currentPrice * 0.0006
  );
  const slDist = vol * 1.5;
  const tp1Dist = vol * 2.2;
  const tp2Dist = vol * 3.8;

  const smaFast = closes.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, n);
  const smaSlow = closes.slice(-7).reduce((a, b) => a + b, 0) / Math.min(7, n);

  // 1. SuperTrend Micro
  if (strategyName.includes('SuperTrend')) {
    if (cLast > smaFast && smaFast >= smaSlow) {
      return {
        action: 'BUY',
        reason: 'SuperTrend Micro Alcista (Precio > SMA rápida)',
        stopLoss: roundPriceDynamic(currentPrice - slDist),
        takeProfit1: roundPriceDynamic(currentPrice + tp1Dist),
        takeProfit2: roundPriceDynamic(currentPrice + tp2Dist),
      };
    } else if (cLast < smaFast && smaFast <= smaSlow) {
      return {
        action: 'SELL',
        reason: 'SuperTrend Micro Bajista (Precio < SMA rápida)',
        stopLoss: roundPriceDynamic(currentPrice + slDist),
        takeProfit1: roundPriceDynamic(currentPrice - tp1Dist),
        takeProfit2: roundPriceDynamic(currentPrice - tp2Dist),
      };
    }
  }

  // 2. Bollinger Bands Reversal
  if (strategyName.includes('Bollinger')) {
    const mean = closes.reduce((a, b) => a + b, 0) / n;
    const variance = closes.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
    const std = Math.sqrt(variance);
    const upper = mean + std * 1.6;
    const lower = mean - std * 1.6;

    // Exige confirmación de giro en la vela (cLast >= cPrev para BUY y cLast <= cPrev para SELL)
    // y permite que entren siempre que la tendencia de 1m no esté fuertemente en contra
    if (currentPrice <= lower && cLast >= cPrev && macroTrend1m !== 'BEARISH') {
      return {
        action: 'BUY',
        reason: 'Rebote y Giro Alcista en Banda Inferior de Bollinger',
        stopLoss: roundPriceDynamic(currentPrice - slDist),
        takeProfit1: roundPriceDynamic(currentPrice + tp1Dist),
        takeProfit2: roundPriceDynamic(currentPrice + tp2Dist),
      };
    } else if (currentPrice >= upper && cLast <= cPrev && macroTrend1m !== 'BULLISH') {
      return {
        action: 'SELL',
        reason: 'Rechazo y Giro Bajista en Banda Superior de Bollinger',
        stopLoss: roundPriceDynamic(currentPrice + slDist),
        takeProfit1: roundPriceDynamic(currentPrice - tp1Dist),
        takeProfit2: roundPriceDynamic(currentPrice - tp2Dist),
      };
    }
  }

  // 3. EMA Golden Cross
  if (strategyName.includes('EMA')) {
    if (smaFast > smaSlow && cPrev <= smaSlow) {
      return {
        action: 'BUY',
        reason: 'Cruce Dorado Micro EMA (Fast cruzó arriba de Slow)',
        stopLoss: roundPriceDynamic(currentPrice - slDist),
        takeProfit1: roundPriceDynamic(currentPrice + tp1Dist),
        takeProfit2: roundPriceDynamic(currentPrice + tp2Dist),
      };
    } else if (smaFast < smaSlow && cPrev >= smaSlow) {
      return {
        action: 'SELL',
        reason: 'Cruce Bajista Micro EMA (Fast cruzó abajo de Slow)',
        stopLoss: roundPriceDynamic(currentPrice + slDist),
        takeProfit1: roundPriceDynamic(currentPrice - tp1Dist),
        takeProfit2: roundPriceDynamic(currentPrice - tp2Dist),
      };
    }
  }

  // 4. MACD Crossover Momentum
  if (strategyName.includes('MACD')) {
    const momentum = cLast - smaSlow;
    if (momentum > 0 && cLast > cPrev) {
      return {
        action: 'BUY',
        reason: 'Impulso Alcista MACD Micro',
        stopLoss: roundPriceDynamic(currentPrice - slDist),
        takeProfit1: roundPriceDynamic(currentPrice + tp1Dist),
        takeProfit2: roundPriceDynamic(currentPrice + tp2Dist),
      };
    } else if (momentum < 0 && cLast < cPrev) {
      return {
        action: 'SELL',
        reason: 'Impulso Bajista MACD Micro',
        stopLoss: roundPriceDynamic(currentPrice + slDist),
        takeProfit1: roundPriceDynamic(currentPrice - tp1Dist),
        takeProfit2: roundPriceDynamic(currentPrice - tp2Dist),
      };
    }
  }

  // 5. RSI + Stochastic Confluence
  if (strategyName.includes('RSI')) {
    let gains = 0;
    let losses = 0;
    for (let i = 1; i < n; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff > 0) gains += diff;
      else losses += Math.abs(diff);
    }
    // Corrección de RSI en mercado plano: si gains === 0 && losses === 0, RSI es 50
    const rsi = gains === 0 && losses === 0
      ? 50
      : losses === 0
      ? 100
      : 100 - 100 / (1 + gains / losses);

    // Exige confirmación de giro en la vela (cLast >= cPrev para BUY y cLast <= cPrev para SELL)
    // y permite que entren siempre que la tendencia de 1m no esté fuertemente en contra
    if (rsi <= 35 && cLast >= cPrev && macroTrend1m !== 'BEARISH') {
      return {
        action: 'BUY',
        reason: `Sobreventa RSI Micro (${rsi.toFixed(0)}) con Giro Alcista`,
        stopLoss: roundPriceDynamic(currentPrice - slDist),
        takeProfit1: roundPriceDynamic(currentPrice + tp1Dist),
        takeProfit2: roundPriceDynamic(currentPrice + tp2Dist),
      };
    } else if (rsi >= 65 && cLast <= cPrev && macroTrend1m !== 'BULLISH') {
      return {
        action: 'SELL',
        reason: `Sobrecompra RSI Micro (${rsi.toFixed(0)}) con Giro Bajista`,
        stopLoss: roundPriceDynamic(currentPrice + slDist),
        takeProfit1: roundPriceDynamic(currentPrice - tp1Dist),
        takeProfit2: roundPriceDynamic(currentPrice - tp2Dist),
      };
    }
  }

  // 6. Alpha Multi-Confluence
  if (strategyName.includes('Alpha')) {
    if (smaFast > smaSlow && cLast > cPrev) {
      return {
        action: 'BUY',
        reason: 'Confluencia Alpha Micro Alcista',
        stopLoss: roundPriceDynamic(currentPrice - slDist),
        takeProfit1: roundPriceDynamic(currentPrice + tp1Dist),
        takeProfit2: roundPriceDynamic(currentPrice + tp2Dist),
      };
    } else if (smaFast < smaSlow && cLast < cPrev) {
      return {
        action: 'SELL',
        reason: 'Confluencia Alpha Micro Bajista',
        stopLoss: roundPriceDynamic(currentPrice + slDist),
        takeProfit1: roundPriceDynamic(currentPrice - tp1Dist),
        takeProfit2: roundPriceDynamic(currentPrice - tp2Dist),
      };
    }
  }

  return { action: 'HOLD', reason: 'Esperando confluencia micro', stopLoss: 0, takeProfit1: 0, takeProfit2: 0 };
}

/**
 * Ejecuta el ciclo por tick para los 10 Sub-Fondos:
 * - Procesa micro-velas en 1s, 3s, 5s.
 * - Aplica confirmación rápida en 15s o 1m.
 * - Ejecuta compras y ventas (bidireccional).
 * - Cierra en salidas contrarias o TP/SL con fee = 0.
 */
export function processTickForSubFunds(
  price: number,
  volume: number = 1,
  timestamp: number = Date.now(),
  subFunds: SubFund[],
  rollingWindow: TickRollingWindow = globalTickRollingWindow,
  symbol: string = 'BTCUSDT'
): { updatedFunds: SubFund[]; tradesExecuted: ClosedTrade[] } {
  rollingWindow.addTick(price, volume, timestamp);

  const trend15s = rollingWindow.getMicroTrend(15);
  const trend1m = rollingWindow.getMicroTrend(60);
  const marketRegime = rollingWindow.getMarketRegime();

  const tradesExecuted: ClosedTrade[] = [];
  const updatedFunds = subFunds.map((fund) => {
    const f: SubFund = {
      ...fund,
      stats: { ...fund.stats },
      closedTrades: [...fund.closedTrades],
    };

    // 1. Determinar confirmación macro rápida para este fondo
    let macroTrend: MacroTrend = 'NEUTRAL';
    if (f.confirmTimeframe === '15s') {
      macroTrend = trend15s;
    } else if (f.confirmTimeframe === '1m') {
      macroTrend = trend1m;
    } else if (f.confirmTimeframe === '15s+1m') {
      macroTrend = trend15s === trend1m ? trend15s : 'NEUTRAL';
    }
    f.lastMacroTrend = macroTrend;
    f.lastMarketRegime = marketRegime;

    // 2. Construir micro-velas de ejecución
    const execSeconds = f.executionTimeframe === '1s' ? 1 : f.executionTimeframe === '3s' ? 3 : 5;
    const microCandles = rollingWindow.buildCandles(execSeconds, 30);
    const strategyEval = evaluateMicroStrategy(f.strategy, microCandles, price, trend1m);

    // 3. Si ya tiene posición activa: Monitorear TP, SL o Salida Contraria (Las salidas NUNCA se bloquean)
    if (f.activePosition) {
      const pos = f.activePosition;

      // Verifica para no mezclar precios si el usuario cambia de moneda
      if (pos.symbol && pos.symbol !== symbol) {
        return f;
      }

      const isBuy = pos.type === 'BUY';

      // TP / SL
      const isSLHit = isBuy ? price <= pos.stopLoss : price >= pos.stopLoss;
      const isTPHit = isBuy ? price >= pos.takeProfit1 : price <= pos.takeProfit1;

      // Salida en micro-temporalidad ante señal contraria
      // Exige un tiempo mínimo de retención de 3000ms (3 segundos) antes de cerrar por OPPOSITE_SIGNAL
      const canCloseOpposite = timestamp - pos.entryTime >= 3000;
      const isOppositeSignal =
        canCloseOpposite &&
        ((isBuy && strategyEval.action === 'SELL') || (!isBuy && strategyEval.action === 'BUY'));

      if (isSLHit || isTPHit || isOppositeSignal) {
        const exitPrice = price;
        const exitReason = isSLHit ? 'SL' : isTPHit ? 'TP1' : 'OPPOSITE_SIGNAL';
        const rawMovePct = isBuy
          ? (exitPrice - pos.entryPrice) / pos.entryPrice
          : (pos.entryPrice - exitPrice) / pos.entryPrice;

        // Medición pura: 0% Comisión (fee = 0), cálculo con 4 decimales
        const pnlUSDT = Number((pos.amountUSDT * rawMovePct).toFixed(4));
        const pnlPercent = Number((rawMovePct * 100).toFixed(2));

        // Simulación Comparativa de Fees (Maker Post-Only 0.010% vs Taker 0.045% por fill):
        const entryNotional = pos.amountUSDT;
        const exitNotional = pos.amountUSDT * (exitPrice / pos.entryPrice);
        const tradeTurnover = entryNotional + exitNotional;

        const tradeMakerFee = tradeTurnover * 0.00010; // 0.010% Maker Post-Only
        const tradeTakerFee = tradeTurnover * 0.00045; // 0.045% Taker

        const tradeMakerNet = pnlUSDT - tradeMakerFee;
        const tradeTakerNet = pnlUSDT - tradeTakerFee;

        f.currentCapital = Number((f.currentCapital + pnlUSDT).toFixed(2));
        f.stats.purePnL = Number((f.stats.purePnL + pnlUSDT).toFixed(2));
        f.stats.makerNetPnL = Number(((f.stats.makerNetPnL ?? 0) + tradeMakerNet).toFixed(4));
        f.stats.takerNetPnL = Number(((f.stats.takerNetPnL ?? 0) + tradeTakerNet).toFixed(4));
        f.stats.totalTrades += 1;

        if (pnlUSDT > 0) {
          f.stats.wins += 1;
        } else if (pnlUSDT < 0) {
          f.stats.losses += 1;
        }

        f.stats.winRate = Number(((f.stats.wins / f.stats.totalTrades) * 100).toFixed(1));

        // Al cerrar un trade, calcula y actualiza f.stats.maxDrawdownPercent comparando f.currentCapital contra f.stats.peakCapital
        if (f.currentCapital > f.stats.peakCapital) {
          f.stats.peakCapital = f.currentCapital;
        }
        const currentDD = f.stats.peakCapital > 0
          ? ((f.stats.peakCapital - f.currentCapital) / f.stats.peakCapital) * 100
          : 0;
        if (currentDD > f.stats.maxDrawdownPercent) {
          f.stats.maxDrawdownPercent = Number(currentDD.toFixed(2));
        }

        const closedTrade: ClosedTrade = {
          id: `fund-${f.id}-close-${Date.now()}`,
          symbol,
          type: pos.type,
          strategy: f.strategy,
          entryPrice: pos.entryPrice,
          exitPrice,
          amountUSDT: pos.amountUSDT,
          pnlUSDT,
          pnlPercent,
          exitReason,
          entryTime: pos.entryTime,
          exitTime: timestamp,
        };

        f.closedTrades.unshift(closedTrade);
        f.activePosition = null;
        tradesExecuted.push(closedTrade);
      } else {
        // Mientras f.activePosition siga abierta, actualiza en vivo f.activePosition.currentPrice, f.activePosition.pnlUSDT y f.activePosition.pnlPercent en cada tick
        const currentRawMovePct = isBuy
          ? (price - pos.entryPrice) / pos.entryPrice
          : (pos.entryPrice - price) / pos.entryPrice;

        pos.currentPrice = price;
        pos.pnlUSDT = Number((pos.amountUSDT * currentRawMovePct).toFixed(4));
        pos.pnlPercent = Number((currentRawMovePct * 100).toFixed(2));
      }
    }
    // 4. Si NO tiene posición activa: Evaluar Entrada Bidireccional con Filtro Grok Anti-Chop y Confirmación MTF
    else {
      // Filtro de Régimen Grok Anti-Chop:
      // Si detecta TOXIC_CHOP, bloquea nuevas entradas en los sub-fondos de 1s para proteger el Win Rate,
      // dejando operar solo a los de 3s y 5s cuando tengan confirmación clara (no neutral).
      if (marketRegime.regime === 'TOXIC_CHOP') {
        if (f.executionTimeframe === '1s') {
          return f; // Bloquea entradas en 1s durante régimen tóxico
        }
        if (macroTrend === 'NEUTRAL') {
          return f; // Para 3s y 5s, exige confirmación tendencial no-neutral
        }
      }

      // Regla Bidireccional:
      // - Si confirmación es BULLISH: Habilita LONG (BUY), bloquea SHORT.
      // - Si confirmación es BEARISH: Habilita SHORT (SELL), bloquea LONG.
      const isLongAllowed = macroTrend === 'BULLISH';
      const isShortAllowed = macroTrend === 'BEARISH';

      if (isLongAllowed && strategyEval.action === 'BUY') {
        const tradeAmount = 1000; // Asignación de $1,000 USD por trade (10% del fondo)
        f.activePosition = {
          id: `pos-${f.id}-${Date.now()}`,
          symbol,
          type: 'BUY',
          strategy: f.strategy,
          entryPrice: price,
          currentPrice: price,
          stopLoss: strategyEval.stopLoss,
          takeProfit1: strategyEval.takeProfit1,
          takeProfit2: strategyEval.takeProfit2,
          amountUSDT: tradeAmount,
          initialAmountUSDT: tradeAmount,
          pnlUSDT: 0,
          pnlPercent: 0,
          entryTime: timestamp,
          orderType: 'MARKET',
          isTP1Hit: false,
        };
      } else if (isShortAllowed && strategyEval.action === 'SELL') {
        const tradeAmount = 1000;
        f.activePosition = {
          id: `pos-${f.id}-${Date.now()}`,
          symbol,
          type: 'SELL',
          strategy: f.strategy,
          entryPrice: price,
          currentPrice: price,
          stopLoss: strategyEval.stopLoss,
          takeProfit1: strategyEval.takeProfit1,
          takeProfit2: strategyEval.takeProfit2,
          amountUSDT: tradeAmount,
          initialAmountUSDT: tradeAmount,
          pnlUSDT: 0,
          pnlPercent: 0,
          entryTime: timestamp,
          orderType: 'MARKET',
          isTP1Hit: false,
        };
      }
    }

    return f;
  });

  return { updatedFunds, tradesExecuted };
}

/**
 * Calcula el resumen global del Banco de Pruebas de $100k con simulación comparativa de Fees (Maker 0.010% vs Taker 0.045%)
 */
export function calculateBankTestSummary(subFunds: SubFund[]): BankTestSummary {
  let totalInitialCapital = 0;
  let totalCurrentCapital = 0;
  let totalPurePnL = 0;
  let totalMakerNetPnL = 0;
  let totalTakerNetPnL = 0;
  let totalTrades = 0;
  let totalWins = 0;
  let totalLosses = 0;

  for (const fund of subFunds) {
    totalInitialCapital += fund.initialCapital;
    totalCurrentCapital += fund.currentCapital;
    totalPurePnL += fund.stats.purePnL;
    totalMakerNetPnL += (fund.stats.makerNetPnL ?? fund.stats.purePnL);
    totalTakerNetPnL += (fund.stats.takerNetPnL ?? fund.stats.purePnL);
    totalTrades += fund.stats.totalTrades;
    totalWins += fund.stats.wins;
    totalLosses += fund.stats.losses;
  }

  const globalWinRate = totalTrades > 0 ? Number(((totalWins / totalTrades) * 100).toFixed(1)) : 0;

  return {
    totalInitialCapital,
    totalCurrentCapital: Number(totalCurrentCapital.toFixed(2)),
    totalPurePnL: Number(totalPurePnL.toFixed(2)),
    makerNetPnL: Number(totalMakerNetPnL.toFixed(2)),
    takerNetPnL: Number(totalTakerNetPnL.toFixed(2)),
    totalTrades,
    totalWins,
    totalLosses,
    globalWinRate,
    feeRate: 0,
  };
}

