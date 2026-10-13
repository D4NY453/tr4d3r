import type { Candle } from '@/types';
import type { UTCTimestamp } from 'lightweight-charts';

export interface IndicatorPoint {
  time: UTCTimestamp;
  value: number;
}

export interface MACDPoint {
  time: UTCTimestamp;
  macd: number;
  signal: number;
  histogram: number;
}

export interface BollingerPoint {
  time: UTCTimestamp;
  upper: number;
  middle: number;
  lower: number;
}

export interface SuperTrendPoint {
  time: UTCTimestamp;
  value: number;
  trend: 'UP' | 'DOWN';
}

/**
 * Exponential Moving Average (EMA)
 */
export function calculateEMA(candles: Candle[], period: number): IndicatorPoint[] {
  if (candles.length < period) return [];

  const k = 2 / (period + 1);
  const result: IndicatorPoint[] = [];

  // Initial SMA for first value
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += candles[i].close;
  }
  let prevEMA = sum / period;
  result.push({ time: candles[period - 1].time, value: prevEMA });

  for (let i = period; i < candles.length; i++) {
    const currentClose = candles[i].close;
    const currentEMA = (currentClose - prevEMA) * k + prevEMA;
    result.push({ time: candles[i].time, value: currentEMA });
    prevEMA = currentEMA;
  }

  return result;
}

/**
 * Precisión Dinámica de Precios:
 * 2 decimales si price >= 1000
 * 4 decimales si price >= 1
 * 6 decimales si price >= 0.001
 * 8 decimales si price < 0.001 (para soportar kBONK, PEPE, SHIB y micro-scalping)
 */
export function roundPriceDynamic(price: number): number {
  if (price === 0 || !isFinite(price)) return 0;
  const abs = Math.abs(price);
  if (abs >= 1000) return Number(price.toFixed(2));
  if (abs >= 1) return Number(price.toFixed(4));
  if (abs >= 0.001) return Number(price.toFixed(6));
  return Number(price.toFixed(8));
}

/**
 * Relative Strength Index (RSI) using Wilder's Smoothing
 */
export function calculateRSI(candles: Candle[], period: number = 14): IndicatorPoint[] {
  if (candles.length <= period) return [];

  const result: IndicatorPoint[] = [];
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = candles[i].close - candles[i - 1].close;
    if (change >= 0) gains += change;
    else losses += Math.abs(change);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  let firstRSI: number;
  if (avgGain === 0 && avgLoss === 0) {
    firstRSI = 50; // Neutral en mercado plano
  } else if (avgLoss === 0) {
    firstRSI = 100;
  } else {
    const firstRS = avgGain / avgLoss;
    firstRSI = 100 - 100 / (1 + firstRS);
  }
  result.push({ time: candles[period].time, value: firstRSI });

  for (let i = period + 1; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close;
    const currentGain = change >= 0 ? change : 0;
    const currentLoss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + currentGain) / period;
    avgLoss = (avgLoss * (period - 1) + currentLoss) / period;

    let rsi: number;
    if (avgGain === 0 && avgLoss === 0) {
      rsi = 50; // Neutral en mercado plano
    } else if (avgLoss === 0) {
      rsi = 100;
    } else {
      const rs = avgGain / avgLoss;
      rsi = 100 - 100 / (1 + rs);
    }
    result.push({ time: candles[i].time, value: rsi });
  }

  return result;
}

/**
 * Moving Average Convergence Divergence (MACD)
 */
export function calculateMACD(
  candles: Candle[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): MACDPoint[] {
  if (candles.length < slowPeriod + signalPeriod) return [];

  const fastEMA = calculateEMA(candles, fastPeriod);
  const slowEMA = calculateEMA(candles, slowPeriod);

  // Match time stamps for MACD line = Fast - Slow
  const slowMap = new Map(slowEMA.map((item) => [item.time, item.value]));
  const macdLinePoints: IndicatorPoint[] = [];

  for (const f of fastEMA) {
    const sValue = slowMap.get(f.time);
    if (sValue !== undefined) {
      macdLinePoints.push({ time: f.time, value: f.value - sValue });
    }
  }

  if (macdLinePoints.length < signalPeriod) return [];

  // Calculate Signal line (EMA of MACD line)
  const kSignal = 2 / (signalPeriod + 1);
  let sum = 0;
  for (let i = 0; i < signalPeriod; i++) {
    sum += macdLinePoints[i].value;
  }
  let prevSignal = sum / signalPeriod;

  const result: MACDPoint[] = [];
  result.push({
    time: macdLinePoints[signalPeriod - 1].time,
    macd: macdLinePoints[signalPeriod - 1].value,
    signal: prevSignal,
    histogram: macdLinePoints[signalPeriod - 1].value - prevSignal,
  });

  for (let i = signalPeriod; i < macdLinePoints.length; i++) {
    const currentMACD = macdLinePoints[i].value;
    const currentSignal = (currentMACD - prevSignal) * kSignal + prevSignal;
    result.push({
      time: macdLinePoints[i].time,
      macd: currentMACD,
      signal: currentSignal,
      histogram: currentMACD - currentSignal,
    });
    prevSignal = currentSignal;
  }

  return result;
}

/**
 * Bollinger Bands (SMA 20 ± 2 StdDev)
 */
export function calculateBollingerBands(
  candles: Candle[],
  period: number = 20,
  stdDevMultiplier: number = 2
): BollingerPoint[] {
  if (candles.length < period) return [];

  const result: BollingerPoint[] = [];

  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1);
    const sum = slice.reduce((acc, c) => acc + c.close, 0);
    const mean = sum / period;

    const variance = slice.reduce((acc, c) => acc + Math.pow(c.close - mean, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    result.push({
      time: candles[i].time,
      middle: mean,
      upper: mean + stdDev * stdDevMultiplier,
      lower: mean - stdDev * stdDevMultiplier,
    });
  }

  return result;
}

/**
 * Bollinger Bandwidth (Spread relativo de las bandas para detectar Squeezes)
 */
export function calculateBollingerBandwidth(
  candles: Candle[],
  period: number = 20,
  stdDevMultiplier: number = 2
): IndicatorPoint[] {
  const bbs = calculateBollingerBands(candles, period, stdDevMultiplier);
  return bbs.map((b) => ({
    time: b.time,
    value: b.middle !== 0 ? ((b.upper - b.lower) / b.middle) * 100 : 0,
  }));
}

/**
 * Bollinger %B (%b Oscillator): (Close - Lower) / (Upper - Lower)
 */
export function calculateBollingerPercentB(
  candles: Candle[],
  period: number = 20,
  stdDevMultiplier: number = 2
): IndicatorPoint[] {
  const bbs = calculateBollingerBands(candles, period, stdDevMultiplier);
  const candleMap = new Map(candles.map((c) => [c.time, c.close]));

  return bbs.map((b) => {
    const close = candleMap.get(b.time) || b.middle;
    const bandRange = b.upper - b.lower;
    const percentB = bandRange !== 0 ? (close - b.lower) / bandRange : 0.5;
    return {
      time: b.time,
      value: percentB,
    };
  });
}

/**
 * Average True Range (ATR)
 */
export function calculateATR(candles: Candle[], period: number = 14): IndicatorPoint[] {
  if (candles.length <= period) return [];

  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      current.high - current.low,
      Math.abs(current.high - prev.close),
      Math.abs(current.low - prev.close)
    );
    trs.push(tr);
  }

  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const result: IndicatorPoint[] = [{ time: candles[period].time, value: atr }];

  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
    result.push({ time: candles[i + 1].time, value: atr });
  }

  return result;
}

/**
 * SuperTrend Indicator
 */
export function calculateSuperTrend(
  candles: Candle[],
  period: number = 10,
  multiplier: number = 3
): SuperTrendPoint[] {
  if (candles.length <= period) return [];

  const atrs = calculateATR(candles, period);
  const atrMap = new Map(atrs.map((a) => [a.time, a.value]));

  const result: SuperTrendPoint[] = [];
  let prevTrend: 'UP' | 'DOWN' = 'UP';
  let prevUpper = 0;
  let prevLower = 0;

  for (let i = period; i < candles.length; i++) {
    const c = candles[i];
    const prevC = candles[i - 1];
    const atr = atrMap.get(c.time) || (c.high - c.low);

    const hl2 = (c.high + c.low) / 2;
    let basicUpper = hl2 + multiplier * atr;
    let basicLower = hl2 - multiplier * atr;

    let finalUpper = basicUpper < prevUpper || prevC.close > prevUpper ? basicUpper : prevUpper;
    let finalLower = basicLower > prevLower || prevC.close < prevLower ? basicLower : prevLower;

    let trend: 'UP' | 'DOWN' = prevTrend;
    if (prevTrend === 'UP') {
      if (c.close < finalLower) {
        trend = 'DOWN';
      }
    } else {
      if (c.close > finalUpper) {
        trend = 'UP';
      }
    }

    const value = trend === 'UP' ? finalLower : finalUpper;
    result.push({ time: c.time, value, trend });

    prevTrend = trend;
    prevUpper = finalUpper;
    prevLower = finalLower;
  }

  return result;
}
