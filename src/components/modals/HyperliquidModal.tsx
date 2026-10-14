'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useTradingStore } from '@/store/useTradingStore';
import {
  X,
  Zap,
  Shield,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Search,
  ExternalLink,
  Wallet,
  Bot,
  Lock,
  Eye,
  EyeOff,
  Flame,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  Play,
  TrendingUp,
  TrendingDown,
  Layers,
  Sparkles,
  Server,
  Power,
  Terminal,
  History,
  ArrowRight,
  Filter,
  Scale,
  DollarSign,
} from 'lucide-react';
import { fetchHyperliquidMarkets } from '@/services/hyperliquid/hyperliquid-rest';
import { Ticker24h } from '@/types';

type Tab = 'markets' | 'portfolio' | 'history' | 'bot' | 'guide';

const formatTimestamp = (ts: number) => {
  if (!ts) return '-';
  const d = new Date(ts);
  return d.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

export const HyperliquidModal: React.FC = () => {
  const {
    isHyperliquidModalOpen,
    setHyperliquidModalOpen,
    hyperliquidWallet,
    setHyperliquidWallet,
    hyperliquidAgentKey,
    setHyperliquidAgentKey,
    hyperliquidAccount,
    isLoadingHyperliquidAccount,
    refreshHyperliquidAccount,
    hyperliquidAutoTrade,
    setHyperliquidAutoTrade,
    hyperliquidDefaultLeverage,
    setHyperliquidDefaultLeverage,
    closeLiveHyperliquidPosition,
    executeLiveHyperliquidOrder,
    setSymbol,
    botConfig,
    updateBotConfig,
    hyperliquidClosedTrades,
    isLoadingHyperliquidClosedTrades,
    fetchHyperliquidClosedTrades,
    currentTimeframe,
  } = useTradingStore();

  const [activeTab, setActiveTab] = useState<Tab>('markets');
  const [portfolioSubTab, setPortfolioSubTab] = useState<'OPEN' | 'CLOSED'>('OPEN');
  const [historySearch, setHistorySearch] = useState('');
  const [historyFilter, setHistoryFilter] = useState<'ALL' | 'WINS' | 'LOSSES'>('ALL');
  const [historyDir, setHistoryDir] = useState<'ALL' | 'LONG' | 'SHORT'>('ALL');
  const [marketSearch, setMarketSearch] = useState('');
  const [hlMarkets, setHlMarkets] = useState<Ticker24h[]>([]);
  const [isLoadingMarkets, setIsLoadingMarkets] = useState(false);
  const [walletInput, setWalletInput] = useState(hyperliquidWallet);
  const [agentKeyInput, setAgentKeyInput] = useState(hyperliquidAgentKey);
  const [showKey, setShowKey] = useState(false);
  const [closingCoin, setClosingCoin] = useState<string | null>(null);
  const [testOrderCoin, setTestOrderCoin] = useState('BTC');
  const [testOrderSide, setTestOrderSide] = useState<'BUY' | 'SELL'>('BUY');
  const [testOrderSize, setTestOrderSize] = useState('0.001');
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [orderFeedback, setOrderFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [serverStatus, setServerStatus] = useState<any>(null);
  const [isStartingServer, setIsStartingServer] = useState(false);
  const [instantProfitEnabled, setInstantProfitEnabled] = useState(true);
  const [minProfitInput, setMinProfitInput] = useState('1.50');

  const handleUpdateInstantProfit = async (enabled: boolean, minVal: string) => {
    setInstantProfitEnabled(enabled);
    setMinProfitInput(minVal);
    const parsedMin = parseFloat(minVal);
    try {
      await fetch('/api/bot/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instantProfitTake: enabled,
          minInstantProfitUSD: isNaN(parsedMin) ? 1.50 : parsedMin,
        }),
      });
    } catch (_) {}
  };

  const handleUpdateMaxConcurrent = async (count: number) => {
    updateBotConfig({ maxConcurrentTrades: count });
    try {
      await fetch('/api/bot/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxConcurrentTrades: count }),
      });
      fetchServerStatus();
      setOrderFeedback({
        type: 'ok',
        msg: `✅ Límite actualizado: Ahora el bot puede tener hasta ${count} operaciones simultáneas.`,
      });
      setTimeout(() => setOrderFeedback(null), 4000);
    } catch (_) {}
  };

  // Closed trades statistics
  const closedStats = useMemo(() => {
    let totalPnl = 0;
    let totalVol = 0;
    let wins = 0;
    let losses = 0;
    let totalFees = 0;
    let totalWinsUSD = 0;
    let totalLossesUSD = 0;

    hyperliquidClosedTrades.forEach((t) => {
      const pnl = t.closedPnlUSD || 0;
      totalPnl += pnl;
      totalVol += t.notionalUSD || 0;
      totalFees += t.feeUSD || 0;
      if (pnl > 0) {
        wins++;
        totalWinsUSD += pnl;
      } else if (pnl < 0) {
        losses++;
        totalLossesUSD += Math.abs(pnl);
      }
    });

    const total = hyperliquidClosedTrades.length;
    const winRate = total > 0 ? (wins / total) * 100 : 0;
    const avgWin = wins > 0 ? totalWinsUSD / wins : 0;
    const avgLoss = losses > 0 ? totalLossesUSD / losses : 0;
    const profitFactor = totalLossesUSD > 0 ? totalWinsUSD / totalLossesUSD : totalWinsUSD > 0 ? 99 : 0;
    const netDifference = totalWinsUSD - totalLossesUSD;

    return {
      totalPnl,
      totalVol,
      wins,
      losses,
      total,
      winRate,
      totalFees,
      totalWinsUSD,
      totalLossesUSD,
      avgWin,
      avgLoss,
      profitFactor,
      netDifference,
    };
  }, [hyperliquidClosedTrades]);

  // Filtered closed trades
  const filteredClosedTrades = useMemo(() => {
    return hyperliquidClosedTrades.filter((t) => {
      if (historySearch.trim()) {
        const q = historySearch.trim().toUpperCase();
        if (!t.coin.toUpperCase().includes(q) && !t.symbol.toUpperCase().includes(q)) {
          return false;
        }
      }
      if (historyFilter === 'WINS' && t.closedPnlUSD <= 0) return false;
      if (historyFilter === 'LOSSES' && t.closedPnlUSD >= 0) return false;
      if (historyDir === 'LONG' && !t.dir.toLowerCase().includes('long')) return false;
      if (historyDir === 'SHORT' && !t.dir.toLowerCase().includes('short')) return false;
      return true;
    });
  }, [hyperliquidClosedTrades, historySearch, historyFilter, historyDir]);

  // Subtotal statistics for currently filtered trades
  const filteredStats = useMemo(() => {
    let sumPnl = 0;
    let sumWinsUSD = 0;
    let sumLossesUSD = 0;
    let wins = 0;
    let losses = 0;

    filteredClosedTrades.forEach((t) => {
      const pnl = t.closedPnlUSD || 0;
      sumPnl += pnl;
      if (pnl > 0) {
        wins++;
        sumWinsUSD += pnl;
      } else if (pnl < 0) {
        losses++;
        sumLossesUSD += Math.abs(pnl);
      }
    });

    return {
      sumPnl,
      sumWinsUSD,
      sumLossesUSD,
      netDifference: sumWinsUSD - sumLossesUSD,
      wins,
      losses,
      count: filteredClosedTrades.length,
    };
  }, [filteredClosedTrades]);

  // Poll 24/7 server daemon status & fetch closed trades on open
  useEffect(() => {
    if (isHyperliquidModalOpen) {
      fetchHyperliquidClosedTrades();
    }
  }, [isHyperliquidModalOpen]);

  // Poll 24/7 server daemon status
  const fetchServerStatus = async () => {
    try {
      const res = await fetch('/api/bot/status');
      if (res.ok) {
        const data = await res.json();
        setServerStatus(data);
        if (data.instantProfitTake !== undefined) {
          setInstantProfitEnabled(data.instantProfitTake);
        }
        if (data.minInstantProfitUSD !== undefined) {
          setMinProfitInput(data.minInstantProfitUSD.toString());
        }
      }
    } catch (e) {
      // offline / quiet
    }
  };

  useEffect(() => {
    if (isHyperliquidModalOpen && activeTab === 'bot') {
      fetchServerStatus();
      const interval = setInterval(fetchServerStatus, 4000);
      return () => clearInterval(interval);
    }
  }, [isHyperliquidModalOpen, activeTab]);

  const handleStartServerBot = async () => {
    let key = (agentKeyInput || hyperliquidAgentKey || '').trim().replace(/^['"]|['"]$/g, '');
    let wallet = (walletInput || hyperliquidWallet || '').trim().replace(/^['"]|['"]$/g, '');

    const isDitto = key.startsWith('ditto_sk_') || key.startsWith('ditto_');
    const isHex = /^(0x)?[0-9a-fA-F]{64}$/.test(key);

    if (isDitto) {
      // Normalize any whitespace copied to hyphen
      key = key.replace(/\s+/g, '-');
      setAgentKeyInput(key);
      setHyperliquidAgentKey(key);
    } else if (isHex) {
      if (!key.startsWith('0x')) {
        key = '0x' + key;
      }
      setAgentKeyInput(key);
      setHyperliquidAgentKey(key);
    } else {
      setOrderFeedback({
        type: 'err',
        msg: '⚠️ Clave de API no reconocida. Ingresa tu API Key de Ditto (ditto_sk_...) o tu Clave de Agente Hyperliquid (0x... de 64 caracteres).',
      });
      return;
    }

    // Auto prepend 0x if wallet is 40 hex chars
    if (wallet && !wallet.startsWith('0x') && /^[0-9a-fA-F]{40}$/.test(wallet)) {
      wallet = '0x' + wallet;
      setWalletInput(wallet);
      setHyperliquidWallet(wallet);
    }

    setIsStartingServer(true);
    try {
      const res = await fetch('/api/bot/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: wallet,
          agentPrivateKey: key,
          capitalPerTrade: botConfig.capitalPerTrade,
          leverage: hyperliquidDefaultLeverage,
          allowedSymbols: [], // All Perps, Memes & Predictions
          timeframe: currentTimeframe || '1m',
          scanIntervalSeconds: 6,
          minSignalScore: 55,
          maxConcurrentTrades: serverStatus?.maxConcurrentTrades || botConfig.maxConcurrentTrades || 8,
          instantProfitTake: instantProfitEnabled,
          minInstantProfitUSD: parseFloat(minProfitInput) || 1.50,
          maxDrawdownPercent: 0.08,
          longOnly: botConfig.tradeDirection === 'LONG_ONLY',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setServerStatus(data.status);
        setOrderFeedback({
          type: 'ok',
          msg: '🚀 ¡Bot de Alta Convicción 24/7 activado en el VPS! Ya puedes cerrar esta ventana o apagar tu PC.',
        });
      } else {
        setOrderFeedback({ type: 'err', msg: data.error || 'Error al iniciar bot en el servidor' });
      }
    } catch (err: any) {
      setOrderFeedback({ type: 'err', msg: err.message });
    } finally {
      setIsStartingServer(false);
      setTimeout(() => setOrderFeedback(null), 6000);
    }
  };

  const handleStopServerBot = async () => {
    setIsStartingServer(true);
    try {
      const res = await fetch('/api/bot/stop', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setServerStatus(data.status);
        setOrderFeedback({ type: 'ok', msg: '⏸️ Bot 24/7 pausado en el servidor VPS.' });
      }
    } catch (err: any) {
      setOrderFeedback({ type: 'err', msg: err.message });
    } finally {
      setIsStartingServer(false);
      setTimeout(() => setOrderFeedback(null), 4000);
    }
  };

  // Load markets on open
  useEffect(() => {
    if (isHyperliquidModalOpen) {
      setWalletInput(hyperliquidWallet);
      setAgentKeyInput(hyperliquidAgentKey);
      loadMarkets();
      if (hyperliquidWallet.startsWith('0x')) {
        refreshHyperliquidAccount();
      }
    }
  }, [isHyperliquidModalOpen]);

  const loadMarkets = async () => {
    setIsLoadingMarkets(true);
    try {
      const data = await fetchHyperliquidMarkets();
      setHlMarkets(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingMarkets(false);
    }
  };

  const handleSaveWallet = () => {
    const clean = walletInput.trim();
    setHyperliquidWallet(clean);
  };

  const handleSaveAgentKey = () => {
    let cleanKey = (agentKeyInput || '').trim().replace(/^['"]|['"]$/g, '');
    let cleanWallet = (walletInput || '').trim().replace(/^['"]|['"]$/g, '');

    const isDitto = cleanKey.startsWith('ditto_sk_') || cleanKey.startsWith('ditto_');
    const isHex = /^(0x)?[0-9a-fA-F]{64}$/.test(cleanKey);

    if (isDitto) {
      cleanKey = cleanKey.replace(/\s+/g, '-');
      setAgentKeyInput(cleanKey);
    } else if (cleanKey && !cleanKey.startsWith('0x') && isHex) {
      cleanKey = '0x' + cleanKey;
      setAgentKeyInput(cleanKey);
    }

    if (cleanWallet && !cleanWallet.startsWith('0x') && /^[0-9a-fA-F]{40}$/.test(cleanWallet)) {
      cleanWallet = '0x' + cleanWallet;
      setWalletInput(cleanWallet);
    }

    setHyperliquidAgentKey(cleanKey);
    if (cleanWallet) setHyperliquidWallet(cleanWallet);
    setOrderFeedback({
      type: 'ok',
      msg: isDitto
        ? '✅ API Key de Ditto Network guardada con éxito.'
        : '✅ Claves de Agente y Billetera guardadas de forma segura.',
    });
    setTimeout(() => setOrderFeedback(null), 4000);
  };

  const handleClosePosition = async (coin: string) => {
    if (!hyperliquidAgentKey) {
      alert('Se requiere configurar una Clave de Agente (Agent API Key) para ejecutar el cierre on-chain.');
      return;
    }
    setClosingCoin(coin);
    try {
      const res = await closeLiveHyperliquidPosition(coin);
      if (res.status === 'ok') {
        setOrderFeedback({ type: 'ok', msg: `Posición en ${coin} cerrada exitosamente a mercado.` });
      } else {
        setOrderFeedback({ type: 'err', msg: `Error al cerrar: ${res.error}` });
      }
    } finally {
      setClosingCoin(null);
      setTimeout(() => setOrderFeedback(null), 5000);
    }
  };

  const handleSendTestOrder = async () => {
    if (!hyperliquidAgentKey) {
      setOrderFeedback({ type: 'err', msg: 'Configura primero la Clave de Agente' });
      return;
    }
    setIsSubmittingOrder(true);
    setOrderFeedback(null);
    try {
      const sz = parseFloat(testOrderSize);
      if (isNaN(sz) || sz <= 0) {
        setOrderFeedback({ type: 'err', msg: 'Tamaño de orden inválido' });
        return;
      }
      const res = await executeLiveHyperliquidOrder({
        coin: testOrderCoin,
        isBuy: testOrderSide === 'BUY',
        sz,
        orderType: 'MARKET',
      });
      if (res.status === 'ok') {
        setOrderFeedback({ type: 'ok', msg: `Orden ${testOrderSide} de ${sz} ${testOrderCoin} ejecutada con éxito en Hyperliquid!` });
      } else {
        setOrderFeedback({ type: 'err', msg: `Fallo en orden: ${res.error}` });
      }
    } catch (e: any) {
      setOrderFeedback({ type: 'err', msg: e.message || 'Error desconocido' });
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const filteredMarkets = useMemo(() => {
    const q = marketSearch.toLowerCase().trim();
    return hlMarkets.filter(
      (m) =>
        m.symbol.toLowerCase().includes(q) ||
        (m.coin && m.coin.toLowerCase().includes(q)) ||
        (m.displayName && m.displayName.toLowerCase().includes(q))
    );
  }, [hlMarkets, marketSearch]);

  if (!isHyperliquidModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200 select-none">
      <div className="relative w-full max-w-5xl h-[88vh] max-h-[780px] bg-[#08090d] border border-white/[0.1] rounded-2xl flex flex-col shadow-2xl overflow-hidden text-xs font-mono">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.08] bg-[#050608]/90">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Zap className="w-4 h-4 fill-emerald-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-sm tracking-wide text-white">
                  HYPERLIQUID L1 HUB
                </span>
                <span className="px-1.5 py-0.2 rounded text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-medium">
                  PERPETUALS DEX
                </span>
              </div>
              <p className="text-[10px] text-slate-400">
                Mercados perpetuos, tasas de financiación, portafolio on-chain y ejecución con Bot
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <a
              href="https://app.hyperliquid.xyz/"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/[0.08] transition-colors text-[11px]"
            >
              <span>app.hyperliquid.xyz</span>
              <ExternalLink className="w-3 h-3" />
            </a>

            <button
              onClick={() => setHyperliquidModalOpen(false)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center justify-between px-5 border-b border-white/[0.08] bg-[#06070a]/80">
          <div className="flex items-center space-x-1 py-1.5">
            <button
              onClick={() => setActiveTab('markets')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-all cursor-pointer ${
                activeTab === 'markets'
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-xs'
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Mercados & Funding ({hlMarkets.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('portfolio')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-all cursor-pointer ${
                activeTab === 'portfolio'
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-xs'
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>Mi Portafolio On-Chain</span>
              {hyperliquidAccount && hyperliquidAccount.assetPositions.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </button>

            <button
              onClick={() => {
                setActiveTab('history');
                fetchHyperliquidClosedTrades();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-all cursor-pointer ${
                activeTab === 'history'
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-xs'
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Historial Cerrado (Ditto / HL)</span>
              {hyperliquidClosedTrades.length > 0 && (
                <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-500/20 text-emerald-300 font-bold">
                  {hyperliquidClosedTrades.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('bot')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-all cursor-pointer ${
                activeTab === 'bot'
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-xs'
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>Trading Bot & Agent API</span>
              {(botConfig.executeOnHyperliquid || hyperliquidAutoTrade) && (
                <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-500/20 text-emerald-300 font-bold">
                  ACTIVO
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('guide')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition-all cursor-pointer ${
                activeTab === 'guide'
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-xs'
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Guía & Setup</span>
            </button>
          </div>

          <div className="flex items-center space-x-2 text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Hyperliquid L1 Mainnet</span>
            </span>
          </div>
        </div>

        {/* Tab 1: Markets & Funding Rates */}
        {activeTab === 'markets' && (
          <div className="flex-1 flex flex-col p-4 overflow-hidden gap-3">
            <div className="flex items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Buscar activo (ej. BTC, ETH, SOL, HYPE, PURR)..."
                  value={marketSearch}
                  onChange={(e) => setMarketSearch(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/[0.08] focus:border-emerald-500/50 rounded-xl pl-9 pr-3 py-1.5 text-white text-xs outline-none placeholder:text-slate-600 font-mono"
                />
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={loadMarkets}
                  disabled={isLoadingMarkets}
                  className="px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/[0.08] flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingMarkets ? 'animate-spin text-emerald-400' : ''}`} />
                  <span>Actualizar</span>
                </button>
              </div>
            </div>

            {/* Markets Table */}
            <div className="flex-1 overflow-y-auto border border-white/[0.07] rounded-xl bg-white/[0.01]">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-[#07080c] z-10 text-[10px] uppercase tracking-wider text-slate-500 border-b border-white/[0.08]">
                  <tr>
                    <th className="py-2.5 px-3">Activo</th>
                    <th className="py-2.5 px-3">Precio Mark</th>
                    <th className="py-2.5 px-3">Cambio 24h</th>
                    <th className="py-2.5 px-3">Funding (8h / Anual)</th>
                    <th className="py-2.5 px-3">Volumen 24h</th>
                    <th className="py-2.5 px-3">Apalancamiento</th>
                    <th className="py-2.5 px-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {filteredMarkets.slice(0, 100).map((m) => {
                    const isPositive = m.priceChangePercent >= 0;
                    const fr = m.fundingRate ?? 0;
                    const frAnn = m.fundingRateAnnualized ?? 0;

                    return (
                      <tr key={m.symbol} className="hover:bg-white/[0.02] transition-colors group">
                        <td className="py-2.5 px-3">
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-white">{m.coin || m.symbol}</span>
                            <span className="px-1.5 py-0.2 rounded text-[9px] bg-white/[0.04] text-slate-400 border border-white/[0.06]">
                              PERP
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-white">
                          ${m.lastPrice < 1 ? m.lastPrice.toFixed(4) : m.lastPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`flex items-center font-medium ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isPositive ? '+' : ''}{m.priceChangePercent.toFixed(2)}%
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex flex-col">
                            <span className={fr >= 0 ? 'text-amber-400' : 'text-indigo-400'}>
                              {(fr * 100).toFixed(4)}% / 8h
                            </span>
                            <span className="text-[10px] text-slate-500">
                              APR: {frAnn >= 0 ? '+' : ''}{frAnn.toFixed(2)}%
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-300">
                          ${(m.quoteVolume / 1_000_000).toFixed(2)}M
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                            Hasta {m.maxLeverage || 50}x
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end space-x-1.5">
                            <button
                              onClick={() => {
                                setSymbol(m.symbol);
                                setHyperliquidModalOpen(false);
                              }}
                              className="px-2 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.1] text-slate-200 hover:text-white transition-colors text-[10px] cursor-pointer"
                              title="Ver gráfico y señales en HIK453 Terminal"
                            >
                              Ver Gráfico
                            </button>
                            <a
                              href={`https://app.hyperliquid.xyz/trade/${m.coin || m.symbol}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
                              title="Operar en Hyperliquid"
                            >
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 2: On-Chain Portfolio */}
        {activeTab === 'portfolio' && (
          <div className="flex-1 flex flex-col p-4 overflow-y-auto gap-4">
            {/* Wallet Address Input Bar */}
            <div className="bg-[#0b0c10] border border-white/[0.08] p-3.5 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center space-x-2.5 w-full sm:w-auto">
                <Wallet className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-white font-medium">Billetera EVM:</span>
                <input
                  type="text"
                  placeholder="0x... (Cualquier dirección pública de Ethereum/Arbitrum)"
                  value={walletInput}
                  onChange={(e) => setWalletInput(e.target.value)}
                  className="flex-1 sm:w-80 bg-white/[0.04] border border-white/[0.1] rounded-lg px-2.5 py-1 text-white font-mono text-xs outline-none focus:border-emerald-500/50"
                />
              </div>

              <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                <button
                  onClick={handleSaveWallet}
                  className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-semibold transition-all cursor-pointer"
                >
                  Guardar & Conectar
                </button>
                <button
                  onClick={refreshHyperliquidAccount}
                  disabled={isLoadingHyperliquidAccount || !hyperliquidWallet}
                  className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white transition-colors cursor-pointer disabled:opacity-40"
                  title="Refrescar estado"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingHyperliquidAccount ? 'animate-spin text-emerald-400' : ''}`} />
                </button>
              </div>
            </div>

            {/* Account Overview Cards */}
            {hyperliquidAccount ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-white/[0.02] border border-white/[0.07] p-3 rounded-xl flex flex-col">
                    <span className="text-slate-500 text-[10px] uppercase">Valor Total Cuenta</span>
                    <span className="text-lg font-bold text-white mt-1">
                      ${hyperliquidAccount.marginSummary.accountValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-[10px] text-emerald-400 mt-0.5">Colateral USDC</span>
                  </div>

                  <div className="bg-white/[0.02] border border-white/[0.07] p-3 rounded-xl flex flex-col">
                    <span className="text-slate-500 text-[10px] uppercase">Margen Utilizado</span>
                    <span className="text-lg font-bold text-white mt-1">
                      ${hyperliquidAccount.marginSummary.totalMarginUsed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-[10px] text-slate-400 mt-0.5">
                      {hyperliquidAccount.marginSummary.accountValue > 0
                        ? `${((hyperliquidAccount.marginSummary.totalMarginUsed / hyperliquidAccount.marginSummary.accountValue) * 100).toFixed(1)}% utilizado`
                        : '0%'}
                    </span>
                  </div>

                  <div className="bg-white/[0.02] border border-white/[0.07] p-3 rounded-xl flex flex-col">
                    <span className="text-slate-500 text-[10px] uppercase">Disponible para Retiro</span>
                    <span className="text-lg font-bold text-emerald-400 mt-1">
                      ${hyperliquidAccount.withdrawable.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-[10px] text-slate-400 mt-0.5">Libre sin riesgo</span>
                  </div>

                  <div className="bg-white/[0.02] border border-white/[0.07] p-3 rounded-xl flex flex-col">
                    <span className="text-slate-500 text-[10px] uppercase">Valor Nocional Total</span>
                    <span className="text-lg font-bold text-slate-200 mt-1">
                      ${hyperliquidAccount.marginSummary.totalNtlPos.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-[10px] text-slate-400 mt-0.5">Posiciones abiertas</span>
                  </div>
                </div>

                {/* Positions vs Closed History Sub-tabs */}
                <div className="flex-1 border border-white/[0.07] rounded-xl bg-white/[0.01] overflow-hidden flex flex-col">
                  <div className="px-4 py-2 border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-2 bg-[#08090d]">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setPortfolioSubTab('OPEN')}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer ${
                          portfolioSubTab === 'OPEN'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-xs'
                            : 'text-slate-400 hover:text-white bg-white/[0.03]'
                        }`}
                      >
                        <Activity className="w-3.5 h-3.5" />
                        <span>Posiciones Abiertas ({hyperliquidAccount.assetPositions.length})</span>
                      </button>

                      <button
                        onClick={() => {
                          setPortfolioSubTab('CLOSED');
                          fetchHyperliquidClosedTrades();
                        }}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer ${
                          portfolioSubTab === 'CLOSED'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-xs'
                            : 'text-slate-400 hover:text-white bg-white/[0.03]'
                        }`}
                      >
                        <History className="w-3.5 h-3.5" />
                        <span>Historial Cerrado ({hyperliquidClosedTrades.length})</span>
                      </button>
                    </div>

                    <div className="text-[10px] text-slate-400 flex items-center gap-2">
                      <span>
                        {portfolioSubTab === 'OPEN'
                          ? 'Liquidación y PnL calculados on-chain'
                          : `${closedStats.total} cerradas · Win Rate: ${closedStats.winRate.toFixed(1)}% · PnL: ${closedStats.totalPnl >= 0 ? '+' : ''}$${closedStats.totalPnl.toFixed(2)}`}
                      </span>
                      <button
                        onClick={() => {
                          refreshHyperliquidAccount();
                          fetchHyperliquidClosedTrades();
                        }}
                        className="p-1 rounded bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white transition-colors cursor-pointer"
                        title="Refrescar datos"
                      >
                        <RefreshCw className={`w-3 h-3 ${isLoadingHyperliquidClosedTrades || isLoadingHyperliquidAccount ? 'animate-spin text-emerald-400' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {portfolioSubTab === 'OPEN' ? (
                    hyperliquidAccount.assetPositions.length === 0 ? (
                      <div className="p-8 text-center text-slate-500">
                        No tienes posiciones abiertas en Hyperliquid para esta billetera.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead className="bg-[#050608] text-[10px] uppercase text-slate-500 border-b border-white/[0.06]">
                            <tr>
                              <th className="py-2 px-3">Par</th>
                              <th className="py-2 px-3">Lado</th>
                              <th className="py-2 px-3">Tamaño</th>
                              <th className="py-2 px-3">Precio Entrada</th>
                              <th className="py-2 px-3">Precio Liq.</th>
                              <th className="py-2 px-3">PnL No Realizado</th>
                              <th className="py-2 px-3">Apalancamiento</th>
                              <th className="py-2 px-3 text-right">Acción</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/[0.04]">
                            {hyperliquidAccount.assetPositions.map((pos) => {
                              const isLong = pos.szi > 0;
                              const isProfit = pos.unrealizedPnl >= 0;

                              return (
                                <tr key={pos.coin} className="hover:bg-white/[0.02]">
                                  <td className="py-2.5 px-3 font-bold text-white">{pos.coin}-PERP</td>
                                  <td className="py-2.5 px-3">
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                        isLong
                                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                          : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                                      }`}
                                    >
                                      {isLong ? 'LONG' : 'SHORT'}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-200">{Math.abs(pos.szi)}</td>
                                  <td className="py-2.5 px-3 text-slate-300">${pos.entryPx.toFixed(2)}</td>
                                  <td className="py-2.5 px-3 text-rose-400 font-semibold">
                                    {pos.liquidationPx ? `$${pos.liquidationPx.toFixed(2)}` : 'N/A'}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <div className="flex flex-col">
                                      <span className={`font-bold ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {isProfit ? '+' : ''}${pos.unrealizedPnl.toFixed(2)}
                                      </span>
                                      <span className="text-[10px] text-slate-500">
                                        ({pos.returnOnEquity.toFixed(2)}% ROE)
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <span className="text-slate-300">
                                      {pos.leverage.value}x ({pos.leverage.type})
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-right">
                                    <button
                                      onClick={() => handleClosePosition(pos.coin)}
                                      disabled={closingCoin === pos.coin}
                                      className="px-2.5 py-1 rounded bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 transition-colors text-[10px] cursor-pointer disabled:opacity-40"
                                      title="Cerrar posición a mercado usando la clave de Agente"
                                    >
                                      {closingCoin === pos.coin ? 'Cerrando...' : 'Cerrar a Mercado'}
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )
                  ) : (
                    /* Closed History Sub-tab */
                    <div className="flex-1 flex flex-col overflow-hidden">
                      {hyperliquidClosedTrades.length === 0 ? (
                        <div className="p-8 text-center text-slate-500">
                          {isLoadingHyperliquidClosedTrades ? (
                            <div className="flex items-center justify-center space-x-2">
                              <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                              <span>Cargando transacciones de Hyperliquid L1...</span>
                            </div>
                          ) : (
                            <span>No hay operaciones cerradas registradas on-chain aún.</span>
                          )}
                        </div>
                      ) : (
                        <div className="overflow-x-auto flex-1">
                          <table className="w-full text-left border-collapse">
                            <thead className="bg-[#050608] text-[10px] uppercase text-slate-500 border-b border-white/[0.06] sticky top-0 z-10">
                              <tr>
                                <th className="py-2 px-3">Par</th>
                                <th className="py-2 px-3">Acción</th>
                                <th className="py-2 px-3">Fecha</th>
                                <th className="py-2 px-3">Precio Cierre</th>
                                <th className="py-2 px-3">Tamaño</th>
                                <th className="py-2 px-3">PnL Realizado</th>
                                <th className="py-2 px-3">Comisión</th>
                                <th className="py-2 px-3">Tx On-Chain</th>
                                <th className="py-2 px-3 text-right">Acción</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.04]">
                              {hyperliquidClosedTrades.map((t) => {
                                const isProfit = t.closedPnlUSD > 0;
                                const isCloseLong = t.dir.toLowerCase().includes('long');
                                return (
                                  <tr key={t.id} className="hover:bg-white/[0.02]">
                                    <td className="py-2.5 px-3 font-bold text-white">{t.coin}-PERP</td>
                                    <td className="py-2.5 px-3">
                                      <span
                                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                          isCloseLong
                                            ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                                            : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                        }`}
                                      >
                                        {t.dir}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3 text-slate-400 text-[10px] whitespace-nowrap">
                                      {formatTimestamp(t.time)}
                                    </td>
                                    <td className="py-2.5 px-3 font-semibold text-slate-200">
                                      ${t.exitPrice < 1 ? t.exitPrice.toFixed(4) : t.exitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                                    </td>
                                    <td className="py-2.5 px-3 text-slate-300">
                                      {t.size} {t.coin} (${t.notionalUSD.toFixed(1)})
                                    </td>
                                    <td className="py-2.5 px-3">
                                      <span className={`font-bold ${isProfit ? 'text-emerald-400' : t.closedPnlUSD < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                                        {isProfit ? '+' : ''}${t.closedPnlUSD.toFixed(3)} USD
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3 text-slate-400 text-[10px]">
                                      {t.feeUSD > 0 ? `$${t.feeUSD.toFixed(4)}` : '$0.00'}
                                    </td>
                                    <td className="py-2.5 px-3">
                                      {t.hash ? (
                                        <a
                                          href={`https://app.hyperliquid.xyz/explorer/tx/${t.hash}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-emerald-400 hover:text-emerald-300 underline font-mono text-[10px] flex items-center space-x-1"
                                        >
                                          <span>{t.hash.slice(0, 6)}...{t.hash.slice(-4)}</span>
                                          <ExternalLink className="w-2.5 h-2.5" />
                                        </a>
                                      ) : (
                                        <span className="text-slate-600 text-[10px]">Daemon Local</span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3 text-right">
                                      <button
                                        onClick={() => {
                                          setSymbol(t.symbol);
                                          setHyperliquidModalOpen(false);
                                        }}
                                        className="px-2 py-1 rounded bg-white/[0.04] hover:bg-white/[0.1] text-slate-200 hover:text-white transition-colors text-[10px] cursor-pointer"
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
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 border border-dashed border-white/[0.1] rounded-2xl text-center">
                <Wallet className="w-10 h-10 text-slate-600 mb-3" />
                <h4 className="text-white font-medium text-sm mb-1">Conecta tu dirección de Hyperliquid</h4>
                <p className="text-slate-500 max-w-md text-[11px] mb-4">
                  Ingresa tu billetera pública de Ethereum/Arbitrum arriba para ver tu portafolio, colateral USDC y posiciones abiertas sin requerir claves privadas.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Closed Trades History (Ditto Competition & Hyperliquid) */}
        {activeTab === 'history' && (
          <div className="flex-1 flex flex-col p-4 overflow-y-auto gap-4">
            {/* Summary Metrics Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-white/[0.02] border border-white/[0.07] p-3 rounded-xl flex flex-col">
                <span className="text-slate-500 text-[10px] uppercase">PnL Realizado Neto</span>
                <span className={`text-lg font-bold mt-1 ${closedStats.totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {closedStats.totalPnl >= 0 ? '+' : ''}${closedStats.totalPnl.toFixed(2)} USD
                </span>
                <span className="text-[10px] text-slate-400 mt-0.5">Torneo Ditto & L1</span>
              </div>

              <div className="bg-white/[0.02] border border-white/[0.07] p-3 rounded-xl flex flex-col">
                <span className="text-slate-500 text-[10px] uppercase">Tasa de Acierto (Win Rate)</span>
                <span className="text-lg font-bold text-white mt-1">
                  {closedStats.winRate.toFixed(1)}%
                </span>
                <span className="text-[10px] text-slate-400 mt-0.5">
                  <span className="text-emerald-400 font-semibold">{closedStats.wins}W</span> / <span className="text-rose-400 font-semibold">{closedStats.losses}L</span>
                </span>
              </div>

              <div className="bg-white/[0.02] border border-white/[0.07] p-3 rounded-xl flex flex-col">
                <span className="text-slate-500 text-[10px] uppercase">Volumen Negociado</span>
                <span className="text-lg font-bold text-slate-200 mt-1">
                  ${closedStats.totalVol.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[10px] text-slate-400 mt-0.5">Nocional ejecutado</span>
              </div>

              <div className="bg-white/[0.02] border border-white/[0.07] p-3 rounded-xl flex flex-col">
                <span className="text-slate-500 text-[10px] uppercase">Operaciones Cerradas</span>
                <span className="text-lg font-bold text-emerald-400 mt-1">
                  {closedStats.total}
                </span>
                <span className="text-[10px] text-slate-400 mt-0.5">Verificadas on-chain</span>
              </div>

              <div className="bg-white/[0.02] border border-white/[0.07] p-3 rounded-xl flex flex-col col-span-2 md:col-span-1">
                <span className="text-slate-500 text-[10px] uppercase">Comisiones (Fees)</span>
                <span className="text-lg font-bold text-amber-400 mt-1">
                  ${closedStats.totalFees.toFixed(4)}
                </span>
                <span className="text-[10px] text-slate-400 mt-0.5">Gas L1 y broker fees</span>
              </div>
            </div>

            {/* Desglose Financiero Total: Ganancias vs Pérdidas con Diferencia Neta */}
            <div className="bg-gradient-to-r from-emerald-950/30 via-slate-900/50 to-rose-950/30 border border-white/[0.1] rounded-2xl p-4 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <Scale className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-white text-xs font-bold tracking-wide uppercase flex items-center gap-2">
                      <span>Balance Acumulado: Ganancias vs Pérdidas</span>
                      <span className="text-[10px] font-normal text-slate-400 lowercase font-mono">
                        ({closedStats.total} operaciones totales)
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Suma total del dinero ganado vs dinero perdido con su diferencia neta exacta
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-[11px] text-slate-400">Profit Factor:</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${
                    closedStats.profitFactor >= 1.2
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : closedStats.profitFactor >= 1.0
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  }`}>
                    {closedStats.profitFactor.toFixed(2)}x
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* 1. Suma de Ganancias */}
                <div
                  onClick={() => setHistoryFilter('WINS')}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer relative overflow-hidden group ${
                    historyFilter === 'WINS'
                      ? 'bg-emerald-500/15 border-emerald-500/50 shadow-lg shadow-emerald-950/50 ring-1 ring-emerald-500/50'
                      : 'bg-emerald-950/20 border-emerald-500/25 hover:border-emerald-500/40 hover:bg-emerald-950/30'
                  }`}
                  title="Haz clic para ver solo las operaciones ganadoras"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1.5 uppercase tracking-wider">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      Suma Ganancias
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                      {closedStats.wins} ganadas
                    </span>
                  </div>
                  <div className="text-2xl font-black font-mono text-emerald-400 mt-2 tracking-tight">
                    +${closedStats.totalWinsUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                    <span className="text-xs font-semibold text-emerald-400/70">USD</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mt-2 pt-2 border-t border-emerald-500/15">
                    <span>Promedio por ganada:</span>
                    <span className="font-mono text-emerald-300 font-bold">
                      +${closedStats.avgWin.toFixed(2)} USD
                    </span>
                  </div>
                </div>

                {/* 2. Suma de Pérdidas */}
                <div
                  onClick={() => setHistoryFilter('LOSSES')}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer relative overflow-hidden group ${
                    historyFilter === 'LOSSES'
                      ? 'bg-rose-500/15 border-rose-500/50 shadow-lg shadow-rose-950/50 ring-1 ring-rose-500/50'
                      : 'bg-rose-950/20 border-rose-500/25 hover:border-rose-500/40 hover:bg-rose-950/30'
                  }`}
                  title="Haz clic para ver solo las operaciones perdedoras"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-rose-400 flex items-center gap-1.5 uppercase tracking-wider">
                      <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse"></span>
                      Suma Pérdidas
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 font-mono font-bold">
                      {closedStats.losses} perdidas
                    </span>
                  </div>
                  <div className="text-2xl font-black font-mono text-rose-400 mt-2 tracking-tight">
                    -${closedStats.totalLossesUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                    <span className="text-xs font-semibold text-rose-400/70">USD</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mt-2 pt-2 border-t border-rose-500/15">
                    <span>Promedio por pérdida:</span>
                    <span className="font-mono text-rose-300 font-bold">
                      -${closedStats.avgLoss.toFixed(2)} USD
                    </span>
                  </div>
                </div>

                {/* 3. Diferencia Neta */}
                <div
                  onClick={() => setHistoryFilter('ALL')}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer relative overflow-hidden group ${
                    historyFilter === 'ALL'
                      ? 'bg-white/[0.06] border-white/30 shadow-lg ring-1 ring-white/20'
                      : 'bg-white/[0.02] border-white/10 hover:border-white/20 hover:bg-white/[0.04]'
                  }`}
                  title="Haz clic para restablecer la vista a todas las operaciones"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
                      <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
                      Diferencia Neta
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/10 text-slate-300 font-mono font-bold">
                      Ganadas - Pérdidas
                    </span>
                  </div>
                  <div className={`text-2xl font-black font-mono mt-2 tracking-tight ${
                    closedStats.netDifference >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {closedStats.netDifference >= 0 ? '+' : '-'}$
                    {Math.abs(closedStats.netDifference).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{' '}
                    <span className="text-xs font-semibold text-slate-400">USD</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mt-2 pt-2 border-t border-white/10">
                    <span>Win Rate ({closedStats.winRate.toFixed(1)}%):</span>
                    <span className="font-mono text-slate-200 font-semibold">
                      <span className="text-emerald-400">{closedStats.wins}W</span> / <span className="text-rose-400">{closedStats.losses}L</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="bg-[#0b0c10] border border-white/[0.08] p-3 rounded-xl flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 flex-1">
                <div className="relative min-w-[180px] max-w-xs">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Filtrar por token (ej. WLD, ENA, BTC)..."
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    className="w-full bg-white/[0.03] border border-white/[0.08] focus:border-emerald-500/50 rounded-lg pl-9 pr-3 py-1 text-white text-xs outline-none placeholder:text-slate-600 font-mono"
                  />
                </div>

                {/* Filter WINS / LOSSES con Montos Totales en Dólares */}
                <div className="flex rounded-lg overflow-hidden border border-white/[0.1] bg-white/[0.02]">
                  <button
                    onClick={() => setHistoryFilter('ALL')}
                    className={`px-3 py-1.5 text-[11px] font-medium transition-colors cursor-pointer flex items-center space-x-1 ${
                      historyFilter === 'ALL'
                        ? 'bg-white/[0.14] text-white font-semibold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>Todas ({closedStats.total})</span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      • Diff: {closedStats.netDifference >= 0 ? '+' : '-'}${Math.abs(closedStats.netDifference).toFixed(2)}
                    </span>
                  </button>
                  <button
                    onClick={() => setHistoryFilter('WINS')}
                    className={`px-3 py-1.5 text-[11px] font-medium transition-colors cursor-pointer flex items-center space-x-1 ${
                      historyFilter === 'WINS'
                        ? 'bg-emerald-500/25 text-emerald-300 font-bold border-l border-r border-emerald-500/30'
                        : 'text-slate-400 hover:text-emerald-400'
                    }`}
                  >
                    <span>Ganadoras ({closedStats.wins})</span>
                    <span className="text-[10px] text-emerald-400 font-mono font-bold">
                      • +${closedStats.totalWinsUSD.toFixed(2)}
                    </span>
                  </button>
                  <button
                    onClick={() => setHistoryFilter('LOSSES')}
                    className={`px-3 py-1.5 text-[11px] font-medium transition-colors cursor-pointer flex items-center space-x-1 ${
                      historyFilter === 'LOSSES'
                        ? 'bg-rose-500/25 text-rose-300 font-bold border-l border-rose-500/30'
                        : 'text-slate-400 hover:text-rose-400'
                    }`}
                  >
                    <span>Pérdidas ({closedStats.losses})</span>
                    <span className="text-[10px] text-rose-400 font-mono font-bold">
                      • -${closedStats.totalLossesUSD.toFixed(2)}
                    </span>
                  </button>
                </div>

                {/* Filter Direction */}
                <div className="flex rounded-lg overflow-hidden border border-white/[0.1] bg-white/[0.02]">
                  <button
                    onClick={() => setHistoryDir('ALL')}
                    className={`px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                      historyDir === 'ALL' ? 'bg-white/[0.12] text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Dirección: Todas
                  </button>
                  <button
                    onClick={() => setHistoryDir('LONG')}
                    className={`px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                      historyDir === 'LONG' ? 'bg-emerald-500/20 text-emerald-300 font-semibold' : 'text-slate-400 hover:text-emerald-400'
                    }`}
                  >
                    Long
                  </button>
                  <button
                    onClick={() => setHistoryDir('SHORT')}
                    className={`px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                      historyDir === 'SHORT' ? 'bg-rose-500/20 text-rose-300 font-semibold' : 'text-slate-400 hover:text-rose-400'
                    }`}
                  >
                    Short
                  </button>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={fetchHyperliquidClosedTrades}
                  disabled={isLoadingHyperliquidClosedTrades}
                  className="px-3 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/[0.08] flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 text-xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingHyperliquidClosedTrades ? 'animate-spin text-emerald-400' : ''}`} />
                  <span>Sincronizar On-Chain</span>
                </button>

                {hyperliquidWallet && (
                  <a
                    href={`https://app.hyperliquid.xyz/trade`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white border border-white/[0.08] transition-colors"
                    title="Ver en DEX Hyperliquid"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>

            {/* Subtotal Dinámico cuando hay filtros activos */}
            {(historyFilter !== 'ALL' || historySearch.trim() !== '' || historyDir !== 'ALL') && (
              <div className="bg-slate-900/80 border border-white/[0.08] px-4 py-2.5 rounded-xl flex flex-wrap items-center justify-between text-xs gap-2 shadow-inner">
                <div className="flex flex-wrap items-center gap-2">
                  <Filter className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-slate-300 font-medium">
                    Subtotal en vista actual ({filteredStats.count} ops):
                  </span>
                  <span className="text-emerald-400 font-mono font-bold">
                    +${filteredStats.sumWinsUSD.toFixed(2)} USD ganados ({filteredStats.wins})
                  </span>
                  <span className="text-slate-600">•</span>
                  <span className="text-rose-400 font-mono font-bold">
                    -${filteredStats.sumLossesUSD.toFixed(2)} USD perdidos ({filteredStats.losses})
                  </span>
                  <span className="text-slate-600">•</span>
                  <span className="text-slate-400">Diferencia:</span>
                  <span className={`font-mono font-bold ${filteredStats.netDifference >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {filteredStats.netDifference >= 0 ? '+' : '-'}${Math.abs(filteredStats.netDifference).toFixed(2)} USD
                  </span>
                </div>
                <button
                  onClick={() => {
                    setHistoryFilter('ALL');
                    setHistorySearch('');
                    setHistoryDir('ALL');
                  }}
                  className="text-[11px] text-slate-400 hover:text-white underline cursor-pointer"
                >
                  Restablecer filtros
                </button>
              </div>
            )}

            {/* Closed Trades Table */}
            <div className="flex-1 border border-white/[0.07] rounded-xl bg-white/[0.01] overflow-hidden flex flex-col">
              <div className="px-4 py-2.5 border-b border-white/[0.08] flex items-center justify-between bg-[#08090d]">
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-white text-xs">
                    Registro de Operaciones Cerradas en Torneo Ditto
                  </span>
                  <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-500/20 text-emerald-400 font-semibold">
                    {filteredClosedTrades.length} registros
                  </span>
                </div>
                <span className="text-[10px] text-slate-400">
                  Transacciones firmadas y liquidadas en Hyperliquid L1
                </span>
              </div>

              {filteredClosedTrades.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  {isLoadingHyperliquidClosedTrades ? (
                    <div className="flex items-center justify-center space-x-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                      <span>Cargando historial de fills y transacciones on-chain...</span>
                    </div>
                  ) : (
                    <span>No hay operaciones cerradas que coincidan con los filtros.</span>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-[#050608] text-[10px] uppercase text-slate-500 border-b border-white/[0.06] sticky top-0 z-10">
                      <tr>
                        <th className="py-2.5 px-3">Par / Token</th>
                        <th className="py-2.5 px-3">Acción / Tipo</th>
                        <th className="py-2.5 px-3">Fecha y Hora</th>
                        <th className="py-2.5 px-3">Precio Cierre</th>
                        <th className="py-2.5 px-3">Tamaño / Nocional</th>
                        <th className="py-2.5 px-3">PnL Realizado</th>
                        <th className="py-2.5 px-3">Comisión</th>
                        <th className="py-2.5 px-3">Tx Hash On-Chain</th>
                        <th className="py-2.5 px-3 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {filteredClosedTrades.map((t) => {
                        const isProfit = t.closedPnlUSD > 0;
                        const isCloseLong = t.dir.toLowerCase().includes('long');

                        return (
                          <tr key={t.id} className="hover:bg-white/[0.02] transition-colors">
                            <td className="py-2.5 px-3">
                              <div className="flex items-center space-x-1.5">
                                <span className="font-bold text-white">{t.coin}</span>
                                <span className="px-1 py-0.2 rounded text-[8px] bg-white/[0.04] text-slate-400 border border-white/[0.06]">
                                  PERP
                                </span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex flex-col">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold inline-block w-fit ${
                                    isCloseLong
                                      ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                                      : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                  }`}
                                >
                                  {t.dir}
                                </span>
                                {t.exitReason && (
                                  <span className="text-[9px] text-slate-400 mt-0.5 font-mono">
                                    {t.exitReason}
                                  </span>
                                )}
                                {(t.rsi14 !== undefined || t.stochK !== undefined) && (
                                  <div className="flex flex-wrap items-center gap-1 mt-1 text-[8px] font-mono text-cyan-300/80 bg-cyan-950/30 border border-cyan-800/30 px-1 py-0.5 rounded">
                                    {t.rsi14 !== undefined && <span>RSI:{t.rsi14}</span>}
                                    {t.stochK !== undefined && <span>K:{t.stochK}% D:{t.stochD}%</span>}
                                    {t.spreadPct !== undefined && <span>Spr:{t.spreadPct}%</span>}
                                    {t.emaTrend && (
                                      <span className={t.emaTrend === 'BULLISH' ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                                        {t.emaTrend}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-slate-400 text-[10px] whitespace-nowrap">
                              {formatTimestamp(t.time)}
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-200">
                              ${t.exitPrice < 1 ? t.exitPrice.toFixed(4) : t.exitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex flex-col">
                                <span className="text-white font-medium">{t.size} {t.coin}</span>
                                <span className="text-[10px] text-slate-500">
                                  ${t.notionalUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                                </span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex flex-col">
                                <span className={`font-bold text-xs ${isProfit ? 'text-emerald-400' : t.closedPnlUSD < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                                  {isProfit ? '+' : ''}${t.closedPnlUSD.toFixed(3)} USD
                                </span>
                                {t.pnlPercent !== undefined && (
                                  <span className={`text-[10px] ${isProfit ? 'text-emerald-500/80' : 'text-rose-500/80'}`}>
                                    ({isProfit ? '+' : ''}{t.pnlPercent.toFixed(2)}%)
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-slate-400 text-[10px]">
                              {t.feeUSD > 0 ? `$${t.feeUSD.toFixed(4)}` : '$0.00'}
                            </td>
                            <td className="py-2.5 px-3">
                              {t.hash ? (
                                <a
                                  href={`https://app.hyperliquid.xyz/explorer/tx/${t.hash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-emerald-400 hover:text-emerald-300 underline font-mono text-[10px] flex items-center space-x-1"
                                  title={`Ver Tx On-Chain ${t.hash}`}
                                >
                                  <span>{t.hash.slice(0, 6)}...{t.hash.slice(-4)}</span>
                                  <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              ) : (
                                <span className="text-slate-600 text-[10px]">Daemon Local</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                onClick={() => {
                                  setSymbol(t.symbol);
                                  setHyperliquidModalOpen(false);
                                }}
                                className="px-2 py-1 rounded bg-white/[0.04] hover:bg-white/[0.1] text-slate-200 hover:text-white transition-colors text-[10px] cursor-pointer"
                                title="Ver gráfico en el terminal"
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
          </div>
        )}

        {/* Tab 3: Bot & Agent API */}
        {activeTab === 'bot' && (
          <div className="flex-1 flex flex-col p-4 overflow-y-auto gap-4">
            {/* Feedback alert */}
            {orderFeedback && (
              <div
                className={`p-3 rounded-xl border flex items-center space-x-2 ${
                  orderFeedback.type === 'ok'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}
              >
                {orderFeedback.type === 'ok' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span>{orderFeedback.msg}</span>
              </div>
            )}

            {/* Agent API Explainer Banner */}
            <div className="bg-emerald-500/5 border border-emerald-500/20 p-4 rounded-xl flex items-start space-x-3">
              <Shield className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-bold text-white text-xs">
                  Seguridad No-Custodial con Hyperliquid Extra Agents
                </span>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  Hyperliquid permite generar una clave secundaria llamada <b>&quot;Agent Wallet&quot;</b> directamente desde la sección <i>Settings &gt; API</i> de app.hyperliquid.xyz. Las claves de Agente <b>NO tienen permiso para retirar fondos</b>, garantizando 100% de seguridad en tu colateral mientras autorizan al bot a colocar y gestionar trades.
                </p>
              </div>
            </div>

            {/* Agent Key Input Box */}
            {/* Wallet & Agent API Key Input Box */}
            <div className="bg-[#0b0c10] border border-white/[0.08] p-4 rounded-xl space-y-3">
              {/* Main Wallet Input */}
              <div className="space-y-1.5">
                <span className="font-bold text-white text-xs flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5 text-cyan-400" />
                  Dirección de Billetera Principal (Donde tienes tu colateral USDC)
                </span>
                <input
                  type="text"
                  placeholder="0x... (Tu dirección pública en Hyperliquid / Arbitrum / Ethereum)"
                  value={walletInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setWalletInput(val);
                    setHyperliquidWallet(val.trim());
                  }}
                  className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-1.5 text-white font-mono text-xs outline-none focus:border-cyan-500/50"
                />
              </div>

              {/* Agent Private Key */}
              <div className="space-y-1.5 pt-2 border-t border-white/[0.06]">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-xs flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-emerald-400" />
                    Clave de API / Agente (Ditto Network API Key o Hyperliquid Agent Key)
                  </span>
                  <button
                    onClick={() => setShowKey(!showKey)}
                    className="text-slate-400 hover:text-white flex items-center space-x-1 text-[11px] cursor-pointer"
                  >
                    {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span>{showKey ? 'Ocultar' : 'Mostrar'}</span>
                  </button>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type={showKey ? 'text' : 'password'}
                    placeholder="ditto_sk_... (app.dittonetwork.io/settings) o 0x... (Hyperliquid API)"
                    value={agentKeyInput}
                    onChange={(e) => setAgentKeyInput(e.target.value)}
                    className="flex-1 bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-1.5 text-white font-mono text-xs outline-none focus:border-emerald-500/50"
                  />
                  <button
                    onClick={handleSaveAgentKey}
                    className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-semibold transition-all cursor-pointer"
                  >
                    Guardar Claves
                  </button>
                </div>
                <p className="text-[10px] text-slate-400">
                  <span className="text-emerald-400 font-semibold">✓ Compatible con Ditto Network:</span> Acepta claves <code className="text-emerald-300">ditto_sk_...</code> (de app.dittonetwork.io/settings para el Torneo) o claves hexadecimales de Agente Hyperliquid (<code className="text-slate-300">0x...</code>).
                </p>
              </div>
            </div>

            {/* 🚨 ALERTA SI EL CIRCUIT BREAKER SE DISPARÓ */}
            {serverStatus?.circuitBreakerTriggered && (
              <div className="bg-rose-950/70 border border-rose-500/60 p-4 rounded-xl flex items-start space-x-3 text-rose-200 shadow-xl">
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5 animate-bounce" />
                <div className="text-xs space-y-1">
                  <div className="font-bold text-white flex items-center gap-2">
                    <span>🚨 CIRCUIT BREAKER ACTIVADO — BOT PAUSADO AUTOMÁTICAMENTE</span>
                    <span className="px-2 py-0.5 rounded bg-rose-500/30 text-rose-200 text-[10px] font-mono border border-rose-500/40">
                      LÍMITE -8% ALCANZADO
                    </span>
                  </div>
                  <p className="text-slate-300">
                    El bot detectó una caída acumulada que superó el <b>8% del balance de la sesión</b> y se detuvo automáticamente para proteger el 92% de tu capital.
                  </p>
                </div>
              </div>
            )}

            {/* 🚀 MOTOR AUTÓNOMO 24/7 EN SERVIDOR VPS */}
            <div className="bg-gradient-to-r from-emerald-950/40 via-[#0d131a] to-[#0b0c10] border border-emerald-500/30 p-4 rounded-xl space-y-3 shadow-lg">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start space-x-3">
                  <div
                    className={`p-2.5 rounded-xl shrink-0 ${
                      serverStatus?.isActive
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : 'bg-white/5 text-slate-400'
                    }`}
                  >
                    <Server className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-white text-sm">Servidor Autónomo 24/7 en VPS</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          serverStatus?.isActive
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 animate-pulse'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {serverStatus?.isActive ? '● EN LÍNEA 24/7' : '○ DETENIDO'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                      Ejecución 100% autónoma en el VPS con <b>Protección Kill-Switch (Pausa automática si pierde &gt;8% del balance)</b>. Puedes apagar tu PC o cerrar este navegador.
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  {serverStatus?.isActive ? (
                    <button
                      onClick={handleStopServerBot}
                      disabled={isStartingServer}
                      className="px-4 py-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-semibold text-xs flex items-center space-x-1.5 transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Power className="w-3.5 h-3.5" />
                      <span>{isStartingServer ? 'Pausando...' : 'Pausar 24/7'}</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleStartServerBot}
                      disabled={isStartingServer}
                      className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs flex items-center space-x-1.5 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Play className="w-3.5 h-3.5 fill-black" />
                      <span>{isStartingServer ? 'Iniciando...' : 'Iniciar 24/7 en Servidor'}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Server Live Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 border-t border-white/[0.08]">
                <div className="bg-black/30 p-2.5 rounded-lg border border-white/[0.05]">
                  <span className="text-[10px] text-slate-400 block">Volumen Torneo</span>
                  <span className="text-sm font-bold text-emerald-400">
                    ${serverStatus?.stats?.totalVolumeUSD ? serverStatus.stats.totalVolumeUSD.toLocaleString(undefined, { maximumFractionDigits: 1 }) : '0.0'} USD
                  </span>
                </div>
                <div className="bg-black/30 p-2.5 rounded-lg border border-white/[0.05]">
                  <span className="text-[10px] text-slate-400 block">Trades Totales</span>
                  <span className="text-sm font-bold text-white">
                    {serverStatus?.stats?.totalTrades || 0}
                  </span>
                </div>
                <div className="bg-black/30 p-2.5 rounded-lg border border-white/[0.05]">
                  <span className="text-[10px] text-slate-400 block">Estrategia / Modo</span>
                  <div className="flex flex-col">
                    <span className="text-xs font-mono text-cyan-400 font-semibold">
                      Alta Convicción 5m
                    </span>
                    <span
                      className={`text-[10px] font-mono font-bold flex items-center gap-1 mt-0.5 ${
                        botConfig.tradeDirection === 'SHORT_ONLY'
                          ? 'text-rose-400'
                          : botConfig.tradeDirection === 'LONG_ONLY'
                          ? 'text-emerald-400'
                          : 'text-amber-400'
                      }`}
                    >
                      {botConfig.tradeDirection === 'SHORT_ONLY' ? (
                        <TrendingDown className="w-3 h-3 text-rose-400" />
                      ) : (
                        <TrendingUp className="w-3 h-3 text-emerald-400" />
                      )}
                      <span>
                        {botConfig.tradeDirection === 'LONG_ONLY'
                          ? 'SOLO COMPRAS (LONG)'
                          : botConfig.tradeDirection === 'SHORT_ONLY'
                          ? 'SOLO VENTAS (SHORT)'
                          : 'COMPRAS Y VENTAS (AMBAS)'}
                      </span>
                    </span>
                  </div>
                </div>
                <div className="bg-black/30 p-2.5 rounded-lg border border-white/[0.05]">
                  <span className="text-[10px] text-slate-400 block">Kill-Switch (8%)</span>
                  <span className="text-xs font-mono text-rose-400 font-semibold flex items-center gap-1">
                    <Shield className="w-3.5 h-3.5 text-rose-400 shrink-0" /> Pausa al -8%
                  </span>
                </div>
                <div className="bg-black/30 p-2.5 rounded-lg border border-white/[0.05]">
                  <span className="text-[10px] text-slate-400 block">Posiciones Activas</span>
                  <span className="text-sm font-bold text-amber-400">
                    {serverStatus?.activePositions?.length || 0} abiertas
                  </span>
                </div>
              </div>

              {/* Live Server Logs Preview */}
              {serverStatus?.recentLogs && serverStatus.recentLogs.length > 0 && (
                <div className="bg-black/40 rounded-lg p-2.5 border border-white/[0.05] space-y-1 font-mono text-[10px]">
                  <div className="flex items-center justify-between text-slate-400 pb-1 border-b border-white/[0.05]">
                    <span className="flex items-center gap-1">
                      <Terminal className="w-3 h-3 text-emerald-400" /> Registro en Vivo del VPS:
                    </span>
                    <span>{new Date(serverStatus.serverTime || Date.now()).toLocaleTimeString()}</span>
                  </div>
                  <div className="max-h-24 overflow-y-auto space-y-0.5">
                    {serverStatus.recentLogs.slice(0, 5).map((l: any) => (
                      <div key={l.id} className="text-slate-300 py-0.5 flex items-start gap-1.5">
                        <span className="text-slate-500 shrink-0">
                          [{new Date(l.timestamp).toLocaleTimeString()}]
                        </span>
                        <span
                          className={
                            l.type === 'EXECUTION' || l.type === 'SIGNAL'
                              ? 'text-emerald-400 font-semibold'
                              : l.type === 'SL_HIT'
                              ? 'text-rose-400'
                              : l.type === 'TP1_HIT' || l.type === 'TP2_HIT'
                              ? 'text-cyan-400'
                              : 'text-slate-300'
                          }
                        >
                          {l.message}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Bot Controls & Automation Settings */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Bot Auto Execution Toggle */}
              <div className="bg-[#0b0c10] border border-white/[0.08] p-4 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-white text-xs">Ejecución Real en Hyperliquid</span>
                    <p className="text-[10px] text-slate-400">
                      Cuando el Bot apruebe una señal, enviará la orden al DEX.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      const next = !botConfig.executeOnHyperliquid;
                      updateBotConfig({ executeOnHyperliquid: next });
                      setHyperliquidAutoTrade(next);
                    }}
                    className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                      botConfig.executeOnHyperliquid || hyperliquidAutoTrade ? 'bg-emerald-500' : 'bg-white/[0.1]'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                        botConfig.executeOnHyperliquid || hyperliquidAutoTrade ? 'left-6' : 'left-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Capital per trade info */}
                <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Capital por Trade del Bot:</span>
                  <span className="font-bold text-white">${botConfig.capitalPerTrade} USDC</span>
                </div>
              </div>

              {/* Límite Operaciones Simultáneas */}
              <div className="bg-[#0b0c10] border border-white/[0.08] p-4 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-white text-xs">Operaciones Simultáneas</span>
                    <p className="text-[10px] text-slate-400">Cupo máx de posiciones a la vez</p>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 font-bold text-xs">
                    {serverStatus?.maxConcurrentTrades || botConfig.maxConcurrentTrades || 5} máx
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5 pt-1">
                  {[2, 3, 5, 8].map((num) => {
                    const currentMax = serverStatus?.maxConcurrentTrades || botConfig.maxConcurrentTrades || 5;
                    const isSelected = currentMax === num;
                    return (
                      <button
                        key={num}
                        onClick={() => handleUpdateMaxConcurrent(num)}
                        className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-500/50 shadow-xs'
                            : 'bg-white/[0.03] hover:bg-white/[0.08] text-slate-400 border border-white/[0.05]'
                        }`}
                      >
                        {num}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Leverage Slider */}
              <div className="bg-[#0b0c10] border border-white/[0.08] p-4 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-xs">Apalancamiento Predeterminado</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-bold">
                    {hyperliquidDefaultLeverage}x Cross
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="50"
                  step="1"
                  value={hyperliquidDefaultLeverage}
                  onChange={(e) => setHyperliquidDefaultLeverage(parseInt(e.target.value, 10))}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>1x (Spot Eq)</span>
                  <span>10x</span>
                  <span>25x</span>
                  <span>50x Max</span>
                </div>
              </div>
            </div>

            {/* ⚡ TOMA RÁPIDA EN VERDE (ULTRA-SCALP EN SEGUNDOS) */}
            <div className="bg-[#0b0c10] border border-emerald-500/30 p-4 rounded-xl space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start space-x-3">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                    <Zap className="w-4 h-4 fill-emerald-400" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-white text-xs">
                        Objetivo de Alta Convicción (+$1.50 a +$2.50 Netos)
                      </span>
                      <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                        MONITOREO CADA 1.5s
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                      El servidor opera señales de alta convicción en <b>velas de 5m</b> y supervisa las posiciones cada <b>1.5s</b>. Si en <b>cualquier segundo</b> la posición alcanza <b>+${minProfitInput} USD netos o más</b>, ejecuta el cierre a mercado inmediatamente asegurando una ganancia real que supera las comisiones de Ditto. Si nunca entra en positivo, aguanta disciplinadamente hasta su <b>Stop Loss (-0.9%)</b>.
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3 self-end sm:self-center shrink-0">
                  <div className="flex items-center space-x-1.5 bg-white/[0.03] border border-white/[0.1] rounded-lg px-2.5 py-1">
                    <span className="text-[10px] text-slate-400">Mínimo Neto:</span>
                    <span className="text-emerald-400 font-bold">$</span>
                    <input
                      type="number"
                      step="0.05"
                      min="0.50"
                      max="10"
                      value={minProfitInput}
                      onChange={(e) => handleUpdateInstantProfit(instantProfitEnabled, e.target.value)}
                      className="w-14 bg-transparent text-white font-mono font-bold text-xs outline-none"
                    />
                    <span className="text-[10px] text-slate-500">USD</span>
                  </div>

                  <button
                    onClick={() => handleUpdateInstantProfit(!instantProfitEnabled, minProfitInput)}
                    className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                      instantProfitEnabled ? 'bg-emerald-500' : 'bg-white/[0.1]'
                    }`}
                    title={instantProfitEnabled ? 'Toma de beneficio activa' : 'Desactivado'}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                        instantProfitEnabled ? 'left-6' : 'left-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="pt-2 border-t border-white/[0.06] flex flex-wrap items-center justify-between text-[10px] text-slate-400 gap-2">
                <span className="flex items-center gap-1 text-emerald-300">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  Garantía matemática: TP1 +1.6% (~+$1.50 neto), TP2 +2.6% (~+$2.50 neto), SL -0.9%
                </span>
                <span className="text-slate-500">
                  Filtro estricto: EMA 9/21/50 + RSI runway + Volumen (Puntaje ≥ 70/100)
                </span>
              </div>
            </div>

            {/* Test Manual Order Execution */}
            <div className="bg-[#0b0c10] border border-white/[0.08] p-4 rounded-xl space-y-3">
              <span className="font-bold text-white text-xs flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                Panel de Prueba Manual de Órdenes a Hyperliquid
              </span>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">Activo</label>
                  <select
                    value={testOrderCoin}
                    onChange={(e) => setTestOrderCoin(e.target.value)}
                    className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-2.5 py-1.5 text-white outline-none"
                  >
                    <option value="BTC" className="bg-[#08090d]">BTC-PERP</option>
                    <option value="ETH" className="bg-[#08090d]">ETH-PERP</option>
                    <option value="SOL" className="bg-[#08090d]">SOL-PERP</option>
                    <option value="HYPE" className="bg-[#08090d]">HYPE-PERP</option>
                    <option value="PURR" className="bg-[#08090d]">PURR-PERP</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">Lado</label>
                  <div className="flex rounded-lg overflow-hidden border border-white/[0.1]">
                    <button
                      onClick={() => setTestOrderSide('BUY')}
                      className={`flex-1 py-1.5 font-bold transition-colors cursor-pointer ${
                        testOrderSide === 'BUY' ? 'bg-emerald-500 text-black' : 'bg-white/[0.02] text-slate-400'
                      }`}
                    >
                      BUY
                    </button>
                    <button
                      onClick={() => setTestOrderSide('SELL')}
                      className={`flex-1 py-1.5 font-bold transition-colors cursor-pointer ${
                        testOrderSide === 'SELL' ? 'bg-rose-500 text-black' : 'bg-white/[0.02] text-slate-400'
                      }`}
                    >
                      SELL
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">Tamaño (Moneda)</label>
                  <input
                    type="text"
                    value={testOrderSize}
                    onChange={(e) => setTestOrderSize(e.target.value)}
                    className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-2.5 py-1.5 text-white outline-none"
                  />
                </div>

                <div className="flex items-end">
                  <button
                    onClick={handleSendTestOrder}
                    disabled={isSubmittingOrder || !hyperliquidAgentKey}
                    className="w-full py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold transition-all cursor-pointer disabled:opacity-40 flex items-center justify-center space-x-1"
                  >
                    {isSubmittingOrder ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Zap className="w-3.5 h-3.5 fill-black" />
                    )}
                    <span>{isSubmittingOrder ? 'Enviando...' : 'Ejecutar Test'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Guide & Setup */}
        {activeTab === 'guide' && (
          <div className="flex-1 flex flex-col p-5 overflow-y-auto gap-4 text-slate-300 leading-relaxed text-[11px]">
            <div className="bg-[#0b0c10] border border-white/[0.08] p-4 rounded-xl space-y-2">
              <h4 className="font-bold text-white text-sm">¿Cómo configurar tu Agent API Key en Hyperliquid en 1 minuto?</h4>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-400">
                <li>Ve a <a href="https://app.hyperliquid.xyz" target="_blank" rel="noopener noreferrer" className="text-emerald-400 underline">app.hyperliquid.xyz</a> y conecta tu billetera habitual (MetaMask, Rabby, etc.).</li>
                <li>Haz clic en el ícono de <b>Configuración (Settings)</b> en la esquina superior derecha.</li>
                <li>Selecciona la pestaña <b>API / Extra Agents</b>.</li>
                <li>Haz clic en <b>&quot;Create Agent&quot;</b>. Tu wallet firmará una autorización sin costo de gas.</li>
                <li>Copia la <b>Clave Privada del Agente (Private Key)</b> generada y pégala en la pestaña <i>&quot;Trading Bot & Agent API&quot;</i> de este terminal.</li>
                <li>¡Listo! Tu colateral está 100% protegido contra retiros y el bot puede operar en tiempo real.</li>
              </ol>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <a
                href="https://hyperliquid.gitbook.io/hyperliquid-docs"
                target="_blank"
                rel="noopener noreferrer"
                className="p-3.5 bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.07] rounded-xl flex items-center justify-between group transition-colors"
              >
                <div>
                  <span className="font-bold text-white block">Documentación Oficial de Hyperliquid</span>
                  <span className="text-[10px] text-slate-500">Arquitectura L1, libro de órdenes y liquidaciones</span>
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-400 transition-colors" />
              </a>

              <a
                href="https://hypurrscan.io/"
                target="_blank"
                rel="noopener noreferrer"
                className="p-3.5 bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.07] rounded-xl flex items-center justify-between group transition-colors"
              >
                <div>
                  <span className="font-bold text-white block">Explorador Hypurrscan L1</span>
                  <span className="text-[10px] text-slate-500">Ver bloques, transferencias y contratos en vivo</span>
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-400 transition-colors" />
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
