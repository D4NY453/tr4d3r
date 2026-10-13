import { Candle, TradingSignal, ClosedTrade, BacktestSummary } from '@/types';

export interface SimulatedTradeResult extends ClosedTrade {
  signalId: string;
  durationCandles: number;
}

/**
 * Executes a high-fidelity historical backtest simulation across all signals.
 * Evaluates whether price touched Take Profit (TP1) or Stop Loss (SL) first in subsequent candles.
 */
export function runSignalsBacktest(
  candles: Candle[],
  signals: TradingSignal[],
  capitalPerTrade: number = 100
): {
  trades: SimulatedTradeResult[];
  summary: BacktestSummary;
} {
  if (!candles || candles.length === 0 || !signals || signals.length === 0) {
    return {
      trades: [],
      summary: {
        totalTrades: 0,
        winTrades: 0,
        lossTrades: 0,
        winRate: 0,
        totalPnlUSDT: 0,
        totalPnlPercent: 0,
        profitFactor: 0,
        avgWinUSDT: 0,
        avgLossUSDT: 0,
      },
    };
  }

  const candleTimeMap = new Map<number, number>();
  candles.forEach((c, idx) => {
    candleTimeMap.set(Number(c.time), idx);
  });

  const trades: SimulatedTradeResult[] = [];
  let totalWinUSDT = 0;
  let totalLossUSDT = 0;

  for (const sig of signals) {
    const sigTimeNum = Number(sig.time);
    const startIdx = candleTimeMap.get(sigTimeNum);
    if (startIdx === undefined || startIdx >= candles.length - 1) continue;

    const isBuy = sig.type === 'BUY';
    const entryPrice = sig.price;
    const sl = sig.stopLoss;
    const tp1 = sig.takeProfit1;
    const tp2 = sig.takeProfit2;

    let exitPrice = entryPrice;
    let exitReason: 'TP1' | 'TP2' | 'SL' | 'MANUAL' = 'MANUAL';
    let exitTime = Number(candles[candles.length - 1].time) * 1000;
    let durationCandles = 0;

    // Scan subsequent candles to see which price was triggered first
    for (let j = startIdx + 1; j < candles.length; j++) {
      const c = candles[j];
      durationCandles = j - startIdx;

      if (isBuy) {
        // Did it hit Stop Loss?
        if (c.low <= sl) {
          exitPrice = sl;
          exitReason = 'SL';
          exitTime = Number(c.time) * 1000;
          break;
        }
        // Did it hit Take Profit 1?
        if (c.high >= tp1) {
          exitPrice = tp1;
          exitReason = 'TP1';
          exitTime = Number(c.time) * 1000;
          break;
        }
      } else {
        // SELL / Short
        // Did it hit Stop Loss?
        if (c.high >= sl) {
          exitPrice = sl;
          exitReason = 'SL';
          exitTime = Number(c.time) * 1000;
          break;
        }
        // Did it hit Take Profit 1?
        if (c.low <= tp1) {
          exitPrice = tp1;
          exitReason = 'TP1';
          exitTime = Number(c.time) * 1000;
          break;
        }
      }
    }

    // If still open at the latest candle, mark as current market close
    if (exitReason === 'MANUAL') {
      exitPrice = candles[candles.length - 1].close;
    }

    // Calculate PnL
    const rawMovePct = isBuy
      ? (exitPrice - entryPrice) / entryPrice
      : (entryPrice - exitPrice) / entryPrice;

    const pnlUSDT = capitalPerTrade * rawMovePct;
    const pnlPercent = rawMovePct * 100;

    if (pnlUSDT > 0) {
      totalWinUSDT += pnlUSDT;
    } else {
      totalLossUSDT += Math.abs(pnlUSDT);
    }

    trades.push({
      id: `trade-${sig.id}`,
      signalId: sig.id,
      symbol: sig.symbol,
      type: sig.type,
      strategy: sig.strategy,
      entryPrice,
      exitPrice: Number(exitPrice.toFixed(4)),
      amountUSDT: capitalPerTrade,
      pnlUSDT: Number(pnlUSDT.toFixed(2)),
      pnlPercent: Number(pnlPercent.toFixed(2)),
      exitReason,
      entryTime: Number(sig.time) * 1000,
      exitTime,
      durationCandles,
    });
  }

  const totalTrades = trades.length;
  const winTrades = trades.filter((t) => t.pnlUSDT > 0).length;
  const lossTrades = trades.filter((t) => t.pnlUSDT <= 0).length;
  const winRate = totalTrades > 0 ? (winTrades / totalTrades) * 100 : 0;
  const totalPnlUSDT = trades.reduce((acc, t) => acc + t.pnlUSDT, 0);
  const totalPnlPercent = (totalPnlUSDT / (totalTrades * capitalPerTrade || 1)) * 100;
  const profitFactor =
    totalLossUSDT > 0 ? totalWinUSDT / totalLossUSDT : totalWinUSDT > 0 ? 99 : 0;

  const avgWinUSDT = winTrades > 0 ? totalWinUSDT / winTrades : 0;
  const avgLossUSDT = lossTrades > 0 ? totalLossUSDT / lossTrades : 0;

  return {
    trades: trades.sort((a, b) => b.entryTime - a.entryTime),
    summary: {
      totalTrades,
      winTrades,
      lossTrades,
      winRate: Number(winRate.toFixed(1)),
      totalPnlUSDT: Number(totalPnlUSDT.toFixed(2)),
      totalPnlPercent: Number(totalPnlPercent.toFixed(2)),
      profitFactor: Number(profitFactor.toFixed(2)),
      avgWinUSDT: Number(avgWinUSDT.toFixed(2)),
      avgLossUSDT: Number(avgLossUSDT.toFixed(2)),
    },
  };
}
