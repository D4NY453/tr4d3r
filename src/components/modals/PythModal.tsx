'use client';

import React, { useState } from 'react';
import { useTradingStore } from '@/store/useTradingStore';
import {
  X,
  ExternalLink,
  ShieldCheck,
  Zap,
  Globe,
  Coins,
  CheckCircle2,
  TrendingUp,
} from 'lucide-react';
import { pythService } from '@/services/pyth/pyth-service';
import { UPSCALE_RWA_ASSETS } from '@/services/assets/market-assets';

export const PythModal: React.FC = () => {
  const { isPythModalOpen, setPythModalOpen, pythApiKey, setPythApiKey } = useTradingStore();
  const [apiKeyInput, setApiKeyInput] = useState(pythApiKey || '');
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isPythModalOpen) return null;

  const handleSave = () => {
    setPythApiKey(apiKeyInput.trim());
    pythService.setApiKey(apiKeyInput.trim());
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      setPythModalOpen(false);
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-[#08090d] border border-white/10 rounded-2xl shadow-2xl overflow-hidden text-slate-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08] bg-white/[0.02]">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#eab308]/20 to-[#6366f1]/20 border border-[#eab308]/30 flex items-center justify-center text-[#eab308]">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white tracking-wide flex items-center gap-2">
                Pyth Network & Upscale.trade
                <span className="text-[10px] bg-[#eab308]/20 text-[#eab308] px-2 py-0.5 rounded-full border border-[#eab308]/30 font-mono">
                  RWA & ORO
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Oráculo descentralizado para Oro (XAU/USD), Forex, Petróleo e Índices
              </p>
            </div>
          </div>
          <button
            onClick={() => setPythModalOpen(false)}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/[0.05] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto font-sans text-xs">
          {/* Activos Activos Banner */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.08] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white uppercase tracking-wider font-mono">
                Activos Operables en Upscale.trade
              </span>
              <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-mono">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Live Feed Activo
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
              <div className="p-2 rounded-lg bg-black/40 border border-white/[0.05]">
                <span className="text-yellow-400 font-semibold">Oro Físico (XAU/USD)</span>
                <p className="text-[10px] text-slate-400 mt-0.5">Respaldado 1:1 · Ticks 1s en vivo</p>
              </div>
              <div className="p-2 rounded-lg bg-black/40 border border-white/[0.05]">
                <span className="text-slate-300 font-semibold">Plata (XAG/USD) & WTI</span>
                <p className="text-[10px] text-slate-400 mt-0.5">Commodities de alta volatilidad</p>
              </div>
              <div className="p-2 rounded-lg bg-black/40 border border-white/[0.05]">
                <span className="text-sky-400 font-semibold">Forex (EUR, GBP, AUD)</span>
                <p className="text-[10px] text-slate-400 mt-0.5">Pares mayores contra USD</p>
              </div>
              <div className="p-2 rounded-lg bg-black/40 border border-white/[0.05]">
                <span className="text-purple-400 font-semibold">Índices (US100, US500)</span>
                <p className="text-[10px] text-slate-400 mt-0.5">Nasdaq y S&P 500 sintéticos</p>
              </div>
            </div>
          </div>

          {/* Pyth API Key Config */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-300">
                Pyth Hermes API Key (Opcional)
              </label>
              <a
                href="https://pyth.network/developers"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-[#eab308] hover:underline flex items-center gap-1 font-mono"
              >
                Obtener Key en Pyth <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <input
              type="password"
              placeholder="Pega tu API Key de Pyth Terminal (dejar en blanco para feed nativo)"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-[#eab308]/50 font-mono transition-colors"
            />
            <p className="text-[11px] text-slate-500 leading-relaxed">
              💡 <strong>Sin configuración requerida:</strong> Tu terminal ya incluye feeds de alta frecuencia para Oro físico (XAU/USD), Forex y activos sintéticos directamente sin necesidad de clave externa.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/[0.08] bg-white/[0.01]">
          <div className="text-[11px] text-slate-400 font-mono">
            {savedSuccess ? (
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> ¡Guardado con éxito!
              </span>
            ) : (
              <span>Upscale.trade Prop Engine</span>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setPythModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-white/[0.05] transition-colors"
            >
              Cerrar
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 rounded-xl text-xs font-semibold bg-[#eab308] hover:bg-[#ca8a04] text-black transition-all shadow-lg shadow-[#eab308]/20"
            >
              Guardar Ajustes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};