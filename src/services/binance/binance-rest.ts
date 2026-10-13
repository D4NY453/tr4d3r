import { Candle, Ticker24h, Timeframe } from '@/types';
import { UTCTimestamp } from 'lightweight-charts';
import {
  UPSCALE_RWA_ASSETS,
  getAssetMetadata,
  getAssetCategory,
  getAssetDisplayName,
} from '@/services/assets/market-assets';
import { pythService } from '@/services/pyth/pyth-service';

const BASE_URL = 'https://api.binance.com/api/v3';
const BACKUP_URL = 'https://data-api.binance.vision/api/v3';

import { fetchHyperliquidKlines, fetchHyperliquidMarkets } from '@/services/hyperliquid/hyperliquid-rest';

let cachedHlMarkets: Ticker24h[] = [];
let lastHlFetchTime = 0;

export async function fetchHistoricalKlines(
  symbol: string = 'BTCUSDT',
  interval: Timeframe = '15m',
  limit: number = 500
): Promise<Candle[]> {
  try {
    const upper = symbol.toUpperCase();
    if (upper.endsWith('-PERP') || upper.startsWith('HL-')) {
      const hlCandles = await fetchHyperliquidKlines(symbol, interval, limit);
      if (hlCandles.length > 0) return hlCandles;
    }

    const norm = symbol.toUpperCase().replace(/[-_/]/g, '');
    const meta = getAssetMetadata(norm);

    // Si es un activo sintético de Upscale/Pyth que no cotiza spot en Binance, generamos velas cuantitativas
    if (meta && meta.isRWA && !['PAXGUSDT', 'EURUSDT', 'GBPUSDT', 'AUDUSDT'].includes(meta.symbol)) {
      const basePrices: Record<string, number> = {
        XAGUSDT: 32.48,
        WTIUSDT: 71.82,
        US100USDT: 19945.2,
        US500USDT: 5794.5,
        US30USDT: 42280.0,
      };
      const base = basePrices[meta.symbol] || 100;
      return pythService.generateSyntheticCandles(base, limit, 15, 0.002);
    }

    let url = `${BASE_URL}/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`;
    let response: Response;
    try {
      response = await fetch(url);
    } catch {
      url = `${BACKUP_URL}/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`;
      response = await fetch(url);
    }

    if (!response.ok) {
      throw new Error(`Binance REST error: ${response.statusText}`);
    }

    const data: any[][] = await response.json();

    return data.map((item) => ({
      time: Math.floor(item[0] / 1000) as UTCTimestamp,
      open: parseFloat(item[1]),
      high: parseFloat(item[2]),
      low: parseFloat(item[3]),
      close: parseFloat(item[4]),
      volume: parseFloat(item[5]),
    }));
  } catch (error) {
    console.error('Error fetching historical klines:', error);
    return [];
  }
}

export async function fetch24hTickers(): Promise<Ticker24h[]> {
  try {
    const url = `${BASE_URL}/ticker/24hr`;
    let res: Response;
    try {
      res = await fetch(url);
    } catch {
      res = await fetch(`${BACKUP_URL}/ticker/24hr`);
    }

    if (!res.ok) throw new Error('Error fetching 24hr tickers');

    const data = await res.json();
    const mappedTickers: Ticker24h[] = data
      .filter(
        (t: any) =>
          t.symbol.endsWith('USDT') &&
          parseFloat(t.bidPrice || '0') > 0 &&
          parseFloat(t.askPrice || '0') > 0
      )
      .map((t: any) => {
        const meta = getAssetMetadata(t.symbol);
        return {
          symbol: t.symbol,
          lastPrice: parseFloat(t.lastPrice),
          priceChangePercent: parseFloat(t.priceChangePercent),
          highPrice: parseFloat(t.highPrice),
          lowPrice: parseFloat(t.lowPrice),
          volume: parseFloat(t.volume),
          quoteVolume: parseFloat(t.quoteVolume),
          category: meta ? meta.category : 'CRYPTO',
          displayName: meta ? meta.displayName : t.symbol,
          isRWA: meta ? meta.isRWA : false,
        };
      });

    // Activos complementarios de Upscale.trade (Plata, Petróleo, Índices)
    const rwaExtras: Ticker24h[] = [
      {
        symbol: 'XAGUSDT',
        lastPrice: 32.48,
        priceChangePercent: 0.85,
        highPrice: 32.9,
        lowPrice: 31.95,
        volume: 142000,
        quoteVolume: 4612160,
        category: 'METALS',
        displayName: 'XAG/USD · Plata (Silver)',
        isRWA: true,
      },
      {
        symbol: 'WTIUSDT',
        lastPrice: 71.82,
        priceChangePercent: -0.42,
        highPrice: 72.95,
        lowPrice: 71.1,
        volume: 85000,
        quoteVolume: 6104700,
        category: 'METALS',
        displayName: 'WTI/USD · Petróleo Crudo',
        isRWA: true,
      },
      {
        symbol: 'US100USDT',
        lastPrice: 19945.2,
        priceChangePercent: 1.15,
        highPrice: 20050.0,
        lowPrice: 19820.0,
        volume: 24000,
        quoteVolume: 478684800,
        category: 'INDICES',
        displayName: 'US100 · Nasdaq 100 Index',
        isRWA: true,
      },
      {
        symbol: 'US500USDT',
        lastPrice: 5794.5,
        priceChangePercent: 0.62,
        highPrice: 5820.0,
        lowPrice: 5760.0,
        volume: 45000,
        quoteVolume: 260752500,
        category: 'INDICES',
        displayName: 'US500 · S&P 500 Index',
        isRWA: true,
      },
      {
        symbol: 'US30USDT',
        lastPrice: 42280.0,
        priceChangePercent: 0.38,
        highPrice: 42450.0,
        lowPrice: 42100.0,
        volume: 18000,
        quoteVolume: 761040000,
        category: 'INDICES',
        displayName: 'US30 · Dow Jones 30 Index',
        isRWA: true,
      },
    ];

    // Hyperliquid Perpetuals Markets (con caché de 8s para máxima fluidez)
    const now = Date.now();
    if (now - lastHlFetchTime > 8000 || cachedHlMarkets.length === 0) {
      try {
        const hlMarkets = await fetchHyperliquidMarkets();
        if (hlMarkets.length > 0) {
          cachedHlMarkets = hlMarkets;
          lastHlFetchTime = now;
        }
      } catch (e) {
        // Silent fallback to cached
      }
    }

    return [...cachedHlMarkets, ...rwaExtras, ...mappedTickers].sort((a: Ticker24h, b: Ticker24h) => {
      return b.quoteVolume - a.quoteVolume;
    });
  } catch (err) {
    console.error('Error fetching 24hr tickers:', err);
    return cachedHlMarkets || [];
  }
}

export type PerformancePeriod = '15m' | '30m' | '24h' | '1M' | '1Y';

export async function fetchMultiPeriodPerformance(
  symbols: string[],
  period: PerformancePeriod
): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  if (!symbols || symbols.length === 0) return result;

  try {
    if (period === '15m' || period === '30m') {
      const windowSize = period;
      const chunks = [];
      const chunkSize = 50;
      for (let i = 0; i < symbols.length; i += chunkSize) {
        chunks.push(symbols.slice(i, i + chunkSize));
      }

      await Promise.all(
        chunks.map(async (chunk) => {
          try {
            const symsParam = encodeURIComponent(JSON.stringify(chunk));
            let url = `${BASE_URL}/ticker?symbols=${symsParam}&windowSize=${windowSize}`;
            let res = await fetch(url);
            if (!res.ok) {
              url = `${BACKUP_URL}/ticker?symbols=${symsParam}&windowSize=${windowSize}`;
              res = await fetch(url);
            }
            if (res.ok) {
              const data = await res.json();
              if (Array.isArray(data)) {
                data.forEach((item: any) => {
                  result[item.symbol] = parseFloat(item.priceChangePercent);
                });
              }
            }
          } catch (e) {
            // Silently fallback
          }
        })
      );
    } else if (period === '1M' || period === '1Y') {
      const limit = period === '1M' ? 2 : 13;
      await Promise.all(
        symbols.slice(0, 40).map(async (symbol) => {
          try {
            let url = `${BASE_URL}/klines?symbol=${symbol}&interval=1M&limit=${limit}`;
            let res = await fetch(url);
            if (!res.ok) {
              url = `${BACKUP_URL}/klines?symbol=${symbol}&interval=1M&limit=${limit}`;
              res = await fetch(url);
            }
            if (res.ok) {
              const data = await res.json();
              if (data && data.length >= 1) {
                const currentPrice = parseFloat(data[data.length - 1][4]);
                const basePrice = parseFloat(data[0][1]);
                if (basePrice > 0) {
                  result[symbol] = Number((((currentPrice - basePrice) / basePrice) * 100).toFixed(2));
                }
              }
            }
          } catch (e) {
            // Silently fallback
          }
        })
      );
    }
  } catch (err) {
    console.error(`Error in fetchMultiPeriodPerformance (${period}):`, err);
  }

  return result;
}
