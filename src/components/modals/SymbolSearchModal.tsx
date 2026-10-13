'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useTradingStore } from '@/store/useTradingStore';
import {
  Search,
  X,
  TrendingUp,
  TrendingDown,
  Flame,
  ArrowUpDown,
  Maximize2,
  Minimize2,
  Zap,
  Sparkles,
  Percent,
  Layers,
  ChevronRight,
  Filter,
  Coins,
} from 'lucide-react';
import { Ticker24h } from '@/types';
import { PerformancePeriod, fetchMultiPeriodPerformance } from '@/services/binance/binance-rest';

type CategoryTab = 'all' | 'hyperliquid' | 'gainers' | 'losers' | 'volume' | 'top50' | 'rwa';
type SortField = 'performance' | 'volume' | 'price' | 'symbol';
type SortDir = 'desc' | 'asc';

const TOP_50_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT',
  'SUIUSDT', 'NEARUSDT', 'LINKUSDT', 'PEPEUSDT', 'RENDERUSDT', 'FETUSDT', 'DOTUSDT', 'HEMIUSDT',
  'APTUSDT', 'SHIBUSDT', 'LTCUSDT', 'BCHUSDT', 'UNIUSDT', 'ICPUSDT', 'TAOUSDT', 'AAVEUSDT',
  'POLUSDT', 'TRXUSDT', 'XLMUSDT', 'FILUSDT', 'ATOMUSDT', 'FTMUSDT', 'INJUSDT', 'OPUSDT',
  'ARBUSDT', 'TIAUSDT', 'SEIUSDT', 'WLDUSDT', 'RUNEUSDT', 'KASUSDT', 'STXUSDT', 'GALAUSDT',
  'FLOKIUSDT', 'BONKUSDT', 'WIFUSDT', 'ENAUSDT', 'NOTUSDT', 'JUPUSDT', 'PENDLEUSDT', 'ONDOUSDT',
  'CFXUSDT', 'SANDUSDT'
];

export const SymbolSearchModal: React.FC = () => {
  const {
    isSearchModalOpen,
    setSearchModalOpen,
    setSymbol,
    watchlist,
    currentSymbol,
  } = useTradingStore();

  const [query, setQuery] = useState('');
  const [categoryTab, setCategoryTab] = useState<CategoryTab>('all');
  const [selectedPeriod, setSelectedPeriod] = useState<PerformancePeriod>('24h');
  const [sortField, setSortField] = useState<SortField>('performance');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(100);
  const [perfCache, setPerfCache] = useState<Record<PerformancePeriod, Record<string, number>>>({
    '15m': {},
    '30m': {},
    '24h': {},
    '1M': {},
    '1Y': {},
  });

  // Populate 24h performance cache
  useEffect(() => {
    if (watchlist.length > 0) {
      const cache24h: Record<string, number> = {};
      watchlist.forEach((d) => {
        cache24h[d.symbol] = d.priceChangePercent;
      });
      setPerfCache((prev) => ({ ...prev, '24h': cache24h }));
    }
  }, [watchlist]);

  // Fetch period performance when period changes (15m, 30m)
  useEffect(() => {
    if (selectedPeriod === '24h' || !isSearchModalOpen) return;

    let isMounted = true;
    const fetchPeriod = async () => {
      const symbolsToFetch = watchlist.slice(0, 100).map((w) => w.symbol);
      const data = await fetchMultiPeriodPerformance(symbolsToFetch, selectedPeriod);
      if (isMounted && Object.keys(data).length > 0) {
        setPerfCache((prev) => ({ ...prev, [selectedPeriod]: data }));
      }
    };
    fetchPeriod();
    return () => {
      isMounted = false;
    };
  }, [selectedPeriod, isSearchModalOpen, watchlist]);

  // Close on ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSearchModalOpen) {
        setSearchModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchModalOpen, setSearchModalOpen]);

  // Global Market Stats
  const marketStats = useMemo(() => {
    let gainers = 0;
    let losers = 0;
    let totalVolumeUSDT = 0;
    let maxGainer: Ticker24h | null = null;

    for (let i = 0; i < watchlist.length; i++) {
      const t = watchlist[i];
      totalVolumeUSDT += t.quoteVolume;
      if (t.priceChangePercent >= 0) gainers++;
      else losers++;

      if (!maxGainer || t.priceChangePercent > (maxGainer as Ticker24h).priceChangePercent) {
        maxGainer = t;
      }
    }

    const topSymbol = maxGainer ? (maxGainer as Ticker24h).symbol.replace('USDT', '') : 'BTC';
    const topPct = maxGainer ? (maxGainer as Ticker24h).priceChangePercent.toFixed(1) : '0.0';

    return {
      totalPairs: watchlist.length,
      gainers,
      losers,
      totalVolumeMillions: (totalVolumeUSDT / 1_000_000).toFixed(0),
      topGainerSymbol: topSymbol,
      topGainerPercent: topPct,
    };
  }, [watchlist]);

  // Filtered & Sorted List of 735+ pairs
  const processedList = useMemo(() => {
    const periodCache = perfCache[selectedPeriod] || {};

    const filtered = watchlist.filter((item) => {
      // 1. Text Search Query
      if (query.trim()) {
        const cleanQuery = query.trim().toUpperCase();
        const baseSymbol = item.symbol.replace('USDT', '');
        const matches =
          item.symbol.includes(cleanQuery) ||
          baseSymbol.includes(cleanQuery) ||
          (item.displayName ? item.displayName.toUpperCase().includes(cleanQuery) : false);
        if (!matches) return false;
      }

      // 2. Category Tab Filter
      const pct =
        periodCache[item.symbol] !== undefined
          ? periodCache[item.symbol]
          : item.priceChangePercent;

      if (categoryTab === 'hyperliquid' && !item.isHyperliquid) return false;
      if (categoryTab === 'gainers' && pct < 0) return false;
      if (categoryTab === 'losers' && pct >= 0) return false;
      if (categoryTab === 'top50' && !TOP_50_SYMBOLS.includes(item.symbol)) return false;
      if (categoryTab === 'rwa' && !item.isRWA) return false;

      return true;
    });

    // 3. Sorting
    return filtered.sort((a, b) => {
      const pctA =
        periodCache[a.symbol] !== undefined ? periodCache[a.symbol] : a.priceChangePercent;
      const pctB =
        periodCache[b.symbol] !== undefined ? periodCache[b.symbol] : b.priceChangePercent;

      let comparison = 0;
      if (sortField === 'performance') {
        comparison = pctB - pctA;
      } else if (sortField === 'volume') {
        comparison = b.quoteVolume - a.quoteVolume;
      } else if (sortField === 'price') {
        comparison = b.lastPrice - a.lastPrice;
      } else if (sortField === 'symbol') {
        comparison = a.symbol.localeCompare(b.symbol);
      }

      return sortDir === 'desc' ? comparison : -comparison;
    });
  }, [watchlist, query, categoryTab, selectedPeriod, sortField, sortDir, perfCache]);

  if (!isSearchModalOpen) return null;

  const handleSelect = (symbol: string) => {
    setSymbol(symbol);
    setSearchModalOpen(false);
  };

  const handleSortToggle = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const formatPrice = (p: number) => {
    if (!p && p !== 0) return '0.00';
    if (p < 0.0001) return p.toFixed(8);
    if (p < 0.1) return p.toFixed(6);
    if (p < 10) return p.toFixed(4);
    if (p < 1000) return p.toFixed(2);
    return p.toFixed(2);
  };

  const periods: { label: string; value: PerformancePeriod }[] = [
    { label: '15m', value: '15m' },
    { label: '30m', value: '30m' },
    { label: '24h', value: '24h' },
    { label: '1M', value: '1M' },
    { label: '1A', value: '1Y' },
  ];

  return (
    <div
      className={
        isFullscreen
          ? 'fixed inset-0 z-[70] flex flex-col bg-[#030305] w-screen h-screen overflow-hidden'
          : 'fixed inset-0 z-[70] flex items-center justify-center bg-black/90 backdrop-blur-md p-2 sm:p-4'
      }
    >
      <div
        className={
          isFullscreen
            ? 'w-full h-full flex flex-col overflow-hidden bg-[#050608]'
            : 'w-full max-w-5xl bg-[#050608] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[90vh] max-h-[850px]'
        }
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-white/[0.07] bg-white/[0.01]">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/[0.08] text-white flex items-center justify-center shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-white font-mono text-sm font-medium tracking-wide">
                  EXPLORADOR DE MERCADO
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.04] text-slate-400 border border-white/[0.06]">
                  {marketStats.totalPairs} PARES EN VIVO
                </span>
              </div>
              <p className="text-[11px] font-mono text-slate-500">
                Radar de Binance Spot ordenado por rendimiento, volumen y categoría
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Fullscreen Toggle */}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] text-slate-400 hover:text-white border border-white/[0.07] transition-colors cursor-pointer"
              title={isFullscreen ? 'Restaurar ventana' : 'Pantalla Completa'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              onClick={() => setSearchModalOpen(false)}
              className="p-1.5 rounded-lg hover:bg-white/[0.06] text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Global Market Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-6 py-2 bg-white/[0.01] border-b border-white/[0.07] text-xs font-mono">
          <div className="flex items-center space-x-2">
            <span className="text-slate-500">Alcistas:</span>
            <span className="text-[#10b981] font-normal">{marketStats.gainers} pares</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-slate-500">Bajistas:</span>
            <span className="text-[#f43f5e] font-normal">{marketStats.losers} pares</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-slate-500">Volumen:</span>
            <span className="text-white font-normal">${marketStats.totalVolumeMillions}M USDT</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-slate-500">Top Gainer:</span>
            <span className="text-[#10b981] font-normal">
              {marketStats.topGainerSymbol} (+{marketStats.topGainerPercent}%)
            </span>
          </div>
        </div>

        {/* Search, Categories & Period Filters Bar */}
        <div className="p-4 bg-white/[0.01] border-b border-white/[0.07] space-y-3">
          {/* Main Search Input */}
          <div className="flex items-center bg-white/[0.03] rounded-xl px-3 py-2 border border-white/[0.07] focus-within:border-white/25 transition-all">
            <Search className="w-4 h-4 text-slate-500 mr-2.5 shrink-0" />
            <input
              type="text"
              placeholder="Buscar entre los 485 pares (BTC, ETH, SOL, PEPE)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              className="flex-1 bg-transparent border-none text-white font-mono text-xs sm:text-sm focus:outline-none placeholder-slate-500"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="text-slate-400 hover:text-white px-2 py-0.5 text-xs rounded hover:bg-white/[0.05] cursor-pointer"
              >
                Limpiar
              </button>
            )}
            <span className="text-[10px] font-mono text-slate-400 bg-white/[0.04] px-2 py-0.5 rounded ml-2 border border-white/[0.06]">
              {processedList.length} encontrados
            </span>
          </div>

          {/* Categories & Timeframe Selector */}
          <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
            {/* Category Tabs */}
            <div className="flex items-center space-x-1 bg-white/[0.02] p-1 rounded-lg border border-white/[0.06]">
              <button
                onClick={() => {
                  setCategoryTab('all');
                  setSortField('performance');
                  setSortDir('desc');
                }}
                className={`px-3 py-1 rounded-md text-[11px] font-mono transition-all cursor-pointer ${
                  categoryTab === 'all'
                    ? 'bg-white text-black font-semibold shadow-xs'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                Todos ({marketStats.totalPairs})
              </button>

              <button
                onClick={() => {
                  setCategoryTab('hyperliquid');
                  setSortField('volume');
                  setSortDir('desc');
                }}
                className={`px-3 py-1 rounded-md text-[11px] font-mono flex items-center space-x-1 transition-all cursor-pointer ${
                  categoryTab === 'hyperliquid'
                    ? 'bg-emerald-500 text-black font-semibold shadow-xs'
                    : 'text-slate-400 hover:text-emerald-400 hover:bg-white/[0.04]'
                }`}
              >
                <Zap className="w-3 h-3 fill-current" />
                <span>Hyperliquid Perps</span>
              </button>

              <button
                onClick={() => {
                  setCategoryTab('gainers');
                  setSortField('performance');
                  setSortDir('desc');
                }}
                className={`px-3 py-1 rounded-md text-[11px] font-mono flex items-center space-x-1 transition-all cursor-pointer ${
                  categoryTab === 'gainers'
                    ? 'bg-white text-black font-semibold shadow-xs'
                    : 'text-slate-400 hover:text-[#10b981] hover:bg-white/[0.04]'
                }`}
              >
                <TrendingUp className="w-3 h-3 text-[#10b981]" />
                <span>Top Ganadores</span>
              </button>

              <button
                onClick={() => {
                  setCategoryTab('losers');
                  setSortField('performance');
                  setSortDir('asc');
                }}
                className={`px-3 py-1 rounded-md text-[11px] font-mono flex items-center space-x-1 transition-all cursor-pointer ${
                  categoryTab === 'losers'
                    ? 'bg-white text-black font-semibold shadow-xs'
                    : 'text-slate-400 hover:text-[#f43f5e] hover:bg-white/[0.04]'
                }`}
              >
                <TrendingDown className="w-3 h-3 text-[#f43f5e]" />
                <span>Top Caídas</span>
              </button>

              <button
                onClick={() => {
                  setCategoryTab('volume');
                  setSortField('volume');
                  setSortDir('desc');
                }}
                className={`px-3 py-1 rounded-md text-[11px] font-mono flex items-center space-x-1 transition-all cursor-pointer ${
                  categoryTab === 'volume'
                    ? 'bg-white text-black font-semibold shadow-xs'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <Sparkles className="w-3 h-3" />
                <span>Mayor Volumen</span>
              </button>

              <button
                onClick={() => {
                  setCategoryTab('top50');
                  setSortField('volume');
                  setSortDir('desc');
                }}
                className={`px-3 py-1 rounded-md text-[11px] font-mono transition-all cursor-pointer ${
                  categoryTab === 'top50'
                    ? 'bg-white text-black font-semibold shadow-xs'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                Top 50
              </button>

              <button
                onClick={() => {
                  setCategoryTab('rwa');
                  setSortField('performance');
                  setSortDir('desc');
                }}
                className={`px-3 py-1 rounded-md text-[11px] font-mono flex items-center space-x-1 transition-all cursor-pointer ${
                  categoryTab === 'rwa'
                    ? 'bg-amber-400 text-black font-semibold shadow-xs'
                    : 'text-amber-400/80 hover:text-amber-300 hover:bg-amber-400/10'
                }`}
              >
                <Coins className="w-3 h-3 text-amber-400" />
                <span>RWA / Upscale</span>
              </button>
            </div>

            {/* Timeframe Performance Selector */}
            <div className="flex items-center space-x-1.5 font-mono">
              <span className="text-[10px] text-slate-500 uppercase">Período:</span>
              <div className="flex items-center bg-white/[0.02] p-0.5 rounded-lg border border-white/[0.06]">
                {periods.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setSelectedPeriod(p.value)}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono transition-all cursor-pointer ${
                      selectedPeriod === p.value
                        ? 'bg-white text-black font-semibold shadow-xs'
                        : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Interactive Sort Table */}
        <div className="flex-1 overflow-y-auto bg-[#030305]">
          <table className="w-full text-left text-xs font-mono min-w-[700px]">
            <thead className="sticky top-0 bg-[#08090d]/95 backdrop-blur-md text-slate-500 border-b border-white/[0.07] text-[10px] uppercase tracking-wider z-10">
              <tr>
                <th className="py-2.5 px-4 w-12 text-center font-normal">#</th>
                <th
                  onClick={() => handleSortToggle('symbol')}
                  className="py-2.5 px-4 cursor-pointer hover:text-white transition-colors font-normal"
                >
                  <div className="flex items-center space-x-1">
                    <span>Par / Símbolo</span>
                    <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </div>
                </th>

                <th
                  onClick={() => handleSortToggle('price')}
                  className="py-2.5 px-4 cursor-pointer hover:text-white transition-colors text-right font-normal"
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>Precio Vivo</span>
                    <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </div>
                </th>

                <th
                  onClick={() => handleSortToggle('performance')}
                  className="py-2.5 px-4 cursor-pointer hover:text-white transition-colors text-right font-normal"
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>
                      Rendimiento ({selectedPeriod === '1Y' ? '1A' : selectedPeriod})
                    </span>
                    <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </div>
                </th>

                <th
                  onClick={() => handleSortToggle('volume')}
                  className="py-2.5 px-4 cursor-pointer hover:text-white transition-colors text-right font-normal"
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>Volumen 24h</span>
                    <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </div>
                </th>

                <th className="py-2.5 px-4 text-right hidden sm:table-cell font-normal">Rango 24h (Mín - Máx)</th>
                <th className="py-2.5 px-4 text-center font-normal">Acción</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/[0.04]">
              {processedList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-500 font-mono text-xs">
                    No se encontraron pares coincidentes con &ldquo;{query}&rdquo;
                  </td>
                </tr>
              ) : (
                processedList.slice(0, visibleCount).map((item, index) => {
                  const isSelected = item.symbol === currentSymbol;
                  const periodCache = perfCache[selectedPeriod] || {};
                  const pct =
                    periodCache[item.symbol] !== undefined
                      ? periodCache[item.symbol]
                      : item.priceChangePercent;
                  const isPositive = pct >= 0;

                  return (
                    <tr
                      key={item.symbol}
                      onClick={() => handleSelect(item.symbol)}
                      className={`hover:bg-white/[0.02] cursor-pointer transition-colors ${
                        isSelected ? 'bg-white/[0.06] border-l-2 border-l-white' : ''
                      }`}
                    >
                      {/* Ranking Index */}
                      <td className="py-2.5 px-4 text-center text-slate-500 text-[11px] font-mono">
                        {index + 1}
                      </td>

                      {/* Symbol */}
                      <td className="py-2.5 px-4">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-white text-xs sm:text-sm font-mono">
                            {item.displayName ? item.displayName.split('·')[0].trim() : item.symbol.replace('USDT', '')}
                          </span>
                          {!item.displayName && (
                            <span className="text-[10px] text-slate-500">/USDT</span>
                          )}
                          {item.isHyperliquid && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-mono border border-emerald-500/30 font-bold flex items-center gap-1">
                              PERP
                              {item.fundingRate !== undefined && (
                                <span className="text-[8px] text-amber-400">
                                  FR: {(item.fundingRate * 100).toFixed(4)}%
                                </span>
                              )}
                            </span>
                          )}
                          {item.isRWA && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-mono border border-amber-500/20 font-semibold">
                              {item.category === 'METALS' ? 'ORO/METALES' : item.category === 'FOREX' ? 'FOREX' : item.category === 'INDICES' ? 'ÍNDICE' : 'RWA'}
                            </span>
                          )}
                          {TOP_50_SYMBOLS.slice(0, 10).includes(item.symbol) && !item.isRWA && !item.isHyperliquid && (
                            <span className="text-[9px] px-1 rounded bg-white/[0.04] text-slate-400 font-mono border border-white/[0.06]">
                              TOP
                            </span>
                          )}
                        </div>
                        {item.displayName && (
                          <div className="text-[10px] text-slate-400 font-mono">
                            {item.displayName.includes('·') ? item.displayName.split('·')[1]?.trim() + ' · ' : ''}{item.symbol}
                          </div>
                        )}
                      </td>

                      {/* Price */}
                      <td className="py-2.5 px-4 text-right font-normal text-white font-mono">
                        ${formatPrice(item.lastPrice)}
                      </td>

                      {/* Performance % */}
                      <td className="py-2.5 px-4 text-right">
                        <div
                          className={`inline-flex items-center space-x-1 font-normal text-xs px-2 py-0.5 rounded font-mono ${
                            isPositive
                              ? 'bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20'
                              : 'bg-[#f43f5e]/10 text-[#f43f5e] border border-[#f43f5e]/20'
                          }`}
                        >
                          {isPositive ? (
                            <TrendingUp className="w-3 h-3" />
                          ) : (
                            <TrendingDown className="w-3 h-3" />
                          )}
                          <span>
                            {isPositive ? '+' : ''}
                            {pct.toFixed(2)}%
                          </span>
                        </div>
                      </td>

                      {/* Volume */}
                      <td className="py-2.5 px-4 text-right text-slate-300 font-mono">
                        ${(item.quoteVolume / 1_000_000).toFixed(2)}M
                      </td>

                      {/* 24h Range */}
                      <td className="py-2.5 px-4 text-right text-slate-500 text-[11px] hidden sm:table-cell font-mono">
                        ${formatPrice(item.lowPrice)} - ${formatPrice(item.highPrice)}
                      </td>

                      {/* Open Chart Action */}
                      <td className="py-2.5 px-4 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelect(item.symbol);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] text-white font-mono text-[11px] border border-white/[0.07] transition-colors cursor-pointer"
                        >
                          Ver Gráfico →
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* Load More Trigger if > visibleCount */}
          {processedList.length > visibleCount && (
            <div className="p-4 text-center bg-white/[0.01] border-t border-white/[0.07]">
              <button
                onClick={() => setVisibleCount((prev) => prev + 150)}
                className="px-4 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] text-white font-mono text-xs border border-white/[0.07] transition-colors cursor-pointer"
              >
                Cargar Más ({visibleCount} de {processedList.length})
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-2.5 bg-white/[0.01] border-t border-white/[0.07] text-xs font-mono text-slate-500 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center space-x-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse" />
            <span>Binance Spot API Live</span>
          </div>
          <div className="text-[11px]">
            Mostrando {Math.min(visibleCount, processedList.length)} de {processedList.length} pares
          </div>
        </div>
      </div>
    </div>
  );
};
