import { Candle, Timeframe } from '@/types';
import { UTCTimestamp } from 'lightweight-charts';

export type KlineCallback = (candle: Candle, isClosed: boolean) => void;

export class BinanceWebSocketClient {
  private ws: WebSocket | null = null;
  private symbol: string = 'btcusdt';
  private interval: Timeframe = '15m';
  private callback: KlineCallback | null = null;
  private isExplicitlyClosed: boolean = false;
  private reconnectAttempts: number = 0;
  private reconnectTimeout: any = null;
  private syntheticInterval: any = null;

  constructor(symbol: string = 'BTCUSDT', interval: Timeframe = '15m', callback?: KlineCallback) {
    this.symbol = symbol.toLowerCase();
    this.interval = interval;
    if (callback) {
      this.callback = callback;
    }
  }

  public subscribe(symbol: string, interval: Timeframe, callback: KlineCallback) {
    this.symbol = symbol.toLowerCase();
    this.interval = interval;
    this.callback = callback;
    this.isExplicitlyClosed = false;
    this.connect();
  }

  public connect() {
    if (this.syntheticInterval) {
      clearInterval(this.syntheticInterval);
      this.syntheticInterval = null;
    }

    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }

    const synthBasePrices: Record<string, number> = {
      xagusdt: 32.48,
      wtiusdt: 71.82,
      us100usdt: 19945.2,
      us500usdt: 5794.5,
      us30usdt: 42280.0,
    };

    if (synthBasePrices[this.symbol]) {
      let currentPrice = synthBasePrices[this.symbol];
      let currentHigh = currentPrice * 1.0003;
      let currentLow = currentPrice * 0.9997;
      let currentOpen = currentPrice;
      const stepSec = 15 * 60;
      let candleTime = (Math.floor(Date.now() / 1000 / stepSec) * stepSec) as UTCTimestamp;

      this.syntheticInterval = setInterval(() => {
        const delta = (Math.random() - 0.495) * (currentPrice * 0.0003);
        currentPrice = Number((currentPrice + delta).toFixed(2));
        currentHigh = Math.max(currentHigh, currentPrice);
        currentLow = Math.min(currentLow, currentPrice);

        const liveCandle: Candle = {
          time: candleTime,
          open: currentOpen,
          high: currentHigh,
          low: currentLow,
          close: currentPrice,
          volume: Math.floor(Math.random() * 50) + 10,
        };

        if (this.callback) {
          this.callback(liveCandle, false);
        }
      }, 1500);

      return;
    }

    const streamName = `${this.symbol}@kline_${this.interval}`;
    const wsUrl = `wss://stream.binance.com:9443/ws/${streamName}`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.e === 'kline' && message.k) {
            const k = message.k;
            const candle: Candle = {
              time: Math.floor(k.t / 1000) as UTCTimestamp,
              open: parseFloat(k.o),
              high: parseFloat(k.h),
              low: parseFloat(k.l),
              close: parseFloat(k.c),
              volume: parseFloat(k.v),
            };
            if (this.callback) {
              this.callback(candle, k.x);
            }
          }
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
        }
      };

      this.ws.onerror = (error) => {
        console.warn('Binance WebSocket error:', error);
      };

      this.ws.onclose = () => {
        if (!this.isExplicitlyClosed) {
          this.scheduleReconnect();
        }
      };
    } catch (err) {
      console.error('Failed to instantiate WebSocket:', err);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 15000);
    this.reconnectAttempts++;
    this.reconnectTimeout = setTimeout(() => {
      if (!this.isExplicitlyClosed) {
        this.connect();
      }
    }, delay);
  }

  public unsubscribe() {
    this.isExplicitlyClosed = true;
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    if (this.syntheticInterval) {
      clearInterval(this.syntheticInterval);
      this.syntheticInterval = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.callback = null;
  }
}

export interface MiniTickerData {
  symbol: string;
  price: number;
  open: number;
  high: number;
  low: number;
  volume: number;
}

export type MultiTickerCallback = (tickers: MiniTickerData[]) => void;

export class BinanceMultiTickerClient {
  private ws: WebSocket | null = null;
  private callback: MultiTickerCallback | null = null;
  private isExplicitlyClosed: boolean = false;
  private reconnectAttempts: number = 0;
  private reconnectTimeout: any = null;

  constructor(callback?: MultiTickerCallback) {
    if (callback) {
      this.callback = callback;
    }
  }

  public subscribe(callback: MultiTickerCallback) {
    this.callback = callback;
    this.isExplicitlyClosed = false;
    this.connect();
  }

  public connect() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }

    const wsUrl = 'wss://stream.binance.com:9443/ws/!miniTicker@arr';

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (Array.isArray(message)) {
            const tickers: MiniTickerData[] = message.map((item: any) => ({
              symbol: item.s,
              price: parseFloat(item.c),
              open: parseFloat(item.o),
              high: parseFloat(item.h),
              low: parseFloat(item.l),
              volume: parseFloat(item.v),
            }));
            if (this.callback) {
              this.callback(tickers);
            }
          }
        } catch (err) {
          console.error('Error parsing MiniTicker message:', err);
        }
      };

      this.ws.onerror = (error) => {
        console.warn('Binance MultiTicker WebSocket error:', error);
      };

      this.ws.onclose = () => {
        if (!this.isExplicitlyClosed) {
          this.scheduleReconnect();
        }
      };
    } catch (err) {
      console.error('Failed to instantiate MultiTicker WebSocket:', err);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
    this.reconnectAttempts++;
    this.reconnectTimeout = setTimeout(() => {
      if (!this.isExplicitlyClosed) {
        this.connect();
      }
    }, delay);
  }

  public unsubscribe() {
    this.isExplicitlyClosed = true;
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.callback = null;
  }
}
