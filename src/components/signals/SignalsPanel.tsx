'use client';

import React, { useState, useMemo } from 'react';
import { useTradingStore } from '@/store/useTradingStore';
import {
  Bell,
  ChevronDown,
  Maximize2,
  Minimize2,
  TrendingUp,
  TrendingDown,
  Target,
  Shield,
  Clock,
  Zap,
  Calculator,
  Wallet,
  Trash2,
  XCircle,
  Send,
  Sparkles,
  RefreshCw,
  Globe,
  ArrowRight,
} from 'lucide-react';
import { TradingSignal } from '@/types';
import { scanAllMarketOpportunities } from '@/services/signals/market-scanner';

export const SignalsPanel: React.FC = () => {
  const {
    signals,
    isSignalsPanelOpen,
    setSignalsPanelOpen,
    currentSymbol,
    currentTimeframe,
    selectedSignal,
    setSelectedSignal,
    setCalculatorModalOpen,
    executePaperTrade,
    setWalletModalOpen,
    dismissedSignalIds,
    dismissSignal,
    dismissAllExpiredSignals,
    dismissAllSignalsForCurrentSymbol,
    signalFilterTab,
    setSignalFilterTab,
    setTelegramModalOpen,
    telegramConfig,
    setSymbol,
    setTimeframe,
    setAllOpportunitiesModalOpen,
    globalActiveSignals,
    setGlobalActiveSignals,
    isScanningGlobalOpportunities,
    setIsScanningGlobalOpportunities,
    activeOpportunityViewMode,
    setActiveOpportunityViewMode,
  } = useTradingStore();

  const [panelHeight, setPanelHeight] = useState<'normal' | 'expanded'>('normal');
  const [panelHeightPx, setPanelHeightPx] = useState<number>(240);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [filterType, setFilterType] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [selectedStrategyFilter, setSelectedStrategyFilter] = useState<string>('ALL');
  const [simulatedCapital, setSimulatedCapital] = useState<number>(100);
  const [executedStatus, setExecutedStatus] = useState<Record<string, 'MARKET' | 'LIMIT'>>({});

  // Extract unique strategies from signals
  const strategiesList = useMemo(() => {
    const set = new Set<string>();
    signals.forEach((s) => set.add(s.strategy));
    return Array.from(set);
  }, [signals]);

  // Available signals (excluding dismissed ones)
  const availableSignals = useMemo(() => {
    return signals.filter((s) => !dismissedSignalIds.includes(s.id));
  }, [signals, dismissedSignalIds]);

  // Active / Valid signals count: ONLY signals that are strictly ACTIVE or TP1_HIT
  const activeSignalsCount = useMemo(() => {
    return availableSignals.filter(
      (s) => s.status === 'ACTIVE' || s.status === 'TP1_HIT'
    ).length;
  }, [availableSignals]);

  // Filtered signals: based on active Tab, Type, and Strategy
  const filteredSignals = useMemo(() => {
    let list = availableSignals;

    if (signalFilterTab === 'ACTIVE') {
      list = list.filter((s) => s.status === 'ACTIVE' || s.status === 'TP1_HIT');
    } else if (signalFilterTab === 'RECENT') {
      list = list.slice(0, 5);
    }

    return list.filter((s) => {
      const matchType = filterType === 'ALL' || s.type === filterType;
      const matchStrategy =
        selectedStrategyFilter === 'ALL' || s.strategy === selectedStrategyFilter;
      return matchType && matchStrategy;
    });
  }, [availableSignals, signalFilterTab, filterType, selectedStrategyFilter]);

  const handleScanGlobal = async () => {
    setIsScanningGlobalOpportunities(true);
    try {
      const res = await scanAllMarketOpportunities({
        timeframe: currentTimeframe,
        maxPairs: 50,
      });
      setGlobalActiveSignals(res);
    } catch (e) {
      console.error('Error scanning global opportunities:', e);
    } finally {
      setIsScanningGlobalOpportunities(false);
    }
  };

  const displayedSignals = useMemo(() => {
    if (activeOpportunityViewMode === 'ALL_SYMBOLS') {
      return (globalActiveSignals as TradingSignal[]).filter((s) => {
        const matchType = filterType === 'ALL' || s.type === filterType;
        const matchStrategy =
          selectedStrategyFilter === 'ALL' || s.strategy === selectedStrategyFilter;
        return matchType && matchStrategy;
      });
    }
    return filteredSignals;
  }, [activeOpportunityViewMode, globalActiveSignals, filteredSignals, filterType, selectedStrategyFilter]);

  if (!isSignalsPanelOpen) return null;

  const handleOpenCalculator = (sig: TradingSignal, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedSignal(sig);
    setCalculatorModalOpen(true);
  };

  const formatPrice = (p: number) => {
    if (!p && p !== 0) return '0.00';
    if (p < 0.00001) return p.toFixed(8);
    if (p < 0.001) return p.toFixed(6);
    if (p < 1) return p.toFixed(6);
    if (p < 10) return p.toFixed(4);
    if (p < 1000) return p.toFixed(2);
    return p.toFixed(2);
  };

  const formatSignalDate = (rawTime: number | string | undefined) => {
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
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month} ${hours}:${mins}`;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const startY = e.clientY;
    const startH = panelHeightPx;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = startY - moveEvent.clientY;
      const newH = Math.min(Math.max(startH + delta, 120), window.innerHeight - 140);
      setPanelHeightPx(newH);
    };

    const onMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    const startY = touch.clientY;
    const startH = panelHeightPx;

    const onTouchMove = (moveEvent: TouchEvent) => {
      const delta = startY - moveEvent.touches[0].clientY;
      const newH = Math.min(Math.max(startH + delta, 120), window.innerHeight - 140);
      setPanelHeightPx(newH);
    };

    const onTouchEnd = () => {
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };

    window.addEventListener('touchmove', onTouchMove);
    window.addEventListener('touchend', onTouchEnd);
  };

  const toggleHeightPreset = () => {
    if (panelHeightPx < 200) {
      setPanelHeightPx(260);
      setPanelHeight('normal');
    } else if (panelHeightPx < 380) {
      setPanelHeightPx(440);
      setPanelHeight('expanded');
    } else {
      setPanelHeightPx(180);
      setPanelHeight('normal');
    }
  };

  return (
    <div
      style={{ height: `${panelHeightPx}px` }}
      className={`bg-[#050608]/95 backdrop-blur-2xl border-t border-white/[0.07] flex flex-col select-none z-20 transition-all ${
        isDragging ? 'duration-0' : 'duration-150'
      }`}
    >
      {/* Draggable Resizer Bar */}
      <div
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onDoubleClick={toggleHeightPreset}
        className="h-2 w-full bg-transparent hover:bg-[#229ED9]/20 active:bg-[#229ED9]/50 cursor-row-resize flex items-center justify-center transition-colors group shrink-0"
        title="Arrastra para cambiar la altura del panel (Doble clic para alternar tamaño)"
      >
        <div className="w-12 h-1 rounded-full bg-white/20 group-hover:bg-[#229ED9] group-active:bg-[#229ED9] transition-colors" />
      </div>

      {/* Header Bar - Single line, never hides buttons, scrolls smoothly if screen is narrow */}
      <div className="h-10 min-h-[40px] bg-white/[0.01] px-3 border-b border-white/[0.07] flex items-center justify-between flex-nowrap overflow-x-auto no-scrollbar gap-2 shrink-0">
        <div className="flex items-center space-x-2 shrink-0">
          <div className="flex items-center space-x-1 font-mono text-xs font-medium tracking-wider text-white">
            <Zap className="w-3.5 h-3.5 text-white" />
            <span className="hidden sm:inline">OPORTUNIDADES</span>
          </div>

          {/* Mode Switcher: Single Symbol vs All Symbols */}
          <div className="flex items-center bg-white/[0.04] p-0.5 rounded-lg border border-white/[0.08]">
            <button
              onClick={() => setActiveOpportunityViewMode('CURRENT_SYMBOL')}
              className={`flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-mono transition-all cursor-pointer ${
                activeOpportunityViewMode === 'CURRENT_SYMBOL'
                  ? 'bg-white text-black font-semibold shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
              title={`Ver oportunidades exclusivas de ${currentSymbol}`}
            >
              <span>{currentSymbol}</span>
            </button>

            <button
              onClick={() => {
                setActiveOpportunityViewMode('ALL_SYMBOLS');
                if (globalActiveSignals.length === 0 && !isScanningGlobalOpportunities) {
                  handleScanGlobal();
                }
              }}
              className={`flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-mono transition-all cursor-pointer ${
                activeOpportunityViewMode === 'ALL_SYMBOLS'
                  ? 'bg-emerald-500 text-black font-semibold shadow-xs'
                  : 'text-emerald-400 hover:text-white hover:bg-emerald-500/10'
              }`}
              title="Ver oportunidades de TODOS los tokens juntos (Multipar)"
            >
              <Globe className="w-3 h-3" />
              <span>Todos ({globalActiveSignals.length})</span>
            </button>
          </div>

          {/* Dedicated Window Modal Button */}
          <button
            onClick={() => setAllOpportunitiesModalOpen(true)}
            className="flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-[10px] font-mono font-semibold transition-all cursor-pointer shadow-xs"
            title="Abrir ventana flotante completa con radar, filtros y gráficos"
          >
            <Sparkles className="w-3 h-3 text-emerald-400" />
            <span>⚡ Ventana Todas Juntas</span>
          </button>

          {activeOpportunityViewMode === 'ALL_SYMBOLS' ? (
            <button
              onClick={handleScanGlobal}
              disabled={isScanningGlobalOpportunities}
              className="flex items-center space-x-1 px-2 py-0.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 text-[10px] font-mono border border-white/[0.08] cursor-pointer disabled:opacity-50"
              title="Volver a escanear todo el mercado"
            >
              <RefreshCw className={`w-3 h-3 ${isScanningGlobalOpportunities ? 'animate-spin' : ''}`} />
              <span className="hidden md:inline">{isScanningGlobalOpportunities ? 'Escaneando...' : 'Re-escanear'}</span>
            </button>
          ) : (
            <>
              {/* Tab Selector: Solo Vigentes vs Recientes vs Histórico */}
              <div className="flex items-center bg-white/[0.02] p-0.5 rounded-lg border border-white/[0.06]">
                <button
                  onClick={() => setSignalFilterTab('ACTIVE')}
                  className={`flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-mono transition-all cursor-pointer ${
                    signalFilterTab === 'ACTIVE'
                      ? 'bg-white text-black font-semibold shadow-xs'
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                  }`}
                  title="Muestra solo oportunidades vivas"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
                  <span>Vigentes ({activeSignalsCount})</span>
                </button>

                <button
                  onClick={() => setSignalFilterTab('RECENT')}
                  className={`flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-mono transition-all cursor-pointer ${
                    signalFilterTab === 'RECENT'
                      ? 'bg-white text-black font-semibold shadow-xs'
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                  }`}
                  title="Muestra las últimas 5 oportunidades"
                >
                  <span>Últimas 5</span>
                </button>

                <button
                  onClick={() => setSignalFilterTab('ALL')}
                  className={`flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-mono transition-all cursor-pointer ${
                    signalFilterTab === 'ALL'
                      ? 'bg-white text-black font-semibold shadow-xs'
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                  }`}
                  title="Historial completo"
                >
                  <span>Historial ({availableSignals.length})</span>
                </button>
              </div>
            </>
          )}

          {/* Quick Clear Buttons */}
          <div className="flex items-center space-x-1">
            <button
              onClick={() => dismissAllExpiredSignals()}
              className="flex items-center space-x-1 px-1.5 py-0.5 rounded-md bg-white/[0.02] hover:bg-white/[0.06] text-slate-400 hover:text-white border border-white/[0.06] text-[10px] font-mono transition-colors cursor-pointer"
              title="Limpiar señales expiradas"
            >
              <Trash2 className="w-3 h-3" />
              <span className="hidden md:inline">Pasadas</span>
            </button>

            <button
              onClick={() => dismissAllSignalsForCurrentSymbol()}
              className="flex items-center space-x-1 px-1.5 py-0.5 rounded-md bg-white/[0.02] hover:bg-[#f43f5e]/20 text-slate-400 hover:text-[#f43f5e] border border-white/[0.06] hover:border-[#f43f5e]/30 text-[10px] font-mono transition-colors cursor-pointer"
              title="Limpiar todo"
            >
              <XCircle className="w-3 h-3" />
              <span className="hidden md:inline">Todo</span>
            </button>
          </div>
        </div>

        {/* Controls: Capital Simulator + Filters + Height Toggles */}
        <div className="flex items-center space-x-1.5 text-xs shrink-0">
          {/* Capital Simulator Box */}
          <div className="flex items-center space-x-1 bg-white/[0.02] px-1.5 py-0.5 rounded-md border border-white/[0.06] text-slate-400">
            <span className="text-[10px] font-mono">Monto:</span>
            <span className="font-mono text-white text-xs">$</span>
            <input
              type="number"
              value={simulatedCapital}
              onChange={(e) => setSimulatedCapital(Math.max(1, Number(e.target.value)))}
              className="w-10 bg-transparent text-white font-mono text-xs focus:outline-none"
              title="Capital por operación"
            />
          </div>

          {/* Type Filter */}
          <div className="flex items-center bg-white/[0.02] p-0.5 rounded-md border border-white/[0.06]">
            <button
              onClick={() => setFilterType('ALL')}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-all cursor-pointer ${
                filterType === 'ALL' ? 'bg-white text-black font-semibold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Todas
            </button>
            <button
              onClick={() => setFilterType('BUY')}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-all cursor-pointer ${
                filterType === 'BUY' ? 'bg-[#10b981]/20 text-[#10b981] font-semibold' : 'text-slate-400 hover:text-[#10b981]'
              }`}
            >
              BUY
            </button>
            <button
              onClick={() => setFilterType('SELL')}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-all cursor-pointer ${
                filterType === 'SELL' ? 'bg-[#f43f5e]/20 text-[#f43f5e] font-semibold' : 'text-slate-400 hover:text-[#f43f5e]'
              }`}
            >
              SELL
            </button>
          </div>

          {/* Strategy Select Filter */}
          <select
            value={selectedStrategyFilter}
            onChange={(e) => setSelectedStrategyFilter(e.target.value)}
            className="bg-[#08090d] text-slate-300 border border-white/[0.07] rounded-md px-1.5 py-1 text-[10px] font-mono focus:outline-none max-w-[110px] truncate"
          >
            <option value="ALL">Todas</option>
            {strategiesList.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>

          {/* Telegram Alerts Button */}
          <button
            onClick={() => setTelegramModalOpen(true)}
            className={`flex items-center space-x-1 px-2 py-1 rounded-md border text-[10px] font-mono transition-colors cursor-pointer ${
              telegramConfig.isEnabled && telegramConfig.chatId
                ? 'bg-[#229ED9]/15 border-[#229ED9]/30 text-[#229ED9]'
                : 'bg-white/[0.03] hover:bg-white/[0.08] text-slate-300 border-white/[0.08]'
            }`}
            title="Configurar Alertas Telegram (@Fl4shloanarb_bot)"
          >
            <Send className="w-3 h-3 text-[#229ED9]" />
            <span className="hidden sm:inline">Alertas</span>
          </button>

          {/* Wallet Button */}
          <button
            onClick={() => setWalletModalOpen(true)}
            className="flex items-center space-x-1 px-2 py-1 rounded-md bg-white/[0.03] hover:bg-white/[0.08] text-white border border-white/[0.08] text-[10px] font-mono transition-colors cursor-pointer"
            title="Abrir Billetera"
          >
            <Wallet className="w-3 h-3 text-slate-400" />
            <span className="hidden sm:inline">Billetera</span>
          </button>

          {/* Expand / Minimize / Toggle Height */}
          <button
            onClick={toggleHeightPreset}
            className="p-1 rounded-md hover:bg-white/[0.06] text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Alternar tamaño del panel"
          >
            {panelHeightPx > 300 ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={() => setSignalsPanelOpen(false)}
            className="p-1 rounded-md hover:bg-white/[0.06] text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Ocultar panel"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Signals Table */}
      <div className="flex-1 overflow-x-auto overflow-y-auto">
        {displayedSignals.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-3 p-6 font-mono text-xs">
            <Bell className="w-8 h-8 text-slate-600" />
            {activeOpportunityViewMode === 'ALL_SYMBOLS' ? (
              <div className="text-center space-y-2">
                <p className="text-slate-300 font-medium">
                  {isScanningGlobalOpportunities
                    ? 'Escaneando todos los tokens del mercado en paralelo...'
                    : 'No hay oportunidades multipar cargadas todavía.'}
                </p>
                <p className="text-slate-500 text-[11px] max-w-sm">
                  Haz clic abajo para buscar oportunidades vivas en 50+ tokens (Hyperliquid Perps, memes y Binance spot).
                </p>
                <div className="flex items-center justify-center space-x-2 pt-2">
                  <button
                    onClick={handleScanGlobal}
                    disabled={isScanningGlobalOpportunities}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-black font-semibold hover:bg-emerald-400 transition-colors cursor-pointer shadow-sm disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isScanningGlobalOpportunities ? 'animate-spin' : ''}`} />
                    <span>{isScanningGlobalOpportunities ? 'Escaneando Mercado...' : 'Escanear Todo el Mercado'}</span>
                  </button>
                  <button
                    onClick={() => setAllOpportunitiesModalOpen(true)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-white font-medium hover:bg-white/15 transition-colors cursor-pointer border border-white/20"
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span>Abrir Ventana Radar</span>
                  </button>
                </div>
              </div>
            ) : (
              <span>
                {signalFilterTab === 'ACTIVE'
                  ? `No hay oportunidades activas pendientes en ${currentSymbol}.`
                  : 'No se encontraron señales con los filtros seleccionados.'}
              </span>
            )}
          </div>
        ) : (
          <table className="w-full text-left text-xs font-mono">
            <thead className="sticky top-0 bg-[#08090d]/95 backdrop-blur-md text-slate-500 border-b border-white/[0.07] text-[10px] uppercase tracking-wider z-10">
              <tr>
                {activeOpportunityViewMode === 'ALL_SYMBOLS' && (
                  <th className="py-2 px-3 font-normal text-white">Par / Token</th>
                )}
                <th className="py-2 px-3 font-normal">Tipo / Estado</th>
                <th className="py-2 px-3 font-normal">Estrategia</th>
                <th className="py-2 px-3 font-normal">Hora</th>
                <th className="py-2 px-3 font-normal text-white">Entrada</th>
                <th className="py-2 px-3 font-normal text-[#f43f5e]">Stop Loss</th>
                <th className="py-2 px-3 font-normal text-[#10b981]">Take Profit 1</th>
                <th className="py-2 px-3 font-normal text-[#10b981]">Take Profit 2</th>
                <th className="py-2 px-3 font-normal text-white">R:R</th>
                <th className="py-2 px-3 font-normal text-[#f43f5e]">Riesgo (${simulatedCapital})</th>
                <th className="py-2 px-3 font-normal text-[#10b981]">Ganancia (${simulatedCapital})</th>
                <th className="py-2 px-3 font-normal">Condición</th>
                <th className="py-2 px-3 font-normal text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {displayedSignals.map((sig: TradingSignal) => {
                const isBuy = sig.type === 'BUY';

                // Calculations based on simulated capital
                const riskDist = Math.abs(sig.price - sig.stopLoss);
                const riskPct = sig.price > 0 ? riskDist / sig.price : 0.02;

                const tp1Dist = Math.abs(sig.takeProfit1 - sig.price);
                const tp1Pct = sig.price > 0 ? tp1Dist / sig.price : 0.04;

                const dollarLoss = simulatedCapital * riskPct;
                const dollarGainTP1 = simulatedCapital * tp1Pct;

                const isSelected = selectedSignal?.id === sig.id;

                const renderStatusBadge = () => {
                  if (sig.status === 'ACTIVE') {
                    return (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-mono text-[#10b981] bg-[#10b981]/10 border border-[#10b981]/20">
                        VIGENTE
                      </span>
                    );
                  }
                  if (sig.status === 'TP1_HIT') {
                    return (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-mono text-white bg-white/10 border border-white/20">
                        TP1 TOCADO
                      </span>
                    );
                  }
                  if (sig.status === 'TP2_HIT') {
                    return (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-mono text-slate-400 bg-white/[0.03] border border-white/[0.06]">
                        COMPLETADA
                      </span>
                    );
                  }
                  if (sig.status === 'SL_HIT') {
                    return (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-mono text-[#f43f5e] bg-[#f43f5e]/10 border border-[#f43f5e]/20">
                        EXPIRADA (SL)
                      </span>
                    );
                  }
                  return null;
                };

                return (
                  <tr
                    key={sig.id}
                    onClick={() => {
                      setSelectedSignal(sig);
                      if (activeOpportunityViewMode === 'ALL_SYMBOLS') {
                        setSymbol(sig.symbol);
                        if (sig.timeframe) setTimeframe(sig.timeframe);
                      }
                    }}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-white/[0.06] border-l-2 border-l-white'
                        : 'hover:bg-white/[0.02]'
                    }`}
                  >
                    {activeOpportunityViewMode === 'ALL_SYMBOLS' && (
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-bold text-white tracking-wide text-xs">{sig.symbol}</span>
                          {sig.symbol.includes('PERP') ? (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-mono text-cyan-300 bg-cyan-500/10 border border-cyan-500/20">
                              PERP
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-mono text-amber-300 bg-amber-500/10 border border-amber-500/20">
                              SPOT
                            </span>
                          )}
                          {sig.timeframe && (
                            <span className="px-1 py-0.2 rounded text-[9px] font-mono text-slate-400 bg-white/[0.04]">
                              {sig.timeframe}
                            </span>
                          )}
                        </div>
                      </td>
                    )}
                    {/* Estado / Tipo */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <div className="flex items-center space-x-1.5">
                        <span
                          className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-normal ${
                            isBuy
                              ? 'bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20'
                              : 'bg-[#f43f5e]/10 text-[#f43f5e] border border-[#f43f5e]/20'
                          }`}
                        >
                          {isBuy ? (
                            <TrendingUp className="w-3 h-3 mr-1" />
                          ) : (
                            <TrendingDown className="w-3 h-3 mr-1" />
                          )}
                          {sig.type}
                        </span>

                        {renderStatusBadge()}
                      </div>
                    </td>

                    {/* Estrategia */}
                    <td className="py-2.5 px-3 font-normal text-white whitespace-nowrap">
                      {sig.strategy}
                    </td>

                    {/* Hora */}
                    <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap text-[10px] font-mono">
                      {formatSignalDate(sig.timestamp || sig.time)}
                    </td>

                    {/* Precio Entrada */}
                    <td className="py-2.5 px-3 font-normal text-white whitespace-nowrap">
                      ${formatPrice(sig.price)}
                    </td>

                    {/* Stop Loss */}
                    <td className="py-2.5 px-3 text-[#f43f5e] whitespace-nowrap">
                      ${formatPrice(sig.stopLoss)}
                      <span className="text-[10px] text-slate-500 ml-1">
                        (-{(riskPct * 100).toFixed(1)}%)
                      </span>
                    </td>

                    {/* TP1 */}
                    <td className="py-2.5 px-3 text-[#10b981] whitespace-nowrap">
                      ${formatPrice(sig.takeProfit1)}
                      <span className="text-[10px] text-slate-500 ml-1">
                        (+{(tp1Pct * 100).toFixed(1)}%)
                      </span>
                    </td>

                    {/* TP2 */}
                    <td className="py-2.5 px-3 text-[#10b981] whitespace-nowrap">
                      ${formatPrice(sig.takeProfit2)}
                    </td>

                    {/* R:R */}
                    <td className="py-2.5 px-3 text-white font-normal whitespace-nowrap">
                      {sig.riskReward}
                    </td>

                    {/* Pérdida $ */}
                    <td className="py-2.5 px-3 font-normal text-[#f43f5e] whitespace-nowrap">
                      -${dollarLoss.toFixed(2)}
                    </td>

                    {/* Ganancia TP1 $ */}
                    <td className="py-2.5 px-3 font-normal text-[#10b981] whitespace-nowrap">
                      +${dollarGainTP1.toFixed(2)}
                    </td>

                    {/* Motivo */}
                    <td className="py-2.5 px-3 text-slate-400 max-w-xs truncate text-[11px]" title={sig.reason}>
                      {sig.reason}
                    </td>

                    {/* Botones Acción / Descartar */}
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center space-x-1">
                        {executedStatus[sig.id] ? (
                          <span className="px-2.5 py-0.5 rounded text-[10px] font-mono text-[#10b981] bg-[#10b981]/15 border border-[#10b981]/30 animate-pulse">
                            ✓ {executedStatus[sig.id] === 'MARKET' ? 'Ejecutada' : 'Limit Lista'}
                          </span>
                        ) : (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                executePaperTrade(sig, simulatedCapital, 'MARKET');
                                setExecutedStatus((prev) => ({ ...prev, [sig.id]: 'MARKET' }));
                                setTimeout(() => {
                                  setExecutedStatus((prev) => {
                                    const next = { ...prev };
                                    delete next[sig.id];
                                    return next;
                                  });
                                }, 1800);
                              }}
                              className="px-2 py-0.5 bg-white text-black hover:bg-slate-200 rounded text-[10px] font-medium transition-colors cursor-pointer"
                              title="Entrar a mercado inmediatamente sin abrir la billetera"
                            >
                              Mercado
                            </button>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                executePaperTrade(sig, simulatedCapital, 'LIMIT');
                                setExecutedStatus((prev) => ({ ...prev, [sig.id]: 'LIMIT' }));
                                setTimeout(() => {
                                  setExecutedStatus((prev) => {
                                    const next = { ...prev };
                                    delete next[sig.id];
                                    return next;
                                  });
                                }, 1800);
                              }}
                              className="px-2 py-0.5 bg-white/[0.03] hover:bg-white/[0.08] text-white rounded text-[10px] font-normal transition-colors border border-white/[0.08] cursor-pointer"
                              title="Colocar limit"
                            >
                              Limit
                            </button>
                          </>
                        )}

                        <button
                          onClick={(e) => handleOpenCalculator(sig, e)}
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
        )}
      </div>
    </div>
  );
};
