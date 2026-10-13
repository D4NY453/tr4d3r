import { Candle, Timeframe } from '@/types';
import { UTCTimestamp } from 'lightweight-charts';

export class HyperliquidWebSocketClient {
  private ws: WebSocket | null = null;
  private coin: string;
  private interval: Timeframe;
  private onCandleUpdate: (candle: Candle) => void;
  private isClosedManually: boolean = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  constructor(
    coin: string,
    interval: Timeframe,
    onCandleUpdate: (candle: Candle) => void
  ) {
    this.coin = coin.replace(/(-PERP|USDT|\/USD)$/i, '').toUpperCase();
    this.interval = interval;
    this.onCandleUpdate = onCandleUpdate;
  }

  public connect(): void {
    if (typeof window === 'undefined') return;

    this.isClosedManually = false;

    // Hyperliquid supports '1m', '5m', '15m', '1h', '4h', '1d'
    const hlIntervalMap: Record<Timeframe, string> = {
      '1s': '1m',
      '3s': '1m',
      '5s': '1m',
      '15s': '1m',
      '1m': '1m',
      '5m': '5m',
      '15m': '15m',
      '1h': '1h',
      '4h': '4h',
      '1d': '1d',
      '1w': '1d',
    };
    const hlInterval = hlIntervalMap[this.interval] || '15m';

    try {
      this.ws = new WebSocket('wss://api.hyperliquid.xyz/ws');

      this.ws.onopen = () => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const subMessage = {
          method: 'subscribe',
          subscription: {
            type: 'candle',
            coin: this.coin,
            interval: hlInterval,
          },
        };
        this.ws.send(JSON.stringify(subMessage));
      };

      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.channel === 'candle' && payload.data) {
            const d = payload.data;
            if (d.s === this.coin) {
              const candle: Candle = {
                time: Math.floor(d.t / 1000) as UTCTimestamp,
                open: parseFloat(d.o),
                high: parseFloat(d.h),
                low: parseFloat(d.l),
                close: parseFloat(d.c),
                volume: parseFloat(d.v),
              };
              this.onCandleUpdate(candle);
            }
          }
        } catch {
          // ignore parsing error
        }
      };

      this.ws.onclose = () => {
        if (!this.isClosedManually) {
          this.reconnectTimeout = setTimeout(() => {
            this.connect();
          }, 3000);
        }
      };

      this.ws.onerror = () => {
        if (this.ws) {
          this.ws.close();
        }
      };
    } catch (err) {
      console.error('Error connecting to Hyperliquid WebSocket:', err);
    }
  }

  public unsubscribe(): void {
    this.isClosedManually = true;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        try {
          const unsubMessage = {
            method: 'unsubscribe',
            subscription: {
              type: 'candle',
              coin: this.coin,
              interval: this.interval,
            },
          };
          this.ws.send(JSON.stringify(unsubMessage));
        } catch {}
      }
      this.ws.close();
      this.ws = null;
    }
  }
}
