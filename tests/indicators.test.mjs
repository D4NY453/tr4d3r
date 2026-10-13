import test from 'node:test';
import assert from 'node:assert';
import {
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateBollingerBands,
  calculateSuperTrend,
} from '../src/services/indicators/calculations.ts';

test('Indicators Engine - Test Calculations', async (t) => {
  // Generate sample candles
  const sampleCandles = [];
  let basePrice = 100;
  for (let i = 0; i < 100; i++) {
    const time = 1700000000 + i * 900;
    const change = Math.sin(i / 5) * 5;
    const close = basePrice + change;
    sampleCandles.push({
      time,
      open: close - 1,
      high: close + 2,
      low: close - 2,
      close: close,
      volume: 1000 + i * 10,
    });
  }

  await t.test('EMA calculation returns valid points', () => {
    const ema20 = calculateEMA(sampleCandles, 20);
    assert.strictEqual(ema20.length, sampleCandles.length - 20 + 1);
    assert(ema20[0].value > 0);
  });

  await t.test('RSI calculation returns points in 0-100 range', () => {
    const rsi14 = calculateRSI(sampleCandles, 14);
    assert(rsi14.length > 0);
    rsi14.forEach((pt) => {
      assert(pt.value >= 0 && pt.value <= 100, `RSI out of bounds: ${pt.value}`);
    });
  });

  await t.test('MACD calculation returns macd, signal and histogram', () => {
    const macd = calculateMACD(sampleCandles, 12, 26, 9);
    assert(macd.length > 0);
    assert(typeof macd[0].macd === 'number');
    assert(typeof macd[0].signal === 'number');
    assert(typeof macd[0].histogram === 'number');
  });

  await t.test('Bollinger Bands returns upper, middle, lower', () => {
    const bb = calculateBollingerBands(sampleCandles, 20, 2);
    assert(bb.length > 0);
    bb.forEach((pt) => {
      assert(pt.upper >= pt.middle && pt.middle >= pt.lower);
    });
  });

  await t.test('SuperTrend returns trend UP or DOWN', () => {
    const st = calculateSuperTrend(sampleCandles, 10, 3);
    assert(st.length > 0);
    st.forEach((pt) => {
      assert(pt.trend === 'UP' || pt.trend === 'DOWN');
    });
  });
});
