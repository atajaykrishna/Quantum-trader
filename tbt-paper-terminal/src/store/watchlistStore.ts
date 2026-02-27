import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// 交易对数据
export interface SymbolInfo {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  displayDecimals?: number; // preferred price precision for display
  bid?: string;
  ask?: string;
  price?: string;
  priceChange24h?: number;
  change24h?: string;
  volume24h?: string;
  sparkline?: number[]; // 24h price points for sparkline
}

export interface ColumnVisibility {
  bid: boolean;
  ask: boolean;
  spread: boolean;
  change: boolean;
}

// 默认交易对列表（CFD/Forex）
const DEFAULT_SYMBOLS: SymbolInfo[] = [
  // 贵金属 (Precious Metals)
  { symbol: 'XAUUSD', baseAsset: 'XAU', quoteAsset: 'USD', displayDecimals: 2 },    // 黄金 (Gold)
  { symbol: 'XAGUSD', baseAsset: 'XAG', quoteAsset: 'USD', displayDecimals: 3 },    // 白银 (Silver)
  { symbol: 'XPTUSD', baseAsset: 'XPT', quoteAsset: 'USD', displayDecimals: 2 },    // 铂金 (Platinum)
  { symbol: 'XPDUSD', baseAsset: 'XPD', quoteAsset: 'USD', displayDecimals: 2 },    // 钯金 (Palladium)
  
  // 能源 (Energies)
  { symbol: 'WTIUSD', baseAsset: 'WTI', quoteAsset: 'USD', displayDecimals: 2 },    // WTI原油 (WTI Crude Oil)
  { symbol: 'BRNUSD', baseAsset: 'BRN', quoteAsset: 'USD', displayDecimals: 2 },    // 布伦特油 (Brent Crude Oil)
  { symbol: 'NGUSD', baseAsset: 'NG', quoteAsset: 'USD', displayDecimals: 3 },      // 天然气 (Natural Gas)
  
  // 主要外汇 (Major Forex Pairs)
  { symbol: 'EURUSD', baseAsset: 'EUR', quoteAsset: 'USD', displayDecimals: 4 },    // 欧元/美元
  { symbol: 'GBPUSD', baseAsset: 'GBP', quoteAsset: 'USD', displayDecimals: 4 },    // 英镑/美元
  { symbol: 'USDJPY', baseAsset: 'USD', quoteAsset: 'JPY', displayDecimals: 3 },    // 美元/日元
  { symbol: 'AUDUSD', baseAsset: 'AUD', quoteAsset: 'USD', displayDecimals: 4 },    // 澳元/美元
  { symbol: 'NZDUSD', baseAsset: 'NZD', quoteAsset: 'USD', displayDecimals: 4 },    // 新西兰元/美元
  { symbol: 'USDCAD', baseAsset: 'USD', quoteAsset: 'CAD', displayDecimals: 4 },    // 美元/加元
  { symbol: 'USDCHF', baseAsset: 'USD', quoteAsset: 'CHF', displayDecimals: 4 },    // 美元/瑞郎
  
  // 交叉汇率 (Forex Crosses)
  { symbol: 'EURGBP', baseAsset: 'EUR', quoteAsset: 'GBP', displayDecimals: 4 },    // 欧元/英镑
  { symbol: 'EURJPY', baseAsset: 'EUR', quoteAsset: 'JPY', displayDecimals: 3 },    // 欧元/日元
  { symbol: 'GBPJPY', baseAsset: 'GBP', quoteAsset: 'JPY', displayDecimals: 3 },    // 英镑/日元
  { symbol: 'AUDJPY', baseAsset: 'AUD', quoteAsset: 'JPY', displayDecimals: 3 },    // 澳元/日元
  { symbol: 'NZDJPY', baseAsset: 'NZD', quoteAsset: 'JPY', displayDecimals: 3 },    // 新西兰元/日元
  
  // 股指 (Indices)
  { symbol: 'SPX500', baseAsset: 'SPX', quoteAsset: 'USD', displayDecimals: 2 },    // 标普500 (S&P 500)
  { symbol: 'NDX100', baseAsset: 'NDX', quoteAsset: 'USD', displayDecimals: 2 },    // 纳斯达克100 (NASDAQ 100)
  { symbol: 'FTSE100', baseAsset: 'FTSE', quoteAsset: 'USD', displayDecimals: 2 },  // 伦敦金融时报100 (FTSE 100)
  { symbol: 'DAX40', baseAsset: 'DAX', quoteAsset: 'USD', displayDecimals: 2 },     // 德国DAX40
  { symbol: 'CAC40', baseAsset: 'CAC', quoteAsset: 'USD', displayDecimals: 2 },     // 法国CAC40
  { symbol: 'AUS200', baseAsset: 'AUS', quoteAsset: 'USD', displayDecimals: 2 },    // 澳大利亚ASX 200
];

interface WatchlistState {
  // 交易对列表
  symbols: SymbolInfo[];
  
  // 收藏集合
  favorites: string[];
  
  // 置顶集合
  pinned: string[];
  
  // 当前选中的交易对
  selectedSymbol: string;
  
  // 搜索关键词
  searchQuery: string;
  
  // 是否只显示收藏
  showFavoritesOnly: boolean;

  // 列可见性
  columnVisibility: ColumnVisibility;
  
  // Actions
  setSelectedSymbol: (symbol: string) => void;
  setSearchQuery: (query: string) => void;
  setShowFavoritesOnly: (show: boolean) => void;
  setColumnVisibility: (column: keyof ColumnVisibility, visible: boolean) => void;
  toggleFavorite: (symbol: string) => void;
  togglePinned: (symbol: string) => void;
  addSymbol: (symbol: SymbolInfo) => void;
  removeSymbol: (symbol: string) => void;
  updateSymbolPrice: (symbol: string, price: string, priceChange24h?: number, bid?: string, ask?: string) => void;
  reorderSymbols: (fromIndex: number, toIndex: number) => void;
}

export const useWatchlistStore = create<WatchlistState>()(
  persist(
    (set, get) => ({
      symbols: DEFAULT_SYMBOLS,
      favorites: ['XAUUSD', 'EURUSD'],
      pinned: [],
      selectedSymbol: 'XAUUSD',
      searchQuery: '',
      showFavoritesOnly: false,
      columnVisibility: {
        bid: true,
        ask: false,
        spread: true,
        change: true,
      },

      setSelectedSymbol: (symbol) => set({ selectedSymbol: symbol }),
      
      setSearchQuery: (query) => set({ searchQuery: query }),
      
      setShowFavoritesOnly: (show) => set({ showFavoritesOnly: show }),

      setColumnVisibility: (column, visible) =>
        set((state) => ({
          columnVisibility: {
            ...state.columnVisibility,
            [column]: visible,
          },
        })),
      
      toggleFavorite: (symbol) => {
        const { favorites } = get();
        if (favorites.includes(symbol)) {
          set({ favorites: favorites.filter(s => s !== symbol) });
        } else {
          set({ favorites: [...favorites, symbol] });
        }
      },
      
      togglePinned: (symbol) => {
        const { pinned } = get();
        if (pinned.includes(symbol)) {
          set({ pinned: pinned.filter(s => s !== symbol) });
        } else {
          set({ pinned: [...pinned, symbol] });
        }
      },
      
      addSymbol: (symbolInfo) => {
        const { symbols } = get();
        if (!symbols.find(s => s.symbol === symbolInfo.symbol)) {
          set({ symbols: [...symbols, symbolInfo] });
        }
      },
      
      removeSymbol: (symbol) => {
        const { symbols, favorites, pinned, selectedSymbol } = get();
        set({
          symbols: symbols.filter(s => s.symbol !== symbol),
          favorites: favorites.filter(s => s !== symbol),
          pinned: pinned.filter(s => s !== symbol),
          selectedSymbol: selectedSymbol === symbol ? 'BTCUSDT' : selectedSymbol,
        });
      },
      
      updateSymbolPrice: (symbol, price, priceChange24h, bid, ask) => {
        const { symbols } = get();
        set({
          symbols: symbols.map(s => 
            s.symbol === symbol 
              ? { 
                  ...s, 
                  price, 
                  priceChange24h: priceChange24h ?? s.priceChange24h,
                  bid: bid ?? s.bid,
                  ask: ask ?? s.ask,
                }
              : s
          ),
        });
      },
      
      reorderSymbols: (fromIndex, toIndex) => {
        const { symbols } = get();
        const newSymbols = [...symbols];
        const [removed] = newSymbols.splice(fromIndex, 1);
        if (removed) {
          newSymbols.splice(toIndex, 0, removed);
          set({ symbols: newSymbols });
        }
      },
    }),
    {
      name: 'watchlist_state',
      version: 3,
      migrate: (persistedState: any, version: number) => {
        if (version < 3) {
          // Version 3: Reset to CFD/Forex symbols from crypto
          // Clear old crypto data and use new defaults
          return {
            symbols: DEFAULT_SYMBOLS,
            favorites: ['XAUUSD', 'EURUSD'],
            pinned: [],
            selectedSymbol: 'XAUUSD',
            searchQuery: '',
            showFavoritesOnly: false,
          };
        }
        return persistedState;
      },
      partialize: (state) => ({
        symbols: state.symbols,
        favorites: state.favorites,
        pinned: state.pinned,
        selectedSymbol: state.selectedSymbol,
        columnVisibility: state.columnVisibility,
      }),
    }
  )
);

// Selectors
export const selectSymbols = (state: WatchlistState) => state.symbols;
export const selectFavorites = (state: WatchlistState) => state.favorites;
export const selectPinned = (state: WatchlistState) => state.pinned;
export const selectSelectedSymbol = (state: WatchlistState) => state.selectedSymbol;
export const selectSearchQuery = (state: WatchlistState) => state.searchQuery;
export const selectShowFavoritesOnly = (state: WatchlistState) => state.showFavoritesOnly;

// 过滤后的交易对列表
export const selectFilteredSymbols = (state: WatchlistState) => {
  let filtered = state.symbols;
  
  // 搜索过滤
  if (state.searchQuery) {
    const query = state.searchQuery.toUpperCase();
    filtered = filtered.filter(s => 
      s.symbol.includes(query) ||
      s.baseAsset.includes(query) ||
      s.quoteAsset.includes(query)
    );
  }
  
  // 只显示收藏
  if (state.showFavoritesOnly) {
    filtered = filtered.filter(s => state.favorites.includes(s.symbol));
  }
  
  // 置顶排序
  return filtered.sort((a, b) => {
    const aIsPinned = state.pinned.includes(a.symbol);
    const bIsPinned = state.pinned.includes(b.symbol);
    if (aIsPinned && !bIsPinned) return -1;
    if (!aIsPinned && bIsPinned) return 1;
    return 0;
  });
};

