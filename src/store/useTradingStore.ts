import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  Candle,
  Timeframe,
  IndicatorSettings,
  ActiveStrategyConfig,
  TradingSignal,
  Ticker24h,
  PaperPosition,
  LimitOrder,
  ClosedTrade,
  TradeExitReason,
  BotConfig,
  BotLogEntry,
  BotLogAction,
  BotStats,
  TelegramConfig,
  AssetCategory,
  SubFund,
  BankTestSummary,
} from '@/types';
import {
  evaluateOpportunityForBot,
  createInitialSubFunds,
  processTickForSubFunds,
  globalTickRollingWindow,
  calculateBankTestSummary,
} from '@/services/bot/trading-bot-engine';
import {
  DEFAULT_TELEGRAM_BOT_TOKEN,
  sendSignalAlert,
  sendBotExecutionAlert,
  sendClosedTradeAlert,
} from '@/services/telegram/telegram-service';
import {
  fetchHyperliquidClearinghouseState,
  executeHyperliquidOrder,
  closeHyperliquidPosition,
  updateHyperliquidLeverage,
  fetchHyperliquidUserFills,
  parseClosedTradesFromFills,
  fetchBotClosedTrades,
} from '@/services/hyperliquid/hyperliquid-rest';
import {
  HyperliquidClearinghouseState,
  HyperliquidOrderResult,
  HyperliquidClosedTrade,
} from '@/services/hyperliquid/hyperliquid-types';

interface TradingState {
  currentSymbol: string;
  currentTimeframe: Timeframe;
  candles: Candle[];
  isLoadingCandles: boolean;

  // Indicators
  indicators: IndicatorSettings;
  strategies: ActiveStrategyConfig;
  signals: TradingSignal[];

  // Wallet & Paper Trading State
  walletBalance: number;
  initialDeposit: number;
  paperPositions: PaperPosition[];
  limitOrders: LimitOrder[];
  closedTrades: ClosedTrade[];

  // Autonomous Trading Bot State
  isBotActive: boolean;
  botConfig: BotConfig;
  botLogs: BotLogEntry[];
  botStats: BotStats;
  isBotModalOpen: boolean;

  // Telegram Alert Settings State
  telegramConfig: TelegramConfig;
  isTelegramModalOpen: boolean;

  // Watchlist & UI state
  watchlist: Ticker24h[];
  selectedSignal: TradingSignal | null;
  isSignalsPanelOpen: boolean;
  isSearchModalOpen: boolean;
  isWatchlistOpen: boolean;
  isIndicatorModalOpen: boolean;
  isStrategyModalOpen: boolean;
  isAcademyModalOpen: boolean;
  isCalculatorModalOpen: boolean;
  isWalletModalOpen: boolean;
  isBankTestModalOpen: boolean;
  subFunds: SubFund[];
  onlyCurrentSignals: boolean;
  dismissedSignalIds: string[];
  signalFilterTab: 'ACTIVE' | 'RECENT' | 'ALL';
  hidePastChartMarkers: boolean;
  selectedCategory: AssetCategory;
  pythApiKey: string;
  isPythModalOpen: boolean;

  // Actions
  setSymbol: (symbol: string) => void;
  setTimeframe: (tf: Timeframe) => void;
  setCandles: (candles: Candle[]) => void;
  updateLastCandle: (candle: Candle) => void;
  setLoadingCandles: (loading: boolean) => void;

  toggleIndicator: (key: keyof IndicatorSettings) => void;
  setIndicatorParam: (key: keyof IndicatorSettings, value: any) => void;
  toggleStrategy: (key: keyof ActiveStrategyConfig) => void;
  setSignals: (signals: TradingSignal[]) => void;
  addSignal: (signal: TradingSignal) => void;
  setSelectedSignal: (signal: TradingSignal | null) => void;
  setOnlyCurrentSignals: (only: boolean) => void;
  dismissSignal: (id: string) => void;
  dismissAllExpiredSignals: () => void;
  dismissAllSignalsForCurrentSymbol: () => void;
  clearDismissedSignals: () => void;
  clearClosedTrades: () => void;
  setSignalFilterTab: (tab: 'ACTIVE' | 'RECENT' | 'ALL') => void;
  setHidePastChartMarkers: (hide: boolean) => void;

  // Bot Actions
  toggleBot: () => void;
  setBotActive: (active: boolean) => void;
  updateBotConfig: (config: Partial<BotConfig>) => void;
  addBotLog: (log: Omit<BotLogEntry, 'id' | 'timestamp'>) => void;
  clearBotLogs: () => void;
  setBotModalOpen: (open: boolean) => void;
  evaluateAndRunBotSignal: (signal: TradingSignal) => void;

  // Banco de Pruebas $100,000 USD (10 Sub-Fondos de $10,000 a 0% Fee)
  processMicroTick: (price: number, volume?: number, timestamp?: number) => void;
  resetSubFunds: () => void;
  setBankTestModalOpen: (open: boolean) => void;

  // Wallet & Paper Trading Actions
  depositFunds: (amount: number) => void;
  resetWallet: (initialBalance?: number) => void;
  executePaperTrade: (
    signal: TradingSignal,
    amountUSDT: number,
    orderType?: 'MARKET' | 'LIMIT'
  ) => void;
  executeMultiplePaperTrades: (
    signals: TradingSignal[],
    amountPerTrade: number,
    orderType?: 'MARKET' | 'LIMIT'
  ) => void;
  cancelLimitOrder: (orderId: string) => void;
  closePaperPosition: (
    positionId: string,
    currentPrice: number,
    reason?: TradeExitReason
  ) => void;
  closeAllPaperPositions: (reason?: TradeExitReason) => void;
  addClosedTrades: (trades: ClosedTrade[]) => void;
  updatePositionsWithTickers: (
    priceMap: Record<string, { price: number; high?: number; low?: number }>
  ) => void;

  setWatchlist: (list: Ticker24h[]) => void;
  setSignalsPanelOpen: (open: boolean) => void;
  setSearchModalOpen: (open: boolean) => void;
  setWatchlistOpen: (open: boolean) => void;
  setIndicatorModalOpen: (open: boolean) => void;
  setStrategyModalOpen: (open: boolean) => void;
  setAcademyModalOpen: (open: boolean) => void;
  setCalculatorModalOpen: (open: boolean) => void;
  setWalletModalOpen: (open: boolean) => void;
  updateTelegramConfig: (config: Partial<TelegramConfig>) => void;
  setTelegramModalOpen: (open: boolean) => void;
  setSelectedCategory: (category: AssetCategory) => void;
  setPythApiKey: (key: string) => void;
  setPythModalOpen: (open: boolean) => void;

  // Global Multi-Token Opportunities
  isAllOpportunitiesModalOpen: boolean;
  setAllOpportunitiesModalOpen: (open: boolean) => void;
  globalActiveSignals: TradingSignal[];
  setGlobalActiveSignals: (signals: TradingSignal[]) => void;
  isScanningGlobalOpportunities: boolean;
  setIsScanningGlobalOpportunities: (scanning: boolean) => void;
  globalScanProgress: number;
  setGlobalScanProgress: (progress: number) => void;
  activeOpportunityViewMode: 'CURRENT_SYMBOL' | 'ALL_SYMBOLS';
  setActiveOpportunityViewMode: (mode: 'CURRENT_SYMBOL' | 'ALL_SYMBOLS') => void;

  // Hyperliquid State & Actions
  hyperliquidWallet: string;
  hyperliquidAgentKey: string;
  hyperliquidAccount: HyperliquidClearinghouseState | null;
  isLoadingHyperliquidAccount: boolean;
  isHyperliquidModalOpen: boolean;
  hyperliquidAutoTrade: boolean;
  hyperliquidDefaultLeverage: number;
  hyperliquidClosedTrades: HyperliquidClosedTrade[];
  isLoadingHyperliquidClosedTrades: boolean;
  setHyperliquidWallet: (wallet: string) => void;
  setHyperliquidAgentKey: (key: string) => void;
  setHyperliquidModalOpen: (open: boolean) => void;
  setHyperliquidAutoTrade: (auto: boolean) => void;
  setHyperliquidDefaultLeverage: (lev: number) => void;
  setHyperliquidClosedTrades: (trades: HyperliquidClosedTrade[]) => void;
  fetchHyperliquidClosedTrades: () => Promise<void>;
  refreshHyperliquidAccount: () => Promise<void>;
  executeLiveHyperliquidOrder: (params: {
    coin: string;
    isBuy: boolean;
    sz: number;
    px?: number;
    orderType: 'MARKET' | 'LIMIT';
  }) => Promise<HyperliquidOrderResult>;
  closeLiveHyperliquidPosition: (coin: string) => Promise<HyperliquidOrderResult>;
}

export const useTradingStore = create<TradingState>()(
  persist(
    (set, get) => ({
      currentSymbol: 'BTCUSDT',
      currentTimeframe: '15m',
      candles: [],
      isLoadingCandles: false,

      indicators: {
        volume: true,
        ema9: false,
        ema20: true,
        ema50: true,
        ema200: true,
        bollinger: true,
        bollingerPeriod: 20,
        bollingerStdDev: 2,
        supertrend: false,
        supertrendPeriod: 10,
        supertrendMultiplier: 3,
        rsi: true,
        rsiPeriod: 14,
        macd: false,
        macdFast: 12,
        macdSlow: 26,
        macdSignal: 9,
      },

      strategies: {
        emaCross: true,
        rsiReversal: true,
        macdCrossover: false,
        superTrendStrategy: false,
        bollingerBreakout: true,
        bollingerSqueeze: true,
        bollingerPercentBDivergence: true,
      },

      signals: [],
      watchlist: [],
      selectedSignal: null,

      // Wallet & Paper Trading
      walletBalance: 10000,
      initialDeposit: 10000,
      paperPositions: [],
      limitOrders: [],
      closedTrades: [],

      // Autonomous Trading Bot
      isBotActive: false,
      botConfig: {
        isActive: false,
        minRiskReward: 1.5,
        capitalPerTrade: 100,
        maxConcurrentTrades: 3,
        autoOrderType: 'MARKET',
        scanIntervalSeconds: 3,
        cooldownMinutes: 3,
        minConfidenceScore: 70,
        enabledStrategies: [],
        allowedSymbols: [],
        longOnly: false,
        tradeDirection: 'BOTH',
        requireMacroTrendConfirmation: true,
      },
      botLogs: [
        {
          id: 'bot-init-log',
          timestamp: Date.now(),
          symbol: 'SISTEMA',
          action: 'SYSTEM',
          reason: '🤖 Motor del Bot Autónomo inicializado y listo para escanear en tiempo real.',
          score: 100,
        },
      ],
      botStats: {
        totalAnalyzed: 0,
        totalExecuted: 0,
        totalRejected: 0,
        totalProfitUSDT: 0,
        winRate: 0,
      },
      isBotModalOpen: false,
      // Telegram Alerts Config
      telegramConfig: {
        isEnabled: true,
        botToken: DEFAULT_TELEGRAM_BOT_TOKEN,
        chatId: '',
        notifyNewSignals: true,
        notifyBotExecutions: true,
        notifyClosedTrades: true,
        minSignalScore: 70,
      },
      isTelegramModalOpen: false,

      isSignalsPanelOpen: true,
      isSearchModalOpen: false,
      isWatchlistOpen: false,
      isIndicatorModalOpen: false,
      isStrategyModalOpen: false,
      isAcademyModalOpen: false,
      isCalculatorModalOpen: false,
      isWalletModalOpen: false,
      isBankTestModalOpen: false,
      subFunds: createInitialSubFunds(),
      onlyCurrentSignals: true,
      dismissedSignalIds: [],
      signalFilterTab: 'ACTIVE',
      hidePastChartMarkers: true,
      selectedCategory: 'ALL',
      setSelectedCategory: (selectedCategory) => set({ selectedCategory }),
      pythApiKey: '',
      setPythApiKey: (pythApiKey) => set({ pythApiKey }),
      isPythModalOpen: false,
      setPythModalOpen: (isPythModalOpen) => set({ isPythModalOpen }),

      // Global Multi-Token Opportunities
      isAllOpportunitiesModalOpen: false,
      setAllOpportunitiesModalOpen: (isAllOpportunitiesModalOpen) => set({ isAllOpportunitiesModalOpen }),
      globalActiveSignals: [],
      setGlobalActiveSignals: (globalActiveSignals) => set({ globalActiveSignals }),
      isScanningGlobalOpportunities: false,
      setIsScanningGlobalOpportunities: (isScanningGlobalOpportunities) => set({ isScanningGlobalOpportunities }),
      globalScanProgress: 0,
      setGlobalScanProgress: (globalScanProgress) => set({ globalScanProgress }),
      activeOpportunityViewMode: 'CURRENT_SYMBOL',
      setActiveOpportunityViewMode: (activeOpportunityViewMode) => set({ activeOpportunityViewMode }),

      // Hyperliquid State & Actions
      hyperliquidWallet: '',
      hyperliquidAgentKey: '',
      hyperliquidAccount: null,
      isLoadingHyperliquidAccount: false,
      isHyperliquidModalOpen: false,
      hyperliquidAutoTrade: false,
      hyperliquidDefaultLeverage: 10,
      hyperliquidClosedTrades: [],
      isLoadingHyperliquidClosedTrades: false,
      setHyperliquidClosedTrades: (hyperliquidClosedTrades) => set({ hyperliquidClosedTrades }),
      fetchHyperliquidClosedTrades: async () => {
        const { hyperliquidWallet } = get();
        set({ isLoadingHyperliquidClosedTrades: true });
        try {
          const [onChainFills, botRes] = await Promise.all([
            hyperliquidWallet ? fetchHyperliquidUserFills(hyperliquidWallet) : Promise.resolve([]),
            fetchBotClosedTrades(),
          ]);

          const parsedOnChain = parseClosedTradesFromFills(onChainFills);
          const daemonTrades: HyperliquidClosedTrade[] = (botRes?.closedTrades || []).map((t: any) => ({
            id: t.id,
            coin: t.coin,
            symbol: t.symbol || `${t.coin}-PERP`,
            side: t.side,
            dir: t.side === 'BUY' ? 'Close Short' : 'Close Long',
            exitPrice: t.exitPrice,
            entryPrice: t.entryPrice,
            size: t.sz || 1,
            notionalUSD: (t.capitalUSD || 10) * (t.leverage || 10),
            closedPnlUSD: t.pnlUSD || 0,
            pnlPercent: t.pnlPercent || 0,
            feeUSD: 0.05,
            time: t.exitTime || Date.now(),
            hash: '',
            orderId: 0,
            exitReason: t.exitReason || 'TP/SL Scalper',
            isWin: Boolean(t.isWin),
            executionVenue: 'DITTO_NETWORK',
            rsi14: t.rsi14,
            stochK: t.stochK,
            stochD: t.stochD,
            atr14: t.atr14,
            emaTrend: t.emaTrend,
            fundingRate: t.fundingRate,
            spreadPct: t.spreadPct,
            volume24hUSD: t.volume24hUSD,
          }));

          // Merge both lists, preferring on-chain fills if matching time & coin, sort by time desc
          const combined = [...parsedOnChain];
          daemonTrades.forEach((dt) => {
            const exists = combined.some(
              (ct) => ct.coin === dt.coin && Math.abs(ct.time - dt.time) < 15000
            );
            if (!exists) {
              combined.push(dt);
            }
          });

          combined.sort((a, b) => b.time - a.time);

          set({
            hyperliquidClosedTrades: combined,
            isLoadingHyperliquidClosedTrades: false,
          });
        } catch (err) {
          console.error('Error fetching closed trades:', err);
          set({ isLoadingHyperliquidClosedTrades: false });
        }
      },
      setHyperliquidWallet: (hyperliquidWallet) => {
        set({ hyperliquidWallet });
        if (hyperliquidWallet.startsWith('0x')) {
          get().refreshHyperliquidAccount();
          get().fetchHyperliquidClosedTrades();
        }
      },
      setHyperliquidAgentKey: (hyperliquidAgentKey) => set({ hyperliquidAgentKey }),
      setHyperliquidModalOpen: (isHyperliquidModalOpen) => {
        set({ isHyperliquidModalOpen });
        if (isHyperliquidModalOpen) {
          if (get().hyperliquidWallet) {
            get().refreshHyperliquidAccount();
          }
          get().fetchHyperliquidClosedTrades();
        }
      },
      setHyperliquidAutoTrade: (hyperliquidAutoTrade) => set({ hyperliquidAutoTrade }),
      setHyperliquidDefaultLeverage: (hyperliquidDefaultLeverage) => set({ hyperliquidDefaultLeverage }),
      refreshHyperliquidAccount: async () => {
        const { hyperliquidWallet } = get();
        if (!hyperliquidWallet || !hyperliquidWallet.startsWith('0x')) return;
        set({ isLoadingHyperliquidAccount: true });
        try {
          const acc = await fetchHyperliquidClearinghouseState(hyperliquidWallet);
          set({ hyperliquidAccount: acc, isLoadingHyperliquidAccount: false });
          get().fetchHyperliquidClosedTrades();
        } catch {
          set({ isLoadingHyperliquidAccount: false });
        }
      },
      executeLiveHyperliquidOrder: async (params) => {
        const state = get();
        const res = await executeHyperliquidOrder({
          agentPrivateKey: state.hyperliquidAgentKey,
          coin: params.coin,
          isBuy: params.isBuy,
          sz: params.sz,
          px: params.px,
          orderType: params.orderType,
        });
        if (res.status === 'ok') {
          await state.refreshHyperliquidAccount();
        }
        return res;
      },
      closeLiveHyperliquidPosition: async (coin) => {
        const state = get();
        const res = await closeHyperliquidPosition({
          agentPrivateKey: state.hyperliquidAgentKey,
          userAddress: state.hyperliquidWallet,
          coin,
        });
        if (res.status === 'ok') {
          await state.refreshHyperliquidAccount();
        }
        return res;
      },
      setSymbol: (symbol) =>
        set((state) => {
          const upperSym = symbol.toUpperCase();
          if (upperSym !== state.currentSymbol) {
            globalTickRollingWindow.clear();
          }
          return {
            currentSymbol: upperSym,
            selectedSignal:
              state.selectedSignal && state.selectedSignal.symbol === upperSym
                ? state.selectedSignal
                : null,
            signals: state.signals.filter((s) => s.symbol === upperSym),
          };
        }),
      setTimeframe: (currentTimeframe) => set({ currentTimeframe }),
      setCandles: (candles) => set({ candles, isLoadingCandles: false }),
      updateLastCandle: (candle) =>
        set((state) => {
          const candles = [...state.candles];
          const lastIdx = candles.findIndex((c) => c.time === candle.time);
          if (lastIdx >= 0) {
            candles[lastIdx] = candle;
          } else {
            candles.push(candle);
          }

          // 1. Process Pending Limit Orders
          const remainingLimitOrders: LimitOrder[] = [];
          const newlyFilledPositions: PaperPosition[] = [];

          state.limitOrders.forEach((order) => {
            if (order.symbol !== state.currentSymbol || order.status !== 'PENDING') {
              remainingLimitOrders.push(order);
              return;
            }

            const isBuy = order.type === 'BUY';
            const isFilled = isBuy
              ? candle.low <= order.limitPrice
              : candle.high >= order.limitPrice;

            if (isFilled) {
              newlyFilledPositions.push({
                id: `pos-filled-${order.id}`,
                symbol: order.symbol,
                type: order.type,
                strategy: order.strategy,
                entryPrice: order.limitPrice,
                currentPrice: candle.close,
                stopLoss: order.stopLoss,
                takeProfit1: order.takeProfit1,
                takeProfit2: order.takeProfit2,
                amountUSDT: order.amountUSDT,
                initialAmountUSDT: order.amountUSDT,
                pnlUSDT: 0,
                pnlPercent: 0,
                entryTime: Date.now(),
                orderType: 'LIMIT',
                isTP1Hit: false,
              });
            } else {
              remainingLimitOrders.push({
                ...order,
                currentPrice: candle.close,
              });
            }
          });

          // 2. Process Active Positions (existing + newly filled)
          const allActivePositions = [...state.paperPositions, ...newlyFilledPositions];
          const remainingPositions: PaperPosition[] = [];
          const newClosedTrades: ClosedTrade[] = [];
          let returnedBalance = 0;

          allActivePositions.forEach((pos) => {
            if (pos.symbol !== state.currentSymbol) {
              remainingPositions.push(pos);
              return;
            }

            const isBuy = pos.type === 'BUY';
            const livePrice = candle.close;

            // Check Stop Loss
            const isSLHit = isBuy ? livePrice <= pos.stopLoss : livePrice >= pos.stopLoss;
            if (isSLHit) {
              const rawMovePct = isBuy
                ? (pos.stopLoss - pos.entryPrice) / pos.entryPrice
                : (pos.entryPrice - pos.stopLoss) / pos.entryPrice;

              const pnlUSDT = Number((pos.amountUSDT * rawMovePct).toFixed(4));
              const pnlPercent = Number((rawMovePct * 100).toFixed(2));
              returnedBalance += pos.amountUSDT + pnlUSDT;

              newClosedTrades.push({
                id: `live-closed-sl-${pos.id}-${Date.now()}`,
                symbol: pos.symbol,
                type: pos.type,
                strategy: pos.strategy,
                entryPrice: pos.entryPrice,
                exitPrice: pos.stopLoss,
                amountUSDT: pos.amountUSDT,
                pnlUSDT,
                pnlPercent,
                exitReason: 'SL',
                entryTime: pos.entryTime,
                exitTime: Date.now(),
              });

              // Cierre real en Hyperliquid si el bot o auto-trade está activo
              if (
                (state.botConfig.executeOnHyperliquid || state.hyperliquidAutoTrade) &&
                state.hyperliquidAgentKey &&
                state.hyperliquidWallet
              ) {
                state.closeLiveHyperliquidPosition(pos.symbol).catch((err) =>
                  console.error('Error cerrando posición en Hyperliquid por SL:', err)
                );
                state.addBotLog({
                  symbol: pos.symbol,
                  action: 'EXECUTED',
                  reason: `🛑 [HYPERLIQUID L1] Cierre automático por Stop Loss a $${pos.stopLoss} (PnL: ${pnlPercent}%)`,
                });
              }
              return;
            }

            // Check Take Profit 2 (if TP1 was already hit)
            if (pos.isTP1Hit) {
              const isTP2Hit = isBuy ? livePrice >= pos.takeProfit2 : livePrice <= pos.takeProfit2;
              if (isTP2Hit) {
                const rawMovePct = isBuy
                  ? (pos.takeProfit2 - pos.entryPrice) / pos.entryPrice
                  : (pos.entryPrice - pos.takeProfit2) / pos.entryPrice;

                const pnlUSDT = Number((pos.amountUSDT * rawMovePct).toFixed(4));
                const pnlPercent = Number((rawMovePct * 100).toFixed(2));
                returnedBalance += pos.amountUSDT + pnlUSDT;

                newClosedTrades.push({
                  id: `live-closed-tp2-${pos.id}-${Date.now()}`,
                  symbol: pos.symbol,
                  type: pos.type,
                  strategy: pos.strategy,
                  entryPrice: pos.entryPrice,
                  exitPrice: pos.takeProfit2,
                  amountUSDT: pos.amountUSDT,
                  pnlUSDT,
                  pnlPercent,
                  exitReason: 'TP2',
                  entryTime: pos.entryTime,
                  exitTime: Date.now(),
                });

                // Cierre real en Hyperliquid por TP2
                if (
                  (state.botConfig.executeOnHyperliquid || state.hyperliquidAutoTrade) &&
                  state.hyperliquidAgentKey &&
                  state.hyperliquidWallet
                ) {
                  state.closeLiveHyperliquidPosition(pos.symbol).catch((err) =>
                    console.error('Error cerrando posición en Hyperliquid por TP2:', err)
                  );
                  state.addBotLog({
                    symbol: pos.symbol,
                    action: 'EXECUTED',
                    reason: `🎯 [HYPERLIQUID L1] Cierre automático por Take Profit 2 a $${pos.takeProfit2} (PnL: +${pnlPercent}%)`,
                  });
                }
                return;
              }
            }

            // Check Take Profit 1 (Sell 50% partial + Move SL to Break-Even)
            const isTP1Hit = isBuy ? livePrice >= pos.takeProfit1 : livePrice <= pos.takeProfit1;
            if (isTP1Hit && !pos.isTP1Hit) {
              const closedPortionAmount = pos.amountUSDT * 0.5;
              const remainingPortionAmount = pos.amountUSDT * 0.5;

              const rawMovePct = isBuy
                ? (pos.takeProfit1 - pos.entryPrice) / pos.entryPrice
                : (pos.entryPrice - pos.takeProfit1) / pos.entryPrice;

              const pnlUSDT = Number((closedPortionAmount * rawMovePct).toFixed(4));
              const pnlPercent = Number((rawMovePct * 100).toFixed(2));
              returnedBalance += closedPortionAmount + pnlUSDT;

              newClosedTrades.push({
                id: `live-closed-tp1-${pos.id}-${Date.now()}`,
                symbol: pos.symbol,
                type: pos.type,
                strategy: pos.strategy,
                entryPrice: pos.entryPrice,
                exitPrice: pos.takeProfit1,
                amountUSDT: closedPortionAmount,
                pnlUSDT,
                pnlPercent,
                exitReason: 'TP1',
                entryTime: pos.entryTime,
                exitTime: Date.now(),
              });

              // Keep the other 50% open running to TP2, and move SL to Entry Price (Break-Even)
              const rawRemainingMovePct = isBuy
                ? (livePrice - pos.entryPrice) / pos.entryPrice
                : (pos.entryPrice - livePrice) / pos.entryPrice;

              remainingPositions.push({
                ...pos,
                amountUSDT: remainingPortionAmount,
                stopLoss: pos.entryPrice, // Break-Even!
                isTP1Hit: true,
                currentPrice: livePrice,
                pnlUSDT: Number((remainingPortionAmount * rawRemainingMovePct).toFixed(4)),
                pnlPercent: Number((rawRemainingMovePct * 100).toFixed(2)),
              });
              return;
            }

            // Position is still running
            const rawMovePct = isBuy
              ? (livePrice - pos.entryPrice) / pos.entryPrice
              : (pos.entryPrice - livePrice) / pos.entryPrice;

            remainingPositions.push({
              ...pos,
              currentPrice: livePrice,
              pnlUSDT: Number((pos.amountUSDT * rawMovePct).toFixed(4)),
              pnlPercent: Number((rawMovePct * 100).toFixed(2)),
            });
          });

          if (newClosedTrades.length > 0) {
            newClosedTrades.forEach((trade) => {
              sendClosedTradeAlert(state.telegramConfig, trade).catch(() => {});
            });
          }

          return {
            candles,
            walletBalance: state.walletBalance + returnedBalance,
            limitOrders: remainingLimitOrders,
            paperPositions: remainingPositions,
            closedTrades: [...newClosedTrades, ...state.closedTrades],
          };
        }),
      setLoadingCandles: (isLoadingCandles) => set({ isLoadingCandles }),

      toggleIndicator: (key) =>
        set((state) => ({
          indicators: {
            ...state.indicators,
            [key]: !state.indicators[key],
          },
        })),

      setIndicatorParam: (key, value) =>
        set((state) => ({
          indicators: {
            ...state.indicators,
            [key]: value,
          },
        })),

      toggleStrategy: (key) =>
        set((state) => ({
          strategies: {
            ...state.strategies,
            [key]: !state.strategies[key],
          },
        })),

      setSignals: (signals) => set({ signals }),
      addSignal: (signal) =>
        set((state) => ({
          signals: [signal, ...state.signals.filter((s) => s.id !== signal.id)],
        })),
      setSelectedSignal: (selectedSignal) => set({ selectedSignal }),

      // Wallet Actions
      depositFunds: (amount) =>
        set((state) => ({
          walletBalance: state.walletBalance + amount,
          initialDeposit: state.initialDeposit + amount,
        })),

      resetWallet: (initialBalance = 10000) =>
        set({
          walletBalance: initialBalance,
          initialDeposit: initialBalance,
          paperPositions: [],
          limitOrders: [],
          closedTrades: [],
        }),

      executePaperTrade: (signal, amountUSDT, orderType = 'MARKET') =>
        set((state) => {
          if (state.walletBalance < amountUSDT) return state;

          // Resolve the most accurate live price for this exact signal's symbol
          let currentLivePrice = signal.price;
          if (signal.symbol === state.currentSymbol && state.candles.length > 0) {
            currentLivePrice = state.candles[state.candles.length - 1].close;
          } else {
            const ticker = state.watchlist.find((w) => w.symbol === signal.symbol);
            if (ticker && ticker.lastPrice > 0) {
              currentLivePrice = ticker.lastPrice;
            }
          }

          if (orderType === 'LIMIT') {
            const newLimitOrder: LimitOrder = {
              id: `limit-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
              symbol: signal.symbol,
              type: signal.type,
              strategy: signal.strategy,
              limitPrice: signal.price,
              currentPrice: currentLivePrice,
              stopLoss: signal.stopLoss,
              takeProfit1: signal.takeProfit1,
              takeProfit2: signal.takeProfit2,
              amountUSDT,
              createdAt: Date.now(),
              status: 'PENDING',
            };

            return {
              walletBalance: state.walletBalance - amountUSDT,
              limitOrders: [newLimitOrder, ...state.limitOrders],
            };
          }

          // MARKET ORDER: Enter immediately at actual live Binance market price!
          const isBuy = signal.type === 'BUY';
          const entryPrice = currentLivePrice;

          const riskDelta = Math.abs(signal.price - signal.stopLoss);
          const tp1Delta = Math.abs(signal.takeProfit1 - signal.price);
          const tp2Delta = Math.abs(signal.takeProfit2 - signal.price);

          const stopLoss = isBuy ? entryPrice - riskDelta : entryPrice + riskDelta;
          const takeProfit1 = isBuy ? entryPrice + tp1Delta : entryPrice - tp1Delta;
          const takeProfit2 = isBuy ? entryPrice + tp2Delta : entryPrice - tp2Delta;

          const newPosition: PaperPosition = {
            id: `pos-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            symbol: signal.symbol,
            type: signal.type,
            strategy: signal.strategy,
            entryPrice,
            currentPrice: entryPrice,
            stopLoss: Number(stopLoss.toFixed(8)),
            takeProfit1: Number(takeProfit1.toFixed(8)),
            takeProfit2: Number(takeProfit2.toFixed(8)),
            amountUSDT,
            initialAmountUSDT: amountUSDT,
            pnlUSDT: 0,
            pnlPercent: 0,
            entryTime: Date.now(),
            orderType: 'MARKET',
            isTP1Hit: false,
          };

          return {
            walletBalance: state.walletBalance - amountUSDT,
            paperPositions: [newPosition, ...state.paperPositions],
          };
        }),

      executeMultiplePaperTrades: (signalsList, amountPerTrade, orderType = 'MARKET') =>
        set((state) => {
          let available = state.walletBalance;

          if (orderType === 'LIMIT') {
            const newLimitOrders: LimitOrder[] = [];
            for (const sig of signalsList) {
              if (available < amountPerTrade) break;
              available -= amountPerTrade;

              let sigLivePrice = sig.price;
              if (sig.symbol === state.currentSymbol && state.candles.length > 0) {
                sigLivePrice = state.candles[state.candles.length - 1].close;
              } else {
                const ticker = state.watchlist.find((w) => w.symbol === sig.symbol);
                if (ticker && ticker.lastPrice > 0) {
                  sigLivePrice = ticker.lastPrice;
                }
              }

              newLimitOrders.push({
                id: `limit-bulk-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
                symbol: sig.symbol,
                type: sig.type,
                strategy: sig.strategy,
                limitPrice: sig.price,
                currentPrice: sigLivePrice,
                stopLoss: sig.stopLoss,
                takeProfit1: sig.takeProfit1,
                takeProfit2: sig.takeProfit2,
                amountUSDT: amountPerTrade,
                createdAt: Date.now(),
                status: 'PENDING',
              });
            }

            return {
              walletBalance: available,
              limitOrders: [...newLimitOrders, ...state.limitOrders],
            };
          }

          const newPositions: PaperPosition[] = [];
          for (const sig of signalsList) {
            if (available < amountPerTrade) break;
            available -= amountPerTrade;

            let entryPrice = sig.price;
            if (sig.symbol === state.currentSymbol && state.candles.length > 0) {
              entryPrice = state.candles[state.candles.length - 1].close;
            } else {
              const ticker = state.watchlist.find((w) => w.symbol === sig.symbol);
              if (ticker && ticker.lastPrice > 0) {
                entryPrice = ticker.lastPrice;
              }
            }

            const isBuy = sig.type === 'BUY';
            const riskDelta = Math.abs(sig.price - sig.stopLoss);
            const tp1Delta = Math.abs(sig.takeProfit1 - sig.price);
            const tp2Delta = Math.abs(sig.takeProfit2 - sig.price);

            const stopLoss = isBuy ? entryPrice - riskDelta : entryPrice + riskDelta;
            const takeProfit1 = isBuy ? entryPrice + tp1Delta : entryPrice - tp1Delta;
            const takeProfit2 = isBuy ? entryPrice + tp2Delta : entryPrice - tp2Delta;

            newPositions.push({
              id: `pos-bulk-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
              symbol: sig.symbol,
              type: sig.type,
              strategy: sig.strategy,
              entryPrice,
              currentPrice: entryPrice,
              stopLoss: Number(stopLoss.toFixed(8)),
              takeProfit1: Number(takeProfit1.toFixed(8)),
              takeProfit2: Number(takeProfit2.toFixed(8)),
              amountUSDT: amountPerTrade,
              initialAmountUSDT: amountPerTrade,
              pnlUSDT: 0,
              pnlPercent: 0,
              entryTime: Date.now(),
              orderType: 'MARKET',
              isTP1Hit: false,
            });
          }

          return {
            walletBalance: available,
            paperPositions: [...newPositions, ...state.paperPositions],
          };
        }),

      cancelLimitOrder: (orderId) =>
        set((state) => {
          const order = state.limitOrders.find((o) => o.id === orderId);
          if (!order) return state;
          return {
            walletBalance: state.walletBalance + order.amountUSDT,
            limitOrders: state.limitOrders.filter((o) => o.id !== orderId),
          };
        }),

      closePaperPosition: (positionId, currentPrice, reason = 'MANUAL') =>
        set((state) => {
          const pos = state.paperPositions.find((p) => p.id === positionId);
          if (!pos) return state;

          const isBuy = pos.type === 'BUY';
          const rawMovePct = isBuy
            ? (currentPrice - pos.entryPrice) / pos.entryPrice
            : (pos.entryPrice - currentPrice) / pos.entryPrice;

          const pnlUSDT = Number((pos.amountUSDT * rawMovePct).toFixed(2));
          const pnlPercent = Number((rawMovePct * 100).toFixed(2));
          const returnedCapital = pos.amountUSDT + pnlUSDT;

          const closedTrade: ClosedTrade = {
            id: `closed-${pos.id}`,
            symbol: pos.symbol,
            type: pos.type,
            strategy: pos.strategy,
            entryPrice: pos.entryPrice,
            exitPrice: currentPrice,
            amountUSDT: pos.amountUSDT,
            pnlUSDT,
            pnlPercent,
            exitReason: reason,
            entryTime: pos.entryTime,
            exitTime: Date.now(),
          };

          sendClosedTradeAlert(state.telegramConfig, closedTrade).catch(() => {});

          return {
            walletBalance: state.walletBalance + returnedCapital,
            paperPositions: state.paperPositions.filter((p) => p.id !== positionId),
            closedTrades: [closedTrade, ...state.closedTrades],
          };
        }),

      closeAllPaperPositions: (reason = 'MANUAL') =>
        set((state) => {
          if (state.paperPositions.length === 0) return state;

          let returnedCapital = 0;
          const newClosedTrades: ClosedTrade[] = [];

          state.paperPositions.forEach((pos) => {
            const isBuy = pos.type === 'BUY';
            const rawMovePct = isBuy
              ? (pos.currentPrice - pos.entryPrice) / pos.entryPrice
              : (pos.entryPrice - pos.currentPrice) / pos.entryPrice;

            const pnlUSDT = Number((pos.amountUSDT * rawMovePct).toFixed(2));
            const pnlPercent = Number((rawMovePct * 100).toFixed(2));
            returnedCapital += pos.amountUSDT + pnlUSDT;

            newClosedTrades.push({
              id: `bulk-closed-${pos.id}-${Date.now()}`,
              symbol: pos.symbol,
              type: pos.type,
              strategy: pos.strategy,
              entryPrice: pos.entryPrice,
              exitPrice: pos.currentPrice,
              amountUSDT: pos.amountUSDT,
              pnlUSDT,
              pnlPercent,
              exitReason: reason,
              entryTime: pos.entryTime,
              exitTime: Date.now(),
            });
          });

          return {
            walletBalance: state.walletBalance + returnedCapital,
            paperPositions: [],
            closedTrades: [...newClosedTrades, ...state.closedTrades],
          };
        }),

      addClosedTrades: (trades) =>
        set((state) => {
          const totalNetPnl = trades.reduce((acc, t) => acc + t.pnlUSDT, 0);
          return {
            walletBalance: state.walletBalance + totalNetPnl,
            closedTrades: [...trades, ...state.closedTrades],
          };
        }),

      updatePositionsWithTickers: (priceMap) =>
        set((state) => {
          if (state.paperPositions.length === 0 && state.limitOrders.length === 0) {
            return state;
          }

          // 1. Process Pending Limit Orders for ANY symbol in priceMap
          const remainingLimitOrders: LimitOrder[] = [];
          const newlyFilledPositions: PaperPosition[] = [];

          state.limitOrders.forEach((order) => {
            if (order.status !== 'PENDING') {
              remainingLimitOrders.push(order);
              return;
            }

            const ticker = priceMap[order.symbol];
            if (!ticker) {
              remainingLimitOrders.push(order);
              return;
            }

            const isBuy = order.type === 'BUY';
            const price = ticker.price;
            const low = ticker.low ?? price;
            const high = ticker.high ?? price;

            const isFilled = isBuy ? low <= order.limitPrice : high >= order.limitPrice;

            if (isFilled) {
              newlyFilledPositions.push({
                id: `pos-filled-${order.id}-${Date.now()}`,
                symbol: order.symbol,
                type: order.type,
                strategy: order.strategy,
                entryPrice: order.limitPrice,
                currentPrice: price,
                stopLoss: order.stopLoss,
                takeProfit1: order.takeProfit1,
                takeProfit2: order.takeProfit2,
                amountUSDT: order.amountUSDT,
                initialAmountUSDT: order.amountUSDT,
                pnlUSDT: 0,
                pnlPercent: 0,
                entryTime: Date.now(),
                orderType: 'LIMIT',
                isTP1Hit: false,
              });
            } else {
              remainingLimitOrders.push({
                ...order,
                currentPrice: price,
              });
            }
          });

          // 2. Process Active Positions for ANY symbol in priceMap
          const allActivePositions = [...state.paperPositions, ...newlyFilledPositions];
          const remainingPositions: PaperPosition[] = [];
          const newClosedTrades: ClosedTrade[] = [];
          let returnedBalance = 0;

          allActivePositions.forEach((pos) => {
            const ticker = priceMap[pos.symbol];
            if (!ticker) {
              remainingPositions.push(pos);
              return;
            }

            const livePrice = ticker.price;
            const isBuy = pos.type === 'BUY';

            // Check Stop Loss
            const isSLHit = isBuy ? livePrice <= pos.stopLoss : livePrice >= pos.stopLoss;
            if (isSLHit) {
              const rawMovePct = isBuy
                ? (pos.stopLoss - pos.entryPrice) / pos.entryPrice
                : (pos.entryPrice - pos.stopLoss) / pos.entryPrice;

              const pnlUSDT = Number((pos.amountUSDT * rawMovePct).toFixed(4));
              const pnlPercent = Number((rawMovePct * 100).toFixed(2));
              returnedBalance += pos.amountUSDT + pnlUSDT;

              newClosedTrades.push({
                id: `live-closed-sl-${pos.id}-${Date.now()}`,
                symbol: pos.symbol,
                type: pos.type,
                strategy: pos.strategy,
                entryPrice: pos.entryPrice,
                exitPrice: pos.stopLoss,
                amountUSDT: pos.amountUSDT,
                pnlUSDT,
                pnlPercent,
                exitReason: 'SL',
                entryTime: pos.entryTime,
                exitTime: Date.now(),
              });
              return;
            }

            // Check Take Profit 2 (if TP1 was already hit)
            if (pos.isTP1Hit) {
              const isTP2Hit = isBuy ? livePrice >= pos.takeProfit2 : livePrice <= pos.takeProfit2;
              if (isTP2Hit) {
                const rawMovePct = isBuy
                  ? (pos.takeProfit2 - pos.entryPrice) / pos.entryPrice
                  : (pos.entryPrice - pos.takeProfit2) / pos.entryPrice;

                const pnlUSDT = Number((pos.amountUSDT * rawMovePct).toFixed(4));
                const pnlPercent = Number((rawMovePct * 100).toFixed(2));
                returnedBalance += pos.amountUSDT + pnlUSDT;

                newClosedTrades.push({
                  id: `live-closed-tp2-${pos.id}-${Date.now()}`,
                  symbol: pos.symbol,
                  type: pos.type,
                  strategy: pos.strategy,
                  entryPrice: pos.entryPrice,
                  exitPrice: pos.takeProfit2,
                  amountUSDT: pos.amountUSDT,
                  pnlUSDT,
                  pnlPercent,
                  exitReason: 'TP2',
                  entryTime: pos.entryTime,
                  exitTime: Date.now(),
                });
                return;
              }
            }

            // Check Take Profit 1 (Sell 50% partial + Move SL to Break-Even)
            const isTP1Hit = isBuy ? livePrice >= pos.takeProfit1 : livePrice <= pos.takeProfit1;
            if (isTP1Hit && !pos.isTP1Hit) {
              const closedPortionAmount = pos.amountUSDT * 0.5;
              const remainingPortionAmount = pos.amountUSDT * 0.5;

              const rawMovePct = isBuy
                ? (pos.takeProfit1 - pos.entryPrice) / pos.entryPrice
                : (pos.entryPrice - pos.takeProfit1) / pos.entryPrice;

              const pnlUSDT = Number((closedPortionAmount * rawMovePct).toFixed(4));
              const pnlPercent = Number((rawMovePct * 100).toFixed(2));
              returnedBalance += closedPortionAmount + pnlUSDT;

              newClosedTrades.push({
                id: `live-closed-tp1-${pos.id}-${Date.now()}`,
                symbol: pos.symbol,
                type: pos.type,
                strategy: pos.strategy,
                entryPrice: pos.entryPrice,
                exitPrice: pos.takeProfit1,
                amountUSDT: closedPortionAmount,
                pnlUSDT,
                pnlPercent,
                exitReason: 'TP1',
                entryTime: pos.entryTime,
                exitTime: Date.now(),
              });

              // Keep the other 50% open running to TP2, and move SL to Entry Price (Break-Even)
              const rawRemainingMovePct = isBuy
                ? (livePrice - pos.entryPrice) / pos.entryPrice
                : (pos.entryPrice - livePrice) / pos.entryPrice;

              remainingPositions.push({
                ...pos,
                amountUSDT: remainingPortionAmount,
                stopLoss: pos.entryPrice, // Break-Even!
                isTP1Hit: true,
                currentPrice: livePrice,
                pnlUSDT: Number((remainingPortionAmount * rawRemainingMovePct).toFixed(4)),
                pnlPercent: Number((rawRemainingMovePct * 100).toFixed(2)),
              });
              return;
            }

            // Position is still active and moving
            const rawMovePct = isBuy
              ? (livePrice - pos.entryPrice) / pos.entryPrice
              : (pos.entryPrice - livePrice) / pos.entryPrice;

            remainingPositions.push({
              ...pos,
              currentPrice: livePrice,
              pnlUSDT: Number((pos.amountUSDT * rawMovePct).toFixed(4)),
              pnlPercent: Number((rawMovePct * 100).toFixed(2)),
            });
          });

          if (newClosedTrades.length > 0) {
            newClosedTrades.forEach((trade) => {
              sendClosedTradeAlert(state.telegramConfig, trade).catch(() => {});
            });
          }

          return {
            walletBalance: state.walletBalance + returnedBalance,
            limitOrders: remainingLimitOrders,
            paperPositions: remainingPositions,
            closedTrades: [...newClosedTrades, ...state.closedTrades],
          };
        }),

      setWatchlist: (watchlist) => {
        // Build price map to update all positions immediately from fresh ticker data
        const priceMap: Record<string, { price: number; high: number; low: number }> = {};
        watchlist.forEach((w) => {
          priceMap[w.symbol] = {
            price: w.lastPrice,
            high: w.highPrice,
            low: w.lowPrice,
          };
        });

        const state = get();
        if (state.paperPositions.length > 0 || state.limitOrders.length > 0) {
          state.updatePositionsWithTickers(priceMap);
        }

        set({ watchlist });
      },
      setSignalsPanelOpen: (isSignalsPanelOpen) => set({ isSignalsPanelOpen }),
      setSearchModalOpen: (isSearchModalOpen) => set({ isSearchModalOpen }),
      setWatchlistOpen: (isWatchlistOpen) => set({ isWatchlistOpen }),
      setIndicatorModalOpen: (isIndicatorModalOpen) => set({ isIndicatorModalOpen }),
      setStrategyModalOpen: (isStrategyModalOpen) => set({ isStrategyModalOpen }),
      setAcademyModalOpen: (isAcademyModalOpen) => set({ isAcademyModalOpen }),
      setCalculatorModalOpen: (isCalculatorModalOpen) => set({ isCalculatorModalOpen }),
      setWalletModalOpen: (isWalletModalOpen) => set({ isWalletModalOpen }),
      updateTelegramConfig: (config) =>
        set((state) => ({
          telegramConfig: { ...state.telegramConfig, ...config },
        })),
      setTelegramModalOpen: (isTelegramModalOpen) => set({ isTelegramModalOpen }),
      setOnlyCurrentSignals: (onlyCurrentSignals) => set({ onlyCurrentSignals }),

      dismissSignal: (id) =>
        set((state) => ({
          dismissedSignalIds: Array.from(new Set([...state.dismissedSignalIds, id])),
          selectedSignal: state.selectedSignal?.id === id ? null : state.selectedSignal,
        })),

      dismissAllExpiredSignals: () =>
        set((state) => {
          const expiredIds = state.signals
            .filter((s) => s.status === 'SL_HIT' || s.status === 'TP2_HIT')
            .map((s) => s.id);
          return {
            dismissedSignalIds: Array.from(new Set([...state.dismissedSignalIds, ...expiredIds])),
            selectedSignal: null,
          };
        }),

      dismissAllSignalsForCurrentSymbol: () =>
        set((state) => {
          const allCurrentIds = state.signals.map((s) => s.id);
          return {
            dismissedSignalIds: Array.from(new Set([...state.dismissedSignalIds, ...allCurrentIds])),
            selectedSignal: null,
          };
        }),

      clearDismissedSignals: () => set({ dismissedSignalIds: [] }),
      clearClosedTrades: () => set({ closedTrades: [] }),

      setSignalFilterTab: (signalFilterTab) => set({ signalFilterTab }),
      setHidePastChartMarkers: (hidePastChartMarkers) => set({ hidePastChartMarkers }),

      // Bot Action Implementations
      toggleBot: () =>
        set((state) => {
          const nextActive = !state.isBotActive;
          const logEntry: BotLogEntry = {
            id: `bot-toggle-${Date.now()}`,
            timestamp: Date.now(),
            symbol: state.currentSymbol,
            action: nextActive ? 'MONITORING' : 'SYSTEM',
            reason: nextActive
              ? `🤖 Bot ACTIVADO en ${state.currentSymbol} (${state.currentTimeframe}). Analizando oportunidades cada 3s...`
              : '⏸️ Bot PAUSADO por el usuario.',
            score: 100,
          };
          return {
            isBotActive: nextActive,
            botConfig: { ...state.botConfig, isActive: nextActive },
            botLogs: [logEntry, ...state.botLogs].slice(0, 100),
          };
        }),

      setBotActive: (isBotActive) =>
        set((state) => ({
          isBotActive,
          botConfig: { ...state.botConfig, isActive: isBotActive },
        })),

      updateBotConfig: (config) =>
        set((state) => ({
          botConfig: { ...state.botConfig, ...config },
        })),

      addBotLog: (log) =>
        set((state) => ({
          botLogs: [
            {
              ...log,
              id: `bot-log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
              timestamp: Date.now(),
            },
            ...state.botLogs,
          ].slice(0, 100),
        })),

      clearBotLogs: () => set({ botLogs: [] }),

      setBotModalOpen: (isBotModalOpen) => set({ isBotModalOpen }),

      evaluateAndRunBotSignal: (signal) => {
        const state = get();
        if (!state.isBotActive) return;

        const currentCandle = state.candles[state.candles.length - 1];
        const currentLivePrice = currentCandle ? currentCandle.close : signal.price;

        const decision = evaluateOpportunityForBot(
          signal,
          currentLivePrice,
          state.paperPositions,
          state.botConfig
        );

        // Avoid spamming log if already logged in the last 60 seconds
        const recentLog = state.botLogs.find(
          (l) => l.signal?.id === signal.id && Date.now() - l.timestamp < 60000
        );
        if (recentLog) return;

        if (decision.approved) {
          state.executePaperTrade(signal, state.botConfig.capitalPerTrade, decision.orderType);

          const execLog: BotLogEntry = {
            id: `bot-exec-${Date.now()}`,
            timestamp: Date.now(),
            symbol: signal.symbol,
            action: 'EXECUTED' as BotLogAction,
            reason: `✅ ${signal.type} ejecutada a $${currentLivePrice} ($${state.botConfig.capitalPerTrade}). ${decision.reason}`,
            score: decision.score,
            signal,
            orderType: decision.orderType,
          };

          set((s) => ({
            botStats: {
              ...s.botStats,
              totalAnalyzed: s.botStats.totalAnalyzed + 1,
              totalExecuted: s.botStats.totalExecuted + 1,
            },
            botLogs: [execLog, ...s.botLogs].slice(0, 100),
          }));

          sendBotExecutionAlert(
            state.telegramConfig,
            signal,
            currentLivePrice,
            state.botConfig.capitalPerTrade,
            decision.orderType,
            decision.reason
          ).catch(() => {});

          // Transmisión a Hyperliquid DEX en vivo si está habilitado
          if (
            (state.botConfig.executeOnHyperliquid || state.hyperliquidAutoTrade) &&
            state.hyperliquidAgentKey
          ) {
            const cleanCoin = signal.symbol.replace(/(-PERP|USDT|\/USD)$/i, '');
            const sz = Number(((state.botConfig.capitalPerTrade * state.hyperliquidDefaultLeverage) / currentLivePrice).toFixed(4));
            if (sz > 0) {
              executeHyperliquidOrder({
                agentPrivateKey: state.hyperliquidAgentKey,
                coin: cleanCoin,
                isBuy: signal.type === 'BUY',
                sz,
                px: currentLivePrice,
                orderType: decision.orderType,
              })
                .then((hlRes) => {
                  if (hlRes.status === 'ok') {
                    get().addBotLog({
                      symbol: signal.symbol,
                      action: 'EXECUTED',
                      reason: `⚡ [HYPERLIQUID L1] ¡Orden enviada a DEX! ${signal.type} ${sz} ${cleanCoin}`,
                      score: decision.score,
                      signal,
                      orderType: decision.orderType,
                    });
                    get().refreshHyperliquidAccount();
                  } else {
                    get().addBotLog({
                      symbol: signal.symbol,
                      action: 'REJECTED',
                      reason: `⚠️ [HYPERLIQUID L1] Error al ejecutar: ${hlRes.error}`,
                      score: decision.score,
                      signal,
                      orderType: decision.orderType,
                    });
                  }
                })
                .catch((e) => {
                  console.error('Hyperliquid bot exec error:', e);
                });
            }
          }
        } else {
          const rejLog: BotLogEntry = {
            id: `bot-rej-${Date.now()}`,
            timestamp: Date.now(),
            symbol: signal.symbol,
            action: 'REJECTED' as BotLogAction,
            reason: `❌ ${signal.type} descartada: ${decision.reason}`,
            score: decision.score,
            signal,
          };

          set((s) => ({
            botStats: {
              ...s.botStats,
              totalAnalyzed: s.botStats.totalAnalyzed + 1,
              totalRejected: s.botStats.totalRejected + 1,
            },
            botLogs: [rejLog, ...s.botLogs].slice(0, 100),
          }));
        }
      },

      // Banco de Pruebas de $100k USD (10 Sub-Fondos a 0% Fee)
      processMicroTick: (price, volume = 1, timestamp = Date.now()) => {
        if (!price || isNaN(price) || price <= 0) return;
        const state = get();
        const fundsToProcess =
          state.subFunds && state.subFunds.length === 10
            ? state.subFunds
            : createInitialSubFunds();

        const result = processTickForSubFunds(
          price,
          volume,
          timestamp,
          fundsToProcess,
          globalTickRollingWindow,
          state.currentSymbol
        );

        set({
          subFunds: result.updatedFunds,
        });
      },

      resetSubFunds: () => {
        globalTickRollingWindow.clear();
        set({
          subFunds: createInitialSubFunds(),
        });
      },

      setBankTestModalOpen: (isBankTestModalOpen) => set({ isBankTestModalOpen }),
    }),
    {
      name: 'tradingview-signals-store',
      partialize: (state) => ({
        currentSymbol: state.currentSymbol,
        currentTimeframe: state.currentTimeframe,
        indicators: state.indicators,
        strategies: state.strategies,
        walletBalance: state.walletBalance,
        initialDeposit: state.initialDeposit,
        paperPositions: state.paperPositions,
        limitOrders: state.limitOrders,
        closedTrades: state.closedTrades,
        isSignalsPanelOpen: state.isSignalsPanelOpen,
        onlyCurrentSignals: state.onlyCurrentSignals,
        isBotActive: state.isBotActive,
        botConfig: state.botConfig,
        botStats: state.botStats,
        subFunds: state.subFunds,
        telegramConfig: state.telegramConfig,
        hyperliquidWallet: state.hyperliquidWallet,
        hyperliquidAgentKey: state.hyperliquidAgentKey,
        hyperliquidAutoTrade: state.hyperliquidAutoTrade,
        hyperliquidDefaultLeverage: state.hyperliquidDefaultLeverage,
      }),
    }
  )
);
