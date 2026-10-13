'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTradingStore } from '@/store/useTradingStore';
import {
  Bot,
  Zap,
  Shield,
  Sliders,
  Terminal,
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Server,
  Play,
  Pause,
  Trash2,
  RefreshCw,
  X,
  TrendingUp,
  Target,
  Sparkles,
  Layers,
  Copy,
  Check,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
} from 'lucide-react';
import { calculateBankTestSummary } from '@/services/bot/trading-bot-engine';

export const BotModal: React.FC = () => {
  const {
    isBotModalOpen,
    setBotModalOpen,
    isBotActive,
    toggleBot,
    botConfig,
    updateBotConfig,
    botLogs,
    clearBotLogs,
    botStats,
    currentSymbol,
    currentTimeframe,
    paperPositions,
    walletBalance,
    subFunds,
    resetSubFunds,
    candles,
  } = useTradingStore();

  const [activeTab, setActiveTab] = useState<'console' | 'config' | 'bank100k' | 'vps'>('console');
  const [copiedVpsCommand, setCopiedVpsCommand] = useState(false);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  const bankSummary = useMemo(() => {
    return calculateBankTestSummary(subFunds || []);
  }, [subFunds]);

  const currentLivePrice = useMemo(() => {
    if (!candles || candles.length === 0) return 0;
    return candles[candles.length - 1].close;
  }, [candles]);

  // Close on ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isBotModalOpen) {
        setBotModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isBotModalOpen, setBotModalOpen]);

  if (!isBotModalOpen) return null;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedVpsCommand(true);
    setTimeout(() => setCopiedVpsCommand(false), 2500);
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
      <div className="w-full max-w-4xl bg-[#1e222d] border border-[#2a2e39] rounded-xl shadow-2xl overflow-hidden flex flex-col h-[90vh] max-h-[800px]">
        {/* Header with Master Switch */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a2e39] bg-[#191d26]">
          <div className="flex items-center space-x-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                isBotActive
                  ? 'bg-[#089981]/20 text-[#089981] shadow-lg shadow-[#089981]/10 ring-1 ring-[#089981]/50'
                  : 'bg-[#2a2e39] text-[#787b86]'
              }`}
            >
              <Bot className={`w-6 h-6 ${isBotActive ? 'animate-pulse' : ''}`} />
            </div>

            <div>
              <div className="flex items-center space-x-2.5">
                <span className="text-white font-bold text-base">Bot de Trading Autónomo</span>
                <span
                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full flex items-center space-x-1 ${
                    isBotActive
                      ? 'bg-[#089981]/20 text-[#089981] border border-[#089981]/40'
                      : 'bg-[#2a2e39] text-[#787b86]'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isBotActive ? 'bg-[#089981] animate-ping' : 'bg-[#787b86]'
                    }`}
                  />
                  <span>{isBotActive ? 'ACTIVO (ESCANEANDO CADA 3s)' : 'PAUSADO'}</span>
                </span>
              </div>
              <p className="text-xs text-[#787b86]">
                Analiza conveniencia técnica, R:R y ejecuta órdenes automáticamente en Binance Spot.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Master Toggle Button */}
            <button
              onClick={toggleBot}
              className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center space-x-2 transition-all shadow-md cursor-pointer ${
                isBotActive
                  ? 'bg-[#f23645]/20 hover:bg-[#f23645] text-[#f23645] hover:text-white border border-[#f23645]/40'
                  : 'bg-[#089981] hover:bg-[#067a67] text-white shadow-emerald-900/30'
              }`}
            >
              {isBotActive ? (
                <>
                  <Pause className="w-4 h-4" />
                  <span>Pausar Bot</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Activar Bot Autónomo</span>
                </>
              )}
            </button>

            <button
              onClick={() => setBotModalOpen(false)}
              className="p-1.5 rounded-lg hover:bg-[#2a2e39] text-[#787b86] hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Live Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-3 bg-[#131722] border-b border-[#2a2e39] text-xs">
          <div className="bg-[#1e222d] p-2.5 rounded-lg border border-[#2a2e39]">
            <span className="text-[#787b86] text-[11px] block">Oportunidades Analizadas</span>
            <span className="text-white font-mono font-bold text-base">{botStats.totalAnalyzed}</span>
          </div>

          <div className="bg-[#1e222d] p-2.5 rounded-lg border border-[#2a2e39]">
            <span className="text-[#787b86] text-[11px] block">Órdenes Ejecutadas</span>
            <span className="text-[#089981] font-mono font-bold text-base">+{botStats.totalExecuted}</span>
          </div>

          <div className="bg-[#1e222d] p-2.5 rounded-lg border border-[#2a2e39]">
            <span className="text-[#787b86] text-[11px] block">Descartadas (Filtro R:R)</span>
            <span className="text-[#f23645] font-mono font-bold text-base">{botStats.totalRejected}</span>
          </div>

          <div className="bg-[#1e222d] p-2.5 rounded-lg border border-[#2a2e39]">
            <span className="text-[#787b86] text-[11px] block">Posiciones Abiertas</span>
            <span className="text-[#2962ff] font-mono font-bold text-base">
              {paperPositions.length} / {botConfig.maxConcurrentTrades} máx
            </span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center px-6 border-b border-[#2a2e39] bg-[#191d26]">
          <button
            onClick={() => setActiveTab('console')}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center space-x-1.5 transition-all ${
              activeTab === 'console'
                ? 'border-[#089981] text-white bg-[#089981]/10'
                : 'border-transparent text-[#787b86] hover:text-[#d1d4dc]'
            }`}
          >
            <Terminal className="w-3.5 h-3.5 text-[#089981]" />
            <span>Consola de Decisiones en Vivo ({botLogs.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('config')}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center space-x-1.5 transition-all ${
              activeTab === 'config'
                ? 'border-[#2962ff] text-white bg-[#2962ff]/10'
                : 'border-transparent text-[#787b86] hover:text-[#d1d4dc]'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-[#2962ff]" />
            <span>Configuración de Conveniencia & Riesgo</span>
          </button>

          <button
            onClick={() => setActiveTab('bank100k')}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center space-x-1.5 transition-all cursor-pointer ${
              activeTab === 'bank100k'
                ? 'border-[#f6c344] text-white bg-[#f6c344]/10'
                : 'border-transparent text-[#787b86] hover:text-[#d1d4dc]'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-[#f6c344]" />
            <span>Banco $100k (10 Sub-Fondos)</span>
            <span className="px-1.5 py-0.2 rounded bg-[#f6c344]/20 text-[#f6c344] font-mono text-[9px] font-bold">
              0% FEE
            </span>
          </button>

          <button
            onClick={() => setActiveTab('vps')}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center space-x-1.5 transition-all ${
              activeTab === 'vps'
                ? 'border-[#ab47bc] text-white bg-[#ab47bc]/10'
                : 'border-transparent text-[#787b86] hover:text-[#d1d4dc]'
            }`}
          >
            <Server className="w-3.5 h-3.5 text-[#ab47bc]" />
            <span>Despliegue VPS 24/7</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 p-6 overflow-y-auto bg-[#1e222d]">
          {/* 1. CONSOLE TAB */}
          {activeTab === 'console' && (
            <div className="flex flex-col h-full space-y-3">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2 text-[#787b86]">
                  <Activity className="w-3.5 h-3.5 text-[#089981]" />
                  <span>
                    Escaneando <b>{currentSymbol}</b> ({currentTimeframe}) cada <b>3 segundos</b>
                  </span>
                </div>

                <button
                  onClick={clearBotLogs}
                  className="flex items-center space-x-1 text-[#787b86] hover:text-white px-2 py-1 rounded hover:bg-[#2a2e39] transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Limpiar Consola</span>
                </button>
              </div>

              {/* Terminal Box */}
              <div className="flex-1 bg-[#0d1117] border border-[#2a2e39] rounded-lg p-4 font-mono text-xs overflow-y-auto space-y-2 select-text shadow-inner">
                {botLogs.length === 0 ? (
                  <div className="text-[#787b86] text-center py-12">
                    <Terminal className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No hay eventos registrados. Activa el bot para ver las decisiones en tiempo real.</p>
                  </div>
                ) : (
                  botLogs.map((log) => {
                    const isExec = log.action === 'EXECUTED';
                    const isRej = log.action === 'REJECTED';
                    const isMon = log.action === 'MONITORING';

                    return (
                      <div
                        key={log.id}
                        className={`p-2 rounded border transition-colors ${
                          isExec
                            ? 'bg-[#089981]/10 border-[#089981]/30 text-[#089981]'
                            : isRej
                            ? 'bg-[#f23645]/10 border-[#f23645]/30 text-[#f23645]'
                            : isMon
                            ? 'bg-[#2962ff]/10 border-[#2962ff]/30 text-[#90caf9]'
                            : 'bg-[#1e222d] border-[#2a2e39] text-[#d1d4dc]'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[11px] opacity-80 mb-1">
                          <span className="flex items-center space-x-1.5">
                            <span className="font-bold">[{formatTime(log.timestamp)}]</span>
                            <span className="px-1.5 py-0.2 rounded bg-black/40 text-white font-bold">
                              {log.symbol}
                            </span>
                            <span className="font-bold uppercase">{log.action}</span>
                          </span>

                          {log.score !== undefined && (
                            <span className="px-1.5 py-0.2 rounded bg-black/40 text-white font-bold text-[10px]">
                              Score: {log.score}%
                            </span>
                          )}
                        </div>
                        <p className="text-xs leading-relaxed font-sans text-white">{log.reason}</p>
                      </div>
                    );
                  })
                )}
                <div ref={terminalEndRef} />
              </div>
            </div>
          )}

          {/* 2. CONFIGURATION TAB */}
          {activeTab === 'config' && (
            <div className="max-w-2xl mx-auto space-y-6">
              {/* Ratio R:R Slider */}
              <div className="bg-[#131722] p-4 rounded-lg border border-[#2a2e39] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="font-bold text-white text-sm flex items-center space-x-1.5">
                      <Target className="w-4 h-4 text-[#f6c344]" />
                      <span>Ratio Riesgo / Beneficio Mínimo (R:R)</span>
                    </span>
                    <p className="text-xs text-[#787b86]">
                      El bot descartará cualquier orden donde la ganancia estimada no supere este ratio.
                    </p>
                  </div>
                  <span className="font-mono font-bold text-base text-[#f6c344] bg-[#1e222d] px-2.5 py-1 rounded border border-[#2a2e39]">
                    1:{botConfig.minRiskReward.toFixed(1)}
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  {[1.2, 1.5, 2.0, 2.5, 3.0].map((val) => (
                    <button
                      key={val}
                      onClick={() => updateBotConfig({ minRiskReward: val })}
                      className={`flex-1 py-1.5 rounded text-xs font-mono font-bold transition-all ${
                        botConfig.minRiskReward === val
                          ? 'bg-[#f6c344] text-black shadow-xs'
                          : 'bg-[#1e222d] text-[#787b86] hover:text-white hover:bg-[#2a2e39]'
                      }`}
                    >
                      1:{val.toFixed(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Capital per Trade */}
              <div className="bg-[#131722] p-4 rounded-lg border border-[#2a2e39] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="font-bold text-white text-sm flex items-center space-x-1.5">
                      <Zap className="w-4 h-4 text-[#089981]" />
                      <span>Capital Asignado por Operación</span>
                    </span>
                    <p className="text-xs text-[#787b86]">Monto en USDT con el que se abrirá cada trade automático.</p>
                  </div>
                  <div className="flex items-center space-x-1 bg-[#1e222d] px-3 py-1 rounded border border-[#2a2e39]">
                    <span className="text-[#089981] font-mono font-bold text-sm">$</span>
                    <input
                      type="number"
                      min={10}
                      max={100000}
                      value={botConfig.capitalPerTrade}
                      onChange={(e) =>
                        updateBotConfig({ capitalPerTrade: Math.max(10, Number(e.target.value) || 10) })
                      }
                      className="w-20 bg-transparent text-[#089981] font-mono font-bold text-sm focus:outline-hidden"
                    />
                    <span className="text-[10px] text-[#787b86] font-bold">USDT</span>
                  </div>
                </div>

                <div className="flex items-center space-x-1.5 flex-wrap gap-y-1.5">
                  {[25, 50, 100, 250, 500, 1000].map((val) => (
                    <button
                      key={val}
                      onClick={() => updateBotConfig({ capitalPerTrade: val })}
                      className={`flex-1 min-w-[55px] py-1.5 rounded text-xs font-mono font-bold transition-all ${
                        botConfig.capitalPerTrade === val
                          ? 'bg-[#089981] text-white shadow-xs'
                          : 'bg-[#1e222d] text-[#787b86] hover:text-white hover:bg-[#2a2e39]'
                      }`}
                    >
                      ${val}
                    </button>
                  ))}
                </div>
              </div>

              {/* Trade Direction Selector (Compras & Ventas / Long Only / Short Only) */}
              <div className="bg-[#131722] p-4 rounded-lg border border-[#2a2e39] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="font-bold text-white text-sm flex items-center space-x-1.5">
                      <TrendingUp className="w-4 h-4 text-[#2962ff]" />
                      <span>Dirección de Operaciones (Test / Paper Trading)</span>
                    </span>
                    <p className="text-xs text-[#787b86]">
                      Permite operar tanto compras como ventas a precios de mercado en tiempo real.
                    </p>
                  </div>
                  <span className="font-mono font-bold text-xs px-2.5 py-1 rounded border border-[#2a2e39] bg-[#1e222d] text-white">
                    {botConfig.tradeDirection === 'LONG_ONLY' || botConfig.longOnly === true
                      ? '🟢 SOLO COMPRAS'
                      : botConfig.tradeDirection === 'SHORT_ONLY'
                      ? '🔴 SOLO VENTAS'
                      : '⚡ COMPRAS Y VENTAS'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    onClick={() => updateBotConfig({ tradeDirection: 'BOTH', longOnly: false })}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                      (botConfig.tradeDirection === 'BOTH' || (!botConfig.tradeDirection && !botConfig.longOnly))
                        ? 'bg-[#2962ff] text-white shadow-md'
                        : 'bg-[#1e222d] text-[#787b86] hover:text-white hover:bg-[#2a2e39] border border-[#2a2e39]'
                    }`}
                  >
                    <span>⚡ Compras y Ventas (Ambas)</span>
                  </button>

                  <button
                    onClick={() => updateBotConfig({ tradeDirection: 'LONG_ONLY', longOnly: true })}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                      (botConfig.tradeDirection === 'LONG_ONLY' || botConfig.longOnly === true)
                        ? 'bg-[#089981] text-white shadow-md'
                        : 'bg-[#1e222d] text-[#787b86] hover:text-white hover:bg-[#2a2e39] border border-[#2a2e39]'
                    }`}
                  >
                    <span>🟢 Solo Compras (Long Only)</span>
                  </button>

                  <button
                    onClick={() => updateBotConfig({ tradeDirection: 'SHORT_ONLY', longOnly: false })}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                      botConfig.tradeDirection === 'SHORT_ONLY'
                        ? 'bg-[#f23645] text-white shadow-md'
                        : 'bg-[#1e222d] text-[#787b86] hover:text-white hover:bg-[#2a2e39] border border-[#2a2e39]'
                    }`}
                  >
                    <span>🔴 Solo Ventas (Short Only)</span>
                  </button>
                </div>
              </div>

              {/* Max Concurrent Trades & Order Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Max Open Trades */}
                <div className="bg-[#131722] p-4 rounded-lg border border-[#2a2e39] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-xs block">Límite de Posiciones Simultáneas</span>
                    <div className="flex items-center space-x-1 bg-[#1e222d] px-2 py-0.5 rounded border border-[#2a2e39]">
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={botConfig.maxConcurrentTrades}
                        onChange={(e) =>
                          updateBotConfig({
                            maxConcurrentTrades: Math.max(1, Math.min(100, Number(e.target.value) || 1)),
                          })
                        }
                        className="w-10 bg-transparent text-[#2962ff] font-mono font-bold text-xs text-center focus:outline-hidden"
                      />
                      <span className="text-[10px] text-[#787b86] font-bold">máx</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-[#787b86]">
                    Capacidad de operaciones abiertas a la vez (de 1 hasta 100 posiciones en paralelo).
                  </p>
                  <div className="flex items-center space-x-1 pt-0.5">
                    {[3, 5, 10, 20, 50, 100].map((val) => (
                      <button
                        key={val}
                        onClick={() => updateBotConfig({ maxConcurrentTrades: val })}
                        className={`flex-1 py-1 rounded text-xs font-mono font-bold transition-all ${
                          botConfig.maxConcurrentTrades === val
                            ? 'bg-[#2962ff] text-white shadow-xs'
                            : 'bg-[#1e222d] text-[#787b86] hover:text-white hover:bg-[#2a2e39]'
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                  <div className="pt-1 text-[10px] text-[#787b86] flex items-center justify-between border-t border-[#2a2e39]/60">
                    <span>Exposición Máxima:</span>
                    <span className="text-[#f6c344] font-bold font-mono">
                      ${(botConfig.maxConcurrentTrades * botConfig.capitalPerTrade).toLocaleString()} USDT
                    </span>
                  </div>
                </div>

                {/* Auto Order Mode */}
                <div className="bg-[#131722] p-4 rounded-lg border border-[#2a2e39] space-y-2.5">
                  <span className="font-bold text-white text-xs block">Modo de Ejecución Automática</span>
                  <p className="text-[11px] text-[#787b86]">¿Cómo debe entrar el bot al detectar y aprobar la oportunidad?</p>
                  <div className="flex items-center space-x-2 pt-0.5">
                    <button
                      onClick={() => updateBotConfig({ autoOrderType: 'MARKET' })}
                      className={`flex-1 py-2 rounded text-xs font-bold transition-all ${
                        botConfig.autoOrderType === 'MARKET'
                          ? 'bg-[#089981] text-white shadow-xs'
                          : 'bg-[#1e222d] text-[#787b86] hover:text-white'
                      }`}
                    >
                      ⚡ Mercado (Inmediato)
                    </button>

                    <button
                      onClick={() => updateBotConfig({ autoOrderType: 'LIMIT' })}
                      className={`flex-1 py-2 rounded text-xs font-bold transition-all ${
                        botConfig.autoOrderType === 'LIMIT'
                          ? 'bg-[#f6c344] text-black shadow-xs'
                          : 'bg-[#1e222d] text-[#787b86] hover:text-white'
                      }`}
                    >
                      ⏳ Limit (Esperar Precio)
                    </button>
                  </div>
                  <p className="text-[10px] text-[#787b86] pt-1">
                    {botConfig.autoOrderType === 'MARKET'
                      ? 'Entra de inmediato al precio vivo del tick de Binance o Hyperliquid.'
                      : 'Coloca orden de compra/venta en el nivel exacto del setup.'}
                  </p>
                </div>
              </div>

              {/* Allowed Perps Selector */}
              <div className="bg-[#131722] p-4 rounded-lg border border-[#2a2e39] space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <span className="font-bold text-white text-xs flex items-center space-x-1.5">
                      <Shield className="w-4 h-4 text-emerald-400" />
                      <span>Mercados Permitidos en Hyperliquid (Perps & Memes)</span>
                    </span>
                    <p className="text-[11px] text-[#787b86]">
                      Selecciona &quot;Todos los Mercados&quot; para escanear los 234 contratos de Perps, Memes y Predictions en velas de 1m a 5m.
                    </p>
                  </div>

                  <button
                    onClick={() => updateBotConfig({ allowedSymbols: [] })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      !botConfig.allowedSymbols || botConfig.allowedSymbols.length === 0 || botConfig.allowedSymbols.includes('ALL')
                        ? 'bg-emerald-500 text-black shadow-md'
                        : 'bg-[#1e222d] border border-[#2a2e39] text-slate-300 hover:text-white'
                    }`}
                  >
                    ⚡ Operar TODOS los 234 Mercados
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {['TODOS (Sin Límite)', 'BTC-PERP', 'ETH-PERP', 'SOL-PERP', 'HYPE-PERP', 'DOGE-PERP', 'kPEPE-PERP', 'FARTCOIN-PERP'].map((sym) => {
                    const isAllBtn = sym.startsWith('TODOS');
                    const isSelected = isAllBtn
                      ? !botConfig.allowedSymbols || botConfig.allowedSymbols.length === 0 || botConfig.allowedSymbols.includes('ALL')
                      : (botConfig.allowedSymbols || []).includes(sym);

                    return (
                      <button
                        key={sym}
                        onClick={() => {
                          if (isAllBtn) {
                            updateBotConfig({ allowedSymbols: [] });
                          } else {
                            const current = botConfig.allowedSymbols || [];
                            const next = isSelected
                              ? current.filter((s) => s !== sym)
                              : [...current.filter((s) => s !== 'ALL'), sym];
                            updateBotConfig({ allowedSymbols: next });
                          }
                        }}
                        className={`py-2 px-2.5 rounded-lg border text-xs font-mono font-bold flex items-center justify-between transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-xs'
                            : 'bg-[#1e222d] border-[#2a2e39] text-[#787b86] hover:text-white'
                        }`}
                      >
                        <span className="truncate">{sym}</span>
                        {isSelected ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <span className="w-3.5 h-3.5 rounded-full border border-[#787b86] shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Hyperliquid DEX Live Execution Card */}
              <div className="bg-[#131722] p-4 rounded-lg border border-emerald-500/30 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="font-bold text-white text-xs">Ejecución Real en Hyperliquid L1 DEX</span>
                  </div>
                  <button
                    onClick={() => updateBotConfig({ executeOnHyperliquid: !botConfig.executeOnHyperliquid })}
                    className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                      botConfig.executeOnHyperliquid
                        ? 'bg-emerald-500 text-black shadow-xs'
                        : 'bg-[#1e222d] text-[#787b86] hover:text-white'
                    }`}
                  >
                    {botConfig.executeOnHyperliquid ? 'ACTIVADO' : 'DESACTIVADO'}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Cuando esté activado y tu clave de Agente esté configurada en el <b>Hyperliquid Hub</b>, el bot transmitirá cada señal aprobada directamente al libro de órdenes de Hyperliquid con tus parámetros de apalancamiento y tamaño.
                </p>
              </div>
            </div>
          )}

          {/* 3. BANCO $100k (10 SUB-FONDOS A 0% FEE) */}
          {activeTab === 'bank100k' && (
            <div className="space-y-4 text-xs">
              {/* Summary Metrics Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 p-3.5 bg-[#131722] rounded-xl border border-[#2a2e39]">
                <div className="bg-[#1e222d] p-2.5 rounded-lg border border-[#2a2e39]">
                  <span className="text-[#787b86] text-[10px] block">Capital Inicial</span>
                  <span className="text-white font-mono font-bold text-xs">
                    ${bankSummary.totalInitialCapital.toLocaleString()} USD
                  </span>
                </div>

                <div className="bg-[#1e222d] p-2.5 rounded-lg border border-[#2a2e39]">
                  <span className="text-[#787b86] text-[10px] block">Capital Actual</span>
                  <span className="text-[#90caf9] font-mono font-bold text-xs">
                    ${bankSummary.totalCurrentCapital.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                  </span>
                </div>

                <div className="bg-[#1e222d] p-2.5 rounded-lg border border-[#2a2e39]">
                  <span className="text-[#787b86] text-[10px] block">PnL Puro Total</span>
                  <span
                    className={`font-mono font-bold text-xs flex items-center space-x-1 ${
                      bankSummary.totalPurePnL >= 0 ? 'text-[#10b981]' : 'text-[#f43f5e]'
                    }`}
                  >
                    {bankSummary.totalPurePnL >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                    <span>
                      {bankSummary.totalPurePnL >= 0 ? '+' : ''}${bankSummary.totalPurePnL.toFixed(2)}
                    </span>
                  </span>
                </div>

                <div className="bg-[#1e222d] p-2.5 rounded-lg border border-[#2a2e39]">
                  <span className="text-[#787b86] text-[10px] block">Win Rate Global</span>
                  <span className="text-white font-mono font-bold text-xs">
                    {bankSummary.globalWinRate}%{' '}
                    <span className="text-[10px] text-[#787b86]">
                      ({bankSummary.totalWins}W / {bankSummary.totalLosses}L)
                    </span>
                  </span>
                </div>

                <div className="bg-[#1e222d] p-2.5 rounded-lg border border-[#2a2e39]">
                  <span className="text-[#787b86] text-[10px] block">Total Trades</span>
                  <span className="text-white font-mono font-bold text-xs">{bankSummary.totalTrades}</span>
                </div>

                <div className="bg-[#1e222d] p-2.5 rounded-lg border border-[#2a2e39] flex items-center justify-between">
                  <div>
                    <span className="text-[#787b86] text-[10px] block">Comisión</span>
                    <span className="text-[#10b981] font-mono font-bold text-xs">0% FEE PURO</span>
                  </div>
                  <button
                    onClick={resetSubFunds}
                    className="p-1.5 rounded bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 hover:text-white transition-colors cursor-pointer"
                    title="Reiniciar banco a $100k iniciales"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Fee Simulation Bar */}
              <div className="p-3 bg-[#131722] rounded-lg border border-[#2a2e39] flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] text-[#787b86]">Simulación Hyperliquid:</span>
                  <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold">
                    Maker (0.010% Alo): ${(bankSummary.makerNetPnL ?? bankSummary.totalPurePnL).toFixed(2)}
                  </span>
                  <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-amber-500/15 text-amber-400 border border-amber-500/30 font-bold">
                    Taker (0.045% Ioc): ${(bankSummary.takerNetPnL ?? bankSummary.totalPurePnL).toFixed(2)}
                  </span>
                </div>
                <span className="text-[10px] text-emerald-400 font-bold">
                  ⚡ 77.8% de Ahorro con Maker Post-Only
                </span>
              </div>

              {/* Live Comparative Table */}
              <div className="border border-[#2a2e39] rounded-xl overflow-hidden bg-[#131722]">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-[#191d26] text-[#787b86] uppercase font-mono text-[10px] border-b border-[#2a2e39]">
                        <th className="py-2.5 px-3"># Fondo & Estrategia</th>
                        <th className="py-2.5 px-2">Ejecución</th>
                        <th className="py-2.5 px-2">Filtro MTF</th>
                        <th className="py-2.5 px-2">Tendencia MTF</th>
                        <th className="py-2.5 px-2">Posición Activa</th>
                        <th className="py-2.5 px-2 text-right">Win Rate</th>
                        <th className="py-2.5 px-2 text-right">Trades (W/L)</th>
                        <th className="py-2.5 px-2 text-right">PnL Puro</th>
                        <th className="py-2.5 px-3 text-right">Capital Actual</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#2a2e39]/60 font-mono text-[11px]">
                      {(subFunds || []).map((fund, idx) => {
                        const hasPos = !!fund.activePosition;
                        const pos = fund.activePosition;
                        const isPosBuy = pos?.type === 'BUY';

                        const unrlPnL = pos ? (pos.pnlUSDT ?? 0) : 0;
                        const isPnLPos = fund.stats.purePnL >= 0;

                        return (
                          <tr
                            key={fund.id}
                            className={`hover:bg-white/[0.02] transition-colors ${
                              hasPos ? 'bg-white/[0.015]' : ''
                            }`}
                          >
                            <td className="py-2 px-3">
                              <div className="flex items-center space-x-2">
                                <span className="w-4 h-4 rounded bg-[#2a2e39] flex items-center justify-center text-[9px] text-slate-300 font-bold shrink-0">
                                  {idx + 1}
                                </span>
                                <div>
                                  <div className="text-white font-sans font-medium text-xs">{fund.name}</div>
                                  <span className="text-[10px] text-[#787b86] font-sans">{fund.strategy}</span>
                                </div>
                              </div>
                            </td>

                            <td className="py-2 px-2">
                              <span className="px-1.5 py-0.2 rounded font-bold text-[9px] bg-[#2962ff]/15 text-[#2962ff] border border-[#2962ff]/30">
                                {fund.executionTimeframe}
                              </span>
                            </td>

                            <td className="py-2 px-2">
                              <span className="px-1.5 py-0.2 rounded font-bold text-[9px] bg-[#ab47bc]/15 text-[#ab47bc] border border-[#ab47bc]/30">
                                {fund.confirmTimeframe}
                              </span>
                            </td>

                            <td className="py-2 px-2">
                              <span
                                className={`px-2 py-0.2 rounded-full text-[9px] font-bold inline-flex items-center space-x-1 ${
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
                                    ? 'LONG'
                                    : fund.lastMacroTrend === 'BEARISH'
                                    ? 'SHORT'
                                    : 'NEUTRAL'}
                                </span>
                              </span>
                            </td>

                            <td className="py-2 px-2">
                              {hasPos && pos ? (
                                <div className="flex items-center space-x-1 text-[10px]">
                                  <span
                                    className={`px-1 py-0.2 rounded font-bold text-[9px] ${
                                      isPosBuy
                                        ? 'bg-[#10b981]/20 text-[#10b981]'
                                        : 'bg-[#f43f5e]/20 text-[#f43f5e]'
                                    }`}
                                  >
                                    {pos.type}
                                  </span>
                                  <span className="text-white">${pos.entryPrice.toFixed(2)}</span>
                                  <span
                                    className={`font-bold ${
                                      unrlPnL >= 0 ? 'text-[#10b981]' : 'text-[#f43f5e]'
                                    }`}
                                  >
                                    ({unrlPnL >= 0 ? '+' : ''}${unrlPnL.toFixed(2)})
                                  </span>
                                </div>
                              ) : (
                                <span className="text-[10px] text-[#787b86]">⚪ Buscando</span>
                              )}
                            </td>

                            <td className="py-2 px-2 text-right">
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

                            <td className="py-2 px-2 text-right">
                              <span className="text-white">{fund.stats.totalTrades}</span>
                              <span className="text-[10px] text-[#787b86] ml-1">
                                ({fund.stats.wins}W/{fund.stats.losses}L)
                              </span>
                            </td>

                            <td className="py-2 px-2 text-right">
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
                                M: ${(fund.stats.makerNetPnL ?? fund.stats.purePnL).toFixed(2)}
                              </span>
                            </td>

                            <td className="py-2 px-3 text-right">
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
            </div>
          )}

          {/* 4. VPS DEPLOYMENT TAB */}
          {activeTab === 'vps' && (
            <div className="max-w-2xl mx-auto space-y-5 text-xs">
              <div className="bg-[#131722] p-4 rounded-lg border border-[#2a2e39] space-y-2">
                <div className="flex items-center space-x-2 text-white font-bold text-sm">
                  <Server className="w-4 h-4 text-[#ab47bc]" />
                  <span>¿Cómo tener el Bot operando 24/7 en un VPS?</span>
                </div>
                <p className="text-[#787b86] leading-relaxed">
                  Para que el bot analice el mercado sin parar aunque apagues tu PC, puedes montarlo en un servidor VPS
                  (Ubuntu Linux en Contabo, Hetzner, AWS o DigitalOcean por ~$4 USD/mes).
                </p>
              </div>

              {/* Step 1: Automated Script */}
              <div className="bg-[#131722] p-4 rounded-lg border border-[#2a2e39] space-y-3">
                <span className="font-bold text-white text-xs block">
                  🚀 Comando de Instalación Rápida 1-Click (Con PM2 & Auto-Reinicio 24/7)
                </span>
                <p className="text-[#787b86]">
                  Conéctate a tu VPS por SSH y ejecuta este comando para compilar e iniciar el bot:
                </p>

                <div className="relative bg-[#0d1117] p-3 rounded border border-[#2a2e39] font-mono text-[11px] text-[#90caf9]">
                  <code>npm run build && npx pm2 start ecosystem.config.js</code>
                  <button
                    onClick={() => copyToClipboard('npm run build && npx pm2 start ecosystem.config.js')}
                    className="absolute top-2 right-2 p-1.5 rounded bg-[#2a2e39] hover:bg-[#363a45] text-white transition-colors"
                    title="Copiar comando"
                  >
                    {copiedVpsCommand ? <Check className="w-3.5 h-3.5 text-[#089981]" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Step 2: Benefits */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-[#131722] p-3 rounded border border-[#2a2e39] space-y-1">
                  <span className="font-bold text-[#089981]">✅ Cero Latencia con Binance</span>
                  <p className="text-[#787b86] text-[11px]">
                    Los VPS tienen conexión de 1 Gbps directa con los servidores de Binance.
                  </p>
                </div>

                <div className="bg-[#131722] p-3 rounded border border-[#2a2e39] space-y-1">
                  <span className="font-bold text-[#f6c344]">⚡ Auto-Recuperación</span>
                  <p className="text-[#787b86] text-[11px]">
                    Si hay corte de red o reinicio del VPS, PM2 reabre el bot en menos de 3 segundos.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
