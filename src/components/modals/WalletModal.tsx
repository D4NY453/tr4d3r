'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useTradingStore } from '@/store/useTradingStore';
import { runSignalsBacktest } from '@/services/simulation/backtest-engine';
import {
  X,
  Wallet,
  DollarSign,
  TrendingUp,
  TrendingDown,
  PlusCircle,
  RefreshCw,
  Play,
  CheckCircle2,
  AlertOctagon,
  History,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Shield,
  Layers,
  Sparkles,
  Zap,
  Trash2,
  Clock,
  Eye,
  EyeOff,
  Hourglass,
  Sliders,
  Search,
  Target,
  Calculator,
  Maximize2,
  Minimize2,
  XCircle,
} from 'lucide-react';
import { TradingSignal, PaperPosition, LimitOrder, ClosedTrade, Timeframe } from '@/types';

const TIMEFRAMES: { label: string; value: Timeframe }[] = [
  { label: '1m', value: '1m' },
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '1h', value: '1h' },
  { label: '4h', value: '4h' },
  { label: '1D', value: '1d' },
  { label: '1W', value: '1w' },
];

const POPULAR_SYMBOLS = [
  'BTCUSDT',
  'ETHUSDT',
  'SOLUSDT',
  'XRPUSDT',
  'BNBUSDT',
  'SUIUSDT',
  'DOGEUSDT',
  'PEPEUSDT',
  'NEARUSDT',
  'LINKUSDT',
  'ADAUSDT',
  'AVAXUSDT',
  'FETUSDT',
  'DOTUSDT',
];

export const WalletModal: React.FC = () => {
  const {
    isWalletModalOpen,
    setWalletModalOpen,
    walletBalance,
    initialDeposit,
    paperPositions,
    limitOrders,
    closedTrades,
    depositFunds,
    resetWallet,
    executePaperTrade,
    executeMultiplePaperTrades,
    cancelLimitOrder,
    closePaperPosition,
    closeAllPaperPositions,
    addClosedTrades,
    candles,
    signals,
    currentSymbol,
    currentTimeframe,
    setSymbol,
    setTimeframe,
    onlyCurrentSignals,
    setOnlyCurrentSignals,
    watchlist,
    setSearchModalOpen,
    setSelectedSignal,
    setCalculatorModalOpen,
    dismissedSignalIds,
    dismissSignal,
    dismissAllExpiredSignals,
    dismissAllSignalsForCurrentSymbol,
  } = useTradingStore();

  const [activeTab, setActiveTab] = useState<'opportunities' | 'positions' | 'limitOrders' | 'history' | 'backtest'>('opportunities');
  const [backtestCapital, setBacktestCapital] = useState<number>(100);
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Dynamic list of all available symbols from Binance watchlist
  const availableSymbols = useMemo(() => {
    const symbolSet = new Set<string>();
    if (currentSymbol) symbolSet.add(currentSymbol);
    POPULAR_SYMBOLS.forEach((s) => symbolSet.add(s));
    watchlist.forEach((w) => symbolSet.add(w.symbol));
    return Array.from(symbolSet);
  }, [watchlist, currentSymbol]);

  // Tick timer to update live position durations every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const currentLivePrice = useMemo(() => {
    if (candles.length === 0) return 0;
    return candles[candles.length - 1].close;
  }, [candles]);

  // Available signals (excluding dismissed ones)
  const availableSignals = useMemo(() => {
    return signals.filter((s) => !dismissedSignalIds.includes(s.id));
  }, [signals, dismissedSignalIds]);

  // Live Backtest on the current candles and available signals
  const backtestResult = useMemo(() => {
    return runSignalsBacktest(candles, availableSignals, backtestCapital);
  }, [candles, availableSignals, backtestCapital]);

  // Filtered signals if onlyCurrentSignals is active (only live valid opportunities)
  const actionableSignals = useMemo(() => {
    let list = availableSignals;
    if (onlyCurrentSignals) {
      list = list.filter((s) => s.status === 'ACTIVE' || s.status === 'TP1_HIT');
    }
    return list;
  }, [availableSignals, onlyCurrentSignals]);

  // Aggregate Stats
  const totalClosedPnl = closedTrades.reduce((acc, t) => acc + t.pnlUSDT, 0);
  const openPositionsPnl = paperPositions.reduce((acc, p) => acc + p.pnlUSDT, 0);
  const totalPnl = totalClosedPnl + openPositionsPnl;
  const totalPnlPercent = initialDeposit > 0 ? (totalPnl / initialDeposit) * 100 : 0;

  const totalCapitalInPositions = paperPositions.reduce((acc, p) => acc + p.amountUSDT, 0);
  const totalCapitalInLimits = limitOrders.reduce((acc, o) => acc + o.amountUSDT, 0);
  const totalAccountValue = walletBalance + totalCapitalInPositions + totalCapitalInLimits + openPositionsPnl;

  const totalWins = closedTrades.filter((t) => t.pnlUSDT > 0).length;
  const totalLosses = closedTrades.filter((t) => t.pnlUSDT <= 0).length;
  const liveWinRate = closedTrades.length > 0 ? (totalWins / closedTrades.length) * 100 : 0;

  // 🎯 Proyección de Ganancias por Objetivos (TP1 50% y TP2 50%)
  const projectionStats = useMemo(() => {
    let totalTP1Gain50 = 0; // Ganancia asegurada al 50% en TP1
    let totalTP2Gain50 = 0; // Ganancia adicional del 50% en TP2
    let totalMaxRiskLoss = 0; // Pérdida si tocan Stop Loss
    let totalTP1Gain100 = 0; // Si el 100% cerrara en TP1
    let totalTP2Gain100 = 0; // Si el 100% cerrara en TP2

    paperPositions.forEach((pos) => {
      const isBuy = pos.type === 'BUY';
      const entry = pos.entryPrice;
      if (!entry || entry <= 0) return;

      const tp1Pct = isBuy
        ? (pos.takeProfit1 - entry) / entry
        : (entry - pos.takeProfit1) / entry;

      const tp2Pct = isBuy
        ? (pos.takeProfit2 - entry) / entry
        : (entry - pos.takeProfit2) / entry;

      const slPct = isBuy
        ? (entry - pos.stopLoss) / entry
        : (pos.stopLoss - entry) / entry;

      const halfAmount = pos.amountUSDT * 0.5;

      const tp1Gain50 = halfAmount * tp1Pct;
      const tp2Gain50 = halfAmount * tp2Pct;
      const slLoss = pos.amountUSDT * slPct;

      totalTP1Gain50 += tp1Gain50;
      totalTP2Gain50 += tp2Gain50;
      totalMaxRiskLoss += slLoss;

      totalTP1Gain100 += pos.amountUSDT * tp1Pct;
      totalTP2Gain100 += pos.amountUSDT * tp2Pct;
    });

    const totalProjectedProfit = totalTP1Gain50 + totalTP2Gain50;
    const projectedProfitPct =
      totalCapitalInPositions > 0 ? (totalProjectedProfit / totalCapitalInPositions) * 100 : 0;
    const maxRiskPct =
      totalCapitalInPositions > 0 ? (totalMaxRiskLoss / totalCapitalInPositions) * 100 : 0;
    const portfolioRR =
      totalMaxRiskLoss > 0 ? totalProjectedProfit / totalMaxRiskLoss : 2.0;

    return {
      totalTP1Gain50,
      totalTP2Gain50,
      totalProjectedProfit,
      projectedProfitPct,
      totalMaxRiskLoss,
      maxRiskPct,
      portfolioRR,
      totalTP1Gain100,
      totalTP2Gain100,
    };
  }, [paperPositions, totalCapitalInPositions]);

  const latestSignal = signals.length > 0 ? signals[0] : null;

  if (!isWalletModalOpen) return null;

  const handleExecuteMarketOrder = (sig: TradingSignal) => {
    executePaperTrade(sig, backtestCapital, 'MARKET');
    setActiveTab('positions');
  };

  const handlePlaceLimitOrder = (sig: TradingSignal) => {
    executePaperTrade(sig, backtestCapital, 'LIMIT');
    setActiveTab('limitOrders');
  };

  const handleOpenActionableMarket = () => {
    if (actionableSignals.length === 0) return;
    const required = actionableSignals.length * backtestCapital;
    if (walletBalance < required) {
      depositFunds(required - walletBalance + 1000);
    }
    executeMultiplePaperTrades(actionableSignals, backtestCapital, 'MARKET');
    setActiveTab('positions');
  };

  const handleOpenActionableLimits = () => {
    if (actionableSignals.length === 0) return;
    const required = actionableSignals.length * backtestCapital;
    if (walletBalance < required) {
      depositFunds(required - walletBalance + 1000);
    }
    executeMultiplePaperTrades(actionableSignals, backtestCapital, 'LIMIT');
    setActiveTab('limitOrders');
  };

  const handleApplyBacktestToWallet = () => {
    if (backtestResult.trades.length === 0) return;
    addClosedTrades(backtestResult.trades);
    setActiveTab('history');
  };

  const formatPrice = (p: number) => {
    if (!p && p !== 0) return '0.00';
    if (p < 0.0001) return p.toFixed(8);
    if (p < 0.1) return p.toFixed(6);
    if (p < 10) return p.toFixed(4);
    if (p < 1000) return p.toFixed(2);
    return p.toFixed(2);
  };

  const formatDateTime = (rawTime: number | string | undefined) => {
    if (!rawTime) return '-';
    let ts = Number(rawTime);
    if (!ts || isNaN(ts)) return '-';
    if (ts < 10000000000) {
      ts = ts * 1000;
    }
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '-';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${day}/${month} ${hours}:${minutes}:${seconds}`;
  };

  const formatDuration = (startMs: number, endMs?: number) => {
    if (!startMs) return '-';
    const diff = (endMs || currentTime) - startMs;
    if (diff <= 0) return '< 1 seg';
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds} seg`;
  };

  return (
    <div
      className={
        isFullscreen
          ? 'fixed inset-0 z-50 flex flex-col bg-[#030305] w-screen h-screen overflow-hidden'
          : 'fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-1 sm:p-2.5'
      }
    >
      <div
        className={
          isFullscreen
            ? 'w-full h-full flex flex-col overflow-hidden bg-[#050608]'
            : 'w-full max-w-[98vw] 2xl:max-w-[1880px] bg-[#050608] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[98vh] max-h-[98vh]'
        }
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-white/[0.07] bg-white/[0.01]">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/[0.08] text-white flex items-center justify-center shrink-0">
              <Wallet className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-white font-mono text-sm font-medium tracking-wide">BILLETERA VIRTUAL & SIMULADOR</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30">
                  LIVE STREAM
                </span>
                <span className="text-xs font-mono text-white bg-white/[0.04] border border-white/[0.07] px-2 py-0.5 rounded">
                  ${formatPrice(currentLivePrice)}
                </span>
              </div>
              <p className="text-[11px] font-mono text-slate-500">
                Operaciones a Mercado y Órdenes Limit en {currentSymbol} ({currentTimeframe})
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Fullscreen / Maximize Toggle */}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] text-slate-400 hover:text-white border border-white/[0.07] transition-colors cursor-pointer"
              title={isFullscreen ? 'Restaurar tamaño' : 'Pantalla Completa'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              onClick={() => setWalletModalOpen(false)}
              className="p-1.5 rounded-lg hover:bg-white/[0.06] text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Asset & Timeframe Switcher Bar + Mode Toggle */}
        <div className="px-6 py-2.5 bg-white/[0.01] border-b border-white/[0.07] flex items-center justify-between flex-wrap gap-2">
          {/* Symbol Selector + Search Trigger + Quick Chips */}
          <div className="flex items-center space-x-2">
            <span className="text-xs font-mono text-slate-500">Activo:</span>
            <select
              value={currentSymbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="bg-[#08090d] text-white font-mono text-xs border border-white/[0.08] rounded-md px-2.5 py-1 focus:outline-none cursor-pointer max-w-[140px]"
            >
              {availableSymbols.map((sym) => (
                <option key={sym} value={sym}>
                  {sym}
                </option>
              ))}
            </select>

            {/* Direct Search Button */}
            <button
              onClick={() => setSearchModalOpen(true)}
              className="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-white/[0.02] hover:bg-white/[0.06] text-slate-300 hover:text-white text-xs font-mono transition-colors border border-white/[0.07] cursor-pointer"
              title="Buscar entre todos los pares"
            >
              <Search className="w-3 h-3 text-slate-400" />
              <span>Explorador ({watchlist.length > 0 ? watchlist.length : 485} Pares)</span>
            </button>

            {/* Quick Symbol Chips */}
            <div className="hidden lg:flex items-center space-x-1">
              {['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT', 'DOGEUSDT', 'SUIUSDT'].map((sym) => (
                <button
                  key={sym}
                  onClick={() => setSymbol(sym)}
                  className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors cursor-pointer ${
                    currentSymbol === sym
                      ? 'bg-white text-black font-semibold'
                      : 'bg-white/[0.02] text-slate-400 hover:text-white hover:bg-white/[0.05]'
                  }`}
                >
                  {sym.replace('USDT', '')}
                </button>
              ))}
            </div>
          </div>

          {/* Timeframe Selector + Mode Toggle */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-1.5">
              <span className="text-xs font-mono text-slate-500">Temporalidad:</span>
              <div className="flex items-center bg-white/[0.02] p-0.5 rounded-lg border border-white/[0.06]">
                {TIMEFRAMES.map((tf) => (
                  <button
                    key={tf.value}
                    onClick={() => setTimeframe(tf.value)}
                    className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors cursor-pointer ${
                      currentTimeframe === tf.value
                        ? 'bg-white text-black font-semibold'
                        : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                    }`}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Toggle: Solo Oportunidades Actuales */}
            <button
              onClick={() => setOnlyCurrentSignals(!onlyCurrentSignals)}
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-xs font-mono transition-all border cursor-pointer ${
                onlyCurrentSignals
                  ? 'bg-white/10 text-white border-white/20'
                  : 'bg-white/[0.02] text-slate-400 hover:text-white border-white/[0.07]'
              }`}
              title="Filtrar para ver solo las oportunidades actuales"
            >
              {onlyCurrentSignals ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              <span>{onlyCurrentSignals ? 'Vigentes' : 'Histórico'}</span>
            </button>
          </div>
        </div>

        {/* Wallet Overview Cards */}
        <div className="p-6 pb-2 bg-white/[0.01] border-b border-white/[0.07]">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Balance Card */}
            <div className="p-3.5 bg-[#08090d]/80 rounded-xl border border-white/[0.07] space-y-1">
              <span className="text-xs text-slate-500 font-mono block">Saldo Disponible</span>
              <div className="text-xl font-normal font-mono text-white">
                ${walletBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <span className="text-[10px] text-slate-500 font-mono">
                Total Cuenta: ${totalAccountValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </span>
            </div>

            {/* Total PnL Card */}
            <div className="p-3.5 bg-[#08090d]/80 rounded-xl border border-white/[0.07] space-y-1">
              <span className="text-xs text-slate-500 font-mono block">P&L Neto Acumulado</span>
              <div className={`text-xl font-normal font-mono flex items-center ${
                totalPnl >= 0 ? 'text-[#10b981]' : 'text-[#f43f5e]'
              }`}>
                {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
              </div>
              <span className={`text-[10px] font-mono ${
                totalPnlPercent >= 0 ? 'text-[#10b981]' : 'text-[#f43f5e]'
              }`}>
                {totalPnlPercent >= 0 ? '+' : ''}{totalPnlPercent.toFixed(2)}% ROI
              </span>
            </div>

            {/* Open Positions Card */}
            <div className="p-3.5 bg-[#08090d]/80 rounded-xl border border-white/[0.07] space-y-1">
              <span className="text-xs text-slate-500 font-mono block">Posiciones / Límites</span>
              <div className="text-xl font-normal font-mono flex items-center space-x-1.5">
                <span className="text-white">{paperPositions.length} activas</span>
                {limitOrders.length > 0 && (
                  <span className="text-xs text-slate-400 font-mono">({limitOrders.length} limit)</span>
                )}
              </div>
              <span className="text-[10px] text-slate-500 font-mono">
                ${(totalCapitalInPositions + totalCapitalInLimits).toFixed(0)} USDT en juego
              </span>
            </div>

            {/* Win Rate Card */}
            <div className="p-3.5 bg-[#08090d]/80 rounded-xl border border-white/[0.07] space-y-1">
              <span className="text-xs text-slate-500 font-mono block">Tasa de Acierto (Win Rate)</span>
              <div className="text-xl font-normal font-mono text-white">
                {liveWinRate.toFixed(1)}%
              </div>
              <span className="text-[10px] text-slate-500 font-mono">
                {totalWins} Ganadas / {totalLosses} Perdidas
              </span>
            </div>
          </div>

          {/* Target Profit Projections Banner (TP1 50% + TP2 50%) */}
          {paperPositions.length > 0 && (
            <div className="mt-3 p-3 bg-white/[0.02] rounded-xl border border-white/[0.07] flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-7 h-7 rounded-lg bg-white/[0.04] text-white flex items-center justify-center shrink-0 border border-white/[0.07]">
                  <Target className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-white font-mono text-xs font-medium">
                      Proyección por Objetivos (TP1 50% + TP2 50%)
                    </span>
                    <span className="text-[10px] bg-white/[0.05] text-slate-300 font-mono px-1.5 py-0.2 rounded border border-white/[0.07]">
                      ${totalCapitalInPositions} USDT en {paperPositions.length} pos
                    </span>
                  </div>
                  <p className="text-[10px] font-mono text-slate-500">
                    50% asegurado en TP1 y 50% restante hasta TP2
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full md:w-auto text-xs font-mono">
                <div className="bg-[#08090d] px-2.5 py-1.5 rounded-lg border border-white/[0.07]">
                  <span className="text-[10px] text-slate-500 block">1. TP1 (50% Venta)</span>
                  <span className="text-[#10b981] font-normal">
                    +${projectionStats.totalTP1Gain50.toFixed(2)}
                  </span>
                </div>

                <div className="bg-[#08090d] px-2.5 py-1.5 rounded-lg border border-white/[0.07]">
                  <span className="text-[10px] text-slate-500 block">2. TP2 (50% Runner)</span>
                  <span className="text-white font-normal">
                    +${projectionStats.totalTP2Gain50.toFixed(2)}
                  </span>
                </div>

                <div className="bg-[#10b981]/10 px-2.5 py-1.5 rounded-lg border border-[#10b981]/30">
                  <span className="text-[10px] text-[#10b981] block">Ganancia Proy.</span>
                  <span className="text-[#10b981] font-normal text-xs">
                    +${projectionStats.totalProjectedProfit.toFixed(2)} (+{projectionStats.projectedProfitPct.toFixed(2)}%)
                  </span>
                </div>

                <div className="bg-[#f43f5e]/10 px-2.5 py-1.5 rounded-lg border border-[#f43f5e]/30">
                  <span className="text-[10px] text-[#f43f5e] block">Riesgo (SL)</span>
                  <span className="text-[#f43f5e] font-normal text-xs">
                    -${projectionStats.totalMaxRiskLoss.toFixed(2)} (1:{projectionStats.portfolioRR.toFixed(1)})
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Quick Deposit & Reset Bar */}
          <div className="mt-3 flex items-center justify-between flex-wrap gap-2 text-xs pt-2 border-t border-white/[0.06]">
            <div className="flex items-center space-x-2">
              <span className="text-slate-500 font-mono text-[11px]">Recargar Saldo:</span>
              {[500, 1000, 5000, 10000].map((amt) => (
                <button
                  key={amt}
                  onClick={() => depositFunds(amt)}
                  className="px-2.5 py-0.5 rounded-md bg-white/[0.02] hover:bg-white/[0.06] text-slate-300 hover:text-white border border-white/[0.07] font-mono transition-colors cursor-pointer"
                >
                  +${amt}
                </button>
              ))}
            </div>

            <button
              onClick={() => resetWallet(10000)}
              className="flex items-center space-x-1 px-2.5 py-0.5 rounded-md bg-white/[0.02] hover:bg-[#f43f5e]/20 text-slate-400 hover:text-[#f43f5e] border border-white/[0.07] hover:border-[#f43f5e]/30 font-mono text-[11px] transition-colors cursor-pointer"
              title="Reiniciar historial y saldo a $10,000"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Reiniciar Billetera</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center px-6 border-b border-white/[0.07] bg-white/[0.01] overflow-x-auto">
          <button
            onClick={() => setActiveTab('opportunities')}
            className={`py-3 px-4 text-xs font-mono border-b-2 flex items-center space-x-1.5 transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'opportunities'
                ? 'border-white text-white font-medium bg-white/[0.04]'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-white" />
            <span>Oportunidades ({actionableSignals.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('positions')}
            className={`py-3 px-4 text-xs font-mono border-b-2 flex items-center space-x-1.5 transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'positions'
                ? 'border-white text-white font-medium bg-white/[0.04]'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-[#10b981]" />
            <span>Posiciones en Vivo ({paperPositions.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('limitOrders')}
            className={`py-3 px-4 text-xs font-mono border-b-2 flex items-center space-x-1.5 transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'limitOrders'
                ? 'border-white text-white font-medium bg-white/[0.04]'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Hourglass className="w-3.5 h-3.5 text-white" />
            <span>Órdenes Limit ({limitOrders.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`py-3 px-4 text-xs font-mono border-b-2 flex items-center space-x-1.5 transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'history'
                ? 'border-white text-white font-medium bg-white/[0.04]'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <History className="w-3.5 h-3.5 text-slate-300" />
            <span>Historial Cerrado ({closedTrades.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('backtest')}
            className={`py-3 px-4 text-xs font-mono border-b-2 flex items-center space-x-1.5 transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'backtest'
                ? 'border-white text-white font-medium bg-white/[0.04]'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Play className="w-3.5 h-3.5 text-slate-300" />
            <span>Simulador Histórico ({signals.length})</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 p-6 overflow-y-auto bg-[#030305]">
          {/* 0. ACTIONABLE LIVE OPPORTUNITIES TAB */}
          {activeTab === 'opportunities' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2 bg-white/[0.01] p-3 rounded-xl border border-white/[0.07]">
                <div className="flex items-center space-x-2">
                  <Zap className="w-4 h-4 text-white" />
                  <span className="text-xs font-mono text-white">
                    {actionableSignals.length} Oportunidades en {currentSymbol} ({currentTimeframe})
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">
                    • Precio: <b className="text-white font-normal">${formatPrice(currentLivePrice)}</b>
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  {/* Capital Selector */}
                  <div className="flex items-center space-x-1 bg-white/[0.02] px-2 py-1 rounded-md border border-white/[0.07] text-xs font-mono">
                    <span className="text-slate-500 text-[11px]">Monto:</span>
                    {[50, 100, 250, 500].map((amt) => (
                      <button
                        key={amt}
                        onClick={() => setBacktestCapital(amt)}
                        className={`px-1.5 py-0.5 rounded text-[11px] font-mono transition-colors cursor-pointer ${
                          backtestCapital === amt
                            ? 'bg-white text-black font-semibold'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        ${amt}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={handleOpenActionableMarket}
                    className="px-3 py-1.5 rounded-lg bg-white text-black hover:bg-slate-200 font-medium text-xs flex items-center space-x-1.5 transition-all cursor-pointer shadow-xs"
                    title={`Ejecutar todas al precio de mercado ($${formatPrice(currentLivePrice)})`}
                  >
                    <Zap className="w-3.5 h-3.5 fill-current" />
                    <span>Ejecutar Todas a Mercado (${backtestCapital} c/u)</span>
                  </button>

                  <button
                    onClick={handleOpenActionableLimits}
                    className="px-3 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] text-white font-medium text-xs flex items-center space-x-1.5 transition-colors border border-white/[0.09] cursor-pointer"
                    title="Colocar órdenes limit"
                  >
                    <Hourglass className="w-3.5 h-3.5" />
                    <span>Colocar Todas como Limit</span>
                  </button>

                  <button
                    onClick={() => dismissAllExpiredSignals()}
                    className="px-2.5 py-1.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] text-slate-400 hover:text-white border border-white/[0.07] text-xs font-mono flex items-center space-x-1 transition-colors cursor-pointer"
                    title="Ocultar oportunidades pasadas"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Limpiar Pasadas</span>
                  </button>

                  <button
                    onClick={() => dismissAllSignalsForCurrentSymbol()}
                    className="px-2.5 py-1.5 rounded-lg bg-white/[0.02] hover:bg-[#f43f5e]/20 text-slate-400 hover:text-[#f43f5e] border border-white/[0.07] hover:border-[#f43f5e]/30 text-xs font-mono flex items-center space-x-1 transition-colors cursor-pointer"
                    title="Limpiar todas las señales de este par"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Limpiar Todo</span>
                  </button>
                </div>
              </div>

              {actionableSignals.length === 0 ? (
                <div className="p-12 text-center text-slate-500 space-y-3 border border-dashed border-white/[0.08] rounded-xl bg-white/[0.01]">
                  <AlertOctagon className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-sm font-mono text-white">No hay oportunidades técnicas activas en {currentSymbol} ({currentTimeframe}).</p>
                  <p className="text-xs font-mono text-slate-500">Prueba cambiando la temporalidad o busca otro activo.</p>
                </div>
              ) : (
                <div className="rounded-xl border border-white/[0.07] overflow-x-auto bg-white/[0.01]">
                  <table className="w-full text-left text-xs font-mono min-w-[900px]">
                    <thead className="bg-[#08090d]/95 backdrop-blur-md text-slate-500 border-b border-white/[0.07] text-[10px] uppercase tracking-wider">
                      <tr>
                        <th className="py-2.5 px-3 font-normal">Tipo / Estado</th>
                        <th className="py-2.5 px-3 font-normal">Estrategia</th>
                        <th className="py-2.5 px-3 font-normal">Hora</th>
                        <th className="py-2.5 px-3 font-normal text-white">Entrada</th>
                        <th className="py-2.5 px-3 font-normal text-[#f43f5e]">Stop Loss</th>
                        <th className="py-2.5 px-3 font-normal text-[#10b981]">Take Profit 1</th>
                        <th className="py-2.5 px-3 font-normal text-[#10b981]">Take Profit 2</th>
                        <th className="py-2.5 px-3 font-normal text-white">R:R</th>
                        <th className="py-2.5 px-3 font-normal">Ganancia / Pérdida</th>
                        <th className="py-2.5 px-3 font-normal">Condición</th>
                        <th className="py-2.5 px-3 font-normal text-center">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {actionableSignals.map((sig, idx) => {
                        const isBuy = sig.type === 'BUY';
                        const riskPct = ((Math.abs(sig.price - sig.stopLoss) / sig.price) * 100).toFixed(1);
                        const tpPct = ((Math.abs(sig.takeProfit1 - sig.price) / sig.price) * 100).toFixed(1);
                        const maxLoss = ((backtestCapital * Math.abs(sig.price - sig.stopLoss)) / sig.price).toFixed(2);
                        const tp1Gain = ((backtestCapital * Math.abs(sig.takeProfit1 - sig.price)) / sig.price).toFixed(2);

                        return (
                          <tr key={sig.id} className="hover:bg-white/[0.02] transition-colors">
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <div className="flex items-center space-x-1.5">
                                <span className={`px-1.5 py-0.2 rounded text-[10px] font-normal ${
                                  isBuy ? 'bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20' : 'bg-[#f43f5e]/10 text-[#f43f5e] border border-[#f43f5e]/20'
                                }`}>
                                  {isBuy ? <TrendingUp className="w-3 h-3 inline mr-0.5" /> : <TrendingDown className="w-3 h-3 inline mr-0.5" />}
                                  {sig.type}
                                </span>
                                {idx === 0 && (
                                  <span className="px-1.5 py-0.2 rounded bg-white/10 text-white text-[9px] font-mono">
                                    RECIENTE
                                  </span>
                                )}
                              </div>
                            </td>

                            <td className="py-2.5 px-3 font-normal text-white max-w-xs truncate" title={sig.strategy}>
                              {sig.strategy}
                            </td>

                            <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap text-[10px]">
                              {formatDateTime(sig.timestamp || sig.time)}
                            </td>

                            <td className="py-2.5 px-3 text-white font-normal whitespace-nowrap">
                              ${formatPrice(sig.price)}
                            </td>

                            <td className="py-2.5 px-3 text-[#f43f5e] whitespace-nowrap">
                              ${formatPrice(sig.stopLoss)} <span className="text-[10px] text-slate-500">(-{riskPct}%)</span>
                            </td>

                            <td className="py-2.5 px-3 text-[#10b981] whitespace-nowrap">
                              ${formatPrice(sig.takeProfit1)} <span className="text-[10px] text-slate-500">(+{tpPct}%)</span>
                            </td>

                            <td className="py-2.5 px-3 text-[#10b981] whitespace-nowrap">
                              ${formatPrice(sig.takeProfit2)}
                            </td>

                            <td className="py-2.5 px-3 font-normal text-white whitespace-nowrap">
                              {sig.riskReward}
                            </td>

                            <td className="py-2.5 px-3 whitespace-nowrap font-mono text-[11px]">
                              <span className="text-[#f43f5e]">-${maxLoss}</span>
                              <span className="text-slate-500 mx-1">/</span>
                              <span className="text-[#10b981]">+${tp1Gain}</span>
                            </td>

                            <td className="py-2.5 px-3 text-slate-400 text-xs max-w-xs truncate" title={sig.reason}>
                              {sig.reason}
                            </td>

                            <td className="py-2.5 px-3 text-center whitespace-nowrap">
                              <div className="flex items-center justify-center space-x-1">
                                <button
                                  onClick={() => handleExecuteMarketOrder(sig)}
                                  className="px-2 py-0.5 bg-white text-black hover:bg-slate-200 rounded text-[10px] font-medium transition-colors cursor-pointer"
                                  title="Entrar a mercado"
                                >
                                  Mercado
                                </button>

                                <button
                                  onClick={() => handlePlaceLimitOrder(sig)}
                                  className="px-2 py-0.5 bg-white/[0.03] hover:bg-white/[0.08] text-white rounded text-[10px] font-normal transition-colors border border-white/[0.08] cursor-pointer"
                                  title="Colocar limit"
                                >
                                  Limit
                                </button>

                                <button
                                  onClick={() => {
                                    setSelectedSignal(sig);
                                    setCalculatorModalOpen(true);
                                  }}
                                  className="p-1 bg-white/[0.03] hover:bg-white/[0.08] text-slate-400 hover:text-white rounded text-[10px] transition-colors border border-white/[0.07] cursor-pointer"
                                  title="Calculadora"
                                >
                                  <Calculator className="w-3 h-3" />
                                </button>

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    dismissSignal(sig.id);
                                  }}
                                  className="p-1 rounded text-slate-500 hover:text-[#f43f5e] hover:bg-white/[0.05] transition-colors cursor-pointer"
                                  title="Eliminar señal"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* 1. LIVE OPEN POSITIONS TAB */}
          {activeTab === 'positions' && (
            <div className="space-y-4">
              {/* Positions Header Actions */}
              <div className="flex items-center justify-between flex-wrap gap-2 bg-white/[0.01] p-3 rounded-xl border border-white/[0.07]">
                <div className="flex items-center space-x-2">
                  <Activity className="w-4 h-4 text-[#10b981]" />
                  <span className="text-xs font-mono text-white">
                    {paperPositions.length} Posiciones Activas
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleOpenActionableMarket}
                    className="px-3 py-1.5 rounded-lg bg-white text-black hover:bg-slate-200 font-medium text-xs flex items-center space-x-1.5 transition-all cursor-pointer shadow-xs"
                  >
                    <Zap className="w-3.5 h-3.5 fill-current" />
                    <span>Entrar a Mercado ($100 c/u)</span>
                  </button>

                  <button
                    onClick={handleOpenActionableLimits}
                    className="px-3 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] text-white font-medium text-xs flex items-center space-x-1.5 transition-colors border border-white/[0.09] cursor-pointer"
                  >
                    <Hourglass className="w-3.5 h-3.5" />
                    <span>Colocar Órdenes Limit</span>
                  </button>

                  {paperPositions.length > 0 && (
                    <button
                      onClick={() => closeAllPaperPositions('MANUAL')}
                      className="px-3 py-1.5 rounded-lg bg-[#f43f5e]/15 hover:bg-[#f43f5e] text-[#f43f5e] hover:text-white font-medium text-xs flex items-center space-x-1.5 transition-colors border border-[#f43f5e]/30 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Cerrar Todas</span>
                    </button>
                  )}
                </div>
              </div>

              {paperPositions.length > 0 && (
                <div className="bg-white/[0.02] p-3 rounded-xl border border-white/[0.07] text-xs font-mono space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-white flex items-center space-x-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-slate-400" />
                      <span>Estrategia de Salida Parcial (50% en TP1 + 50% en TP2)</span>
                    </span>
                    <span className="text-[11px] font-mono text-[#10b981] bg-[#10b981]/10 px-2 py-0.5 rounded border border-[#10b981]/20">
                      Estimado: +${projectionStats.totalProjectedProfit.toFixed(2)} (+{projectionStats.projectedProfitPct.toFixed(2)}%)
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px]">
                    <div className="p-2.5 bg-[#08090d] rounded-lg border border-white/[0.07]">
                      <span className="text-[#10b981] font-medium block">1. Take Profit 1 (TP1):</span>
                      <span className="text-slate-400">
                        Venta del 50% asegurando <b className="text-[#10b981] font-normal">+${projectionStats.totalTP1Gain50.toFixed(2)}</b> y SL se mueve a Break Even.
                      </span>
                    </div>
                    <div className="p-2.5 bg-[#08090d] rounded-lg border border-white/[0.07]">
                      <span className="text-white font-medium block">2. Take Profit 2 (TP2):</span>
                      <span className="text-slate-400">
                        50% restante captura la tendencia y genera <b className="text-white font-normal">+${projectionStats.totalTP2Gain50.toFixed(2)}</b> adicionales.
                      </span>
                    </div>
                    <div className="p-2.5 bg-[#08090d] rounded-lg border border-white/[0.07]">
                      <span className="text-slate-300 font-medium block">Resumen de Cartera:</span>
                      <span className="text-slate-400">
                        Capital: ${totalCapitalInPositions} USDT. Ganancia esperada: <b className="text-[#10b981] font-normal">+${projectionStats.totalProjectedProfit.toFixed(2)}</b>.
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {paperPositions.length === 0 ? (
                <div className="p-12 text-center text-slate-500 space-y-4 border border-dashed border-white/[0.08] rounded-xl bg-white/[0.01]">
                  <Activity className="w-8 h-8 text-slate-600 mx-auto" />
                  <div className="space-y-1">
                    <p className="text-sm font-mono text-white">No tienes posiciones activas en este momento.</p>
                    <p className="text-xs font-mono text-slate-500">
                      Precio actual en vivo de {currentSymbol}: ${formatPrice(currentLivePrice)}
                    </p>
                  </div>

                  <div className="flex items-center justify-center flex-wrap gap-2 pt-2">
                    <button
                      onClick={() => setActiveTab('opportunities')}
                      className="px-4 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] text-slate-300 hover:text-white font-mono text-xs flex items-center space-x-2 transition-colors border border-white/[0.07] cursor-pointer"
                    >
                      <Zap className="w-3.5 h-3.5 text-slate-400" />
                      <span>Ver Oportunidades</span>
                    </button>

                    <button
                      onClick={handleOpenActionableMarket}
                      className="px-4 py-2 rounded-lg bg-white text-black hover:bg-slate-200 font-mono text-xs font-medium flex items-center space-x-2 transition-all cursor-pointer shadow-xs"
                    >
                      <Zap className="w-3.5 h-3.5 fill-current" />
                      <span>Entrar a Mercado Ya</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-white/[0.07] overflow-x-auto bg-white/[0.01]">
                  <table className="w-full text-left text-xs font-mono min-w-[980px]">
                    <thead className="bg-[#08090d]/95 backdrop-blur-md text-slate-500 border-b border-white/[0.07] text-[10px] uppercase tracking-wider">
                      <tr>
                        <th className="py-2.5 px-3 font-normal">Par / Tipo</th>
                        <th className="py-2.5 px-3 font-normal">Estrategia</th>
                        <th className="py-2.5 px-3 font-normal">Tiempo</th>
                        <th className="py-2.5 px-3 font-normal text-white">Entrada</th>
                        <th className="py-2.5 px-3 font-normal text-slate-400">Precio Vivo</th>
                        <th className="py-2.5 px-3 font-normal text-[#f43f5e]">Stop Loss</th>
                        <th className="py-2.5 px-3 font-normal text-[#10b981]">TP1 (50%)</th>
                        <th className="py-2.5 px-3 font-normal text-white">TP2 (50%)</th>
                        <th className="py-2.5 px-3 font-normal text-white">Proy. Total</th>
                        <th className="py-2.5 px-3 font-normal">Monto</th>
                        <th className="py-2.5 px-3 font-normal">P&L Actual</th>
                        <th className="py-2.5 px-3 font-normal text-center">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {paperPositions.map((pos) => {
                        const isWin = pos.pnlUSDT >= 0;
                        const isBuy = pos.type === 'BUY';
                        const entry = pos.entryPrice;

                        const tp1GainPct = entry > 0
                          ? isBuy
                            ? (pos.takeProfit1 - entry) / entry
                            : (entry - pos.takeProfit1) / entry
                          : 0;

                        const tp2GainPct = entry > 0
                          ? isBuy
                            ? (pos.takeProfit2 - entry) / entry
                            : (entry - pos.takeProfit2) / entry
                          : 0;

                        const posTP1Gain50 = (pos.amountUSDT * 0.5) * tp1GainPct;
                        const posTP2Gain50 = (pos.amountUSDT * 0.5) * tp2GainPct;
                        const posTotalGain = posTP1Gain50 + posTP2Gain50;

                        return (
                          <tr key={pos.id} className="hover:bg-white/[0.02] transition-colors">
                            <td className="py-2 px-3 whitespace-nowrap">
                              <span className="font-normal text-white mr-1.5">{pos.symbol}</span>
                              <span className={`px-1.5 py-0.2 rounded text-[10px] font-normal ${
                                pos.type === 'BUY' ? 'bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20' : 'bg-[#f43f5e]/10 text-[#f43f5e] border border-[#f43f5e]/20'
                              }`}>
                                {pos.type}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-slate-300 max-w-xs truncate">{pos.strategy}</td>
                            <td className="py-2 px-3 text-slate-400 whitespace-nowrap text-[10px]">
                              {formatDuration(pos.entryTime)}
                            </td>
                            <td className="py-2 px-3 text-white font-normal">${formatPrice(pos.entryPrice)}</td>
                            <td className="py-2 px-3 text-white font-normal">${formatPrice(pos.currentPrice)}</td>
                            <td className="py-2 px-3 text-[#f43f5e]">${formatPrice(pos.stopLoss)}</td>
                            
                            {/* TP1 50% */}
                            <td className="py-2 px-3 text-[#10b981] whitespace-nowrap">
                              ${formatPrice(pos.takeProfit1)}
                              <span className="text-[10px] text-slate-500 ml-1">
                                (+${posTP1Gain50.toFixed(2)})
                              </span>
                            </td>

                            {/* TP2 50% */}
                            <td className="py-2 px-3 text-white whitespace-nowrap">
                              ${formatPrice(pos.takeProfit2)}
                              <span className="text-[10px] text-slate-500 ml-1">
                                (+${posTP2Gain50.toFixed(2)})
                              </span>
                            </td>

                            {/* Proyección Total */}
                            <td className="py-2 px-3 text-white whitespace-nowrap font-normal">
                              +${posTotalGain.toFixed(2)}
                            </td>

                            <td className="py-2 px-3 font-normal">${pos.amountUSDT.toFixed(0)}</td>
                            
                            {/* P&L Actual Flotante */}
                            <td className="py-2 px-3 whitespace-nowrap">
                              <div className={`flex items-center space-x-1 text-xs ${isWin ? 'text-[#10b981]' : 'text-[#f43f5e]'}`}>
                                <span>
                                  {isWin ? '+' : ''}${Math.abs(pos.pnlUSDT) < 0.01 && pos.pnlUSDT !== 0 ? pos.pnlUSDT.toFixed(4) : pos.pnlUSDT.toFixed(2)}
                                </span>
                                <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                                  isWin ? 'bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20' : 'bg-[#f43f5e]/10 text-[#f43f5e] border border-[#f43f5e]/20'
                                }`}>
                                  {isWin ? '+' : ''}{pos.pnlPercent.toFixed(2)}%
                                </span>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-center">
                              <button
                                onClick={() => closePaperPosition(pos.id, pos.currentPrice, 'MANUAL')}
                                className="px-2.5 py-0.5 rounded-md bg-white/[0.03] hover:bg-[#f43f5e]/20 text-slate-400 hover:text-[#f43f5e] border border-white/[0.07] hover:border-[#f43f5e]/30 text-[10px] font-mono transition-colors cursor-pointer"
                              >
                                Cerrar
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* 2. PENDING LIMIT ORDERS TAB */}
          {activeTab === 'limitOrders' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2 bg-white/[0.01] p-3 rounded-xl border border-white/[0.07]">
                <div className="space-y-0.5">
                  <div className="flex items-center space-x-2">
                    <Hourglass className="w-4 h-4 text-white" />
                    <span className="text-xs font-mono text-white">
                      {limitOrders.length} Órdenes Limit Pendientes
                    </span>
                  </div>
                  <p className="text-[10px] font-mono text-slate-500">
                    Se activan al tocar el precio en Binance ({currentSymbol}: ${formatPrice(currentLivePrice)}).
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleOpenActionableLimits}
                    className="px-3 py-1.5 rounded-lg bg-white text-black hover:bg-slate-200 font-medium text-xs flex items-center space-x-1.5 transition-all cursor-pointer shadow-xs"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>Colocar Nuevas Límites ($100)</span>
                  </button>
                </div>
              </div>

              {limitOrders.length === 0 ? (
                <div className="p-12 text-center text-slate-500 space-y-3 border border-dashed border-white/[0.08] rounded-xl bg-white/[0.01]">
                  <Hourglass className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-sm font-mono text-white">No tienes órdenes limit pendientes en este momento.</p>
                  <button
                    onClick={handleOpenActionableLimits}
                    className="px-4 py-2 rounded-lg bg-white text-black hover:bg-slate-200 font-medium text-xs transition-colors cursor-pointer shadow-xs"
                  >
                    Colocar Órdenes Limit Ahora
                  </button>
                </div>
              ) : (
                <div className="rounded-xl border border-white/[0.07] overflow-hidden bg-white/[0.01]">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-[#08090d]/95 backdrop-blur-md text-slate-500 border-b border-white/[0.07] text-[10px] uppercase tracking-wider">
                      <tr>
                        <th className="py-2.5 px-3 font-normal">Par / Tipo</th>
                        <th className="py-2.5 px-3 font-normal">Estrategia</th>
                        <th className="py-2.5 px-3 font-normal text-white">Precio Limit</th>
                        <th className="py-2.5 px-3 font-normal text-slate-400">Precio Vivo</th>
                        <th className="py-2.5 px-3 font-normal">Distancia</th>
                        <th className="py-2.5 px-3 font-normal text-[#f43f5e]">Stop Loss</th>
                        <th className="py-2.5 px-3 font-normal text-[#10b981]">Take Profit</th>
                        <th className="py-2.5 px-3 font-normal">Monto</th>
                        <th className="py-2.5 px-3 font-normal">Estado</th>
                        <th className="py-2.5 px-3 font-normal text-center">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {limitOrders.map((ord) => {
                        const dist = Math.abs(currentLivePrice - ord.limitPrice);
                        const distPct = ord.limitPrice > 0 ? (dist / ord.limitPrice) * 100 : 0;
                        return (
                          <tr key={ord.id} className="hover:bg-white/[0.02] transition-colors">
                            <td className="py-2 px-3 whitespace-nowrap">
                              <span className="font-normal text-white mr-1.5">{ord.symbol}</span>
                              <span className={`px-1.5 py-0.2 rounded text-[10px] font-normal ${
                                ord.type === 'BUY' ? 'bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20' : 'bg-[#f43f5e]/10 text-[#f43f5e] border border-[#f43f5e]/20'
                              }`}>
                                {ord.type} LIMIT
                              </span>
                            </td>
                            <td className="py-2 px-3 text-slate-300 max-w-xs truncate">{ord.strategy}</td>
                            <td className="py-2 px-3 font-normal text-white">${formatPrice(ord.limitPrice)}</td>
                            <td className="py-2 px-3 font-normal text-slate-400">${formatPrice(currentLivePrice)}</td>
                            <td className="py-2 px-3 text-slate-500 text-[11px]">
                              ${formatPrice(dist)} ({distPct.toFixed(2)}%)
                            </td>
                            <td className="py-2 px-3 text-[#f43f5e]">${formatPrice(ord.stopLoss)}</td>
                            <td className="py-2 px-3 text-[#10b981]">${formatPrice(ord.takeProfit1)}</td>
                            <td className="py-2 px-3 font-normal">${ord.amountUSDT.toFixed(0)}</td>
                            <td className="py-2 px-3 whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/[0.04] text-slate-300 border border-white/[0.06]">
                                ESPERANDO
                              </span>
                            </td>
                            <td className="py-2 px-3 text-center">
                              <button
                                onClick={() => cancelLimitOrder(ord.id)}
                                className="px-2.5 py-0.5 rounded-md bg-white/[0.03] hover:bg-[#f43f5e]/20 text-slate-400 hover:text-[#f43f5e] border border-white/[0.07] hover:border-[#f43f5e]/30 text-[10px] font-mono transition-colors cursor-pointer"
                              >
                                Cancelar
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* 3. BACKTEST SIMULATOR TAB */}
          {activeTab === 'backtest' && (
            <div className="space-y-5">
              {/* Backtest Header & Controls */}
              <div className="p-4 bg-white/[0.01] rounded-xl border border-white/[0.07] flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="space-y-1">
                  <h4 className="text-xs font-mono text-white flex items-center space-x-2">
                    <Sparkles className="w-3.5 h-3.5 text-slate-400" />
                    <span>Auditoría Histórica ({currentSymbol} • {currentTimeframe})</span>
                  </h4>
                  <p className="text-[11px] font-mono text-slate-500">
                    Comprobación matemática de las {signals.length} señales históricas.
                  </p>
                </div>

                <div className="flex items-center space-x-2 shrink-0 flex-wrap gap-2">
                  <div className="flex items-center space-x-1 bg-white/[0.02] px-2.5 py-1 rounded-md border border-white/[0.07]">
                    <span className="text-xs font-mono text-slate-500">Capital:</span>
                    <span className="text-xs font-mono text-white">$</span>
                    <input
                      type="number"
                      value={backtestCapital}
                      onChange={(e) => setBacktestCapital(Math.max(10, Number(e.target.value)))}
                      className="w-14 bg-transparent text-white font-mono text-xs focus:outline-none"
                    />
                  </div>

                  <button
                    onClick={handleOpenActionableMarket}
                    className="px-3 py-1.5 rounded-lg bg-white text-black hover:bg-slate-200 font-medium text-xs flex items-center space-x-1.5 transition-all cursor-pointer shadow-xs"
                  >
                    <Zap className="w-3.5 h-3.5 fill-current" />
                    <span>Entrar a Mercado Ya</span>
                  </button>

                  <button
                    onClick={handleApplyBacktestToWallet}
                    className="px-3 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] text-slate-300 font-mono text-xs flex items-center space-x-1.5 transition-colors border border-white/[0.07] cursor-pointer"
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>Archivar en Historial</span>
                  </button>
                </div>
              </div>

              {/* Simulation Metrics Dashboard */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 bg-[#08090d]/80 rounded-xl border border-white/[0.07] space-y-1">
                  <span className="text-[10px] text-slate-500 font-mono block">Tasa de Acierto</span>
                  <div className="text-lg font-mono font-normal text-[#10b981]">
                    {backtestResult.summary.winRate}%
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {backtestResult.summary.winTrades}W / {backtestResult.summary.lossTrades}L de {backtestResult.summary.totalTrades}
                  </span>
                </div>

                <div className="p-3.5 bg-[#08090d]/80 rounded-xl border border-white/[0.07] space-y-1">
                  <span className="text-[10px] text-slate-500 font-mono block">P&L Neto Total</span>
                  <div className={`text-lg font-mono font-normal ${
                    backtestResult.summary.totalPnlUSDT >= 0 ? 'text-[#10b981]' : 'text-[#f43f5e]'
                  }`}>
                    {backtestResult.summary.totalPnlUSDT >= 0 ? '+' : ''}${backtestResult.summary.totalPnlUSDT.toFixed(2)}
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">
                    con ${backtestCapital}/operación
                  </span>
                </div>

                <div className="p-3.5 bg-[#08090d]/80 rounded-xl border border-white/[0.07] space-y-1">
                  <span className="text-[10px] text-slate-500 font-mono block">Factor de Ganancia (PF)</span>
                  <div className="text-lg font-mono font-normal text-white">
                    {backtestResult.summary.profitFactor}
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {backtestResult.summary.profitFactor >= 1.5 ? 'Rentable' : 'Ajustada'}
                  </span>
                </div>

                <div className="p-3.5 bg-[#08090d]/80 rounded-xl border border-white/[0.07] space-y-1">
                  <span className="text-[10px] text-slate-500 font-mono block">Promedio Ganado / Perdido</span>
                  <div className="text-xs font-mono font-normal text-[#10b981]">
                    +${backtestResult.summary.avgWinUSDT.toFixed(2)} <span className="text-slate-500">/</span> <span className="text-[#f43f5e]">-${backtestResult.summary.avgLossUSDT.toFixed(2)}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">Asimétrico</span>
                </div>
              </div>

              {/* Trade Log Table */}
              <div className="space-y-2">
                <div className="text-xs font-mono text-white flex items-center justify-between">
                  <span>Desglose ({backtestResult.trades.length} trades)</span>
                </div>

                <div className="rounded-xl border border-white/[0.07] overflow-hidden max-h-72 overflow-y-auto bg-white/[0.01]">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="sticky top-0 bg-[#08090d]/95 backdrop-blur-md text-slate-500 border-b border-white/[0.07] text-[10px] uppercase tracking-wider">
                      <tr>
                        <th className="py-2 px-3 font-normal">Tipo</th>
                        <th className="py-2 px-3 font-normal">Estrategia</th>
                        <th className="py-2 px-3 font-normal">Entrada</th>
                        <th className="py-2 px-3 font-normal">Salida</th>
                        <th className="py-2 px-3 font-normal">Duración</th>
                        <th className="py-2 px-3 font-normal text-white">Precio In</th>
                        <th className="py-2 px-3 font-normal text-slate-400">Precio Out</th>
                        <th className="py-2 px-3 font-normal">Resultado</th>
                        <th className="py-2 px-3 font-normal">P&L ($)</th>
                        <th className="py-2 px-3 font-normal">P&L (%)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {backtestResult.trades.map((tr) => {
                        const isWin = tr.pnlUSDT > 0;
                        return (
                          <tr key={tr.id} className="hover:bg-white/[0.02] transition-colors">
                            <td className="py-1.5 px-3 whitespace-nowrap">
                              <span className={`px-1.5 py-0.2 rounded text-[10px] font-normal ${
                                tr.type === 'BUY' ? 'bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20' : 'bg-[#f43f5e]/10 text-[#f43f5e] border border-[#f43f5e]/20'
                              }`}>
                                {tr.type}
                              </span>
                            </td>
                            <td className="py-1.5 px-3 text-slate-300 max-w-xs truncate">{tr.strategy}</td>
                            <td className="py-1.5 px-3 text-slate-500 text-[10px] whitespace-nowrap">
                              {formatDateTime(tr.entryTime)}
                            </td>
                            <td className="py-1.5 px-3 text-slate-500 text-[10px] whitespace-nowrap">
                              {formatDateTime(tr.exitTime)}
                            </td>
                            <td className="py-1.5 px-3 text-slate-400 whitespace-nowrap text-[10px]">
                              {tr.durationCandles} velas ({formatDuration(tr.entryTime, tr.exitTime)})
                            </td>
                            <td className="py-1.5 px-3 text-white font-normal">${formatPrice(tr.entryPrice)}</td>
                            <td className="py-1.5 px-3 text-slate-400 font-normal">${formatPrice(tr.exitPrice)}</td>
                            <td className="py-1.5 px-3 whitespace-nowrap">
                              <span className={`px-1.5 py-0.2 rounded text-[10px] font-normal ${
                                isWin ? 'bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20' : 'bg-[#f43f5e]/10 text-[#f43f5e] border border-[#f43f5e]/20'
                              }`}>
                                {tr.exitReason === 'TP1' ? 'TP1' : tr.exitReason === 'SL' ? 'SL' : 'Cierre'}
                              </span>
                            </td>
                            <td className={`py-1.5 px-3 font-normal ${isWin ? 'text-[#10b981]' : 'text-[#f43f5e]'}`}>
                              {isWin ? '+' : ''}${tr.pnlUSDT.toFixed(2)}
                            </td>
                            <td className={`py-1.5 px-3 font-normal ${isWin ? 'text-[#10b981]' : 'text-[#f43f5e]'}`}>
                              {isWin ? '+' : ''}{tr.pnlPercent.toFixed(2)}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 4. TRADE HISTORY TAB */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              {closedTrades.length === 0 ? (
                <div className="p-12 text-center text-slate-500 space-y-2 border border-dashed border-white/[0.08] rounded-xl bg-white/[0.01]">
                  <History className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-sm font-mono text-white">No hay operaciones cerradas registradas.</p>
                  <p className="text-xs font-mono text-slate-500">
                    Archiva operaciones desde el Simulador Histórico o ejecuta órdenes en vivo.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-white/[0.07] overflow-hidden max-h-96 overflow-y-auto bg-white/[0.01]">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="sticky top-0 bg-[#08090d]/95 backdrop-blur-md text-slate-500 border-b border-white/[0.07] text-[10px] uppercase tracking-wider">
                      <tr>
                        <th className="py-2.5 px-3 font-normal">Par / Tipo</th>
                        <th className="py-2.5 px-3 font-normal">Estrategia</th>
                        <th className="py-2.5 px-3 font-normal">Entrada</th>
                        <th className="py-2.5 px-3 font-normal">Salida</th>
                        <th className="py-2.5 px-3 font-normal">Duración</th>
                        <th className="py-2.5 px-3 font-normal text-white">Entrada</th>
                        <th className="py-2.5 px-3 font-normal text-slate-400">Salida</th>
                        <th className="py-2.5 px-3 font-normal">Motivo</th>
                        <th className="py-2.5 px-3 font-normal">Monto</th>
                        <th className="py-2.5 px-3 font-normal">P&L ($)</th>
                        <th className="py-2.5 px-3 font-normal">P&L (%)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {closedTrades.map((t) => {
                        const isWin = t.pnlUSDT > 0;
                        return (
                          <tr key={t.id} className="hover:bg-white/[0.02] transition-colors">
                            <td className="py-2 px-3 whitespace-nowrap">
                              <span className="font-normal text-white mr-1.5">{t.symbol}</span>
                              <span className={`px-1.5 py-0.2 rounded text-[10px] font-normal ${
                                t.type === 'BUY' ? 'bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20' : 'bg-[#f43f5e]/10 text-[#f43f5e] border border-[#f43f5e]/20'
                              }`}>
                                {t.type}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-slate-300 max-w-xs truncate">{t.strategy}</td>
                            <td className="py-2 px-3 text-slate-500 text-[10px] whitespace-nowrap">
                              {formatDateTime(t.entryTime)}
                            </td>
                            <td className="py-2 px-3 text-slate-500 text-[10px] whitespace-nowrap">
                              {formatDateTime(t.exitTime)}
                            </td>
                            <td className="py-2 px-3 text-slate-400 whitespace-nowrap text-[10px]">
                              {formatDuration(t.entryTime, t.exitTime)}
                            </td>
                            <td className="py-2 px-3 text-white font-normal">${formatPrice(t.entryPrice)}</td>
                            <td className="py-2 px-3 text-slate-400 font-normal">${formatPrice(t.exitPrice)}</td>
                            <td className="py-2 px-3 whitespace-nowrap">
                              <span className={`px-1.5 py-0.2 rounded text-[10px] font-normal ${
                                t.exitReason === 'TP1'
                                  ? 'bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20'
                                  : t.exitReason === 'SL'
                                  ? 'bg-[#f43f5e]/10 text-[#f43f5e] border border-[#f43f5e]/20'
                                  : 'bg-white/10 text-white border border-white/20'
                              }`}>
                                {t.exitReason === 'TP1' ? 'TP1' : t.exitReason === 'SL' ? 'SL' : 'Manual'}
                              </span>
                            </td>
                            <td className="py-2 px-3 font-normal">${t.amountUSDT.toFixed(0)}</td>
                            <td className={`py-2 px-3 font-normal ${isWin ? 'text-[#10b981]' : 'text-[#f43f5e]'}`}>
                              {isWin ? '+' : ''}${t.pnlUSDT.toFixed(2)}
                            </td>
                            <td className={`py-2 px-3 font-normal ${isWin ? 'text-[#10b981]' : 'text-[#f43f5e]'}`}>
                              {isWin ? '+' : ''}{t.pnlPercent.toFixed(2)}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-white/[0.01] border-t border-white/[0.07] flex items-center justify-between text-xs font-mono text-slate-500">
          <div className="flex items-center space-x-1.5">
            <Shield className="w-3.5 h-3.5 text-[#10b981]" />
            <span>Simulación basada en ticks reales de Binance</span>
          </div>

          <button
            onClick={() => setWalletModalOpen(false)}
            className="px-4 py-1.5 rounded-lg bg-white text-black hover:bg-slate-200 font-medium transition-colors cursor-pointer"
          >
            Volver al Gráfico
          </button>
        </div>
      </div>
    </div>
  );
};
