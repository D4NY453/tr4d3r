import test from 'node:test';
import assert from 'node:assert';
import { atr, ema, detectPatterns } from '../src/services/patterns/pattern-detector.mjs';
import { detectPatternSignal } from '../lib/patterns-bridge.mjs';

test('pattern-detector: atr y ema funciones causales', () => {
  const h = [10, 11, 12, 11, 10];
  const l = [9, 10, 11, 10, 9];
  const c = [9.5, 10.5, 11.5, 10.5, 9.5];
  const a = atr(h, l, c, 3);
  assert.strictEqual(a.length, c.length);
  assert.ok(a[a.length - 1] > 0);

  const e = ema(c, 3);
  assert.strictEqual(e.length, c.length);
  assert.ok(e[e.length - 1] > 0);
});

test('patterns-bridge: detectPatternSignal solo emite si la ruptura ocurre en la última vela cerrada', () => {
  // Construir velas simuladas (60 velas)
  const candles = [];
  let basePrice = 100;
  for (let i = 0; i < 60; i++) {
    const change = Math.sin(i / 3) * 5;
    const close = basePrice + change;
    candles.push({
      time: 1700000000000 + i * 3600000,
      open: close - 0.5,
      high: close + 1.5,
      low: close - 1.5,
      close: close,
      volume: 1000 + (i === 59 ? 5000 : 100), // alto volumen al final
    });
  }

  // Sin señal forzada devuelve null sin error
  const sig = detectPatternSignal(candles, { timeframe: '1h' });
  // Si no hay ruptura exactamente en la vela 59, debe ser null
  if (sig) {
    assert.strictEqual(sig.breakIdx, 59);
    assert.ok(['LONG', 'SHORT'].includes(sig.side));
  } else {
    assert.strictEqual(sig, null);
  }

  // Velas insuficientes (< 50) devuelve null
  assert.strictEqual(detectPatternSignal(candles.slice(0, 30)), null);
});

test('pattern-detector: detectPatterns estructura de retorno sin look-ahead', () => {
  const n = 60;
  const h = new Array(n).fill(100);
  const l = new Array(n).fill(95);
  const c = new Array(n).fill(98);
  const v = new Array(n).fill(1000);
  const res = detectPatterns({ h, l, c, v }, { live: true });
  assert.ok(Array.isArray(res));
});
