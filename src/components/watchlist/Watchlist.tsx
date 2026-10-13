'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useTradingStore } from '@/store/useTradingStore';
import {
  fetch24hTickers,
  fetchMultiPeriodPerformance,
  PerformancePeriod,
} from '@/services/binance/binance-rest';
import {
  Search,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Layers,
  X,
  Coins,
  Zap,
} from 'lucide-react';
import { Ticker24h, AssetCategory } from '@/types';

const POPULAR_PAIRS = [
  'BTCUSDT',
  'ETHUSDT',
  'SOLUSDT',
  'BNBUSDT',
  'XRPUSDT',
  'DOGEUSDT',
  'ADAUSDT',
  'AVAXUSDT',
  'SUIUSDT',
  'NEARUSDT',
  'LINKUSDT',
  'PEPEUSDT',
  'RENDERUSDT',
  'FETUSDT',
  'DOTUSDT',
  'HEMIUSDT',
];

type SortMode = 'highest' | 'lowest' | 'volume' | 'alpha';
type FilterDirection = 'all' | 'gainers' | 'losers';

export const Watchlist: React.FC = () => {
  const {
    watchlist,
    setWatchlist,
    currentSymbol,
    setSymbol,
    setSearchModalOpen,
    isWatchlistOpen,
    setWatchlistOpen,
    selectedCategory,
    setSelectedCategory,
    setPythModalOpen,
    setAllOpportunitiesModalOpen,
  } = useTradingStore();

  const [search, setSearch] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<PerformancePeriod>('24h');
  const [sortMode, setSortMode] = useState<SortMode>('highest');
  const [filterDir, setFilterDir] = useState<FilterDirection>('all');
  const [visibleCount, setVisibleCount] = useState(100);
  const [perfCache, setPerfCache] = useState<Record<PerformancePeriod, Record<string, number>>>({
    '15m': {},
    '30m': {},
    '24h': {},
    '1M': {},
    '1Y': {},
  });

  const loadTickers = async () => {
    setIsRefreshing(true);
    const data = await fetch24hTickers();
    if (data.length > 0) {
      setWatchlist(data);

      // Populate 24h cache from ticker24h data
      const cache24h: Record<string, number> = {};
      data.forEach((d) => {
        cache24h[d.symbol] = d.priceChangePercent;
      });
      setPerfCache((prev) => ({ ...prev, '24h': cache24h }));
    }
    setIsRefreshing(false);
  };

  // Fetch specific period performance when period changes
  useEffect(() => {
    if (selectedPeriod === '24h') return;

    let isMounted = true;
    const fetchPeriodData = async () => {
      setIsRefreshing(true);
      const symbolsToFetch = watchlist.length > 0 ? watchlist.map((w) => w.symbol) : POPULAR_PAIRS;
      const periodData = await fetchMultiPeriodPerformance(symbolsToFetch, selectedPeriod);
      if (isMounted && Object.keys(periodData).length > 0) {
        setPerfCache((prev) => ({ ...prev, [selectedPeriod]: periodData }));
      }
      if (isMounted) setIsRefreshing(false);
    };

    fetchPeriodData();
    return () => {
      isMounted = false;
    };
  }, [selectedPeriod, watchlist.length]);

  useEffect(() => {
    loadTickers();
    const interval = setInterval(loadTickers, 10000); // refresh every 10s
    return () => clearInterval(interval);
  }, []);

  // Compute displayed and sorted tickers
  const displayList = useMemo(() => {
    const periodCache = perfCache[selectedPeriod] || {};

    const filtered = watchlist.filter((item) => {
      // Category filter
      if (selectedCategory !== 'ALL') {
        if (selectedCategory === 'CRYPTO') {
          if (
            item.isRWA ||
            item.category === 'METALS' ||
            item.category === 'FOREX' ||
            item.category === 'INDICES'
          ) {
            return false;
          }
        } else if (item.category !== selectedCategory) {
          return false;
        }
      }

      // Search query (matches symbol or displayName)
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesSymbol = item.symbol.toLowerCase().includes(q);
        const matchesName = item.displayName ? item.displayName.toLowerCase().includes(q) : false;
        if (!matchesSymbol && !matchesName) return false;
      }

      // Performance value
      const pct = periodCache[item.symbol] !== undefined ? periodCache[item.symbol] : item.priceChangePercent;

      if (filterDir === 'gainers' && pct < 0) return false;
      if (filterDir === 'losers' && pct >= 0) return false;

      return true;
    });

    return filtered.sort((a, b) => {
      const pctA = periodCache[a.symbol] !== undefined ? periodCache[a.symbol] : a.priceChangePercent;
      const pctB = periodCache[b.symbol] !== undefined ? periodCache[b.symbol] : b.priceChangePercent;

      if (sortMode === 'highest') {
        return pctB - pctA; // Mayor a Menor rendimiento
      }
      if (sortMode === 'lowest') {
        return pctA - pctB; // Menor a Mayor rendimiento (Mayores caídas primero)
      }
      if (sortMode === 'volume') {
        return b.quoteVolume - a.quoteVolume;
      }
      return 0;
    });
  }, [watchlist, search, selectedPeriod, perfCache, sortMode, filterDir]);

  const periods: { label: string; value: PerformancePeriod }[] = [
    { label: '15m', value: '15m' },
    { label: '30m', value: '30m' },
    { label: '24h', value: '24h' },
    { label: '1M', value: '1M' },
    { label: '1A', value: '1Y' },
  ];

  const formatPrice = (p: number) => {
    if (!p && p !== 0) return '0.00';
    if (p < 0.00001) return p.toFixed(8);
    if (p < 0.001) return p.toFixed(6);
    if (p < 1) return p.toFixed(6);
    if (p < 10) return p.toFixed(4);
    if (p < 1000) return p.toFixed(2);
    return p.toFixed(2);
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isWatchlistOpen && (
        <div
          onClick={() => setWatchlistOpen(false)}
          className="fixed inset-0 bg-black/70 backdrop-blur-xs z-40 lg:hidden"
        />
      )}

      <aside
        className={`${
          isWatchlistOpen ? 'fixed inset-y-0 right-0 z-50 w-80 shadow-2xl flex' : 'hidden'
        } lg:flex lg:static w-72 bg-[#050608]/98 backdrop-blur-2xl border-l border-white/[0.07] flex-col h-full select-none shrink-0`}
      >
        {/* Header */}
        <div className="p-3 border-b border-white/[0.07] flex items-center justify-between bg-white/[0.01]">
          <div className="flex items-center space-x-2">
            <span className="font-mono text-xs font-medium tracking-wider text-white">
              WATCHLIST
            </span>
            <span className="text-[10px] font-mono text-slate-400 bg-white/[0.04] px-1.5 py-0.2 rounded border border-white/[0.06]">
              {displayList.length} pares
            </span>
          </div>

          <div className="flex items-center space-x-1">
            <button
              onClick={() => setAllOpportunitiesModalOpen(true)}
              className="p-1.5 rounded-lg hover:bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 transition-colors cursor-pointer"
              title="Radar: Ver todas las oportunidades vigentes juntas"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
            </button>

            <button
              onClick={() => setPythModalOpen(true)}
              className="p-1.5 rounded-lg hover:bg-[#eab308]/15 text-[#eab308] border border-[#eab308]/30 transition-colors cursor-pointer"
              title="Ajustes de Oráculo Pyth / Upscale.trade"
            >
              <Coins className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={loadTickers}
              className={`p-1.5 rounded-lg hover:bg-white/[0.06] text-slate-400 hover:text-white transition-colors cursor-pointer ${
                isRefreshing ? 'animate-spin' : ''
              }`}
              title="Actualizar Precios & Rendimiento"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

            {/* Mobile Close Button */}
            <button
              onClick={() => setWatchlistOpen(false)}
              className="lg:hidden p-1.5 rounded-lg hover:bg-white/[0.06] text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Category Tabs: ALL | HYPERLIQUID | CRYPTO | METALS (Oro) | FOREX | INDICES */}
        <div className="px-2.5 py-1.5 border-b border-white/[0.07] bg-white/[0.02] flex items-center space-x-1 overflow-x-auto no-scrollbar">
          {[
            { id: 'ALL' as AssetCategory, label: 'Todos' },
            { id: 'HYPERLIQUID' as AssetCategory, label: '⚡ Hyperliquid Perps' },
            { id: 'CRYPTO' as AssetCategory, label: 'Cripto Spot' },
            { id: 'METALS' as AssetCategory, label: 'Oro / Metales' },
            { id: 'FOREX' as AssetCategory, label: 'Forex' },
            { id: 'INDICES' as AssetCategory, label: 'Índices' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-2 py-1 rounded text-[10px] font-mono whitespace-nowrap transition-all cursor-pointer ${
                selectedCategory === cat.id
                  ? 'bg-white text-black font-semibold shadow-xs'
                  : 'text-slate-400 hover:text-white bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.04]'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

      {/* Controls: Timeframe & Sort Capsule */}
      <div className="p-2.5 border-b border-white/[0.07] bg-white/[0.01] space-y-2">
        {/* Period Selector */}
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-500 font-mono text-[10px] uppercase tracking-wider">
            Período:
          </span>
          <div className="flex items-center bg-white/[0.02] rounded-lg p-0.5 border border-white/[0.06]">
            {periods.map((p) => (
              <button
                key={p.value}
                onClick={() => setSelectedPeriod(p.value)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-all cursor-pointer ${
                  selectedPeriod === p.value
                    ? 'bg-white text-black font-semibold'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sort Controls (Mayor / Menor Rendimiento) */}
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setSortMode('highest')}
            className={`flex-1 py-1 px-1.5 rounded-md text-[10px] font-mono flex items-center justify-center space-x-1 border transition-all cursor-pointer ${
              sortMode === 'highest'
                ? 'bg-white/10 border-white/30 text-white font-medium'
                : 'bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-white hover:bg-white/[0.04]'
            }`}
            title="Mayor Rendimiento"
          >
            <TrendingUp className="w-3 h-3 text-[#10b981]" />
            <span>Mayor %</span>
          </button>

          <button
            onClick={() => setSortMode('lowest')}
            className={`flex-1 py-1 px-1.5 rounded-md text-[10px] font-mono flex items-center justify-center space-x-1 border transition-all cursor-pointer ${
              sortMode === 'lowest'
                ? 'bg-white/10 border-white/30 text-white font-medium'
                : 'bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-white hover:bg-white/[0.04]'
            }`}
            title="Menor Rendimiento"
          >
            <TrendingDown className="w-3 h-3 text-[#f43f5e]" />
            <span>Menor %</span>
          </button>

          <button
            onClick={() => setSortMode('volume')}
            className={`py-1 px-2 rounded-md text-[10px] font-mono flex items-center justify-center space-x-1 border transition-all cursor-pointer ${
              sortMode === 'volume'
                ? 'bg-white/10 border-white/30 text-white font-medium'
                : 'bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-white hover:bg-white/[0.04]'
            }`}
            title="Mayor Volumen"
          >
            <span>Vol</span>
          </button>
        </div>

        {/* Search Bar & Explorer Button */}
        <div className="space-y-1.5 pt-0.5">
          <div className="flex items-center bg-white/[0.03] rounded-lg px-2.5 py-1.5 border border-white/[0.07] focus-within:border-white/20 transition-all">
            <Search className="w-3.5 h-3.5 text-slate-500 mr-2 shrink-0" />
            <input
              type="text"
              placeholder="Buscar (BTC, PEPE, SOL)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent text-xs text-white font-mono focus:outline-none placeholder-slate-500"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="text-slate-400 hover:text-white text-xs px-1 cursor-pointer"
              >
                ×
              </button>
            )}
          </div>

          <button
            onClick={() => setSearchModalOpen(true)}
            className="w-full py-1.5 px-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] text-slate-300 hover:text-white text-[11px] font-mono flex items-center justify-center space-x-1.5 border border-white/[0.07] hover:border-white/20 transition-all cursor-pointer"
            title="Abrir Explorador y Radar de los 485 Pares de Binance Spot"
          >
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <span>Explorador Radar de Pares ⛶</span>
          </button>
        </div>
      </div>

      {/* Ticker List */}
      <div className="flex-1 overflow-y-auto divide-y divide-white/[0.04]">
        {displayList.length === 0 ? (
          <div className="p-6 text-center text-xs font-mono text-slate-500">
            {isRefreshing ? 'Calculando rendimientos...' : 'No se encontraron pares.'}
          </div>
        ) : (
          <>
            {displayList.slice(0, visibleCount).map((item: Ticker24h) => {
              const isSelected = item.symbol === currentSymbol;
              const periodCache = perfCache[selectedPeriod] || {};
              const pct =
                periodCache[item.symbol] !== undefined
                  ? periodCache[item.symbol]
                  : item.priceChangePercent;
              const isPositive = pct >= 0;

              return (
                <div
                  key={item.symbol}
                  onClick={() => setSymbol(item.symbol)}
                  className={`px-3 py-2.5 flex items-center justify-between hover:bg-white/[0.04] cursor-pointer transition-colors ${
                    isSelected ? 'bg-white/[0.05] border-l-2 border-l-white' : ''
                  }`}
                >
                  <div className="flex flex-col">
                    <div className="flex items-center space-x-1.5">
                      <span className="font-mono font-medium text-xs text-white truncate max-w-[130px]">
                        {item.displayName ? item.displayName.split('·')[0].trim() : item.symbol.replace('USDT', '')}
                      </span>
                      {item.isHyperliquid && (
                        <span className="text-[8px] font-mono font-bold px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          PERP
                        </span>
                      )}
                      {item.isRWA && item.category === 'METALS' && (
                        <span className="text-[8px] font-mono font-semibold px-1 py-0.2 rounded bg-[#eab308]/20 text-[#eab308] border border-[#eab308]/30">
                          ORO
                        </span>
                      )}
                      {item.isRWA && item.category === 'FOREX' && (
                        <span className="text-[8px] font-mono font-semibold px-1 py-0.2 rounded bg-sky-500/20 text-sky-400 border border-sky-500/30">
                          FX
                        </span>
                      )}
                      {item.isRWA && item.category === 'INDICES' && (
                        <span className="text-[8px] font-mono font-semibold px-1 py-0.2 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">
                          IDX
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono truncate max-w-[130px]">
                      {item.fundingRate !== undefined ? (
                        <span className={item.fundingRate >= 0 ? 'text-amber-400' : 'text-indigo-400'}>
                          FR: {(item.fundingRate * 100).toFixed(4)}%
                        </span>
                      ) : item.displayName && item.displayName.includes('·') ? (
                        item.displayName.split('·')[1].trim()
                      ) : (
                        `$${(item.quoteVolume / 1_000_000).toFixed(1)}M`
                      )}
                    </span>
                  </div>

                  <div className="flex flex-col items-end font-mono">
                    <span className="text-xs font-normal text-white">
                      ${formatPrice(item.lastPrice)}
                    </span>
                    <span
                      className={`text-[10px] font-normal px-1.5 py-0.2 rounded mt-0.5 flex items-center space-x-0.5 ${
                        isPositive
                          ? 'text-[#10b981] bg-[#10b981]/10 border border-[#10b981]/20'
                          : 'text-[#f43f5e] bg-[#f43f5e]/10 border border-[#f43f5e]/20'
                      }`}
                    >
                      <span>{isPositive ? '+' : ''}{pct.toFixed(2)}%</span>
                    </span>
                  </div>
                </div>
              );
            })}

            {displayList.length > visibleCount && (
              <div className="p-2 text-center bg-white/[0.01]">
                <button
                  onClick={() => setVisibleCount((prev) => prev + 100)}
                  className="w-full py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] text-white text-[11px] font-mono border border-white/[0.07] transition-colors cursor-pointer"
                >
                  Cargar Más ({visibleCount} de {displayList.length})
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer Info */}
      <div className="p-2.5 border-t border-white/[0.07] bg-white/[0.01] text-[10px] font-mono text-slate-500 flex justify-between items-center">
        <span className="flex items-center space-x-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse" />
          <span>Binance Spot Live</span>
        </span>
        <span>{selectedPeriod === '1Y' ? '1 Año' : selectedPeriod}</span>
      </div>
    </aside>
  </>
);
};
