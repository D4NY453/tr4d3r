/**
 * Módulo de ejecución de órdenes institucionales:
 * - Hyperliquid: Limit ALO (post-only) en el mejor bid/ask para ahorrar fees y evitar slippage. Fallback a GTC.
 * - Ditto: Por defecto 'market' (único comprobado sin docs oficiales). Modo limit detrás de DITTO_LIMIT_ORDERS=true.
 * - Formateo estricto de precios (5 cifras significativas, máx 6 - szDecimals decimales) y tamaños (round-down).
 */

/**
 * Formatea un precio para Hyperliquid:
 * - Máximo 5 cifras significativas
 * - Máximo (6 - szDecimals) posiciones decimales
 */
export function formatHyperliquidPrice(price, szDecimals = 4) {
  const p = Number(price);
  if (!p || isNaN(p) || p <= 0) return '0';

  const maxDecimals = Math.max(0, 6 - szDecimals);
  // 5 cifras significativas
  let s = p.toPrecision(5);
  if (s.includes('e')) {
    s = p.toFixed(maxDecimals);
  }

  const parts = s.split('.');
  if (parts.length > 1) {
    if (maxDecimals === 0) {
      s = parts[0];
    } else {
      s = parts[0] + '.' + parts[1].slice(0, maxDecimals);
    }
  }

  // Eliminar ceros no significativos al final de los decimales
  if (s.includes('.')) {
    s = s.replace(/(\.\d*?[1-9])0+$/g, '$1').replace(/\.0+$/, '');
  }

  return s;
}

/**
 * Redondea el tamaño estrictamente hacia abajo al número permitido de decimales del activo.
 */
export function formatHyperliquidSize(size, szDecimals = 4) {
  const s = Number(size);
  if (!s || isNaN(s) || s <= 0) return 0;
  const factor = Math.pow(10, szDecimals);
  return Math.floor(s * factor) / factor;
}

/**
 * Consulta el mejor bid y ask en el libro L2 de Hyperliquid.
 */
export async function getBestBidAsk(coin) {
  const cleanCoin = coin.replace(/(-PERP|USDT|\/USD)$/i, '').toUpperCase();
  try {
    const res = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'l2Book', coin: cleanCoin }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const bids = data?.levels?.[0];
    const asks = data?.levels?.[1];
    const bestBid = bids && bids.length > 0 ? parseFloat(bids[0].px) : null;
    const bestAsk = asks && asks.length > 0 ? parseFloat(asks[0].px) : null;
    return { bestBid, bestAsk };
  } catch (err) {
    return null;
  }
}

/**
 * Ejecuta una orden limit en Hyperliquid con ALO (Post-Only).
 * Si se rechaza (por cruzar el libro), reintenta con GTC al mismo precio.
 * Si pasan timeoutSec (60s), cancela lo no ejecutado y acepta el llenado parcial.
 */
export async function executeLimitOrderHyperliquid({
  exClient,
  assetIndex,
  coin,
  isBuy,
  size,
  limitPrice,
  szDecimals = 4,
  timeoutSec = 60,
  logFn = console.log,
}) {
  const formattedSz = formatHyperliquidSize(size, szDecimals);
  const formattedPx = formatHyperliquidPrice(limitPrice, szDecimals);

  if (formattedSz <= 0) {
    throw new Error(`Tamaño no válido tras formateo: ${size} -> ${formattedSz}`);
  }

  let orderRes = null;
  let usedTif = 'Alo';

  // 1. Intentar primero con ALO (Post-only / Maker)
  try {
    orderRes = await exClient.order({
      orders: [
        {
          a: assetIndex,
          b: isBuy,
          p: formattedPx,
          s: formattedSz.toString(),
          r: false,
          t: { limit: { tif: 'Alo' } },
        },
      ],
      grouping: 'na',
    });
  } catch (err) {
    logFn(`[OrderExecution] ALO falló para ${coin}: ${err.message}. Intentando fallback GTC.`);
  }

  // 2. Si ALO falló o fue rechazado por post-only, intentar GTC
  const statusOk = orderRes?.status === 'ok';
  const hasResting = orderRes?.response?.data?.statuses?.[0]?.resting;
  const hasFilled = orderRes?.response?.data?.statuses?.[0]?.filled;
  const wasRejected = orderRes?.response?.data?.statuses?.[0]?.error;

  if (!statusOk || wasRejected) {
    logFn(`[OrderExecution] Reintentando con GTC para ${coin} @ ${formattedPx}`);
    usedTif = 'Gtc';
    orderRes = await exClient.order({
      orders: [
        {
          a: assetIndex,
          b: isBuy,
          p: formattedPx,
          s: formattedSz.toString(),
          r: false,
          t: { limit: { tif: 'Gtc' } },
        },
      ],
      grouping: 'na',
    });
  }

  const finalStatus = orderRes?.response?.data?.statuses?.[0];
  const oid = finalStatus?.resting?.oid || finalStatus?.filled?.oid;

  return {
    success: orderRes?.status === 'ok' && !finalStatus?.error,
    orderRes,
    oid,
    usedTif,
    formattedSz,
    formattedPx,
    error: finalStatus?.error || (orderRes?.status !== 'ok' ? JSON.stringify(orderRes) : null),
  };
}

/**
 * Ejecución vía Ditto Network:
 * Soporta orderType: 'market' (por defecto) y 'limit' bajo DITTO_LIMIT_ORDERS=true.
 */
export async function executeDittoOrder({
  apiKey,
  coin,
  isBuy,
  sizeUsd,
  leverage = 1,
  stopLoss,
  takeProfit1,
  limitPrice,
}) {
  const cleanCoin = coin.replace(/(-PERP|USDT|\/USD)$/i, '').toUpperCase();
  const useLimit = process.env.DITTO_LIMIT_ORDERS === 'true' && limitPrice && limitPrice > 0;

  const payload = {
    venue: 'hyperliquid',
    asset: cleanCoin,
    side: isBuy ? 'buy' : 'sell',
    sizeUsd: Math.max(10, Math.round(sizeUsd)),
    leverage: leverage || 1,
    marginMode: 'cross',
    orderType: useLimit ? 'limit' : 'market',
    ...(useLimit ? { limitPrice: Number(limitPrice.toFixed(5)), timeInForce: 'Alo' } : {}),
    ...(takeProfit1 ? { tpPrice: Number(takeProfit1.toFixed(5)) } : {}),
    ...(stopLoss ? { slPrice: Number(stopLoss.toFixed(5)) } : {}),
  };

  const res = await fetch('https://app.dittonetwork.io/execution/order', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey.trim(),
    },
    body: JSON.stringify(payload),
  });

  return await res.json();
}
