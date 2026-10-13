'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTradingStore } from '@/store/useTradingStore';
import { Timeframe, TradingSignal } from '@/types';
import {
  scanAllMarketOpportunities,
  EnrichedTradingSignal,
  getLastScanCache,
} from '@/services/signals/market-scanner';
import {
  Zap,
  X,
  Search,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Target,
  Shield,
  Activity,
  Layers,
  LayoutGrid,
  List,
  Calculator,
  ExternalLink,
  SlidersHorizontal,
  Maximize2,
  Minimize2,
  Sparkles,
  Flame,
  CheckCircle2,
  Play,
  ArrowRight,
} from 'lucide-react';

export const GlobalOpportunitiesModal: React.FC = () => {
  const {
    isAllOpportunitiesModalOpen,
    setAllOpportunitiesModalOpen,
    setSymbol,
    setTimeframe,
    setSelectedSignal,
    setCalculatorModalOpen,
    executePaperTrade,
    setHyperliquidModalOpen,
    hyperliquidAgentKey,
    executeLiveHyperliquidOrder,
    activeOpportunityViewMode,
    setActiveOpportunityViewMode,
  } = useTradingStore();

  const [scanTimeframe, setScanTimeframe] = useState<Timeframe>('1m');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'HYPERLIQUID' | 'MEMES' | 'BINANCE'>('ALL');
  const [directionFilter, setDirectionFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [freshOnly, setFreshOnly] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewStyle, setViewStyle] = useState<'cards' | 'table'>('cards');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Scanner state
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanProgress, setScanProgress] = useState<{
    percent: number;
    scannedCount: number;
    totalCount: number;
    currentSymbol: string;
    foundCount: number;
  }>({
    percent: 0,
    scannedCount: 0,
    totalCount: 0,
    currentSymbol: '',
    foundCount: 0,
  });

  const [signals, setSignals] = useState<EnrichedTradingSignal[]>([]);
  const [lastScanTime, setLastScanTime] = useState<number>(0);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Trigger Scanner function
  const runScan = useCallback(
    async (tf: Timeframe = scanTimeframe, cat: 'ALL' | 'HYPERLIQUID' | 'MEMES' | 'BINANCE' = categoryFilter) => {
      setIsScanning(true);
      setScanProgress({
        percent: 0,
        scannedCount: 0,
        totalCount: 0,
        currentSymbol: 'Iniciando escaneo...',
        foundCount: 0,
      });

      try {
        const results = await scanAllMarketOpportunities({
          timeframe: tf,
          category: cat,
          maxPairs: 50,
          onProgress: (p) => {
            setScanProgress(p);
          },
        });

        setSignals(results);
        setLastScanTime(Date.now());
        // Also update global store
        useTradingStore.getState().setGlobalActiveSignals(results);
      } catch (err: any) {
        console.error('Error scanning market opportunities:', err);
      } finally {
        setIsScanning(false);
      }
    },
    [scanTimeframe, categoryFilter]
  );

  // Auto-scan on modal open if no signals or stale (>45s)
  useEffect(() => {
    if (isAllOpportunitiesModalOpen) {
      const cached = getLastScanCache();
      if (cached.length > 0 && signals.length === 0) {
        setSignals(cached);
      }

      if (Date.now() - lastScanTime > 45000 || signals.length === 0) {
        runScan(scanTimeframe, categoryFilter);
      }
    }
  }, [isAllOpportunitiesModalOpen]);

  // Close on ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isAllOpportunitiesModalOpen) {
        setAllOpportunitiesModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAllOpportunitiesModalOpen, setAllOpportunitiesModalOpen]);

  // Filter signals
  const filteredSignals = useMemo(() => {
    const q = searchQuery.trim().toUpperCase();

    return signals.filter((s) => {
      // Search query
      if (q && !s.symbol.toUpperCase().includes(q) && !s.strategy.toUpperCase().includes(q)) {
        return false;
      }
      // Direction
      if (directionFilter !== 'ALL' && s.type !== directionFilter) {
        return false;
      }
      // Category
      if (categoryFilter === 'HYPERLIQUID' && s.categoryTag !== 'PERP') {
        return false;
      }
      if (categoryFilter === 'MEMES' && s.categoryTag !== 'MEME') {
        return false;
      }
      if (categoryFilter === 'BINANCE' && s.categoryTag !== 'SPOT') {
        return false;
      }
      // Freshness
      if (freshOnly && (s.candlesAgo ?? 99) > 2) {
        return false;
      }
      return true;
    });
  }, [signals, searchQuery, directionFilter, categoryFilter, freshOnly]);

  const stats = useMemo(() => {
    const total = signals.length;
    const buys = signals.filter((s) => s.type === 'BUY').length;
    const sells = signals.filter((s) => s.type === 'SELL').length;
    const perps = signals.filter((s) => s.categoryTag === 'PERP').length;
    const memes = signals.filter((s) => s.categoryTag === 'MEME').length;
    return { total, buys, sells, perps, memes };
  }, [signals]);

  if (!isAllOpportunitiesModalOpen) return null;

  // Handle click on opportunity to jump directly to chart
  const handleSelectOpportunity = (sig: EnrichedTradingSignal) => {
    setSymbol(sig.symbol);
    setTimeframe(sig.timeframe);
    setSelectedSignal(sig);
    setAllOpportunitiesModalOpen(false);
  };

  const handleExecutePaperTrade = (sig: EnrichedTradingSignal, e: React.MouseEvent) => {
    e.stopPropagation();
    executePaperTrade(sig, 100, 'MARKET');
    setFeedbackMsg({
      type: 'ok',
      text: `✅ Orden Paper ${sig.type} ejecutada en ${sig.symbol} a $${sig.price}`,
    });
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  const handleOpenCalculator = (sig: EnrichedTradingSignal, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedSignal(sig);
    setCalculatorModalOpen(true);
  };

  const formatPrice = (p?: number) => {
    if (!p && p !== 0) return '0.00';
    if (p < 0.00001) return p.toFixed(8);
    if (p < 0.001) return p.toFixed(6);
    if (p < 1) return p.toFixed(6);
    if (p < 10) return p.toFixed(4);
    if (p < 1000) return p.toFixed(2);
    return p.toFixed(2);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200 select-none">
      <div
        className={`relative w-full bg-[#08090d] border border-white/[0.1] rounded-2xl flex flex-col shadow-2xl overflow-hidden text-xs font-mono transition-all duration-200 ${
          isFullscreen ? 'w-full h-full max-w-none max-h-none rounded-none' : 'max-w-6xl h-[90vh] max-h-[820px]'
        }`}
      >
        {/* Modal Top Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.08] bg-[#050608]/95 shrink-0 gap-3">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 shadow-sm shadow-emerald-500/20">
              <Zap className="w-4 h-4 fill-emerald-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2 flex-wrap">
                <span className="font-bold text-sm tracking-wide text-white">
                  RADAR GLOBAL: TODAS LAS OPORTUNIDADES VIGENTES
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  {stats.total} Oportunidades Vivas
                </span>
              </div>
              <p className="text-[10px] text-slate-400 truncate">
                Escaneo multi-par en tiempo real. Todas las señales activas de Hyperliquid Perps, Memes y Binance juntas en una sola vista.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {/* Run Scan Button */}
            <button
              onClick={() => runScan(scanTimeframe, categoryFilter)}
              disabled={isScanning}
              className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs flex items-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50 shadow-md shadow-emerald-500/15"
              title="Volver a escanear todos los pares del mercado"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isScanning ? 'Escaneando...' : 'Escanear Ahora'}</span>
            </button>

            {/* View Mode Toggle */}
            <div className="hidden sm:flex items-center bg-white/[0.04] p-0.5 rounded-lg border border-white/[0.08]">
              <button
                onClick={() => setViewStyle('cards')}
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                  viewStyle === 'cards' ? 'bg-white text-black' : 'text-slate-400 hover:text-white'
                }`}
                title="Vista en tarjetas"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewStyle('table')}
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                  viewStyle === 'table' ? 'bg-white text-black' : 'text-slate-400 hover:text-white'
                }`}
                title="Vista en tabla"
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Fullscreen Toggle */}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white transition-colors cursor-pointer hidden md:block"
              title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Close */}
            <button
              onClick={() => setAllOpportunitiesModalOpen(false)}
              className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Cerrar ventana"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Feedback Alert if executed */}
        {feedbackMsg && (
          <div
            className={`px-4 py-2 flex items-center space-x-2 text-xs border-b ${
              feedbackMsg.type === 'ok'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{feedbackMsg.text}</span>
          </div>
        )}

        {/* Live Scan Progress Bar */}
        {isScanning && (
          <div className="bg-emerald-950/30 border-b border-emerald-500/20 px-4 py-2 shrink-0">
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Escaneando: <span className="text-white font-bold">{scanProgress.currentSymbol}</span>
              </span>
              <span className="text-slate-400">
                {scanProgress.scannedCount} de {scanProgress.totalCount} pares ({scanProgress.percent}%) •{' '}
                <b className="text-emerald-400">{scanProgress.foundCount} encontradas</b>
              </span>
            </div>
            <div className="w-full h-1.5 bg-black/50 rounded-full overflow-hidden border border-white/5">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all duration-150"
                style={{ width: `${scanProgress.percent}%` }}
              />
            </div>
          </div>
        )}

        {/* Filter Toolbar Bar */}
        <div className="px-4 py-2.5 bg-[#0b0c10] border-b border-white/[0.06] flex items-center justify-between flex-wrap gap-2.5 shrink-0">
          {/* Left filters: Category & Timeframe */}
          <div className="flex items-center space-x-2 flex-wrap gap-y-1.5">
            {/* Timeframe pill selector */}
            <div className="flex items-center bg-white/[0.03] p-0.5 rounded-lg border border-white/[0.08]">
              {(['1m', '5m', '15m', '1h'] as Timeframe[]).map((tf) => (
                <button
                  key={tf}
                  onClick={() => {
                    setScanTimeframe(tf);
                    runScan(tf, categoryFilter);
                  }}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                    scanTimeframe === tf
                      ? 'bg-emerald-500 text-black shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>

            {/* Category tabs */}
            <div className="flex items-center bg-white/[0.03] p-0.5 rounded-lg border border-white/[0.08]">
              <button
                onClick={() => setCategoryFilter('ALL')}
                className={`px-2.5 py-0.5 rounded-md text-[10px] font-medium transition-all cursor-pointer ${
                  categoryFilter === 'ALL'
                    ? 'bg-white text-black font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Todos ({stats.total})
              </button>
              <button
                onClick={() => setCategoryFilter('HYPERLIQUID')}
                className={`px-2.5 py-0.5 rounded-md text-[10px] font-medium transition-all cursor-pointer ${
                  categoryFilter === 'HYPERLIQUID'
                    ? 'bg-cyan-500 text-black font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Perps ({stats.perps})
              </button>
              <button
                onClick={() => setCategoryFilter('MEMES')}
                className={`px-2.5 py-0.5 rounded-md text-[10px] font-medium transition-all cursor-pointer ${
                  categoryFilter === 'MEMES'
                    ? 'bg-amber-500 text-black font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Memes ({stats.memes})
              </button>
              <button
                onClick={() => setCategoryFilter('BINANCE')}
                className={`px-2.5 py-0.5 rounded-md text-[10px] font-medium transition-all cursor-pointer ${
                  categoryFilter === 'BINANCE'
                    ? 'bg-emerald-500 text-black font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Binance Spot
              </button>
            </div>

            {/* Direction filter */}
            <div className="flex items-center bg-white/[0.03] p-0.5 rounded-lg border border-white/[0.08]">
              <button
                onClick={() => setDirectionFilter('ALL')}
                className={`px-2 py-0.5 rounded-md text-[10px] transition-all cursor-pointer ${
                  directionFilter === 'ALL' ? 'bg-white/10 text-white font-bold' : 'text-slate-400'
                }`}
              >
                Ambos
              </button>
              <button
                onClick={() => setDirectionFilter('BUY')}
                className={`px-2 py-0.5 rounded-md text-[10px] transition-all cursor-pointer ${
                  directionFilter === 'BUY'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-bold'
                    : 'text-slate-400 hover:text-emerald-400'
                }`}
              >
                BUY ({stats.buys})
              </button>
              <button
                onClick={() => setDirectionFilter('SELL')}
                className={`px-2 py-0.5 rounded-md text-[10px] transition-all cursor-pointer ${
                  directionFilter === 'SELL'
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 font-bold'
                    : 'text-slate-400 hover:text-rose-400'
                }`}
              >
                SELL ({stats.sells})
              </button>
            </div>

            {/* Fresh only filter */}
            <button
              onClick={() => setFreshOnly(!freshOnly)}
              className={`px-2.5 py-1 rounded-lg text-[10px] border flex items-center space-x-1 transition-all cursor-pointer ${
                freshOnly
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 font-bold'
                  : 'bg-white/[0.02] border-white/[0.08] text-slate-400 hover:text-white'
              }`}
              title="Filtrar solo oportunidades recién activadas (menos de 2 velas de antigüedad)"
            >
              <Flame className="w-3 h-3 text-amber-400" />
              <span>Recién Activadas</span>
            </button>
          </div>

          {/* Search Input */}
          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-48">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Buscar par (BTC, SOL...)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg pl-8 pr-3 py-1 text-white text-xs placeholder-slate-500 outline-none focus:border-emerald-500/50"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs cursor-pointer"
                >
                  ×
                </button>
              )}
            </div>

            <span className="text-[10px] text-slate-500 whitespace-nowrap">
              Mostrando <b>{filteredSignals.length}</b> de {signals.length}
            </span>
          </div>
        </div>

        {/* Opportunities List Container */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredSignals.length === 0 ? (
            <div className="h-full min-h-[300px] flex flex-col items-center justify-center p-8 text-center border border-dashed border-white/[0.08] rounded-2xl">
              {isScanning ? (
                <>
                  <RefreshCw className="w-10 h-10 text-emerald-400 animate-spin mb-3" />
                  <h4 className="text-white font-bold text-sm mb-1">Escaneando todo el mercado en vivo...</h4>
                  <p className="text-slate-400 max-w-md text-[11px]">
                    Consultando velas de 1m y analizando cruces EMA, bandas de Bollinger, sobreventa RSI y SuperTrend en más de 50 pares.
                  </p>
                </>
              ) : (
                <>
                  <Zap className="w-10 h-10 text-slate-600 mb-3" />
                  <h4 className="text-white font-bold text-sm mb-1">
                    No hay oportunidades activas con los filtros actuales
                  </h4>
                  <p className="text-slate-400 max-w-md text-[11px] mb-4">
                    Prueba cambiando de temporalidad (1m o 5m) o haz clic abajo para lanzar un nuevo escaneo profundo en todos los mercados.
                  </p>
                  <button
                    onClick={() => runScan(scanTimeframe, categoryFilter)}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs flex items-center space-x-1.5 transition-all cursor-pointer shadow-lg shadow-emerald-500/20"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Lanzar Escaneo Completo Ahora</span>
                  </button>
                </>
              )}
            </div>
          ) : viewStyle === 'cards' ? (
            /* Cards Grid View */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {filteredSignals.map((sig) => {
                const isBuy = sig.type === 'BUY';
                const isFresh = (sig.candlesAgo ?? 99) <= 2;
                const isTp1Hit = sig.status === 'TP1_HIT';

                return (
                  <div
                    key={sig.id}
                    onClick={() => handleSelectOpportunity(sig)}
                    className="bg-[#0b0c10] hover:bg-[#0f1117] border border-white/[0.08] hover:border-emerald-500/40 rounded-xl p-3.5 flex flex-col justify-between gap-2.5 transition-all cursor-pointer group shadow-sm hover:shadow-emerald-500/5 relative overflow-hidden"
                  >
                    {/* Glowing side accent */}
                    <div
                      className={`absolute left-0 top-0 bottom-0 w-1 ${
                        isBuy ? 'bg-emerald-500' : 'bg-rose-500'
                      }`}
                    />

                    {/* Top Row: Symbol, Category, Type, Candles Ago */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center space-x-2 min-w-0">
                        <span className="font-bold text-sm text-white group-hover:text-emerald-300 transition-colors truncate">
                          {sig.symbol}
                        </span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                            sig.categoryTag === 'MEME'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : sig.categoryTag === 'PERP'
                              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                              : 'bg-slate-700 text-slate-300'
                          }`}
                        >
                          {sig.categoryTag}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {sig.timeframe}
                        </span>
                      </div>

                      <div className="flex items-center space-x-1.5 shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center space-x-1 ${
                            isBuy
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {isBuy ? (
                            <TrendingUp className="w-3 h-3" />
                          ) : (
                            <TrendingDown className="w-3 h-3" />
                          )}
                          <span>{sig.type}</span>
                        </span>

                        {isFresh && (
                          <span
                            className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0"
                            title="Recién activada (en las últimas 2 velas)"
                          />
                        )}
                      </div>
                    </div>

                    {/* Strategy & Status Row */}
                    <div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-white font-semibold truncate">
                          {sig.strategy}
                        </span>
                        <span
                          className={`text-[10px] font-bold shrink-0 ml-1 ${
                            isTp1Hit ? 'text-cyan-400' : 'text-emerald-400'
                          }`}
                        >
                          {isTp1Hit ? '● TP1 TOCADO' : '● VIGENTE'}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">
                        {sig.reason}
                      </p>
                    </div>

                    {/* Price Targets Matrix */}
                    <div className="grid grid-cols-4 gap-1.5 p-2 rounded-lg bg-black/40 border border-white/[0.05] text-[10px]">
                      <div>
                        <span className="text-slate-500 block text-[9px] uppercase">Entrada</span>
                        <span className="font-bold text-white font-mono truncate block">
                          ${formatPrice(sig.price)}
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-500 block text-[9px] uppercase">Stop Loss</span>
                        <span className="font-bold text-rose-400 font-mono truncate block">
                          ${formatPrice(sig.stopLoss)}
                        </span>
                        <span className="text-[9px] text-rose-400/80 block">
                          -{sig.riskPercent}%
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-500 block text-[9px] uppercase">Target 1</span>
                        <span className="font-bold text-emerald-400 font-mono truncate block">
                          ${formatPrice(sig.takeProfit1)}
                        </span>
                        <span className="text-[9px] text-emerald-400/80 block">
                          +{sig.roiTp1Percent}%
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-500 block text-[9px] uppercase">R:R Ratio</span>
                        <span className="font-bold text-cyan-300 font-mono block">
                          {sig.riskReward ? sig.riskReward.split('/')[0].trim() : '1:1.5'}
                        </span>
                        <span className="text-[9px] text-slate-400 block truncate">
                          TP2: +{sig.roiTp2Percent}%
                        </span>
                      </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="flex items-center justify-between pt-1 border-t border-white/[0.05] text-[10px]">
                      <span className="text-slate-500">
                        {sig.candlesAgo !== undefined ? `Hace ${sig.candlesAgo} vela(s)` : 'En vivo'}
                      </span>

                      <div className="flex items-center space-x-1.5">
                        <button
                          onClick={(e) => handleOpenCalculator(sig, e)}
                          className="px-2 py-1 rounded bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white transition-colors cursor-pointer"
                          title="Abrir calculadora de riesgo"
                        >
                          <Calculator className="w-3 h-3" />
                        </button>

                        <button
                          onClick={(e) => handleExecutePaperTrade(sig, e)}
                          className="px-2 py-1 rounded bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 transition-colors font-semibold cursor-pointer"
                          title="Simular trade con 1 clic"
                        >
                          Simular
                        </button>

                        <button
                          onClick={() => handleSelectOpportunity(sig)}
                          className="px-2.5 py-1 rounded bg-white text-black font-bold hover:bg-slate-200 transition-colors flex items-center space-x-1 cursor-pointer"
                        >
                          <span>Ver Gráfico</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Compact Table View */
            <div className="border border-white/[0.08] rounded-xl overflow-x-auto bg-[#0b0c10]">
              <table className="w-full text-left border-collapse">
                <thead className="bg-[#050608] text-[10px] uppercase text-slate-400 border-b border-white/[0.06]">
                  <tr>
                    <th className="py-2.5 px-3">Par / Token</th>
                    <th className="py-2.5 px-2">Tipo</th>
                    <th className="py-2.5 px-3">Estrategia</th>
                    <th className="py-2.5 px-2">Velas</th>
                    <th className="py-2.5 px-2">Entrada</th>
                    <th className="py-2.5 px-2">Stop Loss</th>
                    <th className="py-2.5 px-2">Take Profit 1</th>
                    <th className="py-2.5 px-2">R:R</th>
                    <th className="py-2.5 px-2">ROI Potencial</th>
                    <th className="py-2.5 px-3">Condición</th>
                    <th className="py-2.5 px-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04] text-[11px]">
                  {filteredSignals.map((sig) => {
                    const isBuy = sig.type === 'BUY';
                    return (
                      <tr
                        key={sig.id}
                        onClick={() => handleSelectOpportunity(sig)}
                        className="hover:bg-white/[0.03] transition-colors cursor-pointer group"
                      >
                        <td className="py-2.5 px-3">
                          <div className="flex items-center space-x-1.5">
                            <span className="font-bold text-white group-hover:text-emerald-400 transition-colors">
                              {sig.symbol}
                            </span>
                            <span
                              className={`px-1 py-0.2 rounded text-[8px] font-bold ${
                                sig.categoryTag === 'MEME'
                                  ? 'bg-amber-500/20 text-amber-300'
                                  : sig.categoryTag === 'PERP'
                                  ? 'bg-cyan-500/20 text-cyan-300'
                                  : 'bg-slate-700 text-slate-300'
                              }`}
                            >
                              {sig.categoryTag}
                            </span>
                          </div>
                        </td>

                        <td className="py-2.5 px-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              isBuy ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                            }`}
                          >
                            {sig.type}
                          </span>
                        </td>

                        <td className="py-2.5 px-3 font-medium text-slate-200">
                          {sig.strategy}
                        </td>

                        <td className="py-2.5 px-2 text-slate-400 font-mono text-[10px]">
                          {sig.timeframe} • {sig.candlesAgo !== undefined ? `${sig.candlesAgo}v` : '0v'}
                        </td>

                        <td className="py-2.5 px-2 font-mono text-white font-bold">
                          ${formatPrice(sig.price)}
                        </td>

                        <td className="py-2.5 px-2 font-mono text-rose-400">
                          ${formatPrice(sig.stopLoss)}{' '}
                          <span className="text-[9px] text-rose-400/70">(-{sig.riskPercent}%)</span>
                        </td>

                        <td className="py-2.5 px-2 font-mono text-emerald-400">
                          ${formatPrice(sig.takeProfit1)}{' '}
                          <span className="text-[9px] text-emerald-400/70">(+{sig.roiTp1Percent}%)</span>
                        </td>

                        <td className="py-2.5 px-2 font-mono text-cyan-300">
                          {sig.riskReward ? sig.riskReward.split('/')[0].trim() : '1:1.5'}
                        </td>

                        <td className="py-2.5 px-2 text-emerald-400 font-bold">
                          +{sig.roiTp1Percent}%
                        </td>

                        <td className="py-2.5 px-3 text-slate-400 text-[10px] max-w-xs truncate">
                          {sig.reason}
                        </td>

                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={() => handleSelectOpportunity(sig)}
                            className="px-2.5 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-[10px] transition-colors cursor-pointer"
                          >
                            Ver Gráfico
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

        {/* Modal Bottom Status Bar */}
        <div className="px-5 py-2.5 bg-[#050608] border-t border-white/[0.07] flex items-center justify-between text-[11px] text-slate-400 shrink-0">
          <div className="flex items-center space-x-3">
            <span>
              Último escaneo:{' '}
              <b className="text-white">
                {lastScanTime ? new Date(lastScanTime).toLocaleTimeString() : 'Pendiente'}
              </b>
            </span>
            <span className="hidden sm:inline text-slate-600">•</span>
            <span className="hidden sm:inline">
              Estrategias evaluadas: EMA Cross, Bollinger Reversal, RSI Rebound, SuperTrend
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                setAllOpportunitiesModalOpen(false);
                setHyperliquidModalOpen(true);
              }}
              className="text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Zap className="w-3 h-3" />
              <span>Abrir Bot Scalper 24/7 en VPS</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
