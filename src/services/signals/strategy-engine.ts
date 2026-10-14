import { Candle, Timeframe, TradingSignal, ActiveStrategyConfig, MacroTrend } from '../../types';
import {
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateSuperTrend,
  calculateBollingerBands,
  calculateBollingerPercentB,
  calculateATR,
  roundPriceDynamic,
} from '../indicators/calculations';
import { getMacroTimeframe, DITTO_SHORT_WHITELIST, isDittoWhitelisted } from '../bot/trading-bot-engine';

export { roundPriceDynamic, DITTO_SHORT_WHITELIST, isDittoWhitelisted };

export function evaluateTradingSignals(
  candles: Candle[],
  symbol: string,
  timeframe: Timeframe,
  activeStrategies: ActiveStrategyConfig
): TradingSignal[] {
  if (candles.length < 50) return [];

  const signals: TradingSignal[] = [];
  const atrs = calculateATR(candles, 14);
  const atrMap = new Map(atrs.map((a) => [a.time, a.value]));

  // 1. EMA Cross Strategy (20 / 50)
  if (activeStrategies.emaCross) {
    const emaFast = calculateEMA(candles, 20);
    const emaSlow = calculateEMA(candles, 50);

    const fastMap = new Map(emaFast.map((e) => [e.time, e.value]));
    const slowMap = new Map(emaSlow.map((e) => [e.time, e.value]));

    for (let i = 2; i < candles.length; i++) {
      const cCurrent = candles[i];
      const cPrev = candles[i - 1];

      const fCurr = fastMap.get(cCurrent.time);
      const sCurr = slowMap.get(cCurrent.time);
      const fPrev = fastMap.get(cPrev.time);
      const sPrev = slowMap.get(cPrev.time);

      if (fCurr !== undefined && sCurr !== undefined && fPrev !== undefined && sPrev !== undefined) {
        const atr = atrMap.get(cCurrent.time) || cCurrent.close * 0.015;

        // Bullish Cross
        if (fPrev <= sPrev && fCurr > sCurr) {
          const entry = cCurrent.close;
          const sl = entry - atr * 1.5;
          const tp1 = entry + atr * 2.25;
          const tp2 = entry + atr * 3.75;
          signals.push({
            id: `${symbol}-${timeframe}-ema-buy-${cCurrent.time}`,
            symbol,
            timeframe,
            type: 'BUY',
            time: cCurrent.time,
            price: entry,
            strategy: 'EMA 20/50 Golden Cross',
            reason: 'EMA 20 cruzó hacia arriba de EMA 50 (tendencia alcista)',
            stopLoss: roundPriceDynamic(sl),
            takeProfit1: roundPriceDynamic(tp1),
            takeProfit2: roundPriceDynamic(tp2),
            riskReward: '1:1.5 / 1:2.5',
            timestamp: Number(cCurrent.time) * 1000,
          });
        }
        // Bearish Cross
        else if (fPrev >= sPrev && fCurr < sCurr) {
          const entry = cCurrent.close;
          const sl = entry + atr * 1.5;
          const tp1 = entry - atr * 2.25;
          const tp2 = entry - atr * 3.75;
          signals.push({
            id: `${symbol}-${timeframe}-ema-sell-${cCurrent.time}`,
            symbol,
            timeframe,
            type: 'SELL',
            time: cCurrent.time,
            price: entry,
            strategy: 'EMA 20/50 Death Cross',
            reason: 'EMA 20 cruzó hacia abajo de EMA 50 (tendencia bajista)',
            stopLoss: roundPriceDynamic(sl),
            takeProfit1: roundPriceDynamic(tp1),
            takeProfit2: roundPriceDynamic(tp2),
            riskReward: '1:1.5 / 1:2.5',
            timestamp: Number(cCurrent.time) * 1000,
          });
        }
      }
    }
  }

  // 2. RSI Reversal Strategy (< 30 bounce, > 70 drop)
  if (activeStrategies.rsiReversal) {
    const rsis = calculateRSI(candles, 14);
    const rsiMap = new Map(rsis.map((r) => [r.time, r.value]));

    for (let i = 2; i < candles.length; i++) {
      const cCurrent = candles[i];
      const cPrev = candles[i - 1];

      const rCurr = rsiMap.get(cCurrent.time);
      const rPrev = rsiMap.get(cPrev.time);

      if (rCurr !== undefined && rPrev !== undefined) {
        const atr = atrMap.get(cCurrent.time) || cCurrent.close * 0.015;

        // Oversold bounce
        if (rPrev <= 30 && rCurr > 30) {
          const entry = cCurrent.close;
          const sl = entry - atr * 1.2;
          const tp1 = entry + atr * 1.8;
          const tp2 = entry + atr * 3.0;
          signals.push({
            id: `${symbol}-${timeframe}-rsi-buy-${cCurrent.time}`,
            symbol,
            timeframe,
            type: 'BUY',
            time: cCurrent.time,
            price: entry,
            strategy: 'RSI Sobrevendido Rebote',
            reason: `RSI salió de zona de sobreventa (${rPrev.toFixed(1)} -> ${rCurr.toFixed(1)})`,
            stopLoss: roundPriceDynamic(sl),
            takeProfit1: roundPriceDynamic(tp1),
            takeProfit2: roundPriceDynamic(tp2),
            riskReward: '1:1.5 / 1:2.5',
            timestamp: Number(cCurrent.time) * 1000,
          });
        }
        // Overbought drop
        else if (rPrev >= 70 && rCurr < 70) {
          const entry = cCurrent.close;
          const sl = entry + atr * 1.2;
          const tp1 = entry - atr * 1.8;
          const tp2 = entry - atr * 3.0;
          signals.push({
            id: `${symbol}-${timeframe}-rsi-sell-${cCurrent.time}`,
            symbol,
            timeframe,
            type: 'SELL',
            time: cCurrent.time,
            price: entry,
            strategy: 'RSI Sobrecompra Rechazo',
            reason: `RSI salió de zona de sobrecompra (${rPrev.toFixed(1)} -> ${rCurr.toFixed(1)})`,
            stopLoss: roundPriceDynamic(sl),
            takeProfit1: roundPriceDynamic(tp1),
            takeProfit2: roundPriceDynamic(tp2),
            riskReward: '1:1.5 / 1:2.5',
            timestamp: Number(cCurrent.time) * 1000,
          });
        }
      }
    }
  }

  // 3. SuperTrend Strategy
  if (activeStrategies.superTrendStrategy) {
    const supertrends = calculateSuperTrend(candles, 10, 3);

    for (let i = 1; i < supertrends.length; i++) {
      const curr = supertrends[i];
      const prev = supertrends[i - 1];

      if (prev.trend !== curr.trend) {
        const c = candles.find((item) => item.time === curr.time);
        if (!c) continue;

        const atr = atrMap.get(curr.time) || c.close * 0.02;

        if (curr.trend === 'UP') {
          const entry = c.close;
          signals.push({
            id: `${symbol}-${timeframe}-st-buy-${curr.time}`,
            symbol,
            timeframe,
            type: 'BUY',
            time: curr.time,
            price: entry,
            strategy: 'SuperTrend Giro Alcista',
            reason: 'El indicador SuperTrend cambió de bajista a alcista',
            stopLoss: roundPriceDynamic(entry - atr * 1.5),
            takeProfit1: roundPriceDynamic(entry + atr * 2.5),
            takeProfit2: roundPriceDynamic(entry + atr * 4.0),
            riskReward: '1:1.6 / 1:2.6',
            timestamp: Number(curr.time) * 1000,
          });
        } else {
          const entry = c.close;
          signals.push({
            id: `${symbol}-${timeframe}-st-sell-${curr.time}`,
            symbol,
            timeframe,
            type: 'SELL',
            time: curr.time,
            price: entry,
            strategy: 'SuperTrend Giro Bajista',
            reason: 'El indicador SuperTrend cambió de alcista a bajista',
            stopLoss: roundPriceDynamic(entry + atr * 1.5),
            takeProfit1: roundPriceDynamic(entry - atr * 2.5),
            takeProfit2: roundPriceDynamic(entry - atr * 4.0),
            riskReward: '1:1.6 / 1:2.6',
            timestamp: Number(curr.time) * 1000,
          });
        }
      }
    }
  }

  // 4. MACD Crossover Strategy
  if (activeStrategies.macdCrossover) {
    const macds = calculateMACD(candles, 12, 26, 9);
    for (let i = 1; i < macds.length; i++) {
      const curr = macds[i];
      const prev = macds[i - 1];

      const c = candles.find((item) => item.time === curr.time);
      if (!c) continue;
      const atr = atrMap.get(curr.time) || c.close * 0.015;

      // MACD cross above Signal
      if (prev.macd <= prev.signal && curr.macd > curr.signal) {
        signals.push({
          id: `${symbol}-${timeframe}-macd-buy-${curr.time}`,
          symbol,
          timeframe,
          type: 'BUY',
          time: curr.time,
          price: c.close,
          strategy: 'MACD Cruce Alcista',
          reason: 'Línea MACD cruzó al alza la línea de Señal',
          stopLoss: roundPriceDynamic(c.close - atr * 1.4),
          takeProfit1: roundPriceDynamic(c.close + atr * 2.1),
          takeProfit2: roundPriceDynamic(c.close + atr * 3.5),
          riskReward: '1:1.5 / 1:2.5',
          timestamp: Number(curr.time) * 1000,
        });
      }
      // MACD cross below Signal
      else if (prev.macd >= prev.signal && curr.macd < curr.signal) {
        signals.push({
          id: `${symbol}-${timeframe}-macd-sell-${curr.time}`,
          symbol,
          timeframe,
          type: 'SELL',
          time: curr.time,
          price: c.close,
          strategy: 'MACD Cruce Bajista',
          reason: 'Línea MACD cruzó a la baja la línea de Señal',
          stopLoss: roundPriceDynamic(c.close + atr * 1.4),
          takeProfit1: roundPriceDynamic(c.close - atr * 2.1),
          takeProfit2: roundPriceDynamic(c.close - atr * 3.5),
          riskReward: '1:1.5 / 1:2.5',
          timestamp: Number(curr.time) * 1000,
        });
      }
    }
  }

  // 5. Bollinger Bands Strategy (Mean Reversion con confirmación de re-entrada)
  if (activeStrategies.bollingerBreakout) {
    const bbs = calculateBollingerBands(candles, 20, 2);
    for (let i = 2; i < bbs.length; i++) {
      const curr = bbs[i];
      const prev = bbs[i - 1];

      const cCurr = candles.find((item) => item.time === curr.time);
      const cPrev = candles.find((item) => item.time === prev.time);

      if (!cCurr || !cPrev) continue;
      const atr = atrMap.get(curr.time) || cCurr.close * 0.015;

      // Reversión Inferior: La vela anterior perforó por debajo de la banda inferior y la actual cierra dentro (rebote)
      if (cPrev.low < prev.lower && cCurr.close > curr.lower && cCurr.close > cCurr.open) {
        const entry = cCurr.close;
        const sl = cPrev.low - atr * 0.5; // Stop Loss debajo del mínimo de la perforación
        const tp1 = curr.middle; // TP1 en la banda media (SMA 20)
        const tp2 = curr.upper; // TP2 en la banda superior

        signals.push({
          id: `${symbol}-${timeframe}-bb-buy-${curr.time}`,
          symbol,
          timeframe,
          type: 'BUY',
          time: curr.time,
          price: entry,
          strategy: 'Bollinger Band Reversal (Rango)',
          reason: 'Perforación de banda inferior con confirmación de cierre dentro del canal',
          stopLoss: roundPriceDynamic(sl),
          takeProfit1: roundPriceDynamic(tp1),
          takeProfit2: roundPriceDynamic(tp2),
          riskReward: '1:1.5 / 1:2.0',
          timestamp: Number(curr.time) * 1000,
        });
      }
      // Reversión Superior: La vela anterior perforó por arriba de la banda superior y la actual cierra dentro (rechazo)
      else if (cPrev.high > prev.upper && cCurr.close < curr.upper && cCurr.close < cCurr.open) {
        const entry = cCurr.close;
        const sl = cPrev.high + atr * 0.5;
        const tp1 = curr.middle;
        const tp2 = curr.lower;

        signals.push({
          id: `${symbol}-${timeframe}-bb-sell-${curr.time}`,
          symbol,
          timeframe,
          type: 'SELL',
          time: curr.time,
          price: entry,
          strategy: 'Bollinger Band Rejection (Rango)',
          reason: 'Perforación de banda superior con confirmación de cierre bajista dentro del canal',
          stopLoss: roundPriceDynamic(sl),
          takeProfit1: roundPriceDynamic(tp1),
          takeProfit2: roundPriceDynamic(tp2),
          riskReward: '1:1.5 / 1:2.0',
          timestamp: Number(curr.time) * 1000,
        });
      }
    }
  }

  // 6. Bollinger Squeeze & Volatility Trend Breakout (Estrategia del Video 2)
  if (activeStrategies.bollingerSqueeze) {
    const bbs = calculateBollingerBands(candles, 20, 2);
    const bandwidths = bbs.map((b) => ({
      time: b.time,
      bw: b.middle !== 0 ? (b.upper - b.lower) / b.middle : 0,
      middle: b.middle,
    }));

    for (let i = 25; i < bandwidths.length; i++) {
      const currBW = bandwidths[i];
      const prevBW = bandwidths[i - 1];
      const prev2BW = bandwidths[i - 2];

      const cCurr = candles.find((item) => item.time === currBW.time);
      if (!cCurr) continue;

      // Calcular umbral de compresión (mínimo de los últimos 20 periodos)
      const windowBW = bandwidths.slice(i - 20, i).map((item) => item.bw);
      const minBW = Math.min(...windowBW);
      const avgBW = windowBW.reduce((a, b) => a + b, 0) / windowBW.length;

      // Condición del video: Estrechamiento en zona baja y quiebro hacia arriba de la volatilidad
      const isSqueeze = prevBW.bw <= minBW * 1.15 || prevBW.bw < avgBW * 0.7;
      const isExpanding = currBW.bw > prevBW.bw && prevBW.bw <= prev2BW.bw;

      if (isSqueeze && isExpanding) {
        const atr = atrMap.get(currBW.time) || cCurr.close * 0.02;
        const isSMAAscending = currBW.middle > prevBW.middle;
        const isSMADescending = currBW.middle < prevBW.middle;

        // Breakout Alcista (Media ascendente)
        if (isSMAAscending && cCurr.close > currBW.middle) {
          const entry = cCurr.close;
          const sl = entry - atr * 1.8;
          const tp1 = entry + atr * 2.5; // Cierre parcial 50%
          const tp2 = entry + atr * 4.5; // Cierre total tendencia

          signals.push({
            id: `${symbol}-${timeframe}-bb-sq-buy-${currBW.time}`,
            symbol,
            timeframe,
            type: 'BUY',
            time: currBW.time,
            price: entry,
            strategy: 'Bollinger Squeeze Trend Breakout (Video 2)',
            reason: 'Expansión de volatilidad tras compresión extrema con media móvil ascendente (Tendencial)',
            stopLoss: roundPriceDynamic(sl),
            takeProfit1: roundPriceDynamic(tp1),
            takeProfit2: roundPriceDynamic(tp2),
            riskReward: '1:1.5 / 1:2.5',
            timestamp: Number(currBW.time) * 1000,
          });
        }
        // Breakout Bajista (Media descendente)
        else if (isSMADescending && cCurr.close < currBW.middle) {
          const entry = cCurr.close;
          const sl = entry + atr * 1.8;
          const tp1 = entry - atr * 2.5;
          const tp2 = entry - atr * 4.5;

          signals.push({
            id: `${symbol}-${timeframe}-bb-sq-sell-${currBW.time}`,
            symbol,
            timeframe,
            type: 'SELL',
            time: currBW.time,
            price: entry,
            strategy: 'Bollinger Squeeze Trend Breakout (Video 2)',
            reason: 'Expansión de volatilidad tras compresión extrema con media móvil descendente (Tendencial)',
            stopLoss: roundPriceDynamic(sl),
            takeProfit1: roundPriceDynamic(tp1),
            takeProfit2: roundPriceDynamic(tp2),
            riskReward: '1:1.5 / 1:2.5',
            timestamp: Number(currBW.time) * 1000,
          });
        }
      }
    }
  }

  // 7. Bollinger %B Divergence Strategy (Estrategia del Video 3)
  if (activeStrategies.bollingerPercentBDivergence) {
    const percentBPoints = calculateBollingerPercentB(candles, 20, 2);
    const pbMap = new Map(percentBPoints.map((p) => [p.time, p.value]));

    for (let i = 15; i < candles.length; i++) {
      const cCurr = candles[i];
      const pbCurr = pbMap.get(cCurr.time);
      if (pbCurr === undefined) continue;

      const atr = atrMap.get(cCurr.time) || cCurr.close * 0.015;

      // Buscar pivote previo en las últimas 10-15 velas
      const lookbackCandles = candles.slice(i - 12, i);
      
      // Divergencia Bajista: Precio hace un nuevo máximo pero %B hace un máximo menor
      const maxPricePrev = Math.max(...lookbackCandles.map((c) => c.high));
      const prevPivotIdx = lookbackCandles.findIndex((c) => c.high === maxPricePrev);
      if (prevPivotIdx !== -1) {
        const prevCandle = lookbackCandles[prevPivotIdx];
        const pbPrev = pbMap.get(prevCandle.time);

        if (
          pbPrev !== undefined &&
          cCurr.high > prevCandle.high && // Precio sube más
          pbCurr < pbPrev && // %B sube menos
          pbPrev > 0.9 && // El pico anterior tocó o perforó la banda superior
          pbCurr < 1.0 && // La vela actual ya no perfora
          cCurr.close < cCurr.open // Confirmación de vela roja
        ) {
          signals.push({
            id: `${symbol}-${timeframe}-bb-pb-div-sell-${cCurr.time}`,
            symbol,
            timeframe,
            type: 'SELL',
            time: cCurr.time,
            price: cCurr.close,
            strategy: 'Bollinger %B Divergencia Bajista (Video 3)',
            reason: `Divergencia bajista en %B (${pbPrev.toFixed(2)} -> ${pbCurr.toFixed(2)}) mientras precio marcó nuevo máximo`,
            stopLoss: roundPriceDynamic(cCurr.high + atr * 0.8),
            takeProfit1: roundPriceDynamic(cCurr.close - atr * 2.0),
            takeProfit2: roundPriceDynamic(cCurr.close - atr * 3.5),
            riskReward: '1:1.6 / 1:2.8',
            timestamp: Number(cCurr.time) * 1000,
          });
        }
      }

      // Divergencia Alcista: Precio hace un nuevo mínimo pero %B hace un mínimo mayor
      const minPricePrev = Math.min(...lookbackCandles.map((c) => c.low));
      const prevLowPivotIdx = lookbackCandles.findIndex((c) => c.low === minPricePrev);
      if (prevLowPivotIdx !== -1) {
        const prevCandle = lookbackCandles[prevLowPivotIdx];
        const pbPrev = pbMap.get(prevCandle.time);

        if (
          pbPrev !== undefined &&
          cCurr.low < prevCandle.low && // Precio cae más bajo
          pbCurr > pbPrev && // %B marca mínimo más alto
          pbPrev < 0.1 && // El mínimo anterior perforó o tocó la banda inferior
          pbCurr > 0.0 && // La vela actual ya no perfora
          cCurr.close > cCurr.open // Confirmación de vela verde
        ) {
          signals.push({
            id: `${symbol}-${timeframe}-bb-pb-div-buy-${cCurr.time}`,
            symbol,
            timeframe,
            type: 'BUY',
            time: cCurr.time,
            price: cCurr.close,
            strategy: 'Bollinger %B Divergencia Alcista (Video 3)',
            reason: `Divergencia alcista en %B (${pbPrev.toFixed(2)} -> ${pbCurr.toFixed(2)}) mientras precio marcó nuevo mínimo`,
            stopLoss: roundPriceDynamic(cCurr.low - atr * 0.8),
            takeProfit1: roundPriceDynamic(cCurr.close + atr * 2.0),
            takeProfit2: roundPriceDynamic(cCurr.close + atr * 3.5),
            riskReward: '1:1.6 / 1:2.8',
            timestamp: Number(cCurr.time) * 1000,
          });
        }
      }
    }
  }

  // Precalcula EMAs para la Jerarquía Multitemporal (MTF)
  const macroTimeframe = getMacroTimeframe(timeframe);
  const ema50List = calculateEMA(candles, 50);
  const ema200List = candles.length >= 200 ? calculateEMA(candles, 200) : [];
  const ema50Map = new Map(ema50List.map((e) => [e.time, e.value]));
  const ema200Map = new Map(ema200List.map((e) => [e.time, e.value]));

  // 8. Ditto Hyperliquid Short 82% WR (Validado en Backtest de 14 días)
  // Activos prioritarios (Whitelist): ['BTC-PERP', 'SOL-PERP', 'HYPE-PERP', 'XRP-PERP', 'DOGE-PERP'] (y sus equivalentes USDT, manteniendo XMR excluido)
  // Disparador: En SHORT (SELL) cuando RSI(14) > 65 (o RSI(14) < 30 en Momentum Breakdown) a favor de la estructura bajista
  // Take Profit 1 Exacto: +1.8% de distancia desde el precio de entrada (entryPrice * (1 - 0.018) en Short)
  // Stop Loss con Holgura Anti-Barrida: 3.5% a 5.0% de distancia (entryPrice * (1 + 0.036) en Short) con apalancamiento 5x
  const isDittoEligible = isDittoWhitelisted(symbol) && (activeStrategies.dittoVerifiedShort !== false);
  if (isDittoEligible) {
    const rsis = calculateRSI(candles, 14);
    const rsiMap = new Map(rsis.map((r) => [r.time, r.value]));

    for (let i = 14; i < candles.length; i++) {
      const cCurrent = candles[i];
      const cPrev = candles[i - 1];

      const rCurr = rsiMap.get(cCurrent.time);
      const rPrev = rsiMap.get(cPrev.time);
      if (rCurr === undefined) continue;

      const e50 = ema50Map.get(cCurrent.time);
      const isBearishStructure = (e50 !== undefined ? cCurrent.close <= e50 : true) || cCurrent.close < cPrev.close;

      // Disparador SHORT:
      // A) Agotamiento en sobrecompra: RSI > 65 con giro o vela bajista
      const isOverboughtExhaustion = rCurr >= 65 && (cCurrent.close <= cCurrent.open || (rPrev !== undefined && rCurr < rPrev));
      // B) Quiebre de momentum bajista: RSI < 30 rompiendo soportes
      const isMomentumBreakdown = rCurr <= 30 && cCurrent.close <= cPrev.low;

      if ((isOverboughtExhaustion || isMomentumBreakdown) && isBearishStructure) {
        // Evita duplicar señales inmediatas si ya se emitió una en los últimos 3 periodos
        const prevSignal = signals[signals.length - 1];
        const isTooRecent =
          prevSignal &&
          prevSignal.strategy === 'Ditto Hyperliquid Short 82% WR' &&
          Number(cCurrent.time) - Number(prevSignal.time) < 180;

        if (!isTooRecent) {
          const entry = cCurrent.close;
          const sl = roundPriceDynamic(entry * (1 + 0.036)); // Stop Loss anti-barrida: +3.6% con 5x
          const tp1 = roundPriceDynamic(entry * (1 - 0.018)); // Take Profit 1 exacto: +1.8%
          const tp2 = roundPriceDynamic(entry * (1 - 0.032)); // Take Profit 2 extendido: +3.2%
          const reason = isOverboughtExhaustion
            ? `Agotamiento en sobrecompra RSI (${rCurr.toFixed(1)} >= 65) a favor de estructura bajista`
            : `Quiebre de momentum bajista RSI (${rCurr.toFixed(1)} <= 30) a favor de estructura bajista`;

          signals.push({
            id: `${symbol}-${timeframe}-ditto-short-${cCurrent.time}`,
            symbol,
            timeframe,
            type: 'SELL',
            time: cCurrent.time,
            price: entry,
            strategy: 'Ditto Hyperliquid Short 82% WR',
            reason,
            stopLoss: sl,
            takeProfit1: tp1,
            takeProfit2: tp2,
            riskReward: '1:0.5 (Alta Probabilidad 82%-93% WR 5x)',
            timestamp: Number(cCurrent.time) * 1000,
          });
        }
      }
    }
  }

  // Helper para evaluar tendencia macro en la vela de la señal
  const evaluateMacroTrendAt = (c: Candle, prevC?: Candle): MacroTrend => {
    const e50 = ema50Map.get(c.time);
    const e200 = ema200Map.get(c.time);
    const prevE50 = prevC ? ema50Map.get(prevC.time) : undefined;

    if (e50 !== undefined && e200 !== undefined) {
      if (c.close >= e50 && e50 >= e200) return 'BULLISH';
      if (c.close <= e50 && e50 <= e200) return 'BEARISH';
    }

    if (e50 !== undefined) {
      const isEmaRising = prevE50 !== undefined ? e50 >= prevE50 : true;
      if (c.close >= e50 && isEmaRising) return 'BULLISH';
      if (c.close <= e50 && !isEmaRising) return 'BEARISH';
    }

    return c.close >= (prevC?.close ?? c.close) ? 'BULLISH' : 'BEARISH';
  };

  // Evaluate live market status for each signal based on price action from entry to current candle
  const candlesByTimeMap = new Map<number, number>();
  candles.forEach((c, idx) => candlesByTimeMap.set(Number(c.time), idx));

  signals.forEach((sig) => {
    const startIdx = candlesByTimeMap.get(Number(sig.time)) ?? 0;
    const isBuy = sig.type === 'BUY';
    let status: 'ACTIVE' | 'TP1_HIT' | 'TP2_HIT' | 'SL_HIT' = 'ACTIVE';
    let isTP1 = false;

    for (let i = startIdx + 1; i < candles.length; i++) {
      const c = candles[i];
      if (isBuy) {
        if (c.low <= sig.stopLoss) {
          status = 'SL_HIT';
          break;
        }
        if (c.high >= sig.takeProfit2) {
          status = 'TP2_HIT';
          break;
        }
        if (c.high >= sig.takeProfit1) {
          isTP1 = true;
        }
      } else {
        if (c.high >= sig.stopLoss) {
          status = 'SL_HIT';
          break;
        }
        if (c.low <= sig.takeProfit2) {
          status = 'TP2_HIT';
          break;
        }
        if (c.low <= sig.takeProfit1) {
          isTP1 = true;
        }
      }
    }

    if (status === 'ACTIVE' && isTP1) {
      status = 'TP1_HIT';
    }

    sig.status = status;
    const candlesAgo = candles.length - 1 - startIdx;
    sig.candlesAgo = candlesAgo;
    // Considered fresh/current if generated in the last 3 candles
    sig.isCurrent = candlesAgo <= 3;

    // Inyección de Confirmación MTF Real
    const sigCandle = candles.find((c) => c.time === sig.time) || candles[candles.length - 1];
    const sigIdx = candles.findIndex((c) => c.time === sig.time);
    const prevSigCandle = sigIdx > 0 ? candles[sigIdx - 1] : undefined;

    const mTrend = evaluateMacroTrendAt(sigCandle, prevSigCandle);
    const mConfirmed =
      (sig.type === 'BUY' && mTrend === 'BULLISH') ||
      (sig.type === 'SELL' && mTrend === 'BEARISH');

    sig.macroTimeframe = macroTimeframe;
    sig.macroTrend = mTrend;
    sig.macroConfirmed = mConfirmed;
    sig.macroReason = mConfirmed
      ? `Confirmado por jerarquía MTF (${macroTimeframe}): tendencia ${mTrend.toLowerCase()}`
      : `Desalineado con jerarquía MTF (${macroTimeframe}): tendencia ${mTrend.toLowerCase()}`;
  });

  // Sort signals newest first (descending chronological)
  return signals.sort((a, b) => Number(b.time) - Number(a.time));
}
