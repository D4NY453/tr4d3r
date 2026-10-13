'use client';

import React from 'react';
import { useTradingStore } from '@/store/useTradingStore';
import { Timeframe } from '@/types';
import {
  Search,
  Activity,
  Zap,
  TrendingUp,
  TrendingDown,
  Maximize2,
  Bell,
  GraduationCap,
  Calculator,
  Wallet,
  Bot,
  List,
  Send,
  Layers,
} from 'lucide-react';

const TIMEFRAMES: { label: string; value: Timeframe }[] = [
  { label: '1m', value: '1m' },
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '1h', value: '1h' },
  { label: '4h', value: '4h' },
  { label: '1D', value: '1d' },
  { label: '1W', value: '1w' },
];

export const Header: React.FC = () => {
  const {
    currentSymbol,
    currentTimeframe,
    setTimeframe,
    setSearchModalOpen,
    setIndicatorModalOpen,
    setStrategyModalOpen,
    setAcademyModalOpen,
    setCalculatorModalOpen,
    setWalletModalOpen,
    isBotActive,
    setBotModalOpen,
    walletBalance,
    paperPositions,
    isSignalsPanelOpen,
    setSignalsPanelOpen,
    indicators,
    strategies,
    watchlist,
    isWatchlistOpen,
    setWatchlistOpen,
    setTelegramModalOpen,
    telegramConfig,
    setHyperliquidModalOpen,
    hyperliquidWallet,
    hyperliquidAccount,
    hyperliquidAutoTrade,
    setAllOpportunitiesModalOpen,
    globalActiveSignals,
    setBankTestModalOpen,
    subFunds,
  } = useTradingStore();

  const currentTicker = watchlist.find((w) => w.symbol === currentSymbol);
  const isPositive = currentTicker ? currentTicker.priceChangePercent >= 0 : true;

  // Active counts
  const activeIndicatorsCount = Object.entries(indicators).filter(
    ([k, v]) => typeof v === 'boolean' && v
  ).length;

  const activeStrategiesCount = Object.values(strategies).filter(Boolean).length;

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
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

  return (
    <header className="h-12 bg-[#050608]/95 backdrop-blur-2xl border-b border-white/[0.07] px-3 flex items-center justify-between text-xs select-none z-30 overflow-x-auto no-scrollbar gap-3">
      {/* Left section: Branding + Symbol + Timeframes */}
      <div className="flex items-center space-x-2 shrink-0">
        {/* Brand / Logo HIK453 */}
        <div className="flex items-center space-x-2 mr-1">
          <div className="w-6 h-6 rounded-md bg-white/[0.06] border border-white/[0.12] flex items-center justify-center text-white">
            <span className="font-mono font-bold text-xs tracking-tight text-white">H</span>
          </div>
          <div className="flex items-baseline space-x-1.5">
            <span className="font-mono font-medium text-sm tracking-wider text-white">
              HIK453
            </span>
            <span className="hidden lg:inline text-[9px] font-mono tracking-widest text-slate-500 uppercase">
              TERMINAL
            </span>
          </div>
        </div>

        {/* Symbol Trigger Button */}
        <button
          onClick={() => setSearchModalOpen(true)}
          className="flex items-center space-x-2 px-2.5 py-1.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.07] hover:border-white/[0.15] text-slate-300 transition-all cursor-pointer group"
          title="Buscar entre 485 pares de Binance"
        >
          <Search className="w-3.5 h-3.5 text-slate-500 group-hover:text-white transition-colors" />
          <span className="font-mono font-medium text-xs text-white">
            {currentTicker?.displayName
              ? currentTicker.displayName.split('·')[0].trim()
              : currentSymbol.replace('USDT', '')}
            {!currentTicker?.displayName && (
              <span className="text-[10px] text-slate-500 ml-0.5">/USDT</span>
            )}
            {currentTicker?.isRWA && (
              <span className="text-[10px] text-amber-400/70 ml-1 font-normal">RWA</span>
            )}
          </span>

          {currentTicker && (
            <div className="hidden sm:flex items-center space-x-1.5 font-mono text-[11px] ml-1 pl-2 border-l border-white/[0.07]">
              <span className="font-normal text-white">
                ${formatPrice(currentTicker.lastPrice)}
              </span>
              <span
                className={`flex items-center font-normal ${
                  isPositive ? 'text-[#10b981]' : 'text-[#f43f5e]'
                }`}
              >
                {isPositive ? '+' : ''}
                {currentTicker.priceChangePercent.toFixed(2)}%
              </span>
            </div>
          )}
        </button>

        <div className="h-4 w-px bg-white/[0.07] mx-0.5" />

        {/* Timeframe Selector Capsule */}
        <div className="flex items-center bg-white/[0.02] rounded-lg p-0.5 border border-white/[0.06]">
          {TIMEFRAMES.map((tf) => {
            const active = tf.value === currentTimeframe;
            return (
              <button
                key={tf.value}
                onClick={() => setTimeframe(tf.value)}
                className={`px-2 py-0.5 rounded-md text-[11px] font-mono transition-all cursor-pointer ${
                  active
                    ? 'bg-white text-black font-semibold'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                {tf.label}
              </button>
            );
          })}
        </div>

        <div className="h-4 w-px bg-white/[0.07] mx-0.5" />

        {/* Indicators Button */}
        <button
          onClick={() => setIndicatorModalOpen(true)}
          className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.14] text-slate-300 transition-all cursor-pointer"
        >
          <Activity className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-normal text-[11px]">Indicadores</span>
          {activeIndicatorsCount > 0 && (
            <span className="px-1.5 py-0.2 rounded bg-white/10 text-white font-mono text-[9px]">
              {activeIndicatorsCount}
            </span>
          )}
        </button>

        {/* Strategies & Signals Button */}
        <button
          onClick={() => setStrategyModalOpen(true)}
          className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.14] text-slate-300 transition-all cursor-pointer"
        >
          <Zap className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-normal text-[11px]">Estrategias</span>
          {activeStrategiesCount > 0 && (
            <span className="px-1.5 py-0.2 rounded bg-white/10 text-white font-mono text-[9px]">
              {activeStrategiesCount}
            </span>
          )}
        </button>

        {/* Radar Multipar / Todas las Oportunidades Juntas Button */}
        <button
          onClick={() => setAllOpportunitiesModalOpen(true)}
          className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:text-emerald-200 transition-all cursor-pointer font-medium shadow-xs shadow-emerald-950/40"
          title="Ver Todas las Oportunidades Vigentes del Mercado Juntas (Perps, Memes y Spot)"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <Zap className="w-3.5 h-3.5 text-emerald-400 fill-current" />
          <span className="font-mono text-[11px] font-semibold">Todas las Oportunidades</span>
          {globalActiveSignals.length > 0 ? (
            <span className="px-1.5 py-0.2 rounded bg-emerald-500/25 text-emerald-300 font-mono text-[9px] font-bold">
              {globalActiveSignals.length}
            </span>
          ) : (
            <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-mono text-[9px]">
              RADAR
            </span>
          )}
        </button>

        {/* Academy / Tutorials Button */}
        <button
          onClick={() => setAcademyModalOpen(true)}
          className="hidden md:flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.14] text-slate-300 transition-all cursor-pointer"
        >
          <GraduationCap className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-normal text-[11px]">Academia</span>
        </button>

        {/* Risk & Position Calculator Button */}
        <button
          onClick={() => setCalculatorModalOpen(true)}
          className="hidden md:flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.14] text-slate-300 transition-all cursor-pointer"
          title="Calculadora de Riesgo R:R"
        >
          <Calculator className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-normal text-[11px]">Calculadora</span>
        </button>
      </div>

      {/* Right section: Autonomous Bot + Wallet + Panels Toggle + Fullscreen */}
      <div className="flex items-center space-x-2 shrink-0">
        {/* Banco $100k Test Bench Button */}
        <button
          onClick={() => setBankTestModalOpen(true)}
          className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg border border-[#f6c344]/30 bg-[#f6c344]/10 hover:bg-[#f6c344]/20 text-[#f6c344] transition-all cursor-pointer font-medium"
          title="Abrir Banco de Pruebas de $100,000 USD (10 Sub-Fondos de $10,000 a 0% Fee)"
        >
          <Layers className="w-3.5 h-3.5" />
          <span className="font-mono text-[11px] font-semibold hidden sm:inline">Banco $100k</span>
          <span className="font-mono text-[9px] px-1.5 py-0.2 rounded bg-[#f6c344]/25 text-[#f6c344] font-bold">
            10 FONDOS
          </span>
        </button>

        {/* Autonomous Bot Toggle Button */}
        <button
          onClick={() => setBotModalOpen(true)}
          className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer ${
            isBotActive
              ? 'bg-[#10b981]/10 border-[#10b981]/30 text-[#10b981]'
              : 'bg-white/[0.02] hover:bg-white/[0.06] border-white/[0.06] text-slate-400 hover:text-slate-200'
          }`}
          title="Bot Autónomo de Escaneo 3s & Auto-Ejecución"
        >
          <span className={`w-1.5 h-1.5 rounded-full ${isBotActive ? 'bg-[#10b981] animate-pulse' : 'bg-slate-600'}`} />
          <Bot className="w-3.5 h-3.5" />
          <span className="font-mono text-[11px] font-normal">Bot</span>
          <span className={`font-mono text-[9px] px-1.5 py-0.2 rounded ${
            isBotActive ? 'bg-[#10b981]/20 text-[#10b981] font-semibold' : 'bg-white/5 text-slate-500'
          }`}>
            {isBotActive ? 'ON' : 'OFF'}
          </span>
        </button>

        {/* Telegram Alerts Button */}
        <button
          onClick={() => setTelegramModalOpen(true)}
          className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer ${
            telegramConfig.isEnabled && telegramConfig.chatId
              ? 'bg-[#229ED9]/10 border-[#229ED9]/30 text-[#229ED9]'
              : 'bg-white/[0.02] hover:bg-white/[0.06] border-white/[0.06] text-slate-400 hover:text-slate-200'
          }`}
          title="Configurar Alertas Telegram (@Fl4shloanarb_bot)"
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              telegramConfig.isEnabled && telegramConfig.chatId ? 'bg-[#229ED9] animate-pulse' : 'bg-slate-600'
            }`}
          />
          <Send className="w-3.5 h-3.5" />
          <span className="font-mono text-[11px] font-normal hidden sm:inline">Telegram</span>
          <span
            className={`font-mono text-[9px] px-1.5 py-0.2 rounded ${
              telegramConfig.isEnabled && telegramConfig.chatId
                ? 'bg-[#229ED9]/20 text-[#229ED9] font-semibold'
                : 'bg-white/5 text-slate-500'
            }`}
          >
            {telegramConfig.isEnabled && telegramConfig.chatId ? 'LINKED' : 'OFF'}
          </span>
        </button>

        {/* Hyperliquid DEX Hub Button */}
        <button
          onClick={() => setHyperliquidModalOpen(true)}
          className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer ${
            hyperliquidWallet || hyperliquidAutoTrade
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-white/[0.02] hover:bg-white/[0.06] border-white/[0.06] text-slate-400 hover:text-slate-200'
          }`}
          title="Abrir Hyperliquid L1 Hub (Mercados, Posiciones On-Chain y Bot)"
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              hyperliquidWallet || hyperliquidAutoTrade ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
            }`}
          />
          <Zap className="w-3.5 h-3.5 fill-current" />
          <span className="font-mono text-[11px] font-normal">Hyperliquid</span>
          <span
            className={`font-mono text-[9px] px-1.5 py-0.2 rounded ${
              hyperliquidAccount
                ? 'bg-emerald-500/20 text-emerald-300 font-bold'
                : hyperliquidWallet
                ? 'bg-emerald-500/15 text-emerald-400 font-medium'
                : 'bg-white/5 text-slate-500'
            }`}
          >
            {hyperliquidAccount
              ? `$${hyperliquidAccount.marginSummary.accountValue.toFixed(0)}`
              : hyperliquidWallet
              ? '0x...'
              : 'DEX'}
          </span>
        </button>

        <div className="h-4 w-px bg-white/[0.07]" />

        {/* Virtual Wallet Button */}
        <button
          onClick={() => setWalletModalOpen(true)}
          className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.07] hover:border-white/[0.15] text-white transition-all cursor-pointer group"
          title="Abrir Billetera Virtual y Paper Trading"
        >
          <Wallet className="w-3.5 h-3.5 text-slate-400 group-hover:text-white transition-colors" />
          <span className="font-mono text-[11px] text-slate-400">Balance:</span>
          <span className="font-mono font-normal text-xs text-white">
            ${walletBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          {paperPositions.length > 0 && (
            <span className="px-1.5 py-0.2 rounded bg-white/10 text-white font-mono text-[9px]">
              {paperPositions.length}
            </span>
          )}
        </button>

        <div className="h-4 w-px bg-white/[0.07]" />

        {/* Toggle Watchlist Button on Mobile */}
        <button
          onClick={() => setWatchlistOpen(!isWatchlistOpen)}
          className={`lg:hidden flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg transition-all text-xs cursor-pointer border ${
            isWatchlistOpen
              ? 'bg-white/10 text-white border-white/20'
              : 'bg-white/[0.02] text-slate-400 hover:text-white border-white/[0.06] hover:bg-white/[0.06]'
          }`}
          title="Abrir Watchlist"
        >
          <List className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[11px] font-normal">Pares</span>
        </button>

        <div className="h-4 w-px bg-white/[0.07] lg:hidden" />

        {/* Toggle Signals Panel */}
        <button
          onClick={() => setSignalsPanelOpen(!isSignalsPanelOpen)}
          className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg transition-all text-xs cursor-pointer border ${
            isSignalsPanelOpen
              ? 'bg-white/10 text-white border-white/20'
              : 'bg-white/[0.02] text-slate-400 hover:text-white border-white/[0.06] hover:bg-white/[0.06]'
          }`}
          title="Panel de Señales"
        >
          <Bell className="w-3.5 h-3.5 text-slate-400" />
          <span className="hidden lg:inline text-[11px] font-normal">Señales</span>
        </button>

        <div className="h-4 w-px bg-white/[0.07]" />

        {/* Fullscreen Button */}
        <button
          onClick={toggleFullscreen}
          className="p-1.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.06] text-slate-400 hover:text-white transition-colors cursor-pointer"
          title="Pantalla Completa"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
