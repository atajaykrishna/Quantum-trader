# TBT Paper Terminal - Trade Page System Explanation

## Table of Contents
1. [System Overview](#system-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Data Flow](#data-flow)
4. [Components Breakdown](#components-breakdown)
5. [Key Files & Their Roles](#key-files--their-roles)
6. [Chart System Explanation](#chart-system-explanation)
7. [How to Customize for Your Needs](#how-to-customize-for-your-needs)
8. [Data Storage & Persistence](#data-storage--persistence)

---

## System Overview

The Trade Page is a **real-time cryptocurrency trading terminal** that uses a **Worker-First Architecture**. This design keeps the main UI thread responsive by offloading heavy computational and network operations to a Web Worker.

### Key Design Principles:
- **Decoupled Data & UI**: Market data processing happens in a Web Worker, not on the main thread
- **State Management**: Zustand stores manage application state (clean, reactive, and performant)
- **Real-Time Updates**: WebSocket connection to Binance for live market data
- **Simulation Engine**: Paper trading engine that matches orders locally
- **Data Confidence System**: Monitors connection health and data reliability

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     BROWSER MAIN THREAD                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              React UI Components                        │   │
│  │  ├─ TradePage (Main Layout)                             │   │
│  │  ├─ OrderEntry (Place Orders)                           │   │
│  │  ├─ OrderBook (Display Bids/Asks)                       │   │
│  │  ├─ PriceChart (Display Candlesticks)                   │   │
│  │  ├─ RecentTrades (Show Trades)                          │   │
│  │  ├─ Positions (Show Holdings)                           │   │
│  │  └─ RiskRibbon (Show Risk Metrics)                      │   │
│  └──────────────┬───────────────────────────────────────────┘   │
│                 │ (Reads/Writes)                                 │
│  ┌──────────────▼───────────────────────────────────────────┐   │
│  │           ZUSTAND STATE STORES                          │   │
│  │  ├─ marketStore (Market Data)                           │   │
│  │  ├─ tradingStore (Orders & Positions)                   │   │
│  │  ├─ walletStore (Balances)                              │   │
│  │  ├─ watchlistStore (Selected Symbol)                    │   │
│  │  └─ automationStore (Automation Rules)                  │   │
│  └──────────────┬───────────────────────────────────────────┘   │
│                 │ (postMessage)                                  │
└─────────────────┼──────────────────────────────────────────────┘
                  │
                  │ Web Worker Boundary
                  │
┌─────────────────▼──────────────────────────────────────────────┐
│               WEB WORKER THREAD                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │         marketDataWorker.ts (Main Worker)               │   │
│  │                                                          │   │
│  │  ┌────────────────────────────────────────────────────┐  │   │
│  │  │ 1. WebSocket Manager                              │  │   │
│  │  │    - Connect to Binance WS                        │  │   │
│  │  │    - Manage Reconnection Logic                    │  │   │
│  │  │    - Handle Connection Failures                  │  │   │
│  │  └────────────────────────────────────────────────────┘  │   │
│  │                      │                                   │   │
│  │  ┌────────────────────▼────────────────────────────────┐  │   │
│  │  │ 2. Message Handler                                │  │   │
│  │  │    - Parse Depth (OrderBook) Updates              │  │   │
│  │  │    - Parse Trade Events                           │  │   │
│  │  │    - Calculate Latency                            │  │   │
│  │  │    - Detect Gaps & Resync                         │  │   │
│  │  └────────────────────────────────────────────────────┘  │   │
│  │                      │                                   │   │
│  │  ┌────────────────────▼────────────────────────────────┐  │   │
│  │  │ 3. OrderBook Manager                               │  │   │
│  │  │    - Update Bids & Asks                            │  │   │
│  │  │    - Calculate Spread                              │  │   │
│  │  │    - Calculate Mid Price                           │  │   │
│  │  └────────────────────────────────────────────────────┘  │   │
│  │                      │                                   │   │
│  │  ┌────────────────────▼────────────────────────────────┐  │   │
│  │  │ 4. Metrics Calculator                              │  │   │
│  │  │    - Calculate Bid-Ask Spread                      │  │   │
│  │  │    - Update Price Metrics                          │  │   │
│  │  │    - Monitor Data Confidence                       │  │   │
│  │  │    - Track Network Health                          │  │   │
│  │  └────────────────────────────────────────────────────┘  │   │
│  │                      │                                   │   │
│  │  ┌────────────────────▼────────────────────────────────┐  │   │
│  │  │ 5. Message Queue & Batching                        │  │   │
│  │  │    - Buffer incoming updates                       │  │   │
│  │  │    - Batch & Throttle messages                     │  │   │
│  │  │    - Send to Main Thread at 60fps                 │  │   │
│  │  └────────────────────────────────────────────────────┘  │   │
│  │                      │                                   │   │
│  │  ┌────────────────────▼────────────────────────────────┐  │   │
│  │  │ 6. Outgoing Message Queue                          │  │   │
│  │  │    - ORDER_BOOK_UPDATE                             │  │   │
│  │  │    - TRADE_UPDATE                                  │  │   │
│  │  │    - CONNECTION_STATUS                             │  │   │
│  │  │    - LOG (Debugging)                               │  │   │
│  │  └────────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### 1. **Market Data Flow (Real-Time)**

```
Binance WebSocket
      ↓
[Market Data Worker]
      ↓
Parse Message:
  - Depth Update (Order Book)
  - Trade Update
  - Mini Ticker Update
      ↓
OrderBook Manager Updates
      ↓
Calculate Metrics:
  - Spread
  - Mid Price
  - Data Confidence
      ↓
Queue Message (Batched)
      ↓
Every ~16ms (60fps):
  Send ORDER_BOOK_UPDATE to Main Thread
      ↓
Market Store Receives Update
      ↓
React Components Re-render
      ↓
UI Shows Latest Data (Chart, OrderBook, Trades)
```

### 2. **Order Execution Flow**

```
User Clicks "Buy/Sell"
      ↓
OrderEntry Component Validates:
  - Balance Check
  - Price Validation
  - Data Confidence Check
      ↓
Call tradingStore.createOrder()
      ↓
Trading Store:
  - Creates Order Object
  - Freezes Balance in Wallet
  - Adds to Orders Array
      ↓
Market Data Available?
      ↓
YES → Order Matching Engine
  - Simulated Delay (50-200ms)
  - Match Against Order Book
  - Generate Fill Events
  - Update Position
  - Unfreeze Balance
      ↓
NO → Wait for Next OrderBook Update
  - Then Attempt Match
      ↓
UI Updates Show:
  - Order Status Changes
  - Position Updated
  - Balance Changed
  - P&L Calculated
```

### 3. **Chart Data Flow**

```
Selected Symbol Changes
      ↓
Subscribe to Symbol:
  (via marketStore.subscribe())
      ↓
Worker Fetches Historical Data
  (via REST API: /api/v3/klines)
      ↓
Generate Kline Data for Chart:
  - 1m, 5m, 15m, 1h, 4h, 1d intervals
      ↓
Real-Time Updates:
  - Each new trade updates current candle
  - Open, High, Low, Close, Volume
      ↓
Calculate Indicators:
  - Moving Average (MA)
  - Exponential MA (EMA)
  - Bollinger Bands (BOLL)
  - Volume Bars
      ↓
Lightweight Charts Library Renders
      ↓
User Sees Live Chart with Price Action
```

---

## Components Breakdown

### **TradePage.tsx** (Main Container)
**Location**: `src/pages/TradePage.tsx`

**Responsibilities**:
- Orchestrates the main trading interface layout
- Manages responsive grid layout (left sidebar, center, right panel)
- Passes data and callbacks to child components
- Handles keyboard shortcuts

**Key Props Used**:
```typescript
- selectedSymbol: string (from watchlistStore)
- orderBook: OrderBook (from marketStore)
- orders: PaperOrder[] (from tradingStore)
- balances: AccountBalance[] (from walletStore)
```

**Layout Structure**:
```
┌─────────────────────────────────────────────┐
│ Left Panel (15%)    │ Center (55%)│ Right (30%)│
├────────────────────┼───────────────┼────────────┤
│ Watchlist          │ Price Chart  │ Risk       │
│                    │ (64%)        │ Ribbon     │
│ Recent Trades      │──────────────┤            │
│                    │ Bottom Tabs  │ Order      │
│                    │ (36%)        │ Entry      │
│                    │ - Orders     │            │
│                    │ - Positions  │ OrderBook  │
│                    │ - Fills      │            │
└────────────────────┴───────────────┴────────────┘
```

---

### **OrderEntry.tsx** (Place Orders)
**Location**: `src/components/OrderEntry/OrderEntry.tsx`

**Responsibilities**:
- Form for entering trade parameters
- Validate inputs and balance
- Calculate total cost
- Support multiple order types:
  - Spot Orders (Market, Limit)
  - Conditional Orders (Stop-Limit, Take-Profit)
  - OCO Orders (One-Cancels-Other)
  - Trailing Stop Orders

**Order Types Supported**:
```typescript
'limit'              // Regular limit order
'market'             // Market order (fills at best ask/bid)
'stop_limit'         // Triggers at price, then limit order
'take_profit_limit'  // TP order
'trailing_stop'      // Follows price with offset
```

**Key Logic**:
```typescript
1. User selects: Side (Buy/Sell) → Type → Price → Quantity
2. Component calculates: Total = Price × Quantity
3. UI shows: Max quantity based on available balance
4. User confirms order
5. Validation checks:
   - Balance sufficient? ✓
   - Data confidence good? ✓
   - Price reasonable? ✓
6. Call tradingStore.createOrder()
```

---

### **OrderBook.tsx** (Market Depth)
**Location**: `src/components/OrderBook/OrderBook.tsx`

**Responsibilities**:
- Display bid and ask levels
- Show order book depth with visual bars
- Allow click-to-fill price
- Calculate and display spread

**Data Structure**:
```typescript
interface OrderBook {
  symbol: string;
  bids: [
    { price: "40000.00", quantity: "0.5" },
    { price: "39999.50", quantity: "1.2" },
    // ... up to 20 levels
  ];
  asks: [
    { price: "40000.50", quantity: "0.8" },
    { price: "40001.00", quantity: "2.1" },
    // ... up to 20 levels
  ];
  timestamp: number;
}
```

**Visual Features**:
- Depth bars show size of each level
- Price colors: Green (bids/buy), Red (asks/sell)
- Flash animation when price changes
- Spread displayed in center

---

### **PriceChart.tsx** (Chart Display)
**Location**: `src/components/Chart/PriceChart.tsx`

**Responsibilities**:
- Display candlestick chart
- Show moving averages
- Show volume bars
- Allow time range selection (1m to 1d)
- Allow indicator selection (MA, EMA, BOLL, VOL)

**Chart Library**: `lightweight-charts` (TradingView-compatible)

**Supported Timeframes**:
```typescript
'1m'  → 1-minute candles
'5m'  → 5-minute candles
'15m' → 15-minute candles
'1h'  → 1-hour candles
'4h'  → 4-hour candles
'1d'  → Daily candles
```

**How Chart Updates**:
1. User selects timeframe
2. Worker fetches historical klines from Binance REST API
3. Chart renders historical data
4. New trades update current candle (OHLCV)
5. Indicators recalculate in real-time

---

### **MetricsPanel.tsx** (Price Info)
**Location**: `src/components/MetricsPanel/MetricsPanel.tsx`

**Shows**:
- Bid Price
- Ask Price
- Mid Price
- Bid-Ask Spread
- Spread in basis points (bps)
- 24h High/Low
- 24h Volume

---

### **RecentTrades.tsx** (Trade History)
**Location**: `src/components/RecentTrades/RecentTrades.tsx`

**Shows**:
- Last 50 trades from Binance
- Price per trade
- Quantity per trade
- Buyer/Seller indicator
- Time of trade

**Data Source**: 
- Binance WebSocket `@trade` stream

---

## Key Files & Their Roles

### **Worker Thread** (`src/worker/`)

#### **marketDataWorker.ts** (Core Data Engine)
```
Responsibilities:
├─ Connect to Binance WebSocket
├─ Subscribe/Unsubscribe from symbols
├─ Parse depth (order book) updates
├─ Parse trade events
├─ Calculate latency
├─ Detect network issues
├─ Batch & throttle messages
├─ Send updates to main thread
└─ Handle reconnection logic

Message Flow IN:
  SUBSCRIBE → { symbol: "BTCUSDT" }
  UNSUBSCRIBE → {}

Message Flow OUT:
  ORDER_BOOK_UPDATE → { orderBook }
  TRADE_UPDATE → { trades: [...] }
  CONNECTION_STATUS → { state, latency, ... }
  LOG → { level, category, event, data }

Key Constants:
  HEARTBEAT_INTERVAL_MS = 15s
  STALE_RECONNECT_THRESHOLD_MS = 15s
  MAX_RECONNECTS_PER_MINUTE = 5
  MESSAGE_RATE_WINDOW_MS = 1s
```

#### **orderbook.ts** (OrderBook Manager)
```
Responsibilities:
├─ Maintain bids and asks
├─ Apply depth updates
├─ Calculate spread
├─ Calculate mid price
└─ Detect and warn of gaps

Key Methods:
  applyDepthUpdate(bids, asks)
  getSpread()
  getMidPrice()
  detectGaps(lastSequence, newSequence)
```

---

### **Stores** (`src/store/`)

#### **marketStore.ts** (Market Data State)
```typescript
export interface MarketState {
  // Connection Info
  connectionStatus: {
    state: 'connected' | 'disconnected' | 'reconnecting'
    latencyMs: number
    messageRate: number
  }
  
  // Data Reliability
  dataConfidence: {
    level: 'live' | 'degraded' | 'resyncing' | 'stale'
    reason: string
    canTrade: boolean
    canTrustMetrics: boolean
  }
  
  // Market Data
  orderBook: OrderBook | null       // Current bids/asks
  metrics: DerivedMetrics | null    // Calculated metrics
  recentTrades: Trade[]             // Last 50 trades
  
  // Actions
  subscribe(symbol): void
  unsubscribe(): void
  clearLogs(): void
}
```

#### **tradingStore.ts** (Order & Position Management)
```typescript
export interface TradingState {
  // Data
  orders: PaperOrder[]
  positions: Map<symbol, Position>
  focusMode: boolean
  
  // Order Operations
  createOrder(params, currentMarketPrice?): PaperOrder | null
  cancelOrder(clientOrderId): boolean
  
  // Advanced Orders
  createStopLimitOrder(params): PaperOrder | null
  createOCOOrder(params): OCOOrder | null
  createTrailingStopOrder(params): PaperOrder | null
  
  // Order Book Matching
  updateOrderBookForMatching(orderBook): void
  checkConditionalOrders(symbol, currentPrice, prevPrice): void
  updateTrailingStops(symbol, currentPrice): void
  
  // Position Management
  checkTPSL(symbol, midPrice): void
  updatePositionTPSL(symbol, tp?, sl?): void
  
  // Utilities
  getOrder(clientOrderId): PaperOrder | undefined
  getOpenOrders(): PaperOrder[]
  getOrderHistory(): PaperOrder[]
  resetAccount(): void
}
```

#### **walletStore.ts** (Balance Management)
```typescript
export interface WalletState {
  // Balances
  balances: AccountBalance[]
  
  // Operations
  getBalance(asset): AccountBalance | undefined
  setBalance(asset, total, free, locked): void
  freezeBalance(asset, amount, orderId, type): boolean
  unfreezeBalance(asset, amount, orderId, type): void
  executeDeposit(asset, amount): boolean
  resetWallet(): void
}
```

#### **watchlistStore.ts** (Symbol Selection)
```typescript
export interface WatchlistState {
  // Data
  watchlist: SymbolInfo[]
  selectedSymbol: string
  favorites: string[]
  
  // Operations
  setSelectedSymbol(symbol): void
  addSymbol(symbol): void
  removeSymbol(symbol): void
  toggleFavorite(symbol): void
  reorderWatchlist(symbols): void
}
```

---

## Chart System Explanation

### **How the Chart Works**

1. **Historical Data Loading**
   - When symbol changes, chart loads 500+ historical candles
   - Source: Binance REST API `/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=500`
   - Formats: 1m, 5m, 15m, 1h, 4h, 1d

2. **Real-Time Updates**
   - New trades from WebSocket update current candle
   - Current candle OHLCV (Open, High, Low, Close, Volume) updates
   - Previous candles never change (immutable)

3. **Kline Structure**
   ```typescript
   interface KlineData {
     time: UTCTimestamp      // Candle open time
     open: number            // Opening price
     high: number            // Highest price in period
     low: number             // Lowest price in period
     close: number           // Closing price
     volume: number          // Total volume
   }
   ```

4. **Indicator Calculations**

   **Simple Moving Average (SMA)**
   - Formula: SUM(close[n-period:n]) / period
   - Example: MA7 = Average of last 7 closes
   - Color: Yellow (#F0B90B)

   **Exponential Moving Average (EMA)**
   - Weights recent prices more heavily
   - Multiplier = 2 / (period + 1)
   - More responsive than SMA
   - Colors: EMA12 (Cyan), EMA26 (Pink)

   **Bollinger Bands (BOLL)**
   - Upper Band = MA20 + (2 × StdDev)
   - Middle Band = MA20
   - Lower Band = MA20 - (2 × StdDev)
   - Shows volatility: wider bands = more volatility
   - Colors: Upper (Red), Middle (Cyan), Lower (Blue)

   **Volume**
   - Shows trade volume per candle
   - Colors: Green (up candles), Red (down candles)
   - Heights represent quantity traded

### **Customizing Chart Data**

#### **Option 1: Modify Historical Data Fetch**

Current code in `PriceChart.tsx`:
```typescript
// Fetch klines from Binance
const response = await fetch(
  `/binance-api/api/v3/klines?symbol=${symbol}&interval=1m&limit=500`
);
```

To use **custom prices**:
```typescript
// Load from your database instead
const response = await fetch('/api/custom-klines', {
  method: 'POST',
  body: JSON.stringify({
    symbol: symbol,
    interval: '1m',
    limit: 500,
    startTime: startTime,
    endTime: endTime
  })
});

// Your backend returns:
[
  {
    "time": 1609459200000,
    "open": "40000.50",
    "high": "40500.00",
    "low": "39500.00", 
    "close": "40250.00",
    "volume": "150.5"
  }
  // ... more candles
]
```

#### **Option 2: Modify Real-Time Updates**

Current code calculates candles from trades:
```typescript
// In marketDataWorker.ts
// Each trade updates the current candle
currentKline.high = Math.max(currentKline.high, tradePrice)
currentKline.low = Math.min(currentKline.low, tradePrice)
currentKline.close = tradePrice
currentKline.volume += tradeQuantity
```

To use **custom prices**:
```typescript
// In tradingStore.ts or a custom price feed handler
const updatePriceChart = (customPrice: string) => {
  const marketStore = useMarketStore.getState()
  
  // Manually update the chart with custom price
  marketStore.updateMetrics({
    mid: customPrice,
    bid: String(parseFloat(customPrice) - 0.01),
    ask: String(parseFloat(customPrice) + 0.01)
  })
  
  // This triggers chart re-render with new price
}
```

#### **Option 3: Inject Custom Data Source**

Create a new store for custom prices:
```typescript
// src/store/customPriceStore.ts
import { create } from 'zustand'

export const useCustomPriceStore = create((set) => ({
  priceHistory: [] as CustomPrice[],
  
  addCustomPrice: (price: string, timestamp: number) => {
    set((state) => ({
      priceHistory: [...state.priceHistory, { price, timestamp }]
    }))
  },
  
  getKlinesFromCustom: (interval: '1m' | '5m' | '15m') => {
    // Group prices by interval
    // Return formatted klines
  }
}))
```

Then in `PriceChart.tsx`:
```typescript
const customPrices = useCustomPriceStore((state) => state.priceHistory)

useEffect(() => {
  if (customPrices.length > 0) {
    const klines = useCustomPriceStore.getState().getKlinesFromCustom('1m')
    // Update chart with custom klines
  }
}, [customPrices])
```

---

## How to Customize for Your Needs

### **Scenario 1: Use Custom Price Source Instead of Binance**

**Files to Modify**:
1. `src/worker/marketDataWorker.ts`
2. `src/store/marketStore.ts`
3. `src/components/Chart/PriceChart.tsx`

**Steps**:

Step 1: Create a custom data service
```typescript
// src/services/customDataService.ts
export async function subscribeToCustomPrices(symbol: string) {
  // Connect to your data source (WebSocket, API, etc)
  const ws = new WebSocket('wss://your-api.com/prices')
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data)
    // Format: { symbol, price, bid, ask, timestamp }
    return {
      symbol: data.symbol,
      bid: data.bid,
      ask: data.ask,
      mid: data.price,
      timestamp: data.timestamp
    }
  }
}

export async function fetchCustomKlines(symbol: string, interval: string) {
  // Fetch historical data
  const response = await fetch(
    `https://your-api.com/klines?symbol=${symbol}&interval=${interval}`
  )
  return response.json()
}
```

Step 2: Update market worker to use custom data
```typescript
// In marketDataWorker.ts, replace Binance connection with:
import { subscribeToCustomPrices, fetchCustomKlines } from '../services/customDataService'

async function connect(symbol: string) {
  // Replace Binance WebSocket with custom
  const customStream = await subscribeToCustomPrices(symbol)
  
  customStream.onUpdate = (data) => {
    // Send to main thread same way as Binance
    sendMessage('ORDER_BOOK_UPDATE', {
      symbol: data.symbol,
      bids: [[data.bid, '1']],
      asks: [[data.ask, '1']],
      timestamp: data.timestamp
    })
  }
}
```

Step 3: Update chart to use custom klines
```typescript
// In PriceChart.tsx
const loadHistoricalData = async () => {
  const klines = await fetchCustomKlines(symbol, INTERVAL_MAP[timeRange])
  setChartData(klines)
}
```

### **Scenario 2: Add Support for Previous Custom Prices**

**Goal**: Keep history of custom prices for backtesting or comparison

**Implementation**:

Step 1: Create price history store
```typescript
// src/store/priceHistoryStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface PriceSnapshot {
  symbol: string
  price: string
  bid: string
  ask: string
  timestamp: number
  source: 'binance' | 'custom'
}

export const usePriceHistoryStore = create<PriceHistoryState>()(
  persist(
    (set) => ({
      history: [] as PriceSnapshot[],
      
      recordPrice: (snapshot: PriceSnapshot) => {
        set((state) => ({
          history: [...state.history, snapshot].slice(-10000) // Keep last 10k
        }))
      },
      
      getPriceHistory: (symbol: string, timeRange: number) => {
        return get().history.filter(p => 
          p.symbol === symbol && 
          p.timestamp >= Date.now() - timeRange
        )
      },
      
      generateKlinesFromHistory: (symbol: string, interval: number) => {
        const history = get().getPriceHistory(symbol, 86400000) // 24h
        const klines = []
        let current = null
        
        for (const price of history) {
          const candle = Math.floor(price.timestamp / interval) * interval
          
          if (!current || current.time !== candle) {
            if (current) klines.push(current)
            current = {
              time: candle,
              open: parseFloat(price.price),
              high: parseFloat(price.price),
              low: parseFloat(price.price),
              close: parseFloat(price.price),
              volume: 0
            }
          } else {
            current.high = Math.max(current.high, parseFloat(price.price))
            current.low = Math.min(current.low, parseFloat(price.price))
            current.close = parseFloat(price.price)
          }
        }
        
        return klines
      },
      
      clearHistory: () => set({ history: [] })
    }),
    {
      name: 'price-history-storage',
      version: 1
    }
  )
)
```

Step 2: Record prices as they come in
```typescript
// In marketDataWorker.ts or custom data service
import { usePriceHistoryStore } from '../store/priceHistoryStore'

// When price updates
const priceStore = usePriceHistoryStore.getState()
priceStore.recordPrice({
  symbol: symbol,
  price: midPrice,
  bid: bestBid,
  ask: bestAsk,
  timestamp: Date.now(),
  source: 'binance' // or 'custom'
})
```

Step 3: Use historical prices in chart
```typescript
// In PriceChart.tsx
const priceHistory = usePriceHistoryStore(state => state.history)

useEffect(() => {
  // Option 1: Use historical data for selected interval
  const klines = usePriceHistoryStore.getState()
    .generateKlinesFromHistory(symbol, getIntervalMs(timeRange))
  
  if (klines.length > 0) {
    setChartData(klines)
  }
}, [symbol, timeRange])
```

### **Scenario 3: Switch Between Binance and Custom Data**

Create a data source selector:

```typescript
// src/store/dataSourceStore.ts
export type DataSource = 'binance' | 'custom'

export const useDataSourceStore = create((set) => ({
  currentSource: 'binance' as DataSource,
  
  switchSource: (source: DataSource) => {
    set({ currentSource: source })
    
    // Trigger reconnection with new source
    const marketStore = useMarketStore.getState()
    marketStore.unsubscribe()
    setTimeout(() => {
      marketStore.subscribe(watchlistStore.getState().selectedSymbol)
    }, 500)
  }
}))
```

Then in `marketDataWorker.ts`:
```typescript
// Before connecting, check which source to use
const source = useDataSourceStore.getState().currentSource

if (source === 'binance') {
  connectToBinance(symbol)
} else {
  connectToCustom(symbol)
}
```

---

## Data Storage & Persistence

### **What's Stored**

1. **Orders & Positions** (localStorage)
   ```
   Key: 'paper-trading-storage'
   Stores: orders[], ocoOrders[], positions
   Persists across browser refresh
   ```

2. **Wallet Balances** (localStorage)
   ```
   Key: 'wallet-storage'
   Stores: balances, totalValue
   Persists across browser refresh
   ```

3. **Watchlist** (localStorage)
   ```
   Key: 'watchlist-storage'
   Stores: favorites, addedSymbols
   Persists across browser refresh
   ```

4. **Settings** (localStorage)
   ```
   Key: 'settings-storage'
   Stores: theme, language, notifications
   Persists across browser refresh
   ```

### **Storage Locations in Code**

```typescript
// tradingStore.ts - Line ~120
const customStorage = {
  getItem: (name: string) => localStorage.getItem(name),
  setItem: (name: string, value) => localStorage.setItem(name, JSON.stringify(value)),
  removeItem: (name: string) => localStorage.removeItem(name)
}

// Usage with Zustand persist middleware
persist(
  (set, get) => ({ /* state */ }),
  {
    name: 'paper-trading-storage',
    version: 4,
    storage: customStorage
  }
)
```

### **To Add Custom Price Storage**

```typescript
// In customPriceStore.ts
export const useCustomPriceStore = create<CustomPriceState>()(
  persist(
    (set, get) => ({
      priceHistory: [] as CustomPrice[],
      recordPrice: (price: CustomPrice) => {
        set(state => ({
          priceHistory: [...state.priceHistory, price].slice(-100000)
        }))
      }
    }),
    {
      name: 'custom-price-storage',
      version: 1
    }
  )
)
```

---

## Quick Reference: Key Data Structures

### **Order Object**
```typescript
{
  clientOrderId: "uuid-1234",           // Unique ID
  symbol: "BTCUSDT",
  side: "buy" | "sell",
  type: "limit" | "market" | "stop_limit",
  price: "40000.50",                    // For limit orders
  quantity: "0.5",                      // Order size
  filledQty: "0.25",                    // Already filled
  avgPrice: "40100.00",                 // Average fill price
  status: "pending" | "open" | "filled",
  createdAt: 1609459200000,
  updatedAt: 1609459300000,
  fills: [
    { fillId: "fill-1", price: "40100", quantity: "0.25", time: 1609459300000 }
  ]
}
```

### **Position Object**
```typescript
{
  symbol: "BTCUSDT",
  side: "long",                         // Only 'long' or 'flat' (no short)
  quantity: "0.5",                      // How much BTC you own
  avgEntryPrice: "40000.00",           // Average price paid
  unrealizedPnl: "500.00",             // Current P&L (unrealized)
  realizedPnl: "200.00",               // P&L from closed positions
  updatedAt: 1609459300000,
  takeProfitPrice: "41000.00",         // Optional TP price
  stopLossPrice: "39000.00"            // Optional SL price
}
```

### **OrderBook Object**
```typescript
{
  symbol: "BTCUSDT",
  timestamp: 1609459300000,
  bids: [
    { price: "40000.00", quantity: "1.5" },  // People wanting to buy
    { price: "39999.50", quantity: "2.0" },
    // ... up to 20 levels
  ],
  asks: [
    { price: "40000.50", quantity: "1.2" },  // People wanting to sell
    { price: "40001.00", quantity: "3.0" },
    // ... up to 20 levels
  ]
}
```

---

## Summary

The Trade Page is a sophisticated system combining:
- **Real-time data processing** (Web Worker)
- **Order simulation** (Paper trading engine)
- **Responsive UI** (React components)
- **State management** (Zustand stores)
- **Data persistence** (localStorage)

To customize for your needs:
1. **Replace data source**: Update `marketDataWorker.ts` to connect to your API
2. **Use custom prices**: Create a custom price store and feed it data
3. **Store price history**: Use localStorage or a backend database
4. **Modify chart**: Update chart component to use your kline data

All code is modular and can be extended without affecting other parts of the system.

