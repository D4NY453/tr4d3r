import type { UTCTimestamp } from 'lightweight-charts';

export type Timeframe = '1s' | '3s' | '5s' | '15s' | '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w';

export interface Candle {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorSettings {
  ema9: boolean;
  ema20: boolean;
  ema50: boolean;
  ema200: boolean;
  rsi: boolean;
  rsiPeriod: number;
  macd: boolean;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  bollinger: boolean;
  bollingerPeriod: number;
  bollingerStdDev: number;
  volume: boolean;
  supertrend: boolean;
  supertrendPeriod: number;
  supertrendMultiplier: number;
}

export type SignalType = 'BUY' | 'SELL';
export type SignalStatus = 'ACTIVE' | 'TP1_HIT' | 'TP2_HIT' | 'SL_HIT';
export type MacroTrend = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface TradingSignal {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  type: SignalType;
  time: UTCTimestamp;
  price: number;
  strategy: string;
  reason: string;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  riskReward: string;
  timestamp: number;
  status?: SignalStatus;
  isCurrent?: boolean;
  candlesAgo?: number;
  // Jerarquía Multitemporal (MTF)
  macroTimeframe?: Timeframe;
  macroTrend?: MacroTrend;
  macroConfirmed?: boolean;
  macroReason?: string;
}

export interface ActiveStrategyConfig {
  emaCross: boolean;
  rsiReversal: boolean;
  macdCrossover: boolean;
  superTrendStrategy: boolean;
  bollingerBreakout: boolean;
  bollingerSqueeze: boolean;
  bollingerPercentBDivergence: boolean;
}

export type AssetCategory = 'ALL' | 'CRYPTO' | 'METALS' | 'FOREX' | 'INDICES' | 'HYPERLIQUID';

export interface Ticker24h {
  symbol: string;
  lastPrice: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
  quoteVolume: number;
  category?: AssetCategory;
  displayName?: string;
  isRWA?: boolean;
  isHyperliquid?: boolean;
  coin?: string;
  fundingRate?: number;
  fundingRateAnnualized?: number;
  openInterest?: number;
  markPrice?: number;
  oraclePrice?: number;
  maxLeverage?: number;
}

export type TradeExitReason = 'TP1' | 'TP2' | 'SL' | 'MANUAL' | 'OPPOSITE_SIGNAL';

export interface PaperPosition {
  id: string;
  symbol: string;
  type: SignalType;
  strategy: string;
  entryPrice: number;
  currentPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  amountUSDT: number;
  initialAmountUSDT?: number;
  pnlUSDT: number;
  pnlPercent: number;
  entryTime: number;
  signalTime?: number;
  orderType?: 'MARKET' | 'LIMIT';
  isTP1Hit?: boolean;
  macroTrend?: MacroTrend;
  macroTimeframe?: Timeframe;
}

export interface LimitOrder {
  id: string;
  symbol: string;
  type: SignalType;
  strategy: string;
  limitPrice: number;
  currentPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  amountUSDT: number;
  createdAt: number;
  signalTime?: number;
  status: 'PENDING' | 'FILLED' | 'CANCELLED';
}

export interface ClosedTrade {
  id: string;
  symbol: string;
  type: SignalType;
  strategy: string;
  entryPrice: number;
  exitPrice: number;
  amountUSDT: number;
  pnlUSDT: number;
  pnlPercent: number;
  exitReason: TradeExitReason;
  entryTime: number;
  exitTime: number;
  signalTime?: number;
  durationCandles?: number;
}

export interface BacktestSummary {
  totalTrades: number;
  winTrades: number;
  lossTrades: number;
  winRate: number;
  totalPnlUSDT: number;
  totalPnlPercent: number;
  profitFactor: number;
  avgWinUSDT: number;
  avgLossUSDT: number;
}

export interface BotConfig {
  isActive: boolean;
  minRiskReward: number; // e.g. 1.5 for 1:1.5
  capitalPerTrade: number; // in USDT
  maxConcurrentTrades: number; // e.g. 3
  autoOrderType: 'MARKET' | 'LIMIT';
  scanIntervalSeconds: number; // e.g. 3
  cooldownMinutes: number; // avoid repeating same asset within X min
  minConfidenceScore: number; // 0 to 100
  enabledStrategies: string[];
  allowedSymbols?: string[];
  executeOnHyperliquid?: boolean;
  hyperliquidLeverage?: number;
  instantProfitTake?: boolean;
  minInstantProfitUSD?: number;
  longOnly?: boolean;
  tradeDirection?: 'BOTH' | 'LONG_ONLY' | 'SHORT_ONLY';
  requireMacroTrendConfirmation?: boolean;
}

export type BotLogAction = 'EXECUTED' | 'REJECTED' | 'EVALUATING' | 'MONITORING' | 'SYSTEM' | 'MTF_VETO';

export interface BotLogEntry {
  id: string;
  timestamp: number;
  symbol: string;
  action: BotLogAction;
  reason: string;
  score?: number;
  signal?: TradingSignal;
  orderType?: 'MARKET' | 'LIMIT';
  macroTimeframe?: Timeframe;
  macroTrend?: MacroTrend;
}

export interface BotStats {
  totalAnalyzed: number;
  totalExecuted: number;
  totalRejected: number;
  totalProfitUSDT: number;
  winRate: number;
}

export interface TelegramConfig {
  isEnabled: boolean;
  botToken: string;
  chatId: string;
  notifyNewSignals: boolean;
  notifyBotExecutions: boolean;
  notifyClosedTrades: boolean;
  minSignalScore: number;
}

export type MarketRegimeType = 'TRENDING' | 'RANGING' | 'TOXIC_CHOP';

export interface MarketRegimeInfo {
  regime: MarketRegimeType;
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
  reason: string;
}

export interface MicroCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SubFundStats {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  purePnL: number;
  makerNetPnL?: number; // Descontando 0.010% Hyperliquid Maker Post-Only
  takerNetPnL?: number; // Descontando 0.045% Hyperliquid Taker
  peakCapital: number;
  maxDrawdownPercent: number;
}

export interface SubFund {
  id: string;
  name: string;
  initialCapital: number;
  currentCapital: number;
  executionTimeframe: '1s' | '3s' | '5s';
  confirmTimeframe: '15s' | '1m' | '15s+1m';
  strategy: string;
  feeRate: number; // 0 for 0% fee
  activePosition: PaperPosition | null;
  closedTrades: ClosedTrade[];
  stats: SubFundStats;
  lastMacroTrend?: MacroTrend;
  lastMarketRegime?: MarketRegimeInfo;
}

export interface BankTestSummary {
  totalInitialCapital: number; // 100,000
  totalCurrentCapital: number;
  totalPurePnL: number;
  makerNetPnL?: number; // Simulación neta Maker Post-Only (0.010%)
  takerNetPnL?: number; // Simulación neta Taker (0.045%)
  totalTrades: number;
  totalWins: number;
  totalLosses: number;
  globalWinRate: number;
  feeRate: number; // 0
}

