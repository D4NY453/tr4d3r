'use client';

import React, { useState } from 'react';
import { useTradingStore } from '@/store/useTradingStore';
import {
  X,
  GraduationCap,
  TrendingUp,
  Layers,
  ShieldCheck,
  Zap,
  Activity,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Target,
  Sparkles,
  RefreshCw,
} from 'lucide-react';

interface Module {
  id: string;
  title: string;
  category: string;
  icon: React.ReactNode;
  badgeColor: string;
  content: React.ReactNode;
}

export const AcademyModal: React.FC = () => {
  const { isAcademyModalOpen, setAcademyModalOpen } = useTradingStore();
  const [activeTab, setActiveTab] = useState<string>('top-down');

  // Interactive Checklist State
  const [checklist, setChecklist] = useState({
    macroTrend: false,
    pivotSupport: false,
    chartPattern: false,
    oscillatorReset: false,
    riskReward: false,
  });

  const toggleChecklist = (key: keyof typeof checklist) => {
    setChecklist((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const resetChecklist = () => {
    setChecklist({
      macroTrend: false,
      pivotSupport: false,
      chartPattern: false,
      oscillatorReset: false,
      riskReward: false,
    });
  };

  const completedSteps = Object.values(checklist).filter(Boolean).length;
  const isSetupReady = completedSteps === 5;

  if (!isAcademyModalOpen) return null;

  const modules: Module[] = [
    {
      id: 'top-down',
      title: '1. Protocolo Top-Down Multi-Temporal',
      category: 'Metodología Base',
      icon: <Layers className="w-4 h-4 text-[#2962ff]" />,
      badgeColor: 'bg-[#2962ff]/20 text-[#2962ff]',
      content: (
        <div className="space-y-4 text-sm text-[#d1d4dc] leading-relaxed">
          <div className="p-4 bg-[#131722] rounded-lg border border-[#2a2e39]">
            <h4 className="text-base font-bold text-white mb-2 flex items-center space-x-2">
              <span className="w-6 h-6 rounded-full bg-[#2962ff] text-white flex items-center justify-center text-xs font-mono">
                1
              </span>
              <span>La Regla de Oro: Analizar de Mayor a Menor Temporalidad</span>
            </h4>
            <p className="text-xs text-[#787b86]">
              Nunca comiences un análisis en un gráfico de 5 minutos o 1 hora. Para tener una ventaja real en el mercado, debes entender el ciclo mayor y operar a favor de la corriente dominante.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3.5 bg-[#191d26] rounded-lg border border-[#2a2e39] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-[#089981]">Gráfico Mensual (1M)</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#089981]/20 text-[#089981] font-mono">Macro</span>
              </div>
              <p className="text-xs text-[#787b86]">
                Identifica el <b>ciclo de fondo</b>. Colorea mentalmente o con rectángulos las grandes fases alcistas (verde) y bajistas (rojo). ¿Estamos en expansión o en contracción secular?
              </p>
            </div>

            <div className="p-3.5 bg-[#191d26] rounded-lg border border-[#2a2e39] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-[#2962ff]">Gráfico Semanal (1W)</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#2962ff]/20 text-[#2962ff] font-mono">Estructura</span>
              </div>
              <p className="text-xs text-[#787b86]">
                Traza <b>Directrices Maestras</b> (líneas uniendo la mayor cantidad de mínimos crecientes o máximos decrecientes) y localiza las <b>Zonas Pivote</b> de soporte institucional.
              </p>
            </div>

            <div className="p-3.5 bg-[#191d26] rounded-lg border border-[#2a2e39] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-[#f6c344]">Gráfico Diario (1D)</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#f6c344]/20 text-[#f6c344] font-mono">Timing & Gatillo</span>
              </div>
              <p className="text-xs text-[#787b86]">
                Haz <b>Zoom con la lupa</b>. Busca micro-canales de corrección que se rompen al alza y confirma que los osciladores (RSI / %B) se hayan saneado tras la corrección.
              </p>
            </div>
          </div>

          <div className="p-3 bg-[#2962ff]/10 rounded-lg border border-[#2962ff]/30 text-xs text-[#90caf9] flex items-start space-x-2">
            <Sparkles className="w-4 h-4 text-[#2962ff] shrink-0 mt-0.5" />
            <p>
              <b>Consejo Pro:</b> Si la tendencia semanal (1W) es alcista, busca únicamente compras (BUY) en los retrocesos diarios. Si la tendencia semanal es bajista, busca ventas o salidas en los rebotes.
            </p>
          </div>
        </div>
      ),
    },

    {
      id: 'pivots',
      title: '2. Zonas Pivote y Polaridad',
      category: 'Soportes & Resistencias',
      icon: <Target className="w-4 h-4 text-[#089981]" />,
      badgeColor: 'bg-[#089981]/20 text-[#089981]',
      content: (
        <div className="space-y-4 text-sm text-[#d1d4dc] leading-relaxed">
          <div className="p-4 bg-[#131722] rounded-lg border border-[#2a2e39]">
            <h4 className="text-base font-bold text-white mb-2 flex items-center space-x-2">
              <span className="w-6 h-6 rounded-full bg-[#089981] text-white flex items-center justify-center text-xs font-mono">
                2
              </span>
              <span>El Principio de Polaridad (Soporte ↔ Resistencia)</span>
            </h4>
            <p className="text-xs text-[#787b86]">
              Los soportes y resistencias no son líneas delgadas fijas, sino <b>zonas o franjas de precio</b> donde confluyen las órdenes de grandes instituciones financieras.
            </p>
          </div>

          <div className="p-4 bg-[#191d26] rounded-lg border border-[#2a2e39] space-y-3 font-mono text-xs">
            <div className="text-white font-bold">Mecánica del Retesteo (Throwback / Pullback):</div>
            <div className="p-3 bg-[#131722] rounded border border-[#2a2e39] text-[#787b86] space-y-2">
              <div className="flex items-center space-x-2 text-[#f23645]">
                <span>1. RESISTENCIA:</span>
                <span>El precio choca varias veces contra un techo sin poder superarlo.</span>
              </div>
              <div className="flex items-center space-x-2 text-[#f6c344]">
                <span>2. RUPTURA:</span>
                <span>El mercado rompe con fuerza y volumen el techo hacia arriba.</span>
              </div>
              <div className="flex items-center space-x-2 text-[#089981]">
                <span>3. ZONA PIVOTE (THROWBACK):</span>
                <span>El precio cae a descansar en el techo roto, que ahora actúa como SOPORTE SÓLIDO.</span>
              </div>
            </div>
          </div>

          <div className="p-3 bg-[#089981]/10 rounded-lg border border-[#089981]/30 text-xs text-[#a7f3d0] flex items-start space-x-2">
            <CheckCircle2 className="w-4 h-4 text-[#089981] shrink-0 mt-0.5" />
            <p>
              <b>Punto de Entrada Institucional:</b> La compra de mayor probabilidad matemática no se realiza persiguiendo la vela verde de la ruptura, sino en el <b>retesteo a la zona pivote</b> con rechazo a la baja.
            </p>
          </div>
        </div>
      ),
    },

    {
      id: 'hch',
      title: '3. Figuras de Vuelta (H-C-H Invertido)',
      category: 'Chartismo Clásico',
      icon: <TrendingUp className="w-4 h-4 text-[#f6c344]" />,
      badgeColor: 'bg-[#f6c344]/20 text-[#f6c344]',
      content: (
        <div className="space-y-4 text-sm text-[#d1d4dc] leading-relaxed">
          <div className="p-4 bg-[#131722] rounded-lg border border-[#2a2e39]">
            <h4 className="text-base font-bold text-white mb-2 flex items-center space-x-2">
              <span className="w-6 h-6 rounded-full bg-[#f6c344] text-black flex items-center justify-center text-xs font-mono font-bold">
                3
              </span>
              <span>Hombro-Cabeza-Hombro Invertido (HCHi)</span>
            </h4>
            <p className="text-xs text-[#787b86]">
              Es la formación chartista reina para identificar el fin definitivo de una gran tendencia bajista y el nacimiento de un ciclo alcista.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3.5 bg-[#191d26] rounded-lg border border-[#2a2e39] space-y-2">
              <span className="font-bold text-xs text-white">Anatomía de la Figura:</span>
              <ul className="text-xs text-[#787b86] space-y-1.5 list-disc list-inside">
                <li><b>Hombro Izquierdo (HI):</b> Primera caída y rebote menor.</li>
                <li><b>Cabeza (C):</b> Caída a un nuevo mínimo más profundo.</li>
                <li><b>Hombro Derecho (HD):</b> Corrección final que se frena a la misma altura del HI (no marca nuevo mínimo).</li>
                <li><b>Línea Clavicular (Neckline):</b> Línea que une los dos picos intermedios.</li>
              </ul>
            </div>

            <div className="p-3.5 bg-[#191d26] rounded-lg border border-[#2a2e39] space-y-2">
              <span className="font-bold text-xs text-white">Cálculo del Objetivo Mínimo:</span>
              <p className="text-xs text-[#787b86]">
                Mide la distancia vertical en precio desde la parte más baja de la <b>Cabeza</b> hasta la <b>Línea Clavicular</b>.
              </p>
              <div className="p-2 bg-[#131722] rounded border border-[#2a2e39] font-mono text-xs text-[#089981]">
                Objetivo = Neckline + Distancia(Cabeza ➔ Neckline)
              </div>
            </div>
          </div>
        </div>
      ),
    },

    {
      id: 'bollinger-suite',
      title: '4. Bandas de Bollinger: Rango vs Squeeze',
      category: 'Estrategias Cuantitativas',
      icon: <Zap className="w-4 h-4 text-[#00bcd4]" />,
      badgeColor: 'bg-[#00bcd4]/20 text-[#00bcd4]',
      content: (
        <div className="space-y-4 text-sm text-[#d1d4dc] leading-relaxed">
          <div className="p-4 bg-[#131722] rounded-lg border border-[#2a2e39]">
            <h4 className="text-base font-bold text-white mb-2 flex items-center space-x-2">
              <span className="w-6 h-6 rounded-full bg-[#00bcd4] text-black flex items-center justify-center text-xs font-mono font-bold">
                4
              </span>
              <span>La Dualidad de Bollinger: ¿Rango o Tendencia?</span>
            </h4>
            <p className="text-xs text-[#787b86]">
              El gran error de los principiantes es usar las Bandas de Bollinger de una sola forma. Bollinger diseñó dos modos operativos completamente opuestos:
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3.5 bg-[#191d26] rounded-lg border border-[#2a2e39] space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-[#00bcd4]">Modo Rango (Video 1)</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#00bcd4]/20 text-[#00bcd4]">Reversión</span>
              </div>
              <p className="text-xs text-[#787b86]">
                Cuando el mercado está lateral y las bandas están anchas y horizontales:
              </p>
              <ul className="text-xs text-[#787b86] space-y-1 list-disc list-inside">
                <li><b>BUY:</b> Precio toca banda inferior y rebota hacia adentro.</li>
                <li><b>SELL:</b> Precio toca banda superior y rechaza hacia adentro.</li>
                <li><b>Target:</b> La Media Móvil central (SMA 20).</li>
              </ul>
            </div>

            <div className="p-3.5 bg-[#191d26] rounded-lg border border-[#2a2e39] space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-[#f6c344]">Modo Squeeze (Video 2)</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#f6c344]/20 text-[#f6c344]">Tendencial</span>
              </div>
              <p className="text-xs text-[#787b86]">
                Cuando las bandas se comprimen al mínimo histórico de volatilidad (Squeeze):
              </p>
              <ul className="text-xs text-[#787b86] space-y-1 list-disc list-inside">
                <li><b>Disparador:</b> El Spread de bandas quiebra hacia arriba.</li>
                <li><b>Filtro:</b> Si la SMA 20 sube ➔ BUY. Si baja ➔ SELL.</li>
                <li><b>Salida 50/50:</b> Cerrar 50% en primer impulso, dejar correr el 50% restante.</li>
              </ul>
            </div>
          </div>
        </div>
      ),
    },

    {
      id: 'percent-b',
      title: '5. Oscilador %B y Divergencias',
      category: 'Osciladores Dinámicos',
      icon: <Activity className="w-4 h-4 text-[#ab47bc]" />,
      badgeColor: 'bg-[#ab47bc]/20 text-[#ab47bc]',
      content: (
        <div className="space-y-4 text-sm text-[#d1d4dc] leading-relaxed">
          <div className="p-4 bg-[#131722] rounded-lg border border-[#2a2e39]">
            <h4 className="text-base font-bold text-white mb-2 flex items-center space-x-2">
              <span className="w-6 h-6 rounded-full bg-[#ab47bc] text-white flex items-center justify-center text-xs font-mono font-bold">
                5
              </span>
              <span>El Oscilador %B (Porcentaje B)</span>
            </h4>
            <p className="text-xs text-[#787b86]">
              Calcula la ubicación exacta del precio respecto al canal de volatilidad:
            </p>
            <div className="mt-2 p-2 bg-[#191d26] rounded border border-[#2a2e39] font-mono text-xs text-white">
              %B = (Precio - Banda Inferior) / (Banda Superior - Banda Inferior)
            </div>
          </div>

          <div className="p-4 bg-[#191d26] rounded-lg border border-[#2a2e39] space-y-2">
            <span className="font-bold text-xs text-white">Cómo leer las Divergencias de Agotamiento:</span>
            <div className="space-y-2 text-xs text-[#787b86]">
              <div className="p-2.5 bg-[#131722] rounded border border-[#2a2e39]">
                <b className="text-[#f23645]">Divergencia Bajista (Alerta de Techo):</b> El precio hace un nuevo máximo más alto, pero el oscilador %B hace un pico inferior (habiendo superado 1.0 en el primer pico). Señal de salida o venta inmediata.
              </div>
              <div className="p-2.5 bg-[#131722] rounded border border-[#2a2e39]">
                <b className="text-[#089981]">Divergencia Alcista (Alerta de Suelo):</b> El precio marca un nuevo mínimo más bajo, pero el oscilador %B marca un suelo más alto (habiendo caído de 0.0 en el primer suelo). Señal de compra de alta fiabilidad.
              </div>
            </div>
          </div>
        </div>
      ),
    },

    {
      id: 'risk-management',
      title: '6. Gestión de Riesgo y el "Punto de Invalidez"',
      category: 'Disciplina & Capital',
      icon: <ShieldCheck className="w-4 h-4 text-[#f23645]" />,
      badgeColor: 'bg-[#f23645]/20 text-[#f23645]',
      content: (
        <div className="space-y-4 text-sm text-[#d1d4dc] leading-relaxed">
          <div className="p-4 bg-[#131722] rounded-lg border border-[#2a2e39]">
            <h4 className="text-base font-bold text-white mb-2 flex items-center space-x-2">
              <span className="w-6 h-6 rounded-full bg-[#f23645] text-white flex items-center justify-center text-xs font-mono font-bold">
                6
              </span>
              <span>El "Punto de Cambio de Opinión" (Stop Loss)</span>
            </h4>
            <p className="text-xs text-[#787b86]">
              Todo trade profesional nace con una condición innegociable: definir de antemano el precio exacto donde la hipótesis de mercado queda anulada.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3.5 bg-[#191d26] rounded-lg border border-[#2a2e39] space-y-1.5">
              <span className="font-bold text-xs text-white">Regla del 1% al 2% de Riesgo:</span>
              <p className="text-xs text-[#787b86]">
                Nunca arriesgues más del 1% o 2% de tu cuenta total en una sola operación. Ajusta el tamaño de la posición (lote/tamaño) a la distancia entre tu Entrada y tu Stop Loss.
              </p>
            </div>

            <div className="p-3.5 bg-[#191d26] rounded-lg border border-[#2a2e39] space-y-1.5">
              <span className="font-bold text-xs text-white">Ratio Riesgo : Beneficio (R:R ≥ 1:2):</span>
              <p className="text-xs text-[#787b86]">
                Si arriesgas $100 en el Stop Loss, tu objetivo de beneficio debe ser al menos $200. De esta manera, incluso con una tasa de acierto del 40%, tu cuenta será rentable a largo plazo.
              </p>
            </div>
          </div>
        </div>
      ),
    },

    {
      id: 'checklist',
      title: '7. Simulador / Checklist Pre-Operación',
      category: 'Herramienta Interactiva',
      icon: <CheckCircle2 className="w-4 h-4 text-[#089981]" />,
      badgeColor: 'bg-[#089981]/20 text-[#089981]',
      content: (
        <div className="space-y-4 text-sm text-[#d1d4dc]">
          <div className="p-4 bg-[#131722] rounded-lg border border-[#2a2e39]">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-base font-bold text-white flex items-center space-x-2">
                <CheckCircle2 className="w-5 h-5 text-[#089981]" />
                <span>Checklist de Validación antes de Operar</span>
              </h4>
              <button
                onClick={resetChecklist}
                className="flex items-center space-x-1 text-xs text-[#787b86] hover:text-[#d1d4dc] transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reiniciar</span>
              </button>
            </div>
            <p className="text-xs text-[#787b86]">
              Marca cada una de las 5 condiciones. Si no cumples las 5, <b>no entres a la operación</b>.
            </p>
          </div>

          {/* Checklist items */}
          <div className="space-y-2.5">
            <label className={`p-3.5 rounded-lg border flex items-start space-x-3 cursor-pointer transition-all ${
              checklist.macroTrend ? 'bg-[#089981]/10 border-[#089981]/50 text-white' : 'bg-[#191d26] border-[#2a2e39] text-[#787b86]'
            }`}>
              <input
                type="checkbox"
                checked={checklist.macroTrend}
                onChange={() => toggleChecklist('macroTrend')}
                className="mt-0.5 rounded border-[#2a2e39] text-[#089981] focus:ring-0 w-4 h-4"
              />
              <div className="space-y-0.5">
                <div className="font-semibold text-xs text-[#d1d4dc]">1. Alineación de Tendencia Macro (1W / 1D)</div>
                <div className="text-[11px] text-[#787b86]">Verifiqué en semanal o diario que la directriz mayor favorece la dirección de mi trade.</div>
              </div>
            </label>

            <label className={`p-3.5 rounded-lg border flex items-start space-x-3 cursor-pointer transition-all ${
              checklist.pivotSupport ? 'bg-[#089981]/10 border-[#089981]/50 text-white' : 'bg-[#191d26] border-[#2a2e39] text-[#787b86]'
            }`}>
              <input
                type="checkbox"
                checked={checklist.pivotSupport}
                onChange={() => toggleChecklist('pivotSupport')}
                className="mt-0.5 rounded border-[#2a2e39] text-[#089981] focus:ring-0 w-4 h-4"
              />
              <div className="space-y-0.5">
                <div className="font-semibold text-xs text-[#d1d4dc]">2. Confluencia con Zona Pivote o Soporte Dinámico</div>
                <div className="text-[11px] text-[#787b86]">El precio está descansando en un soporte histórico o en la EMA 50 / Banda de Bollinger.</div>
              </div>
            </label>

            <label className={`p-3.5 rounded-lg border flex items-start space-x-3 cursor-pointer transition-all ${
              checklist.chartPattern ? 'bg-[#089981]/10 border-[#089981]/50 text-white' : 'bg-[#191d26] border-[#2a2e39] text-[#787b86]'
            }`}>
              <input
                type="checkbox"
                checked={checklist.chartPattern}
                onChange={() => toggleChecklist('chartPattern')}
                className="mt-0.5 rounded border-[#2a2e39] text-[#089981] focus:ring-0 w-4 h-4"
              />
              <div className="space-y-0.5">
                <div className="font-semibold text-xs text-[#d1d4dc]">3. Patrón Chartista o Ruptura de Micro-Directriz</div>
                <div className="text-[11px] text-[#787b86]">Identifiqué un HCHi, doble suelo o quiebro de micro-canal de retroceso.</div>
              </div>
            </label>

            <label className={`p-3.5 rounded-lg border flex items-start space-x-3 cursor-pointer transition-all ${
              checklist.oscillatorReset ? 'bg-[#089981]/10 border-[#089981]/50 text-white' : 'bg-[#191d26] border-[#2a2e39] text-[#787b86]'
            }`}>
              <input
                type="checkbox"
                checked={checklist.oscillatorReset}
                onChange={() => toggleChecklist('oscillatorReset')}
                className="mt-0.5 rounded border-[#2a2e39] text-[#089981] focus:ring-0 w-4 h-4"
              />
              <div className="space-y-0.5">
                <div className="font-semibold text-xs text-[#d1d4dc]">4. Saneamiento de Osciladores (RSI / %B / Squeeze)</div>
                <div className="text-[11px] text-[#787b86]">El RSI se descargó a zona neutral/sobreventa o las bandas salieron de un Squeeze.</div>
              </div>
            </label>

            <label className={`p-3.5 rounded-lg border flex items-start space-x-3 cursor-pointer transition-all ${
              checklist.riskReward ? 'bg-[#089981]/10 border-[#089981]/50 text-white' : 'bg-[#191d26] border-[#2a2e39] text-[#787b86]'
            }`}>
              <input
                type="checkbox"
                checked={checklist.riskReward}
                onChange={() => toggleChecklist('riskReward')}
                className="mt-0.5 rounded border-[#2a2e39] text-[#089981] focus:ring-0 w-4 h-4"
              />
              <div className="space-y-0.5">
                <div className="font-semibold text-xs text-[#d1d4dc]">5. Stop Loss Innegociable y Ratio R:R ≥ 1:2</div>
                <div className="text-[11px] text-[#787b86]">Definí mi precio exacto de invalidación por debajo del soporte antes de disparar la orden.</div>
              </div>
            </label>
          </div>

          {/* Validation Banner */}
          <div className={`p-4 rounded-lg border flex items-center justify-between transition-all ${
            isSetupReady
              ? 'bg-[#089981]/20 border-[#089981] text-[#a7f3d0]'
              : 'bg-[#191d26] border-[#2a2e39] text-[#787b86]'
          }`}>
            <div className="flex items-center space-x-2.5">
              {isSetupReady ? (
                <CheckCircle2 className="w-5 h-5 text-[#089981]" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-[#f6c344]" />
              )}
              <span className="text-xs font-semibold">
                {isSetupReady
                  ? '¡Setup 100% Validado! Cumples las 5 reglas para ejecutar.'
                  : `Progreso: ${completedSteps}/5 condiciones validadas.`}
              </span>
            </div>
          </div>
        </div>
      ),
    },
  ];

  const currentModule = modules.find((m) => m.id === activeTab) || modules[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className="w-full max-w-4xl bg-[#1e222d] border border-[#2a2e39] rounded-xl shadow-2xl overflow-hidden flex flex-col h-[85vh] max-h-[750px]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a2e39] bg-[#191d26]">
          <div className="flex items-center space-x-2.5 text-white font-bold text-base">
            <div className="w-8 h-8 rounded-lg bg-[#2962ff]/20 text-[#2962ff] flex items-center justify-center">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <span>Academia de Trading & Análisis Técnico</span>
              <p className="text-xs text-[#787b86] font-normal">Guía interactiva basada en análisis cuantitativo y chartismo profesional</p>
            </div>
          </div>
          <button
            onClick={() => setAcademyModalOpen(false)}
            className="p-1 rounded hover:bg-[#2a2e39] text-[#787b86] hover:text-[#d1d4dc] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body (Sidebar + Content) */}
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar Tabs */}
          <div className="w-72 bg-[#131722] border-r border-[#2a2e39] p-3 space-y-1 overflow-y-auto shrink-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#787b86] px-2 py-1 mb-1">
              Módulos de Aprendizaje
            </div>
            {modules.map((mod) => {
              const active = mod.id === activeTab;
              return (
                <button
                  key={mod.id}
                  onClick={() => setActiveTab(mod.id)}
                  className={`w-full text-left p-2.5 rounded-lg text-xs font-medium transition-all flex items-center justify-between group ${
                    active
                      ? 'bg-[#2962ff] text-white shadow-xs'
                      : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1e222d]'
                  }`}
                >
                  <div className="flex items-center space-x-2 truncate">
                    <span className={active ? 'text-white' : 'text-[#787b86] group-hover:text-[#d1d4dc]'}>
                      {mod.icon}
                    </span>
                    <span className="truncate">{mod.title}</span>
                  </div>
                  <ArrowRight className={`w-3 h-3 shrink-0 ${active ? 'opacity-100 text-white' : 'opacity-0'}`} />
                </button>
              );
            })}
          </div>

          {/* Main Content Area */}
          <div className="flex-1 p-6 overflow-y-auto bg-[#1e222d]">
            <div className="mb-4 pb-3 border-b border-[#2a2e39] flex items-center justify-between">
              <div>
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${currentModule.badgeColor}`}>
                  {currentModule.category}
                </span>
                <h3 className="text-lg font-bold text-white mt-1">{currentModule.title}</h3>
              </div>
            </div>

            {currentModule.content}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-[#191d26] border-t border-[#2a2e39] flex items-center justify-between text-xs text-[#787b86]">
          <span>Plataforma TradingView Clone & Engine Cuantitativo</span>
          <button
            onClick={() => setAcademyModalOpen(false)}
            className="px-4 py-1.5 rounded bg-[#2962ff] hover:bg-[#1e4bd8] text-white font-medium transition-colors"
          >
            Entendido, volver al gráfico
          </button>
        </div>
      </div>
    </div>
  );
};
