'use client';

import React from 'react';
import { useTradingStore } from '@/store/useTradingStore';
import { X, Activity, Check } from 'lucide-react';

export const IndicatorModal: React.FC = () => {
  const {
    isIndicatorModalOpen,
    setIndicatorModalOpen,
    indicators,
    toggleIndicator,
    setIndicatorParam,
  } = useTradingStore();

  if (!isIndicatorModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2a2e39] bg-[#191d26]">
          <div className="flex items-center space-x-2 text-[#d1d4dc] font-semibold text-base">
            <Activity className="w-5 h-5 text-[#2962ff]" />
            <span>Indicadores Técnicos</span>
          </div>
          <button
            onClick={() => setIndicatorModalOpen(false)}
            className="p-1 rounded hover:bg-[#2a2e39] text-[#787b86] hover:text-[#d1d4dc]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content list */}
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* EMAs */}
          <div className="p-3 bg-[#131722] rounded-lg border border-[#2a2e39] space-y-2">
            <div className="text-xs font-bold text-[#787b86] uppercase tracking-wider">
              Medias Móviles Exponenciales (EMA)
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center space-x-2 text-sm cursor-pointer hover:text-white">
                <input
                  type="checkbox"
                  checked={Boolean(indicators?.ema9)}
                  onChange={() => toggleIndicator('ema9')}
                  className="rounded border-[#2a2e39] text-[#2962ff] focus:ring-0"
                />
                <span className="flex items-center">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#f6c344] mr-2"></span>
                  EMA 9 (Rápida)
                </span>
              </label>

              <label className="flex items-center space-x-2 text-sm cursor-pointer hover:text-white">
                <input
                  type="checkbox"
                  checked={Boolean(indicators?.ema20)}
                  onChange={() => toggleIndicator('ema20')}
                  className="rounded border-[#2a2e39] text-[#2962ff] focus:ring-0"
                />
                <span className="flex items-center">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#2962ff] mr-2"></span>
                  EMA 20 (Corta)
                </span>
              </label>

              <label className="flex items-center space-x-2 text-sm cursor-pointer hover:text-white">
                <input
                  type="checkbox"
                  checked={Boolean(indicators?.ema50)}
                  onChange={() => toggleIndicator('ema50')}
                  className="rounded border-[#2a2e39] text-[#2962ff] focus:ring-0"
                />
                <span className="flex items-center">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#e040fb] mr-2"></span>
                  EMA 50 (Media)
                </span>
              </label>

              <label className="flex items-center space-x-2 text-sm cursor-pointer hover:text-white">
                <input
                  type="checkbox"
                  checked={Boolean(indicators?.ema200)}
                  onChange={() => toggleIndicator('ema200')}
                  className="rounded border-[#2a2e39] text-[#2962ff] focus:ring-0"
                />
                <span className="flex items-center">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#ff9800] mr-2"></span>
                  EMA 200 (Institucional)
                </span>
              </label>
            </div>
          </div>

          {/* SuperTrend */}
          <div className="p-3 bg-[#131722] rounded-lg border border-[#2a2e39] space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center space-x-2 text-sm font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(indicators?.supertrend)}
                  onChange={() => toggleIndicator('supertrend')}
                  className="rounded border-[#2a2e39] text-[#2962ff] focus:ring-0"
                />
                <span className="text-[#d1d4dc]">SuperTrend (Seguidor de Tendencia)</span>
              </label>
              <span className="text-xs text-[#787b86]">Periodo: {indicators.supertrendPeriod}, Multi: {indicators.supertrendMultiplier}</span>
            </div>
          </div>

          {/* Bollinger Bands */}
          <div className="p-3 bg-[#131722] rounded-lg border border-[#2a2e39] space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center space-x-2 text-sm font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(indicators?.bollinger)}
                  onChange={() => toggleIndicator('bollinger')}
                  className="rounded border-[#2a2e39] text-[#2962ff] focus:ring-0"
                />
                <span className="text-[#d1d4dc]">Bandas de Bollinger</span>
              </label>
              <span className="text-xs text-[#787b86]">SMA 20 ± 2σ</span>
            </div>
          </div>

          {/* RSI */}
          <div className="p-3 bg-[#131722] rounded-lg border border-[#2a2e39] space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center space-x-2 text-sm font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(indicators?.rsi)}
                  onChange={() => toggleIndicator('rsi')}
                  className="rounded border-[#2a2e39] text-[#2962ff] focus:ring-0"
                />
                <span className="text-[#d1d4dc]">RSI (Relative Strength Index)</span>
              </label>
              <div className="flex items-center space-x-2">
                <span className="text-xs text-[#787b86]">Periodo:</span>
                <input
                  type="number"
                  min="2"
                  max="50"
                  value={indicators.rsiPeriod}
                  onChange={(e) => setIndicatorParam('rsiPeriod', parseInt(e.target.value) || 14)}
                  className="w-12 bg-[#1e222d] border border-[#2a2e39] rounded px-1.5 py-0.5 text-xs text-center text-[#d1d4dc]"
                />
              </div>
            </div>
          </div>

          {/* MACD */}
          <div className="p-3 bg-[#131722] rounded-lg border border-[#2a2e39] space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center space-x-2 text-sm font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={indicators.macd}
                  onChange={() => toggleIndicator('macd')}
                  className="rounded border-[#2a2e39] text-[#2962ff] focus:ring-0"
                />
                <span className="text-[#d1d4dc]">MACD (12, 26, 9)</span>
              </label>
              <span className="text-xs text-[#787b86]">Histograma + Cruces</span>
            </div>
          </div>

          {/* Volume */}
          <div className="p-3 bg-[#131722] rounded-lg border border-[#2a2e39] space-y-2">
            <label className="flex items-center space-x-2 text-sm font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={indicators.volume}
                onChange={() => toggleIndicator('volume')}
                className="rounded border-[#2a2e39] text-[#2962ff] focus:ring-0"
              />
              <span className="text-[#d1d4dc]">Barras de Volumen</span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#191d26] border-t border-[#2a2e39] flex justify-end">
          <button
            onClick={() => setIndicatorModalOpen(false)}
            className="flex items-center space-x-1.5 px-4 py-2 bg-[#2962ff] hover:bg-[#1e53e5] text-white rounded text-sm font-medium transition-colors"
          >
            <Check className="w-4 h-4" />
            <span>Aplicar al Gráfico</span>
          </button>
        </div>
      </div>
    </div>
  );
};
