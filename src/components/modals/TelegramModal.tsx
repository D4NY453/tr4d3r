'use client';

import React, { useState } from 'react';
import { useTradingStore } from '@/store/useTradingStore';
import {
  Send,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  ExternalLink,
  ShieldCheck,
  Bell,
  Bot,
  DollarSign,
  HelpCircle,
  RefreshCw,
} from 'lucide-react';
import {
  BOT_USERNAME,
  DEFAULT_TELEGRAM_BOT_TOKEN,
  getLatestTelegramChatId,
  testTelegramConnection,
} from '@/services/telegram/telegram-service';

export const TelegramModal: React.FC = () => {
  const {
    isTelegramModalOpen,
    setTelegramModalOpen,
    telegramConfig,
    updateTelegramConfig,
  } = useTradingStore();

  const [token, setToken] = useState(telegramConfig.botToken || DEFAULT_TELEGRAM_BOT_TOKEN);
  const [chatId, setChatId] = useState(telegramConfig.chatId || '');
  const [notifyNewSignals, setNotifyNewSignals] = useState(telegramConfig.notifyNewSignals);
  const [notifyBotExecutions, setNotifyBotExecutions] = useState(telegramConfig.notifyBotExecutions);
  const [notifyClosedTrades, setNotifyClosedTrades] = useState(telegramConfig.notifyClosedTrades);

  const [isDetecting, setIsDetecting] = useState(false);
  const [detectStatus, setDetectStatus] = useState<{ success?: boolean; message?: string } | null>(null);

  const [isTesting, setIsTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<{ success?: boolean; message?: string } | null>(null);

  if (!isTelegramModalOpen) return null;

  const handleDetectChatId = async () => {
    setIsDetecting(true);
    setDetectStatus(null);
    try {
      const res = await getLatestTelegramChatId(token);
      if (res.chatId) {
        setChatId(res.chatId);
        updateTelegramConfig({ chatId: res.chatId });
        setDetectStatus({
          success: true,
          message: `¡Chat ID detectado con éxito! Vinculado a: @${res.username || res.firstName || res.chatId}`,
        });
      } else {
        setDetectStatus({
          success: false,
          message: res.error || 'No se encontró mensaje. Presiona /start en el bot e intenta de nuevo.',
        });
      }
    } catch (err: any) {
      setDetectStatus({ success: false, message: err.message || 'Error al conectar con Telegram.' });
    } finally {
      setIsDetecting(false);
    }
  };

  const handleTestNotification = async () => {
    if (!chatId.trim()) {
      setTestStatus({ success: false, message: 'Por favor ingresa o auto-detecta un Chat ID primero.' });
      return;
    }

    setIsTesting(true);
    setTestStatus(null);
    try {
      const res = await testTelegramConnection(token, chatId);
      if (res.success) {
        setTestStatus({ success: true, message: '¡Mensaje de prueba enviado! Revisa tu Telegram.' });
      } else {
        setTestStatus({ success: false, message: res.error || 'Error al enviar mensaje de prueba.' });
      }
    } catch (err: any) {
      setTestStatus({ success: false, message: err.message || 'Error al probar conexión.' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    updateTelegramConfig({
      botToken: token.trim(),
      chatId: chatId.trim(),
      notifyNewSignals,
      notifyBotExecutions,
      notifyClosedTrades,
      isEnabled: Boolean(chatId.trim()),
    });
    setTelegramModalOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-4">
      <div className="w-full max-w-xl bg-[#08090d] border border-white/[0.09] rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-white/[0.07] flex items-center justify-between bg-white/[0.01]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#229ED9]/10 border border-[#229ED9]/30 flex items-center justify-center text-[#229ED9]">
              <Send className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-mono font-medium text-white tracking-wider">
                  ALERTAS TELEGRAM BOT
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#229ED9]/15 text-[#229ED9] border border-[#229ED9]/30">
                  @{BOT_USERNAME}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono">
                Recibe señales en vivo, órdenes del bot y toma de ganancias en tu Telegram
              </p>
            </div>
          </div>

          <button
            onClick={() => setTelegramModalOpen(false)}
            className="p-1.5 rounded-lg hover:bg-white/[0.06] text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto space-y-4 text-xs font-mono">
          {/* Quick Step Banner */}
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.07] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-200 font-medium flex items-center space-x-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-[#229ED9]" />
                <span>¿Cómo vincular tu Telegram en 30 segundos?</span>
              </span>
              <a
                href={`https://t.me/${BOT_USERNAME}`}
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-[#229ED9] hover:underline flex items-center space-x-1"
              >
                <span>Abrir @{BOT_USERNAME}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <ol className="list-decimal list-inside space-y-1 text-slate-400 text-[11px] leading-relaxed">
              <li>
                Abre Telegram y busca al bot <strong className="text-white">@{BOT_USERNAME}</strong>.
              </li>
              <li>
                Presiona el botón <strong className="text-white">INICIAR</strong> (o envíale el comando <strong className="text-white">/start</strong>).
              </li>
              <li>
                Haz clic en el botón <strong className="text-[#229ED9]">"Auto-detectar Chat ID"</strong> aquí abajo.
              </li>
            </ol>
          </div>

          {/* Form Fields */}
          <div className="space-y-3">
            {/* Bot Token */}
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Token del Bot de Telegram (HTTP API):
              </label>
              <input
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                className="w-full bg-[#050608] border border-white/[0.08] focus:border-[#229ED9]/60 rounded-lg px-3 py-2 text-slate-200 font-mono text-xs focus:outline-none"
              />
            </div>

            {/* Chat ID & Auto-detect Button */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-slate-400">
                  Tu Chat ID de Telegram (Usuario o Grupo):
                </label>
                <button
                  type="button"
                  onClick={handleDetectChatId}
                  disabled={isDetecting}
                  className="text-[10px] text-[#229ED9] hover:text-white flex items-center space-x-1 transition-colors cursor-pointer"
                >
                  {isDetecting ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Detectando...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3 h-3" />
                      <span>Auto-detectar Chat ID</span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={chatId}
                  onChange={(e) => setChatId(e.target.value)}
                  placeholder="Ej: 123456789 (Pulsa Auto-detectar)"
                  className="flex-1 bg-[#050608] border border-white/[0.08] focus:border-[#229ED9]/60 rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none"
                />

                <button
                  type="button"
                  onClick={handleTestNotification}
                  disabled={isTesting || !chatId}
                  className="px-3 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] text-white border border-white/[0.09] text-[11px] font-mono transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-40"
                  title="Enviar mensaje de prueba"
                >
                  {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5 text-[#229ED9]" />}
                  <span>Probar</span>
                </button>
              </div>
            </div>

            {/* Detection / Test Status Feedback */}
            {detectStatus && (
              <div
                className={`p-2.5 rounded-lg border text-[11px] flex items-start space-x-2 ${
                  detectStatus.success
                    ? 'bg-[#10b981]/10 border-[#10b981]/30 text-[#10b981]'
                    : 'bg-[#f43f5e]/10 border-[#f43f5e]/30 text-[#f43f5e]'
                }`}
              >
                {detectStatus.success ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{detectStatus.message}</span>
              </div>
            )}

            {testStatus && (
              <div
                className={`p-2.5 rounded-lg border text-[11px] flex items-start space-x-2 ${
                  testStatus.success
                    ? 'bg-[#10b981]/10 border-[#10b981]/30 text-[#10b981]'
                    : 'bg-[#f43f5e]/10 border-[#f43f5e]/30 text-[#f43f5e]'
                }`}
              >
                {testStatus.success ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{testStatus.message}</span>
              </div>
            )}
          </div>

          {/* Alert Type Toggles */}
          <div className="pt-2 border-t border-white/[0.07] space-y-2">
            <span className="text-slate-300 font-medium block mb-1">
              Seleccionar tipos de alertas a enviar:
            </span>

            {/* Signals */}
            <label className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition-colors cursor-pointer">
              <div className="flex items-center space-x-2.5">
                <Bell className="w-4 h-4 text-[#10b981]" />
                <div>
                  <div className="text-white font-medium">Nuevas Señales (BUY / SELL)</div>
                  <div className="text-[10px] text-slate-400">
                    Notifica al instante cuando una estrategia cuantitativa valida una oportunidad
                  </div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={notifyNewSignals}
                onChange={(e) => setNotifyNewSignals(e.target.checked)}
                className="w-4 h-4 accent-white rounded cursor-pointer"
              />
            </label>

            {/* Bot Executions */}
            <label className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition-colors cursor-pointer">
              <div className="flex items-center space-x-2.5">
                <Bot className="w-4 h-4 text-[#229ED9]" />
                <div>
                  <div className="text-white font-medium">Ejecuciones del Bot Autónomo</div>
                  <div className="text-[10px] text-slate-400">
                    Notifica cada vez que el Bot abre una operación a mercado o coloca orden límite
                  </div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={notifyBotExecutions}
                onChange={(e) => setNotifyBotExecutions(e.target.checked)}
                className="w-4 h-4 accent-white rounded cursor-pointer"
              />
            </label>

            {/* Closed Trades / TP & SL */}
            <label className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition-colors cursor-pointer">
              <div className="flex items-center space-x-2.5">
                <DollarSign className="w-4 h-4 text-[#f59e0b]" />
                <div>
                  <div className="text-white font-medium">Toma de Ganancias (TP1 / TP2) & Stop Loss</div>
                  <div className="text-[10px] text-slate-400">
                    Envía reporte con el PnL neto en USDT (%) al alcanzar objetivos de salida
                  </div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={notifyClosedTrades}
                onChange={(e) => setNotifyClosedTrades(e.target.checked)}
                className="w-4 h-4 accent-white rounded cursor-pointer"
              />
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-white/[0.07] bg-white/[0.01] flex items-center justify-between">
          <div className="flex items-center space-x-1 text-[11px] text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-[#10b981]" />
            <span>Encriptado y privado en tu navegador</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setTelegramModalOpen(false)}
              className="px-3 py-1.5 rounded-lg hover:bg-white/[0.06] text-slate-400 hover:text-white transition-colors cursor-pointer text-xs"
            >
              Cancelar
            </button>

            <button
              onClick={handleSave}
              className="px-4 py-1.5 rounded-lg bg-white text-black hover:bg-slate-200 font-medium text-xs transition-colors cursor-pointer shadow-xs"
            >
              Guardar Configuración
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
