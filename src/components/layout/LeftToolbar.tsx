'use client';

import React, { useState } from 'react';
import {
  Crosshair,
  TrendingUp,
  Percent,
  Ruler,
  Eraser,
  Pencil,
  Type,
  Square,
  Lock,
  Eye,
  Trash2,
} from 'lucide-react';

interface ToolItem {
  id: string;
  icon: React.ElementType;
  label: string;
}

const TOOLS: ToolItem[] = [
  { id: 'crosshair', icon: Crosshair, label: 'Cruz / Puntero' },
  { id: 'trendline', icon: TrendingUp, label: 'Línea de Tendencia' },
  { id: 'fibonacci', icon: Percent, label: 'Retroceso de Fibonacci' },
  { id: 'brush', icon: Pencil, label: 'Pincel / Dibujo' },
  { id: 'shapes', icon: Square, label: 'Formas Geométricas' },
  { id: 'text', icon: Type, label: 'Texto / Anotación' },
  { id: 'measure', icon: Ruler, label: 'Regla de Medición' },
  { id: 'eraser', icon: Eraser, label: 'Borrador' },
];

export const LeftToolbar: React.FC = () => {
  const [activeTool, setActiveTool] = useState<string>('crosshair');

  return (
    <aside className="hidden md:flex w-10 bg-[#050608]/95 backdrop-blur-2xl border-r border-white/[0.07] flex-col items-center py-2 justify-between select-none z-10 shrink-0">
      {/* Top tools */}
      <div className="flex flex-col items-center space-y-1">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          const isActive = activeTool === tool.id;

          return (
            <button
              key={tool.id}
              onClick={() => setActiveTool(tool.id)}
              className={`w-7 h-7 rounded-md flex items-center justify-center transition-all cursor-pointer ${
                isActive
                  ? 'bg-white text-black shadow-xs'
                  : 'text-slate-500 hover:text-white hover:bg-white/[0.05]'
              }`}
              title={tool.label}
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          );
        })}
      </div>

      {/* Bottom utility icons */}
      <div className="flex flex-col items-center space-y-1 pt-2 border-t border-white/[0.07]">
        <button
          className="w-7 h-7 rounded-md flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/[0.05] transition-colors cursor-pointer"
          title="Bloquear Dibujos"
        >
          <Lock className="w-3 h-3" />
        </button>
        <button
          className="w-7 h-7 rounded-md flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/[0.05] transition-colors cursor-pointer"
          title="Ocultar Dibujos"
        >
          <Eye className="w-3 h-3" />
        </button>
        <button
          className="w-7 h-7 rounded-md flex items-center justify-center text-slate-500 hover:text-[#f43f5e] hover:bg-white/[0.05] transition-colors cursor-pointer"
          title="Borrar Todos los Dibujos"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </aside>
  );
};
