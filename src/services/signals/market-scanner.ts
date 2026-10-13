import { Candle, Timeframe, TradingSignal, ActiveStrategyConfig } from '@/types';
import { fetchHistoricalKlines } from '@/services/binance/binance-rest';
import { evaluateTradingSignals } from '@/services/signals/strategy-engine';

export const SCANNER_HL_SYMBOLS = [
  'BTC-PERP',
  'ETH-PERP',
  'SOL-PERP',
  'HYPE-PERP',
  'PURR-PERP',
  'SUI-PERP',
  'DOGE-PERP',
  'PEPE-PERP',
  'PYTH-PERP',
  'AVAX-PERP',
  'LINK-PERP',
  'NEAR-PERP',
  'APT-PERP',
  'ARB-PERP',
  'OP-PERP',
  'INJ-PERP',
  'TIA-PERP',
  'RENDER-PERP',
  'FET-PERP',
  'SEI-PERP',
  'WIF-PERP',
  'BONK-PERP',
  'PENDLE-PERP',
  'ENA-PERP',
  'JUP-PERP',
  'AAVE-PERP',
  'CRV-PERP',
  'LDO-PERP',
  'UNI-PERP',
  'TAO-PERP',
  'STX-PERP',
  'TRUMP-PERP',
  'FART-PERP',
  'PENGU-PERP',
  'MOODENG-PERP',
  'GOAT-PERP',
  'MELANIA-PERP',
  'CHILL-PERP',
  'PNUT-PERP',
  'ACT-PERP',
  'GIGA-PERP',
  'POPCAT-PERP',
  'BRETT-PERP',
  'SHIB-PERP',
];

export const SCANNER_BINANCE_SYMBOLS = [
  'BTCUSDT',
  'ETHUSDT',
  'SOLUSDT',
  'BNBUSDT',
  'XRPUSDT',
  'DOGEUSDT',
  'ADAUSDT',
  'AVAXUSDT',
  'SUIUSDT',
  'NEARUSDT',
  'LINKUSDT',
  'PEPEUSDT',
  'RENDERUSDT',
  'FETUSDT',
  'DOTUSDT',
  'APTUSDT',
  'SHIBUSDT',
  'LTCUSDT',
  'UNIUSDT',
  'TAOUSDT',
  'AAVEUSDT',
  'TIAUSDT',
  'SEIUSDT',
  'WLDUSDT',
  'FLOKIUSDT',
  'BONKUSDT',
  'WIFUSDT',
  'ENAUSDT',
];

export const MEME_SYMBOLS_REGEX =
  /PEPE|DOGE|SHIB|BONK|WIF|POPCAT|FART|TRUMP|PENGU|MOODENG|GOAT|BRETT|PURR|MELANIA|CHILL|PNUT|ACT|BOME|MEME|CAT|NEIRO|MOG|GIGA|SPX/i;

export interface EnrichedTradingSignal extends TradingSignal {
  categoryTag: 'PERP' | 'MEME' | 'SPOT';
  roiTp1Percent: number;
  roiTp2Percent: number;
  riskPercent: number;
  currentPrice?: number;
}

export interface ScanMarketOptions {
  timeframe?: Timeframe;
  category?: 'ALL' | 'HYPERLIQUID' | 'MEMES' | 'BINANCE';
  activeStrategies?: ActiveStrategyConfig;
  maxPairs?: number;
  onProgress?: (progress: {
    scannedCount: number;
    totalCount: number;
    percent: number;
    currentSymbol: string;
    foundCount: number;
  }) => void;
}

let lastScanCache: {
  timestamp: number;
  timeframe: string;
  category: string;
  signals: EnrichedTradingSignal[];
} | null = null;

export async function scanAllMarketOpportunities(
  options: ScanMarketOptions = {}
): Promise<EnrichedTradingSignal[]> {
  const {
    timeframe = '1m',
    category = 'ALL',
    activeStrategies = {
      emaCross: true,
      rsiReversal: true,
      macdCrossover: true,
      superTrendStrategy: true,
      bollingerBreakout: true,
      bollingerSqueeze: true,
      bollingerPercentBDivergence: true,
    },
    maxPairs = 60,
    onProgress,
  } = options;

  // Determine list of symbols to scan
  let targetSymbols: string[] = [];

  if (category === 'HYPERLIQUID') {
    targetSymbols = [...SCANNER_HL_SYMBOLS];
  } else if (category === 'BINANCE') {
    targetSymbols = [...SCANNER_BINANCE_SYMBOLS];
  } else if (category === 'MEMES') {
    targetSymbols = [
      ...SCANNER_HL_SYMBOLS.filter((s) => MEME_SYMBOLS_REGEX.test(s)),
      ...SCANNER_BINANCE_SYMBOLS.filter((s) => MEME_SYMBOLS_REGEX.test(s)),
    ];
  } else {
    // ALL: Prioritize top Hyperliquid Perps (high volume & fast trades) + Top Binance
    targetSymbols = Array.from(new Set([...SCANNER_HL_SYMBOLS, ...SCANNER_BINANCE_SYMBOLS]));
  }

  if (maxPairs && maxPairs > 0) {
    targetSymbols = targetSymbols.slice(0, maxPairs);
  }

  const allFoundSignals: EnrichedTradingSignal[] = [];
  const total = targetSymbols.length;
  let completed = 0;

  // Process in concurrent batches of 6
  const BATCH_SIZE = 6;
  for (let i = 0; i < targetSymbols.length; i += BATCH_SIZE) {
    const batch = targetSymbols.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.all(
      batch.map(async (symbol) => {
        try {
          // Fetch last 60 candles
          const candles = await fetchHistoricalKlines(symbol, timeframe, 60);
          if (!candles || candles.length < 35) {
            return [];
          }

          const rawSignals = evaluateTradingSignals(
            candles,
            symbol,
            timeframe,
            activeStrategies
          );

          // Keep strictly ACTIVE or TP1_HIT (vigentes)
          const liveSignals = rawSignals.filter(
            (s) => s.status === 'ACTIVE' || s.status === 'TP1_HIT'
          );

          const lastCandle = candles[candles.length - 1];
          const currPx = lastCandle ? lastCandle.close : 0;

          const isMeme = MEME_SYMBOLS_REGEX.test(symbol);
          const isPerp = symbol.endsWith('-PERP') || symbol.startsWith('HL-');
          const categoryTag: 'PERP' | 'MEME' | 'SPOT' = isMeme
            ? 'MEME'
            : isPerp
            ? 'PERP'
            : 'SPOT';

          return liveSignals.map((s) => {
            const entry = s.price || currPx || 1;
            const roiTp1 = (Math.abs(s.takeProfit1 - entry) / entry) * 100;
            const roiTp2 = (Math.abs(s.takeProfit2 - entry) / entry) * 100;
            const riskPct = (Math.abs(entry - s.stopLoss) / entry) * 100;

            const enriched: EnrichedTradingSignal = {
              ...s,
              categoryTag,
              roiTp1Percent: Number(roiTp1.toFixed(2)),
              roiTp2Percent: Number(roiTp2.toFixed(2)),
              riskPercent: Number(riskPct.toFixed(2)),
              currentPrice: currPx,
            };
            return enriched;
          });
        } catch (err) {
          return [];
        } finally {
          completed++;
          if (onProgress) {
            onProgress({
              scannedCount: completed,
              totalCount: total,
              percent: Math.min(100, Math.round((completed / total) * 100)),
              currentSymbol: symbol,
              foundCount: allFoundSignals.length,
            });
          }
        }
      })
    );

    batchResults.forEach((signals) => {
      allFoundSignals.push(...signals);
    });

    // Small delay between batches to remain friendly to rates
    if (i + BATCH_SIZE < targetSymbols.length) {
      await new Promise((res) => setTimeout(res, 25));
    }
  }

  // Deduplicate by symbol + strategy if identical
  const uniqueMap = new Map<string, EnrichedTradingSignal>();
  for (const sig of allFoundSignals) {
    const key = `${sig.symbol}-${sig.strategy}-${sig.type}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, sig);
    } else {
      // Keep the fresher signal (smaller candlesAgo)
      const existing = uniqueMap.get(key)!;
      if ((sig.candlesAgo ?? 99) < (existing.candlesAgo ?? 99)) {
        uniqueMap.set(key, sig);
      }
    }
  }

  // Sort: freshest first (candlesAgo <= 1, then <= 2), then newest timestamp
  const sorted = Array.from(uniqueMap.values()).sort((a, b) => {
    const aFresh = a.candlesAgo ?? 99;
    const bFresh = b.candlesAgo ?? 99;
    if (aFresh !== bFresh) return aFresh - bFresh;
    return Number(b.timestamp) - Number(a.timestamp);
  });

  lastScanCache = {
    timestamp: Date.now(),
    timeframe,
    category,
    signals: sorted,
  };

  return sorted;
}

export function getLastScanCache(): EnrichedTradingSignal[] {
  return lastScanCache ? lastScanCache.signals : [];
}
