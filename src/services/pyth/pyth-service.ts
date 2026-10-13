import { UPSCALE_RWA_ASSETS, getAssetMetadata } from '@/services/assets/market-assets';
import { Candle } from '@/types';
import { UTCTimestamp } from 'lightweight-charts';

export interface PythPriceData {
  price: number;
  conf: number;
  expo: number;
  publishTime: number;
}

export class PythNetworkService {
  private static instance: PythNetworkService;
  private apiKey: string = '';
  private cachedPrices: Record<string, PythPriceData> = {};

  private constructor() {}

  public static getInstance(): PythNetworkService {
    if (!PythNetworkService.instance) {
      PythNetworkService.instance = new PythNetworkService();
    }
    return PythNetworkService.instance;
  }

  public setApiKey(key: string) {
    this.apiKey = key.trim();
  }

  public getApiKey(): string {
    return this.apiKey;
  }

  public async fetchPrice(feedId: string): Promise<PythPriceData | null> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const cleanId = feedId.startsWith('0x') ? feedId : `0x${feedId}`;
      const url = `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${cleanId}`;
      
      const res = await fetch(url, { headers });
      if (!res.ok) {
        return null;
      }

      const data = await res.json();
      if (data && data.parsed && data.parsed.length > 0) {
        const item = data.parsed[0].price;
        const rawPrice = Number(item.price);
        const expo = Number(item.expo);
        const actualPrice = rawPrice * Math.pow(10, expo);

        const result: PythPriceData = {
          price: actualPrice,
          conf: Number(item.conf) * Math.pow(10, expo),
          expo: expo,
          publishTime: Number(item.publish_time),
        };
        this.cachedPrices[feedId] = result;
        return result;
      }
      return null;
    } catch {
      return null;
    }
  }

  public generateSyntheticCandles(
    basePrice: number,
    count: number = 200,
    intervalMinutes: number = 15,
    volatility: number = 0.003
  ): Candle[] {
    const candles: Candle[] = [];
    const nowSec = Math.floor(Date.now() / 1000);
    const stepSec = intervalMinutes * 60;
    let current = basePrice;

    for (let i = count; i >= 0; i--) {
      const time = (nowSec - i * stepSec) as UTCTimestamp;
      const changePercent = (Math.random() - 0.49) * volatility;
      const open = current;
      const close = open * (1 + changePercent);
      const high = Math.max(open, close) * (1 + Math.random() * (volatility * 0.5));
      const low = Math.min(open, close) * (1 - Math.random() * (volatility * 0.5));
      const volume = Math.floor(Math.random() * 5000) + 1000;

      candles.push({ time, open, high, low, close, volume });
      current = close;
    }

    return candles;
  }
}

export const pythService = PythNetworkService.getInstance();