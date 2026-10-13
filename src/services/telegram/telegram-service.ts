import { TradingSignal, ClosedTrade, TelegramConfig } from '@/types';

export const DEFAULT_TELEGRAM_BOT_TOKEN = '8829870430:AAHE9C5U4s8eM4B36omK5tzjGZ1qFb6oRF8';
export const BOT_USERNAME = 'Fl4shloanarb_bot';

const formatPrice = (p: number) => {
  if (!p && p !== 0) return '0.00';
  if (p < 0.00001) return p.toFixed(8);
  if (p < 0.001) return p.toFixed(6);
  if (p < 1) return p.toFixed(6);
  if (p < 10) return p.toFixed(4);
  if (p < 1000) return p.toFixed(2);
  return p.toFixed(2);
};

/**
 * Enviar mensaje crudo en HTML a Telegram
 */
export async function sendTelegramRawMessage(
  botToken: string,
  chatId: string,
  htmlText: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!botToken || !chatId) {
      return { success: false, error: 'Token del bot o Chat ID faltante.' };
    }

    const cleanToken = botToken.trim();
    const cleanChatId = chatId.trim();

    const response = await fetch(`https://api.telegram.org/bot${cleanToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: cleanChatId,
        text: htmlText,
        parse_mode: 'HTML',
        disable_web_page_preview: false,
      }),
    });

    const data = await response.json();
    if (data.ok) {
      return { success: true };
    } else {
      return { success: false, error: data.description || 'Error de Telegram API' };
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error de conexión con Telegram' };
  }
}

/**
 * Probar conexión con Telegram
 */
export async function testTelegramConnection(
  botToken: string,
  chatId: string
): Promise<{ success: boolean; error?: string }> {
  const message = `
⚡ <b>HIK453 TERMINAL · CONEXIÓN EXITOSA</b>
━━━━━━━━━━━━━━━━━━━━
✅ Tu bot <b>@${BOT_USERNAME}</b> está correctamente vinculado a tu terminal de trading.
🔔 Recibirás alertas instantáneas de señales, ejecuciones del bot autónomo y toma de ganancias.
━━━━━━━━━━━━━━━━━━━━
🌐 <i>Terminal activa: </i><a href="http://217.77.14.31:3001/">HIK453 Trading Pro</a>
`.trim();

  return await sendTelegramRawMessage(botToken, chatId, message);
}

/**
 * Auto-detectar Chat IDs de usuarios que hayan enviado /start o algún mensaje al bot
 */
export async function getLatestTelegramChatId(botToken: string): Promise<{
  chatId?: string;
  username?: string;
  firstName?: string;
  error?: string;
}> {
  try {
    const cleanToken = (botToken || DEFAULT_TELEGRAM_BOT_TOKEN).trim();
    const res = await fetch(`https://api.telegram.org/bot${cleanToken}/getUpdates`);
    const data = await res.json();

    if (!data.ok || !data.result || data.result.length === 0) {
      return {
        error: `No se encontraron mensajes recientes. Abre Telegram, busca a @${BOT_USERNAME}, presiona "INICIAR" (o escribe /start) y vuelve a intentar.`,
      };
    }

    // Tomar el último mensaje recibido
    const lastUpdate = data.result[data.result.length - 1];
    const message = lastUpdate.message || lastUpdate.channel_post || lastUpdate.my_chat_member;
    const chat = message?.chat || lastUpdate?.callback_query?.message?.chat;

    if (chat && chat.id) {
      return {
        chatId: String(chat.id),
        username: chat.username || chat.title || 'Usuario',
        firstName: chat.first_name || '',
      };
    }

    return { error: 'No se pudo extraer el Chat ID de las actualizaciones.' };
  } catch (err: any) {
    return { error: err.message || 'Error al consultar actualizaciones de Telegram.' };
  }
}

/**
 * Notificar una nueva señal de trading
 */
export async function sendSignalAlert(
  config: TelegramConfig,
  signal: TradingSignal
): Promise<void> {
  if (!config.isEnabled || !config.notifyNewSignals || !config.chatId) return;

  const isBuy = signal.type === 'BUY';
  const typeBadge = isBuy ? '🟢 BUY / LONG' : '🔴 SELL / SHORT';

  const message = `
🚨 <b>ALERTA DE SEÑAL: ${signal.symbol}</b>
━━━━━━━━━━━━━━━━━━━━
📈 <b>Operación:</b> ${typeBadge}
⏱ <b>Temporalidad:</b> ${signal.timeframe}
📊 <b>Estrategia:</b> ${signal.strategy}
🎯 <b>Precio Entrada:</b> $${formatPrice(signal.price)}
🛡 <b>Stop Loss (SL):</b> $${formatPrice(signal.stopLoss)}
🎯 <b>Take Profit 1:</b> $${formatPrice(signal.takeProfit1)}
🚀 <b>Take Profit 2:</b> $${formatPrice(signal.takeProfit2)}
⚖️ <b>Ratio R:R:</b> ${signal.riskReward}
💡 <b>Motivo:</b> ${signal.reason}
━━━━━━━━━━━━━━━━━━━━
🔗 <a href="http://217.77.14.31:3001/">Abrir Terminal HIK453</a>
`.trim();

  await sendTelegramRawMessage(config.botToken, config.chatId, message);
}

/**
 * Notificar ejecución de orden del Bot Autónomo
 */
export async function sendBotExecutionAlert(
  config: TelegramConfig,
  signal: TradingSignal,
  entryPrice: number,
  amountUSDT: number,
  orderType: string,
  reason: string
): Promise<void> {
  if (!config.isEnabled || !config.notifyBotExecutions || !config.chatId) return;

  const isBuy = signal.type === 'BUY';
  const typeEmoji = isBuy ? '🟢 COMPRA' : '🔴 VENTA';

  const message = `
🤖 <b>BOT AUTÓNOMO: ORDEN EJECUTADA</b>
━━━━━━━━━━━━━━━━━━━━
💎 <b>Par:</b> ${signal.symbol}
📈 <b>Tipo:</b> ${typeEmoji} (${orderType})
💵 <b>Monto:</b> $${amountUSDT} USDT
🎯 <b>Precio Ejecución:</b> $${formatPrice(entryPrice)}
🛡 <b>Stop Loss:</b> $${formatPrice(signal.stopLoss)}
🎯 <b>Take Profit 1:</b> $${formatPrice(signal.takeProfit1)}
🚀 <b>Take Profit 2:</b> $${formatPrice(signal.takeProfit2)}
🧠 <b>Validación Cuantitativa:</b> ${reason}
━━━━━━━━━━━━━━━━━━━━
🔗 <a href="http://217.77.14.31:3001/">Ver Posición en Vivo</a>
`.trim();

  await sendTelegramRawMessage(config.botToken, config.chatId, message);
}

/**
 * Notificar trade cerrado (TP1, TP2, SL o Manual)
 */
export async function sendClosedTradeAlert(
  config: TelegramConfig,
  trade: ClosedTrade
): Promise<void> {
  if (!config.isEnabled || !config.notifyClosedTrades || !config.chatId) return;

  const isProfit = trade.pnlUSDT >= 0;
  const emoji = isProfit ? '💰' : '🛑';
  const pnlSign = isProfit ? '+' : '';

  let exitLabel = 'Cierre Manual';
  if (trade.exitReason === 'TP1') exitLabel = 'Take Profit 1 (50% Parcial asegurado)';
  if (trade.exitReason === 'TP2') exitLabel = 'Take Profit 2 (100% Meta Cumplida 🚀)';
  if (trade.exitReason === 'SL') exitLabel = 'Stop Loss Ejecutado 🛡️';

  const message = `
${emoji} <b>TRADE CERRADO: ${trade.symbol}</b>
━━━━━━━━━━━━━━━━━━━━
📈 <b>Posición:</b> ${trade.type} (${trade.strategy})
💵 <b>Capital:</b> $${trade.amountUSDT} USDT
🏁 <b>Entrada:</b> $${formatPrice(trade.entryPrice)} ➡️ <b>Salida:</b> $${formatPrice(trade.exitPrice)}
${isProfit ? '🟢' : '🔴'} <b>Resultado:</b> <b>${pnlSign}$${trade.pnlUSDT.toFixed(2)} USDT (${pnlSign}${trade.pnlPercent.toFixed(2)}%)</b>
🎯 <b>Motivo:</b> ${exitLabel}
━━━━━━━━━━━━━━━━━━━━
🔗 <a href="http://217.77.14.31:3001/">Historial en Terminal HIK453</a>
`.trim();

  await sendTelegramRawMessage(config.botToken, config.chatId, message);
}
