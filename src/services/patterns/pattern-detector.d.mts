export type PatternFamily = 'classic' | 'triangle' | 'flag';
export interface PatternParams { k?: number; tolAtr?: number; volMult?: number; lookahead?: number; emaFilter?: boolean; families?: PatternFamily[]; /** evalúa también la última vela (uso en vivo) */ live?: boolean }
export interface PatternSignal { pattern: string; side: 'LONG' | 'SHORT'; breakIdx: number; entry: number; level: number; stop: number; target: number }
export interface OHLCV { o?: number[]; h: number[]; l: number[]; c: number[]; v: number[] }
export const DEFAULT_PATTERN_PARAMS: Readonly<Record<'5m' | '15m' | '1h', Required<Omit<PatternParams, 'live'>>>>;
export function detectPatterns(d: OHLCV, params?: PatternParams): PatternSignal[];
export function atr(h: number[], l: number[], c: number[], n?: number): number[];
export function ema(x: number[], n: number): number[];
export function zigzag(h: number[], l: number[], c: number[], a: number[], k: number): [number, number, 'H' | 'L', number][];
