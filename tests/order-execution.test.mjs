import test from 'node:test';
import assert from 'node:assert';
import { formatHyperliquidPrice, formatHyperliquidSize } from '../lib/order-execution.mjs';

test('formatHyperliquidPrice: 5 cifras significativas y límite de decimales', () => {
  // BTC (szDecimals = 5 -> maxDecimals = 1)
  // 65432.123 -> 5 cifras: 65432
  assert.strictEqual(formatHyperliquidPrice(65432.123, 5), '65432');
  // 81234.56 -> 5 cifras: 81235
  assert.strictEqual(formatHyperliquidPrice(81234.56, 5), '81235');

  // ETH (szDecimals = 4 -> maxDecimals = 2)
  // 2456.789 -> 5 cifras: 2456.8
  assert.strictEqual(formatHyperliquidPrice(2456.789, 4), '2456.8');
  // 3125.4 -> 5 cifras: 3125.4
  assert.strictEqual(formatHyperliquidPrice(3125.4, 4), '3125.4');

  // SOL (szDecimals = 2 -> maxDecimals = 4)
  // 152.34567 -> 5 cifras: 152.35
  assert.strictEqual(formatHyperliquidPrice(152.34567, 2), '152.35');

  // Token de bajo precio: 0.0123456 (szDecimals = 0 -> maxDecimals = 6)
  // 5 cifras significativas: 0.012346
  assert.strictEqual(formatHyperliquidPrice(0.0123456, 0), '0.012346');

  // Cero / inválido
  assert.strictEqual(formatHyperliquidPrice(0, 4), '0');
  assert.strictEqual(formatHyperliquidPrice(null, 4), '0');
});

test('formatHyperliquidSize: redondeo estricto hacia abajo', () => {
  // szDecimals = 4
  assert.strictEqual(formatHyperliquidSize(0.12349, 4), 0.1234);
  assert.strictEqual(formatHyperliquidSize(1.99999, 4), 1.9999);

  // szDecimals = 2
  assert.strictEqual(formatHyperliquidSize(5.559, 2), 5.55);

  // szDecimals = 0
  assert.strictEqual(formatHyperliquidSize(10.95, 0), 10);

  // Cero / inválido
  assert.strictEqual(formatHyperliquidSize(0, 4), 0);
  assert.strictEqual(formatHyperliquidSize(-5, 4), 0);
});

test('executeDittoOrder: payload usa market por defecto y limit si DITTO_LIMIT_ORDERS=true', async () => {
  const origFetch = globalThis.fetch;
  const origEnv = process.env.DITTO_LIMIT_ORDERS;
  const calls = [];

  globalThis.fetch = async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body), headers: opts.headers });
    return { ok: true, json: async () => ({ ok: true, txHash: '0xmock' }) };
  };

  try {
    delete process.env.DITTO_LIMIT_ORDERS;
    const { executeDittoOrder } = await import('../lib/order-execution.mjs');

    // 1. Por defecto: market
    await executeDittoOrder({
      apiKey: 'ditto_sk_test',
      coin: 'BTC-PERP',
      isBuy: true,
      sizeUsd: 100,
      leverage: 1,
      stopLoss: 60000,
      takeProfit1: 65000,
      limitPrice: 62000,
    });

    assert.strictEqual(calls[0].body.orderType, 'market');
    assert.strictEqual(calls[0].body.asset, 'BTC');
    assert.strictEqual(calls[0].body.marginMode, 'cross');
    assert.strictEqual(calls[0].body.limitPrice, undefined);

    // 2. Con DITTO_LIMIT_ORDERS=true: limit
    process.env.DITTO_LIMIT_ORDERS = 'true';
    await executeDittoOrder({
      apiKey: 'ditto_sk_test',
      coin: 'ETH',
      isBuy: false,
      sizeUsd: 50,
      leverage: 1,
      stopLoss: 3500,
      takeProfit1: 3000,
      limitPrice: 3200,
    });

    assert.strictEqual(calls[1].body.orderType, 'limit');
    assert.strictEqual(calls[1].body.limitPrice, 3200);
    assert.strictEqual(calls[1].body.timeInForce, 'Alo');
  } finally {
    globalThis.fetch = origFetch;
    if (origEnv !== undefined) process.env.DITTO_LIMIT_ORDERS = origEnv;
    else delete process.env.DITTO_LIMIT_ORDERS;
  }
});
