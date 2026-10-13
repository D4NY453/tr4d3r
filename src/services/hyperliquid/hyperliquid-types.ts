export interface HyperliquidPerpMeta {
  name: string;
  szDecimals: number;
  maxLeverage: number;
  onlyIsolated?: boolean;
}

export interface HyperliquidAssetCtx {
  funding: string;
  openInterest: string;
  prevDayPx: string;
  dayNtlVlm: string;
  premium: string;
  oraclePx: string;
  markPx: string;
  midPx?: string;
  impactPxs?: [string, string];
  dayBaseVlm: string;
}

export interface HyperliquidMarketInfo {
  coin: string;
  symbol: string; // e.g. "BTC-PERP"
  displayName: string;
  szDecimals: number;
  maxLeverage: number;
  lastPrice: number;
  prevDayPrice: number;
  priceChangePercent: number;
  dayVolumeUSD: number;
  fundingRate: number; // 8-hour rate (e.g. 0.0001)
  fundingRateAnnualized: number; // in %
  openInterest: number;
  markPrice: number;
  oraclePrice: number;
}

export interface HyperliquidPosition {
  coin: string;
  szi: number; // size, positive for long, negative for short
  entryPx: number;
  positionValue: number;
  unrealizedPnl: number;
  returnOnEquity: number;
  liquidationPx: number | null;
  leverage: {
    type: 'cross' | 'isolated';
    value: number;
  };
  marginUsed: number;
  maxLeverage: number;
}

export interface HyperliquidMarginSummary {
  accountValue: number;
  totalNtlPos: number;
  totalRawUsd: number;
  totalMarginUsed: number;
}

export interface HyperliquidClearinghouseState {
  marginSummary: HyperliquidMarginSummary;
  crossMarginSummary: HyperliquidMarginSummary;
  crossMaintenanceMarginUsed: number;
  withdrawable: number;
  assetPositions: HyperliquidPosition[];
  time: number;
}

export interface HyperliquidOrderResult {
  status: 'ok' | 'err';
  response?: any;
  error?: string;
}

export interface HyperliquidUserFill {
  coin: string;
  px: string;
  sz: string;
  side: 'B' | 'A';
  time: number;
  startPosition?: string;
  dir: string;
  closedPnl: string;
  hash: string;
  oid: number;
  fee: string;
  builderFee?: string;
  tid?: number;
  feeToken?: string;
}

export interface HyperliquidClosedTrade {
  id: string;
  coin: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  dir: string;
  exitPrice: number;
  entryPrice?: number;
  size: number;
  notionalUSD: number;
  closedPnlUSD: number;
  pnlPercent?: number;
  feeUSD: number;
  time: number;
  hash: string;
  orderId: number;
  exitReason?: string;
  isWin: boolean;
  executionVenue: 'DITTO_NETWORK' | 'HYPERLIQUID';
  // Telemetría Técnica al Disparar (Fase 2)
  rsi14?: number;
  stochK?: number;
  stochD?: number;
  atr14?: number;
  emaTrend?: string;
  fundingRate?: number;
  spreadPct?: number;
  volume24hUSD?: number;
  // Jerarquía Multitemporal MTF
  macroTf?: string;
  macroTrend?: string;
}

