import { Candle, Ticker24h, Timeframe } from '@/types';
import { UTCTimestamp } from 'lightweight-charts';
import {
  HyperliquidClearinghouseState,
  HyperliquidOrderResult,
  HyperliquidPosition,
  HyperliquidUserFill,
  HyperliquidClosedTrade,
} from './hyperliquid-types';
import { HttpTransport, InfoClient, ExchangeClient } from '@nktkas/hyperliquid';
import { privateKeyToAccount } from 'viem/accounts';

const transport = new HttpTransport({ timeout: 25000 });
const infoClient = new InfoClient({ transport });

let cachedMeta: any = null;
let metaCacheTimestamp = 0;
let cachedMarkets: Ticker24h[] = [];
let lastMarketsFetchTime = 0;

export async function getHyperliquidMeta(): Promise<any> {
  const now = Date.now();
  if (cachedMeta && now - metaCacheTimestamp < 60000) {
    return cachedMeta;
  }
  try {
    const meta = await infoClient.meta();
    cachedMeta = meta;
    metaCacheTimestamp = now;
    return meta;
  } catch (err) {
    console.warn('Hyperliquid meta fetch warning, using cache:', err);
    return cachedMeta || { universe: [] };
  }
}

export async function fetchHyperliquidMarkets(): Promise<Ticker24h[]> {
  const now = Date.now();
  // Return cached markets if fetched within last 12 seconds to prevent excessive RPC calls
  if (cachedMarkets.length > 0 && now - lastMarketsFetchTime < 12000) {
    return cachedMarkets;
  }

  try {
    const [meta, assetCtxs] = await infoClient.metaAndAssetCtxs();
    if (!meta || !meta.universe || !assetCtxs) return cachedMarkets;

    cachedMeta = meta;
    metaCacheTimestamp = now;

    const tickers: Ticker24h[] = [];

    meta.universe.forEach((u: any, idx: number) => {
      const ctx = assetCtxs[idx];
      if (!ctx) return;

      const coin = u.name;
      const symbol = `${coin}-PERP`;
      const markPrice = parseFloat(ctx.markPx || '0');
      const prevDayPrice = parseFloat(ctx.prevDayPx || '0');
      const lastPrice = parseFloat(ctx.midPx || ctx.markPx || '0');
      const priceChangePercent =
        prevDayPrice > 0 ? ((lastPrice - prevDayPrice) / prevDayPrice) * 100 : 0;
      const dayVolumeUSD = parseFloat(ctx.dayNtlVlm || '0');
      const fundingRate = parseFloat(ctx.funding || '0');
      // Hyperliquid funding is hourly; annualized = hourly * 24 * 365 * 100
      const fundingRateAnnualized = fundingRate * 24 * 365 * 100;
      const openInterest = parseFloat(ctx.openInterest || '0') * (markPrice || lastPrice);

      tickers.push({
        symbol,
        displayName: `${coin} Perpetual (Hyperliquid)`,
        lastPrice,
        priceChangePercent,
        highPrice: lastPrice * (1 + Math.abs(priceChangePercent) / 200),
        lowPrice: lastPrice * (1 - Math.abs(priceChangePercent) / 200),
        volume: parseFloat(ctx.dayBaseVlm || '0'),
        quoteVolume: dayVolumeUSD,
        category: 'HYPERLIQUID',
        isHyperliquid: true,
        coin,
        fundingRate,
        fundingRateAnnualized,
        openInterest,
        markPrice,
        oraclePrice: parseFloat(ctx.oraclePx || '0'),
        maxLeverage: u.maxLeverage || 50,
      });
    });

    if (tickers.length > 0) {
      cachedMarkets = tickers;
      lastMarketsFetchTime = now;
    }

    return cachedMarkets;
  } catch (err) {
    console.warn('Hyperliquid markets fetch timeout/error, using fallback cache:', err);
    return cachedMarkets;
  }
}

export async function fetchHyperliquidKlines(
  coinOrSymbol: string = 'BTC',
  interval: Timeframe = '15m',
  limit: number = 300
): Promise<Candle[]> {
  try {
    let coin = coinOrSymbol.replace(/(-PERP|USDT|\/USD)$/i, '').toUpperCase();
    if (coin === 'PEPE') coin = 'kPEPE';
    if (coin === 'BONK') coin = 'kBONK';
    if (coin === 'SHIB') coin = 'kSHIB';
    if (coin === 'FLOKI') coin = 'kFLOKI';

    // Map interval to Hyperliquid supported intervals: '1m', '5m', '15m', '1h', '4h', '1d'
    const hlIntervalMap: Record<Timeframe, '1m' | '5m' | '15m' | '1h' | '4h' | '1d'> = {
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
    const hlInterval = hlIntervalMap[interval] || '15m';

    const intervalMinutes: Record<string, number> = {
      '1m': 1,
      '5m': 5,
      '15m': 15,
      '1h': 60,
      '4h': 240,
      '1d': 1440,
    };
    const minutes = intervalMinutes[hlInterval] || 15;
    const now = Date.now();
    const durationMs = minutes * 60 * 1000 * Math.min(limit, 500);
    const startTime = now - durationMs;

    const data = await infoClient.candleSnapshot({
      coin,
      interval: hlInterval,
      startTime,
      endTime: now,
    });

    if (!Array.isArray(data)) return [];

    return data.map((item: any) => ({
      time: Math.floor(item.t / 1000) as UTCTimestamp,
      open: parseFloat(item.o),
      high: parseFloat(item.h),
      low: parseFloat(item.l),
      close: parseFloat(item.c),
      volume: parseFloat(item.v),
    }));
  } catch (err) {
    console.error(`Error fetching Hyperliquid candles for ${coinOrSymbol}:`, err);
    return [];
  }
}

export async function fetchHyperliquidClearinghouseState(
  userAddress: string
): Promise<HyperliquidClearinghouseState | null> {
  if (!userAddress || !userAddress.startsWith('0x')) return null;

  try {
    const raw: any = await infoClient.clearinghouseState({
      user: userAddress as `0x${string}`,
    });

    if (!raw) return null;

    const marginSummary = {
      accountValue: parseFloat(raw.marginSummary?.accountValue || '0'),
      totalNtlPos: parseFloat(raw.marginSummary?.totalNtlPos || '0'),
      totalRawUsd: parseFloat(raw.marginSummary?.totalRawUsd || '0'),
      totalMarginUsed: parseFloat(raw.marginSummary?.totalMarginUsed || '0'),
    };

    const crossMarginSummary = {
      accountValue: parseFloat(raw.crossMarginSummary?.accountValue || '0'),
      totalNtlPos: parseFloat(raw.crossMarginSummary?.totalNtlPos || '0'),
      totalRawUsd: parseFloat(raw.crossMarginSummary?.totalRawUsd || '0'),
      totalMarginUsed: parseFloat(raw.crossMarginSummary?.totalMarginUsed || '0'),
    };

    const positions: HyperliquidPosition[] = [];
    if (Array.isArray(raw.assetPositions)) {
      raw.assetPositions.forEach((item: any) => {
        const p = item.position;
        if (!p) return;
        const szi = parseFloat(p.szi || '0');
        if (szi === 0) return;

        positions.push({
          coin: p.coin,
          szi,
          entryPx: parseFloat(p.entryPx || '0'),
          positionValue: parseFloat(p.positionValue || '0'),
          unrealizedPnl: parseFloat(p.unrealizedPnl || '0'),
          returnOnEquity: parseFloat(p.returnOnEquity || '0') * 100,
          liquidationPx: p.liquidationPx ? parseFloat(p.liquidationPx) : null,
          leverage: {
            type: p.leverage?.type || 'cross',
            value: p.leverage?.value || 1,
          },
          marginUsed: parseFloat(p.marginUsed || '0'),
          maxLeverage: p.maxLeverage || 50,
        });
      });
    }

    return {
      marginSummary,
      crossMarginSummary,
      crossMaintenanceMarginUsed: parseFloat(raw.crossMaintenanceMarginUsed || '0'),
      withdrawable: parseFloat(raw.withdrawable || '0'),
      assetPositions: positions,
      time: raw.time || Date.now(),
    };
  } catch (err) {
    console.error('Error fetching Hyperliquid clearinghouse state:', err);
    return null;
  }
}

export async function fetchHyperliquidOpenOrders(userAddress: string): Promise<any[]> {
  if (!userAddress || !userAddress.startsWith('0x')) return [];
  try {
    return await infoClient.openOrders({ user: userAddress as `0x${string}` });
  } catch (err) {
    console.error('Error fetching Hyperliquid open orders:', err);
    return [];
  }
}

export async function executeHyperliquidOrder(params: {
  agentPrivateKey: string;
  coin: string;
  isBuy: boolean;
  sz: number;
  px?: number;
  orderType: 'MARKET' | 'LIMIT';
  slippagePercent?: number;
  reduceOnly?: boolean;
  cloid?: string;
}): Promise<HyperliquidOrderResult> {
  const {
    agentPrivateKey,
    coin,
    isBuy,
    sz,
    px,
    orderType,
    slippagePercent = 1.0,
    reduceOnly = false,
    cloid,
  } = params;

  const isDitto = agentPrivateKey.startsWith('ditto_sk_') || agentPrivateKey.startsWith('ditto_');

  if (!agentPrivateKey || (!isDitto && !agentPrivateKey.startsWith('0x'))) {
    return { status: 'err', error: 'Clave de Agente no válida (usa clave de Ditto ditto_sk_... o clave 0x de 64 hex)' };
  }

  if (isDitto) {
    try {
      const cleanCoin = coin.replace(/(-PERP|USDT|\/USD)$/i, '').toUpperCase();
      let estPrice = px || 0;
      if (!estPrice) {
        try {
          const meta = await getHyperliquidMeta();
          const assetIndex = meta.universe.findIndex((u: any) => u.name === cleanCoin);
          if (assetIndex !== -1) {
            const assetCtxs = await infoClient.metaAndAssetCtxs();
            estPrice = parseFloat(assetCtxs[1]?.[assetIndex]?.midPx || assetCtxs[1]?.[assetIndex]?.markPx || '100');
          }
        } catch (_) {}
        if (!estPrice) estPrice = 100;
      }
      const notionalUsd = Math.max(10, Math.round(sz * estPrice));

      const payload: any = {
        venue: 'hyperliquid',
        asset: cleanCoin,
        side: isBuy ? 'buy' : 'sell',
        sizeUsd: notionalUsd,
        leverage: 10,
        marginMode: 'cross',
        orderType: orderType === 'LIMIT' ? 'limit' : 'market',
        reduceOnly,
      };
      if (orderType === 'LIMIT' && px) {
        payload.limitPrice = px;
      }

      const res = await fetch('https://app.dittonetwork.io/execution/order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': agentPrivateKey.trim(),
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.ok || res.ok) {
        return { status: 'ok', response: data };
      } else {
        return { status: 'err', error: data.error || 'Error en ejecución de Ditto Network' };
      }
    } catch (e: any) {
      return { status: 'err', error: e.message || 'Error conectando a Ditto Network' };
    }
  }

  try {
    const meta = await getHyperliquidMeta();
    const cleanCoin = coin.replace(/(-PERP|USDT|\/USD)$/i, '').toUpperCase();
    const assetIndex = meta.universe.findIndex((u: any) => u.name === cleanCoin);

    if (assetIndex === -1) {
      return { status: 'err', error: `Activo ${cleanCoin} no encontrado en Hyperliquid` };
    }

    const universeItem = meta.universe[assetIndex];
    const szDecimals = typeof universeItem.szDecimals === 'number' ? universeItem.szDecimals : 4;
    const factor = Math.pow(10, szDecimals);
    const formattedSz = Math.round(sz * factor) / factor;
    const formattedSzStr = szDecimals === 0 ? Math.round(formattedSz).toString() : formattedSz.toFixed(szDecimals);

    if (formattedSz <= 0) {
      return { status: 'err', error: `Tamaño de orden demasiado pequeño para ${cleanCoin} (min decimals: ${szDecimals})` };
    }

    // Determine execution price
    const assetCtxs = await infoClient.metaAndAssetCtxs();
    const ctx = assetCtxs[1]?.[assetIndex];
    const midPx = parseFloat(ctx?.midPx || ctx?.markPx || '0');

    let targetPrice = px;
    if (orderType === 'MARKET') {
      if (!midPx) {
        return { status: 'err', error: `No se pudo obtener el precio actual para ${cleanCoin}` };
      }
      // Apply slippage for market execution
      targetPrice = isBuy
        ? midPx * (1 + slippagePercent / 100)
        : midPx * (1 - slippagePercent / 100);
    } else {
      // LIMIT Post-Only Execution (Garantiza 0.010% Maker Fee)
      // Ajusta el precio límite para que no cruce el libro
      const basePx = targetPrice || midPx;
      if (midPx > 0) {
        targetPrice = isBuy
          ? Math.min(basePx, midPx * 0.9999)
          : Math.max(basePx, midPx * 1.0001);
      } else {
        targetPrice = basePx;
      }
    }

    // Format price according to Hyperliquid rules (max 5 significant figures or standard precision)
    const formattedPriceStr = targetPrice > 1000
      ? targetPrice.toFixed(1)
      : targetPrice > 10
      ? targetPrice.toFixed(2)
      : targetPrice > 0.1
      ? targetPrice.toFixed(4)
      : targetPrice.toFixed(6);

    const wallet = privateKeyToAccount(agentPrivateKey as `0x${string}`);
    const exchangeClient = new ExchangeClient({ transport, wallet });

    const orderPayload = {
      orders: [
        {
          a: assetIndex,
          b: isBuy,
          p: formattedPriceStr,
          s: formattedSzStr,
          r: reduceOnly,
          t: {
            limit: {
              tif: orderType === 'MARKET' ? ('Ioc' as const) : ('Alo' as const),
            },
          },
          ...(cloid ? { c: cloid } : {}),
        },
      ],
      grouping: 'na' as const,
    };

    const res: any = await exchangeClient.order(orderPayload);

    if (res?.status === 'ok') {
      return { status: 'ok', response: res.response };
    } else {
      return {
        status: 'err',
        error: res?.response?.data?.statuses?.[0]?.error || JSON.stringify(res),
      };
    }
  } catch (err: any) {
    console.error('Error executing Hyperliquid order:', err);
    return {
      status: 'err',
      error: err?.message || 'Error desconocido al transmitir orden a Hyperliquid',
    };
  }
}

export async function closeHyperliquidPosition(params: {
  agentPrivateKey: string;
  userAddress: string;
  coin: string;
}): Promise<HyperliquidOrderResult> {
  const { agentPrivateKey, userAddress, coin } = params;
  const isDitto = agentPrivateKey.startsWith('ditto_sk_') || agentPrivateKey.startsWith('ditto_');
  if (isDitto) {
    try {
      const cleanCoin = coin.replace(/(-PERP|USDT|\/USD)$/i, '').toUpperCase();
      const res = await fetch('https://app.dittonetwork.io/execution/agent/close', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': agentPrivateKey.trim(),
        },
        body: JSON.stringify({
          asset: cleanCoin,
          fraction: 1.0,
        }),
      });
      const data = await res.json();
      if (data.ok || res.ok) {
        return { status: 'ok', response: data };
      } else {
        return { status: 'err', error: data.error || 'Error al cerrar en Ditto' };
      }
    } catch (e: any) {
      return { status: 'err', error: e.message || 'Error cerrando en Ditto' };
    }
  }

  try {
    const cleanCoin = coin.replace(/(-PERP|USDT|\/USD)$/i, '').toUpperCase();
    const state = await fetchHyperliquidClearinghouseState(userAddress);
    if (!state) {
      return { status: 'err', error: 'No se pudo cargar el estado de la cuenta en Hyperliquid' };
    }

    const pos = state.assetPositions.find((p) => p.coin === cleanCoin);
    if (!pos || pos.szi === 0) {
      return { status: 'err', error: `No hay posición abierta en ${cleanCoin}` };
    }

    const isBuy = pos.szi < 0; // If short, we buy to close; if long, we sell to close
    const size = Math.abs(pos.szi);

    return await executeHyperliquidOrder({
      agentPrivateKey,
      coin: cleanCoin,
      isBuy,
      sz: size,
      orderType: 'MARKET',
      slippagePercent: 1.5,
      reduceOnly: true,
    });
  } catch (err: any) {
    return { status: 'err', error: err?.message || 'Error al cerrar posición' };
  }
}

export async function updateHyperliquidLeverage(params: {
  agentPrivateKey: string;
  coin: string;
  leverage: number;
  isCross: boolean;
}): Promise<any> {
  const { agentPrivateKey, coin, leverage, isCross } = params;
  try {
    const meta = await getHyperliquidMeta();
    const cleanCoin = coin.replace(/(-PERP|USDT|\/USD)$/i, '').toUpperCase();
    const assetIndex = meta.universe.findIndex((u: any) => u.name === cleanCoin);
    if (assetIndex === -1) throw new Error(`Activo ${cleanCoin} no encontrado`);

    const wallet = privateKeyToAccount(agentPrivateKey as `0x${string}`);
    const exchangeClient = new ExchangeClient({ transport, wallet });

    return await exchangeClient.updateLeverage({
      asset: assetIndex,
      isCross,
      leverage,
    });
  } catch (err) {
    console.error('Error updating leverage on Hyperliquid:', err);
    throw err;
  }
}

/**
 * Fetch on-chain fills history directly from Hyperliquid Info API for a wallet
 */
export async function fetchHyperliquidUserFills(
  userAddress: string
): Promise<HyperliquidUserFill[]> {
  if (!userAddress || !userAddress.startsWith('0x')) return [];
  try {
    const raw: any = await infoClient.userFills({
      user: userAddress as `0x${string}`,
    });
    return Array.isArray(raw) ? raw : [];
  } catch (err) {
    console.warn('Error fetching Hyperliquid userFills:', err);
    return [];
  }
}

/**
 * Parse on-chain fills into clean closed trades list
 */
export function parseClosedTradesFromFills(
  fills: HyperliquidUserFill[]
): HyperliquidClosedTrade[] {
  if (!Array.isArray(fills)) return [];

  // Filter for fills that closed a position (dir contains "Close" or non-zero closedPnl)
  const closedFills = fills.filter(
    (f) =>
      (f.dir && f.dir.toLowerCase().includes('close')) ||
      (f.closedPnl && parseFloat(f.closedPnl) !== 0)
  );

  return closedFills.map((f, idx) => {
    const px = parseFloat(f.px || '0');
    const sz = parseFloat(f.sz || '0');
    const notionalUSD = px * sz;
    const closedPnlUSD = parseFloat(f.closedPnl || '0');
    const feeUSD = parseFloat(f.fee || '0');
    const side: 'BUY' | 'SELL' = f.side === 'B' ? 'BUY' : 'SELL';
    const isWin = closedPnlUSD > 0;
    const pnlPercent = notionalUSD > 0 ? (closedPnlUSD / notionalUSD) * 100 : 0;

    let exitReason = 'Cierre a Mercado';
    if (f.dir) {
      if (f.dir.toLowerCase().includes('short')) {
        exitReason = 'Cierre de Corto (Short)';
      } else if (f.dir.toLowerCase().includes('long')) {
        exitReason = 'Cierre de Largo (Long)';
      }
    }

    return {
      id: `hl-fill-${f.tid || f.oid || idx}-${f.time}`,
      coin: f.coin,
      symbol: `${f.coin}-PERP`,
      side,
      dir: f.dir || (side === 'BUY' ? 'Close Short' : 'Close Long'),
      exitPrice: px,
      size: sz,
      notionalUSD,
      closedPnlUSD,
      pnlPercent,
      feeUSD,
      time: f.time,
      hash: f.hash || '',
      orderId: f.oid || 0,
      exitReason,
      isWin,
      executionVenue: 'HYPERLIQUID',
    };
  });
}

/**
 * Fetch closed trades tracked by the server-side 24/7 daemon bot
 */
export async function fetchBotClosedTrades(): Promise<{
  closedTrades: any[];
  stats: any;
}> {
  try {
    const res = await fetch('/api/bot/closed-trades');
    if (!res.ok) {
      return { closedTrades: [], stats: null };
    }
    const data = await res.json();
    return {
      closedTrades: Array.isArray(data.closedTrades) ? data.closedTrades : [],
      stats: data.stats || null,
    };
  } catch (e) {
    return { closedTrades: [], stats: null };
  }
}

