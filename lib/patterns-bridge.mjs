import { detectPatterns, DEFAULT_PATTERN_PARAMS } from '../src/services/patterns/pattern-detector.mjs';

/**
 * Bridge entre el detector de patrones chartistas y el daemon del bot.
 * Solo emite señal si se detectó una ruptura confirmada exactamente en la ÚLTIMA vela cerrada (live = true).
 */
export function detectPatternSignal(candles, opts = {}) {
  if (!candles || candles.length < 50) return null;

  const h = [];
  const l = [];
  const c = [];
  const v = [];

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const high = typeof candle.high === 'number' ? candle.high : Number(candle.h || candle[2]);
    const low = typeof candle.low === 'number' ? candle.low : Number(candle.l || candle[3]);
    const close = typeof candle.close === 'number' ? candle.close : Number(candle.c || candle[4]);
    const vol = typeof candle.volume === 'number' ? candle.volume : Number(candle.v || candle[5] || 0);

    h.push(high);
    l.push(low);
    c.push(close);
    v.push(vol);
  }

  const tf = opts.timeframe || '1h';
  const defaultParams = DEFAULT_PATTERN_PARAMS[tf] || DEFAULT_PATTERN_PARAMS['1h'];
  const params = {
    ...defaultParams,
    ...opts,
    live: true,
  };

  const signals = detectPatterns({ h, l, c, v }, params);
  if (!signals || signals.length === 0) return null;

  const lastClosedIdx = c.length - 1;
  // Solo la ruptura confirmada en la última vela cerrada
  const latest = signals.find((s) => s.breakIdx === lastClosedIdx);
  if (!latest) return null;

  const risk = Math.abs(latest.entry - latest.stop);
  const reward = Math.abs(latest.target - latest.entry);
  const riskReward = risk > 0 ? reward / risk : 0;

  return {
    ...latest,
    timeframe: tf,
    riskReward,
  };
}
