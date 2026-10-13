'use client';

import React, { useState, useEffect } from 'react';
import { useTradingStore } from '@/store/useTradingStore';
import {
  X,
  Calculator,
  DollarSign,
  Percent,
  ShieldAlert,
  TrendingUp,
  TrendingDown,
  Star,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

export const CalculatorModal: React.FC = () => {
  const {
    isCalculatorModalOpen,
    setCalculatorModalOpen,
    candles,
    currentSymbol,
    selectedSignal,
  } = useTradingStore();

  const lastCandle = candles[candles.length - 1];
  const defaultPrice = lastCandle ? lastCandle.close : 100;

  const [accountBalance, setAccountBalance] = useState<number>(10000);
  const [orderType, setOrderType] = useState<'BUY' | 'SELL'>('BUY');
  const [entryPrice, setEntryPrice] = useState<number>(defaultPrice);
  const [stopLossPrice, setStopLossPrice] = useState<number>(
    defaultPrice * 0.98
  );
  const [takeProfitPrice, setTakeProfitPrice] = useState<number>(
    defaultPrice * 1.05
  );
  const [confidenceLevel, setConfidenceLevel] = useState<1 | 2 | 3>(2);
  const [baseRiskPercent, setBaseRiskPercent] = useState<number>(2);

  // Sync with selected signal or current price when opened
  useEffect(() => {
    if (selectedSignal) {
      setOrderType(selectedSignal.type);
      setEntryPrice(selectedSignal.price);
      setStopLossPrice(selectedSignal.stopLoss);
      setTakeProfitPrice(selectedSignal.takeProfit1);
    } else if (lastCandle) {
      setEntryPrice(lastCandle.close);
      if (orderType === 'BUY') {
        setStopLossPrice(Number((lastCandle.close * 0.985).toFixed(4)));
        setTakeProfitPrice(Number((lastCandle.close * 1.045).toFixed(4)));
      } else {
        setStopLossPrice(Number((lastCandle.close * 1.015).toFixed(4)));
        setTakeProfitPrice(Number((lastCandle.close * 0.955).toFixed(4)));
      }
    }
  }, [selectedSignal, isCalculatorModalOpen]);

  if (!isCalculatorModalOpen) return null;

  // Mathematical calculations (Video 5 formulas)
  const priceDistanceRisk = Math.abs(entryPrice - stopLossPrice);
  const priceDistanceReward = Math.abs(takeProfitPrice - entryPrice);

  const riskPercent =
    entryPrice > 0 ? (priceDistanceRisk / entryPrice) * 100 : 0;
  const rewardPercent =
    entryPrice > 0 ? (priceDistanceReward / entryPrice) * 100 : 0;

  const riskRewardRatio =
    riskPercent > 0 ? rewardPercent / riskPercent : 0;

  // Adjusted Risk based on Confidence Score
  // Score 1 (Low/Contratrend): 1%
  // Score 2 (Medium/Confirmed): 2%
  // Score 3 (High/Confluence): 3.5%
  const effectiveRiskPercent =
    confidenceLevel === 1
      ? Math.min(baseRiskPercent, 1.0)
      : confidenceLevel === 2
      ? baseRiskPercent
      : baseRiskPercent * 1.5;

  const maxLossAmount = (accountBalance * effectiveRiskPercent) / 100;
  const estimatedProfitAmount = maxLossAmount * riskRewardRatio;

  const positionSizeUSDT =
    riskPercent > 0 ? (maxLossAmount / (riskPercent / 100)) : 0;
  const positionSizeTokens =
    entryPrice > 0 ? positionSizeUSDT / entryPrice : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
      <div className="w-full max-w-2xl bg-[#050608] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.07] bg-white/[0.01]">
          <div className="flex items-center space-x-3 text-white">
            <div className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/[0.08] text-white flex items-center justify-center">
              <Calculator className="w-4 h-4" />
            </div>
            <div>
              <span className="font-mono text-sm font-medium tracking-wide">CALCULADORA DE RIESGO & TAMAÑO</span>
              <p className="text-[11px] font-mono text-slate-500 font-normal">
                Gestión de capital para {currentSymbol}
              </p>
            </div>
          </div>
          <button
            onClick={() => setCalculatorModalOpen(false)}
            className="p-1 rounded-lg hover:bg-white/[0.06] text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto bg-[#030305]">
          {/* Order Type Toggle & Balance */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] uppercase font-mono text-slate-500 block mb-1.5 font-normal">
                Dirección
              </label>
              <div className="grid grid-cols-2 gap-2 bg-white/[0.02] p-1 rounded-xl border border-white/[0.07]">
                <button
                  type="button"
                  onClick={() => setOrderType('BUY')}
                  className={`py-1.5 text-xs font-mono rounded-lg flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                    orderType === 'BUY'
                      ? 'bg-white text-black font-semibold shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>COMPRA (LONG)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setOrderType('SELL')}
                  className={`py-1.5 text-xs font-mono rounded-lg flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                    orderType === 'SELL'
                      ? 'bg-white text-black font-semibold shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <TrendingDown className="w-3.5 h-3.5" />
                  <span>VENTA (SHORT)</span>
                </button>
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase font-mono text-slate-500 block mb-1.5 font-normal">
                Capital de Cuenta (USDT)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-slate-500 text-xs font-mono">$</span>
                <input
                  type="number"
                  value={accountBalance}
                  onChange={(e) => setAccountBalance(Number(e.target.value))}
                  className="w-full bg-white/[0.02] border border-white/[0.07] rounded-xl pl-7 pr-3 py-1.5 text-xs text-white font-mono focus:border-white/25 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Trade Parameters (Entry, SL, TP) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] uppercase font-mono text-slate-500 block mb-1 font-normal">
                Precio de Entrada
              </label>
              <input
                type="number"
                step="any"
                value={entryPrice}
                onChange={(e) => setEntryPrice(Number(e.target.value))}
                className="w-full bg-white/[0.02] border border-white/[0.07] rounded-xl px-3 py-1.5 text-xs text-white font-mono focus:border-white/25 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-mono text-[#f43f5e] block mb-1 font-normal flex items-center justify-between">
                <span>Stop Loss (SL)</span>
                <span className="text-[10px] text-slate-500 font-mono">-{riskPercent.toFixed(2)}%</span>
              </label>
              <input
                type="number"
                step="any"
                value={stopLossPrice}
                onChange={(e) => setStopLossPrice(Number(e.target.value))}
                className="w-full bg-white/[0.02] border border-[#f43f5e]/30 rounded-xl px-3 py-1.5 text-xs text-white font-mono focus:border-[#f43f5e] focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-mono text-[#10b981] block mb-1 font-normal flex items-center justify-between">
                <span>Take Profit (TP)</span>
                <span className="text-[10px] text-slate-500 font-mono">+{rewardPercent.toFixed(2)}%</span>
              </label>
              <input
                type="number"
                step="any"
                value={takeProfitPrice}
                onChange={(e) => setTakeProfitPrice(Number(e.target.value))}
                className="w-full bg-white/[0.02] border border-[#10b981]/30 rounded-xl px-3 py-1.5 text-xs text-white font-mono focus:border-[#10b981] focus:outline-none"
              />
            </div>
          </div>

          {/* Confidence Score & Risk % Slider */}
          <div className="p-4 bg-white/[0.01] rounded-xl border border-white/[0.07] space-y-3 font-mono">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-xs font-mono text-white block font-medium">
                  Nivel de Confianza (Scoring 1-3)
                </span>
                <span className="text-[11px] text-slate-500">
                  Ajusta el capital según la confluencia
                </span>
              </div>

              {/* Star buttons */}
              <div className="flex items-center space-x-1.5 bg-white/[0.02] p-1 rounded-lg border border-white/[0.07]">
                {[1, 2, 3].map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setConfidenceLevel(lvl as 1 | 2 | 3)}
                    className={`px-3 py-1 rounded-md text-xs font-mono flex items-center space-x-1 transition-all cursor-pointer ${
                      confidenceLevel === lvl
                        ? 'bg-white text-black font-semibold shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Star className={`w-3 h-3 ${confidenceLevel >= lvl ? 'fill-current' : ''}`} />
                    <span>Nivel {lvl}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="text-[11px] text-slate-400 flex items-center space-x-1.5 font-mono">
              <Sparkles className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span>
                {confidenceLevel === 1 && 'Nivel 1 (Bajo): Riesgo limitado al 1.0% de la cuenta.'}
                {confidenceLevel === 2 && 'Nivel 2 (Medio): Riesgo estándar del 2.0% de la cuenta.'}
                {confidenceLevel === 3 && 'Nivel 3 (Alto): Riesgo ampliado al 3.0% de la cuenta.'}
              </span>
            </div>
          </div>

          {/* Calculation Results Dashboard */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono">
            <div className="p-3 bg-[#08090d] rounded-xl border border-white/[0.07] space-y-1">
              <span className="text-[10px] text-slate-500 uppercase block font-normal">Ratio R:R</span>
              <div className="text-base font-normal text-white">
                1 : {riskRewardRatio.toFixed(2)}
              </div>
              <span className="text-[9px] text-slate-500">
                {riskRewardRatio >= 2 ? 'Favorable' : 'Ajustado'}
              </span>
            </div>

            <div className="p-3 bg-[#08090d] rounded-xl border border-white/[0.07] space-y-1">
              <span className="text-[10px] text-slate-500 uppercase block font-normal">Pérdida Máxima</span>
              <div className="text-base font-normal text-[#f43f5e]">
                -${maxLossAmount.toFixed(2)}
              </div>
              <span className="text-[9px] text-slate-500">
                {effectiveRiskPercent.toFixed(1)}% del capital
              </span>
            </div>

            <div className="p-3 bg-[#08090d] rounded-xl border border-white/[0.07] space-y-1">
              <span className="text-[10px] text-slate-500 uppercase block font-normal">Beneficio Esperado</span>
              <div className="text-base font-normal text-[#10b981]">
                +${estimatedProfitAmount.toFixed(2)}
              </div>
              <span className="text-[9px] text-slate-500">
                +{(estimatedProfitAmount / (accountBalance || 1) * 100).toFixed(1)}% cuenta
              </span>
            </div>

            <div className="p-3 bg-[#08090d] rounded-xl border border-white/[0.07] space-y-1">
              <span className="text-[10px] text-slate-500 uppercase block font-normal">Tamaño Posición</span>
              <div className="text-base font-normal text-white">
                ${positionSizeUSDT.toFixed(0)}
              </div>
              <span className="text-[9px] text-slate-500">
                {positionSizeTokens.toFixed(4)} {currentSymbol.replace('USDT', '')}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-white/[0.01] border-t border-white/[0.07] flex items-center justify-between font-mono">
          <div className="text-xs text-slate-500 flex items-center space-x-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
            <span>Riesgo controlado por Stop Loss</span>
          </div>
          <button
            onClick={() => setCalculatorModalOpen(false)}
            className="px-4 py-1.5 rounded-lg bg-white text-black hover:bg-slate-200 font-medium text-xs transition-colors cursor-pointer"
          >
            Aplicar al Gráfico
          </button>
        </div>
      </div>
    </div>
  );
};
