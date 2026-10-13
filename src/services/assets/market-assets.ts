export type AssetCategory = 'ALL' | 'CRYPTO' | 'METALS' | 'FOREX' | 'INDICES';

export interface AssetMetadata {
  symbol: string;          // Símbolo de motor (ej. PAXGUSDT o EURUSDT)
  canonicalSymbol: string; // Símbolo estándar de mercado (ej. XAU/USD o EUR/USD)
  displayName: string;     // Nombre descriptivo (ej. XAU/USD · Oro Físico)
  category: AssetCategory;
  baseAsset: string;
  quoteAsset: string;
  precision: number;
  pythFeedId?: string;
  isRWA?: boolean;
}

export const UPSCALE_RWA_ASSETS: AssetMetadata[] = [
  // 1. METALES / COMMODITIES (Oro, Plata, Petróleo)
  {
    symbol: 'PAXGUSDT',
    canonicalSymbol: 'XAU/USD',
    displayName: 'XAU/USD · Oro Físico',
    category: 'METALS',
    baseAsset: 'XAU',
    quoteAsset: 'USD',
    precision: 2,
    pythFeedId: '765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2',
    isRWA: true,
  },
  {
    symbol: 'XAGUSDT',
    canonicalSymbol: 'XAG/USD',
    displayName: 'XAG/USD · Plata (Silver)',
    category: 'METALS',
    baseAsset: 'XAG',
    quoteAsset: 'USD',
    precision: 3,
    pythFeedId: 'f2fb02c32e2316447571228ba40402fe66ba9f2d525975216654939763765757',
    isRWA: true,
  },
  {
    symbol: 'WTIUSDT',
    canonicalSymbol: 'WTI/USD',
    displayName: 'WTI/USD · Petróleo Crudo',
    category: 'METALS',
    baseAsset: 'WTI',
    quoteAsset: 'USD',
    precision: 2,
    pythFeedId: '2b4c102505500e2609074df0a3952f40bfa0f7572ce346fdf4fc07d10e0aa647',
    isRWA: true,
  },

  // 2. FOREX (Divisas mayores)
  {
    symbol: 'EURUSDT',
    canonicalSymbol: 'EUR/USD',
    displayName: 'EUR/USD · Euro',
    category: 'FOREX',
    baseAsset: 'EUR',
    quoteAsset: 'USD',
    precision: 4,
    pythFeedId: 'a995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09550b0c6604284b26',
    isRWA: true,
  },
  {
    symbol: 'GBPUSDT',
    canonicalSymbol: 'GBP/USD',
    displayName: 'GBP/USD · Libra Esterlina',
    category: 'FOREX',
    baseAsset: 'GBP',
    quoteAsset: 'USD',
    precision: 4,
    pythFeedId: '84c2dde9633d93d1bcad84e7dc41c9d56578b7ec52fabedc1f335d673df0a7c1',
    isRWA: true,
  },
  {
    symbol: 'AUDUSDT',
    canonicalSymbol: 'AUD/USD',
    displayName: 'AUD/USD · Dólar Australiano',
    category: 'FOREX',
    baseAsset: 'AUD',
    quoteAsset: 'USD',
    precision: 4,
    pythFeedId: '67a6f930304dd1a6db8ca7ff5aec2ab5451c89db788ef6b9432655075f05b084',
    isRWA: true,
  },

  // 3. ÍNDICES
  {
    symbol: 'US100USDT',
    canonicalSymbol: 'US100',
    displayName: 'US100 · Nasdaq 100 Index',
    category: 'INDICES',
    baseAsset: 'US100',
    quoteAsset: 'USD',
    precision: 2,
    isRWA: true,
  },
  {
    symbol: 'US500USDT',
    canonicalSymbol: 'US500',
    displayName: 'US500 · S&P 500 Index',
    category: 'INDICES',
    baseAsset: 'US500',
    quoteAsset: 'USD',
    precision: 2,
    isRWA: true,
  },
  {
    symbol: 'US30USDT',
    canonicalSymbol: 'US30',
    displayName: 'US30 · Dow Jones 30 Index',
    category: 'INDICES',
    baseAsset: 'US30',
    quoteAsset: 'USD',
    precision: 2,
    isRWA: true,
  },
];

export const ASSET_MAP: Record<string, AssetMetadata> = {};
UPSCALE_RWA_ASSETS.forEach((a) => {
  ASSET_MAP[a.symbol] = a;
  ASSET_MAP[a.canonicalSymbol.replace('/', '')] = a;
  if (a.symbol === 'PAXGUSDT') {
    ASSET_MAP['XAUUSDT'] = a;
  }
});

export function getAssetMetadata(symbol: string): AssetMetadata | null {
  const norm = symbol.toUpperCase().replace(/[-_/]/g, '');
  return ASSET_MAP[norm] || null;
}

export function getAssetDisplayName(symbol: string): string {
  const meta = getAssetMetadata(symbol);
  return meta ? meta.displayName : symbol;
}

export function getAssetCategory(symbol: string): AssetCategory {
  const meta = getAssetMetadata(symbol);
  return meta ? meta.category : 'CRYPTO';
}
