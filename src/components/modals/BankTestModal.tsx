'use client';

import React, { useMemo } from 'react';
import { useTradingStore } from '@/store/useTradingStore';
import { calculateBankTestSummary } from '@/services/bot/trading-bot-engine';
import {
  Layers,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  X,
  Target,
  Shield,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Award,
  Clock,
  Sparkles,
} from 'lucide-react';

export const BankTestModal: React.FC = () => {
  const {
    isBankTestModalOpen,
    setBankTestModalOpen,
    subFunds,
    resetSubFunds,
    currentSymbol,
    candles,
  } = useTradingStore();

  const currentLivePrice = useMemo(() => {
    if (candles.length === 0) return 0;
    return candles[candles.length - 1].close;
  }, [candles]);

  const summary = useMemo(() => {
    return calculateBankTestSummary(subFunds || []);
  }, [subFunds]);

  if (!isBankTestModalOpen) return null;

  const isProfitPositive = summary.totalPurePnL >= 0;

  const activeRegime = useMemo(() => {
    const fundWithRegime = subFunds.find((f) => f.lastMarketRegime);
    return fundWithRegime?.lastMarketRegime;
  }, [subFunds]);

  const feeSavings = useMemo(() => {
    const diff = (summary.makerNetPnL ?? 0) - (summary.takerNetPnL ?? 0);
    return Math.max(0, diff);
  }, [summary]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xs p-4 select-none">
      <div className="w-full max-w-6xl bg-[#131722] border border-[#2a2e39] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-[#191d26] border-b border-[#2a2e39] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-[#f6c344]/15 border border-[#f6c344]/30 flex items-center justify-center text-[#f6c344]">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-white font-bold text-base">Banco de Pruebas $100,000 USD</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30">
                  10 Sub-Fondos de $10,000
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#2962ff]/15 text-[#2962ff] border border-[#2962ff]/30">
                  Filtro Anti-Chop Grok + Post-Only 0.01%
                </span>
              </div>
              <p className="text-xs text-[#787b86]">
                Micro-temporalidades (1s, 3s, 5s) con confirmación MTF rápida (15s y 1m) en tiempo real sobre{' '}
                <b className="text-white">{currentSymbol}</b> (${currentLivePrice.toLocaleString()}).
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={resetSubFunds}
              className="px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-300 hover:text-white text-xs font-medium flex items-center space-x-1.5 transition-all cursor-pointer"
              title="Reiniciar los 10 Sub-Fondos a $10,000 y resetear estadísticas"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reiniciar Banco ($100k)</span>
            </button>

            <button
              onClick={() => setBankTestModalOpen(false)}
              className="p-1.5 rounded-lg hover:bg-[#2a2e39] text-[#787b86] hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Global Summary KPI Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 px-6 py-3.5 bg-[#0f1218] border-b border-[#2a2e39] text-xs">
          <div className="bg-[#191d26] p-3 rounded-xl border border-[#2a2e39]">
            <span className="text-[#787b86] text-[11px] block">Capital Inicial Total</span>
            <span className="text-white font-mono font-bold text-sm">
              ${summary.totalInitialCapital.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className="bg-[#191d26] p-3 rounded-xl border border-[#2a2e39]">
            <span className="text-[#787b86] text-[11px] block">Capital Actual Total</span>
            <span className="text-[#90caf9] font-mono font-bold text-sm">
              ${summary.totalCurrentCapital.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className="bg-[#191d26] p-3 rounded-xl border border-[#2a2e39]">
            <span className="text-[#787b86] text-[11px] block">PnL Puro Total</span>
            <span
              className={`font-mono font-bold text-sm flex items-center space-x-1 ${
                isProfitPositive ? 'text-[#10b981]' : 'text-[#f43f5e]'
              }`}
            >
              {isProfitPositive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
              <span>
                {isProfitPositive ? '+' : ''}$
                {summary.totalPurePnL.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </span>
          </div>

          <div className="bg-[#191d26] p-3 rounded-xl border border-[#2a2e39]">
            <span className="text-[#787b86] text-[11px] block">Win Rate Global</span>
            <div className="flex items-center space-x-1.5 mt-0.5">
              <span className="text-white font-mono font-bold text-sm">{summary.globalWinRate}%</span>
              <span className="text-[10px] text-[#787b86]">
                ({summary.totalWins}W / {summary.totalLosses}L)
              </span>
            </div>
          </div>

          <div className="bg-[#191d26] p-3 rounded-xl border border-[#2a2e39]">
            <span className="text-[#787b86] text-[11px] block">Total Operaciones</span>
            <span className="text-white font-mono font-bold text-sm">{summary.totalTrades}</span>
          </div>

          <div className="bg-[#191d26] p-3 rounded-xl border border-[#2a2e39]">
            <span className="text-[#787b86] text-[11px] block">Tasa de Comisión</span>
            <span className="text-[#10b981] font-mono font-bold text-sm flex items-center space-x-1">
              <Zap className="w-3.5 h-3.5 fill-current text-[#10b981]" />
              <span>0% FEE PURO</span>
            </span>
          </div>
        </div>

        {/* Phase 2: Fee Simulation & Grok Regime Bar */}
        <div className="px-6 py-2.5 bg-[#121620] border-b border-[#2a2e39] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center space-x-2">
              <span className="text-[11px] text-[#787b86] font-medium">Simulación Hyperliquid:</span>
              <span className="px-2 py-0.5 rounded font-mono text-[11px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold" title="Hyperliquid Maker Fee: 0.010% por fill (tif: Alo)">
                Maker Post-Only: ${(summary.makerNetPnL ?? summary.totalPurePnL).toFixed(2)}
              </span>
              <span className="px-2 py-0.5 rounded font-mono text-[11px] bg-amber-500/15 text-amber-400 border border-amber-500/30 font-semibold" title="Hyperliquid Taker Fee: 0.045% por fill (tif: Ioc)">
                Taker Estándar: ${(summary.takerNetPnL ?? summary.totalPurePnL).toFixed(2)}
              </span>
            </div>

            <div className="flex items-center space-x-1 text-[11px] text-emerald-400 font-medium">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>Ahorro Comisiones: <b>+77.8%</b> (${feeSavings.toFixed(2)} USDT guardados)</span>
            </div>
          </div>

          {/* Grok Anti-Chop Regime Indicator */}
          <div className="flex items-center space-x-2">
            <span className="text-[11px] text-[#787b86]">Régimen 30s (Grok):</span>
            <span
              className={`px-2.5 py-0.5 rounded-full font-mono text-[10px] font-bold border flex items-center space-x-1 ${
                activeRegime?.regime === 'TRENDING'
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : activeRegime?.regime === 'TOXIC_CHOP'
                  ? 'bg-rose-500/15 text-rose-400 border-rose-500/30 animate-pulse'
                  : 'bg-blue-500/15 text-blue-400 border-blue-500/30'
              }`}
              title={activeRegime?.reason || 'Calculando régimen con ventana de ticks'}
            >
              <Activity className="w-3 h-3" />
              <span>
                {activeRegime?.regime === 'TRENDING'
                  ? `TRENDING (${activeRegime.sentiment})`
                  : activeRegime?.regime === 'TOXIC_CHOP'
                  ? 'TOXIC CHOP (1s Pausa)'
                  : 'RANGING'}
              </span>
              {activeRegime?.confidence ? (
                <span className="opacity-80">({activeRegime.confidence}%)</span>
              ) : null}
            </span>
          </div>
        </div>

        {/* Live Comparative Table */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          <div className="border border-[#2a2e39] rounded-xl overflow-hidden bg-[#181c25]">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-[#12151c] text-[#787b86] uppercase font-mono text-[10px] border-b border-[#2a2e39]">
                    <th className="py-3 px-4"># Sub-Fondo & Estrategia</th>
                    <th className="py-3 px-3">Ejecución</th>
                    <th className="py-3 px-3">Filtro MTF</th>
                    <th className="py-3 px-3">Tendencia MTF</th>
                    <th className="py-3 px-3">Posición Activa</th>
                    <th className="py-3 px-3 text-right">Win Rate</th>
                    <th className="py-3 px-3 text-right">Trades (W/L)</th>
                    <th className="py-3 px-3 text-right">PnL Puro</th>
                    <th className="py-3 px-4 text-right">Capital Actual</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2a2e39]/60 font-mono">
                  {subFunds.map((fund, idx) => {
                    const hasPos = !!fund.activePosition;
                    const pos = fund.activePosition;
                    const isPosBuy = pos?.type === 'BUY';

                    // Unrealized PnL
                    let unrlPnL = 0;
                    if (pos && currentLivePrice > 0) {
                      const movePct = isPosBuy
                        ? (currentLivePrice - pos.entryPrice) / pos.entryPrice
                        : (pos.entryPrice - currentLivePrice) / pos.entryPrice;
                      unrlPnL = pos.amountUSDT * movePct;
                    }

                    const isPnLPos = fund.stats.purePnL >= 0;

                    return (
                      <tr
                        key={fund.id}
                        className={`hover:bg-white/[0.02] transition-colors ${
                          hasPos ? 'bg-white/[0.015]' : ''
                        }`}
                      >
                        {/* 1. Name & Strategy */}
                        <td className="py-3 px-4">
                          <div className="flex items-center space-x-2">
                            <span className="w-5 h-5 rounded-md bg-[#2a2e39] flex items-center justify-center text-[10px] text-slate-300 font-bold shrink-0">
                              {idx + 1}
                            </span>
                            <div>
                              <div className="text-white font-sans font-semibold text-xs">{fund.name}</div>
                              <span className="text-[10px] text-[#787b86] font-sans">{fund.strategy}</span>
                            </div>
                          </div>
                        </td>

                        {/* 2. Micro Execution Timeframe */}
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-[#2962ff]/15 text-[#2962ff] border border-[#2962ff]/30">
                            {fund.executionTimeframe}
                          </span>
                        </td>

                        {/* 3. Confirm Timeframe */}
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-[#ab47bc]/15 text-[#ab47bc] border border-[#ab47bc]/30">
                            {fund.confirmTimeframe}
                          </span>
                        </td>

                        {/* 4. Live MTF Trend Status */}
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center space-x-1 ${
                              fund.lastMacroTrend === 'BULLISH'
                                ? 'bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30'
                                : fund.lastMacroTrend === 'BEARISH'
                                ? 'bg-[#f43f5e]/15 text-[#f43f5e] border border-[#f43f5e]/30'
                                : 'bg-[#787b86]/15 text-[#787b86] border border-[#787b86]/30'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                fund.lastMacroTrend === 'BULLISH'
                                  ? 'bg-[#10b981] animate-pulse'
                                  : fund.lastMacroTrend === 'BEARISH'
                                  ? 'bg-[#f43f5e] animate-pulse'
                                  : 'bg-[#787b86]'
                              }`}
                            />
                            <span>
                              {fund.lastMacroTrend === 'BULLISH'
                                ? 'LONG (Alcista)'
                                : fund.lastMacroTrend === 'BEARISH'
                                ? 'SHORT (Bajista)'
                                : 'NEUTRAL'}
                            </span>
                          </span>
                        </td>

                        {/* 5. Active Position */}
                        <td className="py-3 px-3">
                          {hasPos && pos ? (
                            <div className="flex items-center space-x-1.5">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  isPosBuy
                                    ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/40'
                                    : 'bg-[#f43f5e]/20 text-[#f43f5e] border border-[#f43f5e]/40'
                                }`}
                              >
                                {pos.type}
                              </span>
                              <div className="text-[10px]">
                                <span className="text-white">${pos.entryPrice.toFixed(2)}</span>
                                <span
                                  className={`ml-1 font-bold ${
                                    unrlPnL >= 0 ? 'text-[#10b981]' : 'text-[#f43f5e]'
                                  }`}
                                >
                                  ({unrlPnL >= 0 ? '+' : ''}${unrlPnL.toFixed(2)})
                                </span>
                              </div>
                            </div>
                          ) : (
                            <span className="text-[10px] text-[#787b86] flex items-center space-x-1">
                              <Clock className="w-3 h-3 text-[#787b86]" />
                              <span>Buscando setup</span>
                            </span>
                          )}
                        </td>

                        {/* 6. Win Rate */}
                        <td className="py-3 px-3 text-right">
                          <span
                            className={`font-bold ${
                              fund.stats.winRate >= 50
                                ? 'text-[#10b981]'
                                : fund.stats.totalTrades === 0
                                ? 'text-[#787b86]'
                                : 'text-[#f43f5e]'
                            }`}
                          >
                            {fund.stats.totalTrades > 0 ? `${fund.stats.winRate}%` : '--'}
                          </span>
                        </td>

                        {/* 7. Trades (W / L) */}
                        <td className="py-3 px-3 text-right">
                          <span className="text-white">{fund.stats.totalTrades}</span>
                          <span className="text-[10px] text-[#787b86] ml-1">
                            ({fund.stats.wins}W / {fund.stats.losses}L)
                          </span>
                        </td>

                        {/* 8. Pure PnL & Fee Breakdown */}
                        <td className="py-3 px-3 text-right">
                          <span
                            className={`font-bold block ${
                              fund.stats.purePnL === 0
                                ? 'text-[#787b86]'
                                : isPnLPos
                                ? 'text-[#10b981]'
                                : 'text-[#f43f5e]'
                            }`}
                          >
                            {fund.stats.purePnL > 0 ? '+' : ''}${fund.stats.purePnL.toFixed(2)}
                          </span>
                          <span className="text-[9px] text-[#787b86] font-mono block">
                            M: ${(fund.stats.makerNetPnL ?? fund.stats.purePnL).toFixed(2)} | T: ${(fund.stats.takerNetPnL ?? fund.stats.purePnL).toFixed(2)}
                          </span>
                        </td>

                        {/* 9. Current Capital */}
                        <td className="py-3 px-4 text-right">
                          <span className="font-bold text-white text-xs">
                            ${fund.currentCapital.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Architecture Details Box */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="bg-[#191d26] p-3.5 rounded-xl border border-[#2a2e39] space-y-1">
              <span className="font-bold text-white flex items-center space-x-1.5">
                <Clock className="w-3.5 h-3.5 text-[#2962ff]" />
                <span>Micro-Velas en Vivo (Rolling Window)</span>
              </span>
              <p className="text-[#787b86] text-[11px] leading-relaxed">
                El motor construye las velas de 1s, 3s, 5s, 15s y 1m agrupando los ticks vivos en una ventana móvil en memoria. No requiere esperar a que el exchange cierre la vela.
              </p>
            </div>

            <div className="bg-[#191d26] p-3.5 rounded-xl border border-[#2a2e39] space-y-1">
              <span className="font-bold text-white flex items-center space-x-1.5">
                <Target className="w-3.5 h-3.5 text-[#10b981]" />
                <span>Ejecución Bidireccional sin Congelamiento</span>
              </span>
              <p className="text-[#787b86] text-[11px] leading-relaxed">
                Si la confirmación está BULLISH habilita COMPRAS; si está BEARISH habilita VENTAS. Salidas inmediatas en 1s/3s/5s ante señal contraria o TP/SL.
              </p>
            </div>

            <div className="bg-[#191d26] p-3.5 rounded-xl border border-[#2a2e39] space-y-1">
              <span className="font-bold text-white flex items-center space-x-1.5">
                <Award className="w-3.5 h-3.5 text-[#f6c344]" />
                <span>Medición de Puntería Pura (0% Fee)</span>
              </span>
              <p className="text-[#787b86] text-[11px] leading-relaxed">
                Cada sub-fondo opera de forma aislada con $10,000 USD y 0% de comisión para auditar con exactitud matemática el Win Rate y el ratio R:R de cada estrategia.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
