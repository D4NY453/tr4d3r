import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { clampRiskConfig, positionSize, RiskGuard } from '../lib/risk-manager.mjs';

test('clampRiskConfig: fuerza límites institucionales estrictos', () => {
  const input = {
    leverage: 20,
    maxConcurrentTrades: 10,
    riskPerTradePct: 0.05,
    dailyLossCapPct: 0.10,
    maxConsecutiveLosses: 10,
    timeframe: '1m',
    allowedSymbols: ['DOGE', 'BTC', 'PEPE', 'ETH', 'SOL'],
    atrStopMult: -1,
  };

  const clamped = clampRiskConfig(input);

  assert.strictEqual(clamped.leverage, 1, 'leverage debe ser 1');
  assert.strictEqual(clamped.maxConcurrentTrades, 1, 'maxConcurrentTrades debe ser 1');
  assert.strictEqual(clamped.riskPerTradePct, 0.01, 'riskPerTradePct debe topar en 0.01');
  assert.strictEqual(clamped.dailyLossCapPct, 0.03, 'dailyLossCapPct debe topar en 0.03');
  assert.strictEqual(clamped.maxConsecutiveLosses, 3, 'maxConsecutiveLosses debe topar en 3');
  assert.strictEqual(clamped.timeframe, '1h', 'timeframe inválido debe caer a 1h');
  assert.deepStrictEqual(clamped.allowedSymbols.sort(), ['BTC', 'ETH'], 'solo se permiten BTC y ETH');
  assert.strictEqual(clamped.atrStopMult, 1.5, 'atrStopMult default 1.5');
  assert.strictEqual(clamped.atrTargetMult, 3.0, 'atrTargetMult default 3.0');
  assert.strictEqual(clamped.instantProfitTake, false, 'instantProfitTake debe ser false');
  assert.strictEqual(clamped.usePatternSignals, false, 'usePatternSignals debe ser false');
});

test('positionSize: cálculo de tamaño por riesgo y tope 1x equity', () => {
  const equity = 1000;
  const entry = 100;
  const stop = 95; // diff = 5
  // riskAmount = 1000 * 0.005 = 5 USD -> rawSize = 5 / 5 = 1.0 -> notional = 100 USD (< 1000)
  const size = positionSize(equity, entry, stop, 0.005);
  assert.strictEqual(size, 1.0);

  // Caso tope nocional 1x equity: si el stop está muy cerca (ej. diff = 0.1), rawSize sería 50 (nocional 5000)
  // Pero con tope nocional maxNotional = 1000 -> maxSize = 1000 / 100 = 10
  const tightStop = 99.9;
  const cappedSize = positionSize(equity, entry, tightStop, 0.005);
  assert.strictEqual(cappedSize, 10);

  // Si nocional < $10 USD, debe devolver 0 (operación omitida)
  const smallEquity = 50;
  const tinySize = positionSize(smallEquity, 100, 50, 0.005);
  // risk = 0.25 USD, diff = 50 -> size = 0.005 -> notional = 0.5 USD (< 10) -> 0
  assert.strictEqual(tinySize, 0);

  // Parámetros inválidos
  assert.strictEqual(positionSize(0, 100, 95), 0);
  assert.strictEqual(positionSize(1000, 0, 95), 0);
  assert.strictEqual(positionSize(1000, 100, 100), 0);
});

test('RiskGuard: control de pérdidas consecutivas y límite diario', () => {
  const tmpFile = path.join(os.tmpdir(), `test-risk-guard-${Date.now()}.json`);
  try {
    const rg = new RiskGuard(tmpFile);
    const initialEquity = 1000;

    // Equity inválido bloquea
    assert.strictEqual(rg.canTrade(0).allowed, false);
    assert.strictEqual(rg.canTrade(null).allowed, false);

    // Con equity normal, permite operar
    assert.strictEqual(rg.canTrade(initialEquity).allowed, true);

    // Registrar 2 pérdidas
    rg.recordTrade(-10);
    rg.recordTrade(-10);
    assert.strictEqual(rg.canTrade(initialEquity - 20).allowed, true);

    // 3ra pérdida consecutiva bloquea
    rg.recordTrade(-10);
    const blocked3Losses = rg.canTrade(initialEquity - 30);
    assert.strictEqual(blocked3Losses.allowed, false);
    assert.match(blocked3Losses.reason, /3 pérdidas consecutivas/);

    // Un trade ganador resetea las pérdidas consecutivas
    rg.recordTrade(5);
    assert.strictEqual(rg.state.consecutiveLosses, 0);

    // Límite de pérdida diaria del 3% (30 USD de 1000)
    rg.recordTrade(-35); // Realized PnL = -10 -10 -10 + 5 - 35 = -60 USD (< -30 USD)
    const blockedDaily = rg.canTrade(initialEquity - 60);
    assert.strictEqual(blockedDaily.allowed, false);
    assert.match(blockedDaily.reason, /pérdida diaria/);

    // Caída de capital intra-día >= 3% aunque no esté realizada
    const rg2 = new RiskGuard(path.join(os.tmpdir(), `test-risk-guard-dd-${Date.now()}.json`));
    rg2.canTrade(1000); // fija dayStartEquity = 1000
    const blockedDrawdown = rg2.canTrade(960); // caída de 40 USD (4%)
    assert.strictEqual(blockedDrawdown.allowed, false);
    assert.match(blockedDrawdown.reason, /caída de capital/);

    // Kill switch -8%
    const blockedKill = rg2.canTrade(910); // caída de 9%
    assert.strictEqual(blockedKill.allowed, false);
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
});

test('getDataDir: respeta variable de entorno BOT_DATA_DIR', async () => {
  const orig = process.env.BOT_DATA_DIR;
  const custom = path.join(os.tmpdir(), `bot-data-${Date.now()}`);
  try {
    process.env.BOT_DATA_DIR = custom;
    const m = await import('../lib/risk-manager.mjs');
    assert.strictEqual(m.getDataDir(), custom);
    assert.ok(fs.existsSync(custom));
  } finally {
    if (orig !== undefined) process.env.BOT_DATA_DIR = orig;
    else delete process.env.BOT_DATA_DIR;
    if (fs.existsSync(custom)) fs.rmSync(custom, { recursive: true, force: true });
  }
});

test('RiskGuard: resetea métricas al cambiar de día UTC', () => {
  const tmpFile = path.join(os.tmpdir(), `test-risk-guard-date-${Date.now()}.json`);
  try {
    const rg = new RiskGuard(tmpFile);
    rg.canTrade(1000);
    rg.recordTrade(-20);
    assert.strictEqual(rg.state.consecutiveLosses, 1);
    assert.strictEqual(rg.state.dailyRealizedPnl, -20);

    // Simular que el estado era de ayer
    rg.state.currentDate = '2020-01-01';
    rg.save();

    // Al llamar a checkDateReset con el día de hoy, debe reiniciar a 0
    rg.checkDateReset(980);
    assert.strictEqual(rg.state.consecutiveLosses, 0);
    assert.strictEqual(rg.state.dailyRealizedPnl, 0);
    assert.strictEqual(rg.state.dayStartEquity, 980);
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
});
