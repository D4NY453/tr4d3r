'use client';

import React from 'react';
import { useTradingStore } from '@/store/useTradingStore';
import { X, Zap, Check, ShieldAlert } from 'lucide-react';

export const StrategyModal: React.FC = () => {
  const {
    isStrategyModalOpen,
    setStrategyModalOpen,
    strategies,
    toggleStrategy,
  } = useTradingStore();

  if (!isStrategyModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2a2e39] bg-[#191d26]">
          <div className="flex items-center space-x-2 text-[#d1d4dc] font-semibold text-base">
            <Zap className="w-5 h-5 text-[#089981]" />
            <span>Motor de Señales y Estrategias en Vivo</span>
          </div>
          <button
            onClick={() => setStrategyModalOpen(false)}
            className="p-1 rounded hover:bg-[#2a2e39] text-[#787b86] hover:text-[#d1d4dc]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <p className="text-xs text-[#787b86]">
            Activa las estrategias que deseas que el motor analice en tiempo real sobre el gráfico. Las señales detectadas generarán marcadores BUY/SELL y alertas con cálculo automático de Stop Loss y Take Profit.
          </p>

          {/* Strategy 1: EMA Cross */}
          <div className="p-4 bg-[#131722] rounded-lg border border-[#2a2e39] flex items-start justify-between">
            <div className="space-y-1 pr-4">
              <div className="text-sm font-semibold text-[#d1d4dc] flex items-center space-x-2">
                <span>EMA 20/50 Golden & Death Cross</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#089981]/20 text-[#089981] font-mono">
                  Tendencial
                </span>
              </div>
              <p className="text-xs text-[#787b86]">
                Genera señal BUY cuando la EMA rápida (20) cruza al alza la EMA lenta (50), y señal SELL en cruce a la baja.
              </p>
            </div>
            <input
              type="checkbox"
              checked={Boolean(strategies?.emaCross)}
              onChange={() => toggleStrategy('emaCross')}
              className="mt-1 rounded border-[#2a2e39] text-[#2962ff] focus:ring-0 w-4 h-4 cursor-pointer"
            />
          </div>

          {/* Strategy 2: RSI Reversal */}
          <div className="p-4 bg-[#131722] rounded-lg border border-[#2a2e39] flex items-start justify-between">
            <div className="space-y-1 pr-4">
              <div className="text-sm font-semibold text-[#d1d4dc] flex items-center space-x-2">
                <span>RSI 14 Reversal (Sobreventa / Sobrecompra)</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#2962ff]/20 text-[#2962ff] font-mono">
                  Reversión
                </span>
              </div>
              <p className="text-xs text-[#787b86]">
                BUY cuando el RSI sale de zona extrema (&lt;30 rebotando al alza). SELL cuando el RSI sale de zona extrema (&gt;70 cayendo).
              </p>
            </div>
            <input
              type="checkbox"
              checked={Boolean(strategies?.rsiReversal)}
              onChange={() => toggleStrategy('rsiReversal')}
              className="mt-1 rounded border-[#2a2e39] text-[#2962ff] focus:ring-0 w-4 h-4 cursor-pointer"
            />
          </div>

          {/* Strategy 3: SuperTrend */}
          <div className="p-4 bg-[#131722] rounded-lg border border-[#2a2e39] flex items-start justify-between">
            <div className="space-y-1 pr-4">
              <div className="text-sm font-semibold text-[#d1d4dc] flex items-center space-x-2">
                <span>SuperTrend Giro de Tendencia (10, 3)</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#f6c344]/20 text-[#f6c344] font-mono">
                  Volatilidad
                </span>
              </div>
              <p className="text-xs text-[#787b86]">
                Detecta giros de tendencia basados en el promedio de rango verdadero (ATR). Señal de compra en cambio a verde y venta en cambio a rojo.
              </p>
            </div>
            <input
              type="checkbox"
              checked={Boolean(strategies?.superTrendStrategy)}
              onChange={() => toggleStrategy('superTrendStrategy')}
              className="mt-1 rounded border-[#2a2e39] text-[#2962ff] focus:ring-0 w-4 h-4 cursor-pointer"
            />
          </div>

          {/* Strategy 4: MACD Crossover */}
          <div className="p-4 bg-[#131722] rounded-lg border border-[#2a2e39] flex items-start justify-between">
            <div className="space-y-1 pr-4">
              <div className="text-sm font-semibold text-[#d1d4dc] flex items-center space-x-2">
                <span>MACD Momentum Cross</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#e040fb]/20 text-[#e040fb] font-mono">
                  Momentum
                </span>
              </div>
              <p className="text-xs text-[#787b86]">
                Cruces de línea de MACD con la línea de Señal combinadas con aceleración en el histograma.
              </p>
            </div>
            <input
              type="checkbox"
              checked={Boolean(strategies?.macdCrossover)}
              onChange={() => toggleStrategy('macdCrossover')}
              className="mt-1 rounded border-[#2a2e39] text-[#2962ff] focus:ring-0 w-4 h-4 cursor-pointer"
            />
          </div>

          {/* Strategy 5: Bollinger Bands Mean Reversion */}
          <div className="p-4 bg-[#131722] rounded-lg border border-[#2a2e39] flex items-start justify-between">
            <div className="space-y-1 pr-4">
              <div className="text-sm font-semibold text-[#d1d4dc] flex items-center space-x-2">
                <span>Bandas de Bollinger Reversal (SMA 20, 2σ)</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#00bcd4]/20 text-[#00bcd4] font-mono">
                  Rangos (Video 1)
                </span>
              </div>
              <p className="text-xs text-[#787b86]">
                Estrategia Video 1: Compra al perforar/rebotar en banda inferior y venta al perforar/rechazar banda superior con Stop Loss adaptativo.
              </p>
            </div>
            <input
              type="checkbox"
              checked={Boolean(strategies?.bollingerBreakout)}
              onChange={() => toggleStrategy('bollingerBreakout')}
              className="mt-1 rounded border-[#2a2e39] text-[#2962ff] focus:ring-0 w-4 h-4 cursor-pointer"
            />
          </div>

          {/* Strategy 6: Bollinger Squeeze & Volatility Trend Breakout */}
          <div className="p-4 bg-[#131722] rounded-lg border border-[#2a2e39] flex items-start justify-between">
            <div className="space-y-1 pr-4">
              <div className="text-sm font-semibold text-[#d1d4dc] flex items-center space-x-2">
                <span>Bollinger Squeeze Trend Breakout (Spread / Bandwidth)</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#f6c344]/20 text-[#f6c344] font-mono">
                  Tendencias (Video 2)
                </span>
              </div>
              <p className="text-xs text-[#787b86]">
                Estrategia Video 2: Detecta compresión extrema del ancho de bandas (Squeeze) y quiebro explosivo de volatilidad guiado por la dirección de la SMA 20.
              </p>
            </div>
            <input
              type="checkbox"
              checked={Boolean(strategies?.bollingerSqueeze)}
              onChange={() => toggleStrategy('bollingerSqueeze')}
              className="mt-1 rounded border-[#2a2e39] text-[#2962ff] focus:ring-0 w-4 h-4 cursor-pointer"
            />
          </div>

          {/* Strategy 7: Bollinger %B Divergences */}
          <div className="p-4 bg-[#131722] rounded-lg border border-[#2a2e39] flex items-start justify-between">
            <div className="space-y-1 pr-4">
              <div className="text-sm font-semibold text-[#d1d4dc] flex items-center space-x-2">
                <span>Bollinger %B Divergencia & Directriz</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#ab47bc]/20 text-[#ab47bc] font-mono">
                  Divergencias (Video 3)
                </span>
              </div>
              <p className="text-xs text-[#787b86]">
                Estrategia Video 3: Detecta agotamiento de tendencia mediante divergencias regulares entre los picos de precio y el oscilador %B.
              </p>
            </div>
            <input
              type="checkbox"
              checked={Boolean(strategies?.bollingerPercentBDivergence)}
              onChange={() => toggleStrategy('bollingerPercentBDivergence')}
              className="mt-1 rounded border-[#2a2e39] text-[#2962ff] focus:ring-0 w-4 h-4 cursor-pointer"
            />
          </div>

          <div className="p-3 bg-[#131722]/60 rounded border border-[#2a2e39]/60 flex items-start space-x-2">
            <ShieldAlert className="w-4 h-4 text-[#787b86] shrink-0 mt-0.5" />
            <p className="text-[11px] text-[#787b86]">
              Las señales son herramientas de análisis cuantitativo en tiempo real. Utiliza siempre una adecuada gestión de capital y riesgo.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#191d26] border-t border-[#2a2e39] flex justify-end">
          <button
            onClick={() => setStrategyModalOpen(false)}
            className="flex items-center space-x-1.5 px-4 py-2 bg-[#089981] hover:bg-[#067a67] text-white rounded text-sm font-medium transition-colors"
          >
            <Check className="w-4 h-4" />
            <span>Guardar y Ejecutar</span>
          </button>
        </div>
      </div>
    </div>
  );
};
