import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { botDaemon } from '../server-bot-daemon.mjs';

test('daemon: closedCandlesOnly descarta la última vela en formación', () => {
  const candles = [
    { t: 1, c: 100 },
    { t: 2, c: 105 },
    { t: 3, c: 110 },
  ];
  const closed = botDaemon.closedCandlesOnly(candles);
  assert.strictEqual(closed.length, 2);
  assert.strictEqual(closed[1].c, 105);
  assert.strictEqual(botDaemon.closedCandlesOnly([]).length, 0);
  assert.strictEqual(botDaemon.closedCandlesOnly(null).length, 0);
});

test('daemon: getMsUntilNextCandleClose calcula milisegundos hasta cierre más 3s', () => {
  const ms1h = botDaemon.getMsUntilNextCandleClose('1h');
  assert.ok(ms1h > 3000, 'debe ser mayor a 3000ms');
  assert.ok(ms1h <= 60 * 60 * 1000 + 3000, 'no debe exceder 1h + 3s');

  const ms15m = botDaemon.getMsUntilNextCandleClose('15m');
  assert.ok(ms15m > 3000);
  assert.ok(ms15m <= 15 * 60 * 1000 + 3000);

  const ms5m = botDaemon.getMsUntilNextCandleClose('5m');
  assert.ok(ms5m > 3000);
  assert.ok(ms5m <= 5 * 60 * 1000 + 3000);
});

test('daemon: getStatus devuelve valores institucionales estrictos', () => {
  const status = botDaemon.getStatus();
  assert.strictEqual(status.leverage, 1, 'leverage siempre 1');
  assert.strictEqual(status.maxConcurrentTrades, 1, 'maxConcurrentTrades siempre 1');
  assert.deepStrictEqual(status.allowedSymbols, ['BTC', 'ETH']);
  assert.strictEqual(status.instantProfitTake, false, 'instantProfitTake false por defecto');
  assert.strictEqual(status.isAllMarkets, undefined, 'isAllMarkets eliminado');
});

test('daemon: saveConfig nunca guarda agentPrivateKey en bot-config.json', () => {
  const cfgPath = path.join(process.cwd(), 'bot-config.json');
  botDaemon.saveConfig({ agentPrivateKey: '0x9999999999999999999999999999999999999999999999999999999999999999', leverage: 10 });
  assert.strictEqual(botDaemon.config.leverage, 1, 'leverage forzado a 1');
  if (fs.existsSync(cfgPath)) {
    const content = fs.readFileSync(cfgPath, 'utf8');
    assert.ok(!content.includes('99999999999999999999'), 'clave no debe escribirse a disco');
  }
});
