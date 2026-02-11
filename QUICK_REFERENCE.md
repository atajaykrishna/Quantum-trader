# Quick Reference Guide - Trade Page System

## 🎯 What You Need to Know in 5 Minutes

### **The Big Picture**
- **Web Worker** processes market data from Binance (doesn't block UI)
- **Zustand Stores** hold application state (clean, reactive)
- **React Components** display the UI (dumb, just show data)
- **Paper Trading Engine** simulates order matching
- Everything syncs in real-time

---

## 📂 File Organization

```
src/
├── pages/
│   └── TradePage.tsx              ← Main trading page layout
│
├── components/
│   ├── Chart/
│   │   ├── PriceChart.tsx         ← Candlestick chart + indicators
│   │   └── Sparkline.tsx          ← Mini 24h chart
│   ├── OrderEntry/                ← Place orders form
│   ├── OrderBook/                 ← Show bids/asks
│   ├── Positions/                 ← Show your holdings
│   ├── RecentTrades/              ← Show market trades
│   └── ...others
│
├── store/                         ← All state management
│   ├── marketStore.ts             ← Market data (quotes, orderbook)
│   ├── tradingStore.ts            ← Orders & positions
│   ├── walletStore.ts             ← Your balances
│   ├── watchlistStore.ts          ← Selected symbol
│   └── ...others
│
├── worker/
│   ├── marketDataWorker.ts        ← ⭐ Core engine: WebSocket handler
│   └── orderbook.ts               ← OrderBook manager
│
├── services/
│   ├── marketDataService.ts       ← REST API calls (Binance)
│   └── ...others
│
└── types/
    ├── trading.ts                 ← Order types
    ├── market.ts                  ← Quote types
    └── ...others
```

---

## 🔄 Data Flow in 3 Steps

### **Step 1: Subscribe to Market Data**
```
User opens Trade Page
    ↓
TradePage calls: marketStore.subscribe('BTCUSDT')
    ↓
Market Store sends WebSocket subscribe to Worker
    ↓
Worker connects to Binance: wss://stream.binance.com:9443
    ↓
Worker receives: depth updates, trade events, ticker updates
```

### **Step 2: Worker Processes Data**
```
Raw Binance Messages arrive
    ↓
Worker parses them (depth, trades, ticker)
    ↓
Updates OrderBook (bids, asks)
    ↓
Calculates: spread, mid price, latency
    ↓
Batches messages every ~16ms (60fps)
    ↓
Sends to Main Thread: ORDER_BOOK_UPDATE
```

### **Step 3: UI Gets Latest Data**
```
Main Thread receives update
    ↓
Market Store updates state
    ↓
React components see new data
    ↓
Components re-render
    ↓
User sees live price chart, orderbook, trades
```

---

## 🎛️ Components & What They Do

| Component | Purpose | Gets Data From |
|-----------|---------|-----------------|
| **TradePage** | Main layout orchestrator | All stores |
| **PriceChart** | Candlestick + MA/EMA/BOLL | Market data + REST API |
| **OrderEntry** | Place buy/sell orders | Market store + user input |
| **OrderBook** | Show bid/ask levels | Market store |
| **Positions** | Show your holdings | Trading store |
| **Wallet** | Show your balances | Wallet store |
| **RecentTrades** | Show last 50 market trades | Market store |
| **RiskRibbon** | Show risk metrics | Trading store |

---

## 💾 State Management Quick Guide

### **marketStore** - Market Data (Live)
```typescript
// Read prices
const orderBook = useMarketStore((s) => s.orderBook)
const { bid, ask, mid, spread } = useMarketStore((s) => s.metrics)

// Read data quality
const { level, canTrade } = useMarketStore((s) => s.dataConfidence)
// level: 'live', 'degraded', 'resyncing', 'stale'

// Subscribe to symbol
useMarketStore((s) => s.subscribe('BTCUSDT'))
```

### **tradingStore** - Orders & Positions
```typescript
// Create order
const order = tradingStore.createOrder({
  symbol: 'BTCUSDT',
  side: 'buy',
  type: 'limit',
  price: '40000',
  quantity: '0.5'
})

// Read orders
const openOrders = tradingStore.getOpenOrders()
const position = tradingStore.getPosition('BTCUSDT')

// Cancel order
tradingStore.cancelOrder(orderId)
```

### **walletStore** - Balances
```typescript
// Read balance
const btc = walletStore.getBalance('BTC')
console.log(btc.available, btc.total)

// Balances update when:
// - You place an order (freezes balance)
// - Order fills (updates balance)
// - You cancel order (unfreezes balance)
```

### **watchlistStore** - Symbol Selection
```typescript
// Get current symbol
const symbol = watchlistStore.selectSelectedSymbol()

// Change symbol
watchlistStore.setSelectedSymbol('ETHUSDT')

// This triggers:
// 1. Worker unsubscribes from old symbol
// 2. Worker subscribes to new symbol
// 3. Chart loads new historical data
// 4. All components update to show new data
```

---

## 📊 Chart System Explained

### **How Chart Gets Data**

```
User selects "BTCUSDT"
    ↓
PriceChart.tsx mounts
    ↓
Fetches historical klines:
  GET /binance-api/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=500
    ↓
Gets back 500 candles:
  [
    { time: 1609459200, open: 40000, high: 40100, low: 39900, close: 40050, volume: 150 },
    { time: 1609459260, open: 40050, high: 40200, low: 39950, close: 40100, volume: 200 },
    ...
  ]
    ↓
Chart renders all 500 candles
    ↓
    ↓
NEW TRADE comes in from WebSocket
    ↓
Updates current (last) candle:
  lastCandle.high = max(lastCandle.high, tradePrice)
  lastCandle.low = min(lastCandle.low, tradePrice)
  lastCandle.close = tradePrice
  lastCandle.volume += tradeQty
    ↓
Chart updates in real-time
```

### **Available Indicators**

| Indicator | Formula | Usage |
|-----------|---------|-------|
| **MA7** | Average of last 7 closes | Trend follower |
| **MA25** | Average of last 25 closes | Trend confirmation |
| **EMA12** | Exponential MA (12 period) | Fast trend |
| **EMA26** | Exponential MA (26 period) | Slow trend |
| **BOLL** | MA ± 2×StdDev | Volatility bands |
| **VOL** | Volume bars | Trading activity |

### **Timeframes Available**
- `1m` - 1-minute candles (500 = 8.3 hours history)
- `5m` - 5-minute candles (500 = 41.6 hours history)
- `15m` - 15-minute candles (500 = 125 hours history)
- `1h` - 1-hour candles (500 = 20.8 days history)
- `4h` - 4-hour candles (500 = 83.3 days history)
- `1d` - daily candles (500 = 1.37 years history)

---

## 🔧 How to Modify the System

### **Use Custom Prices Instead of Binance**

**File**: `src/worker/marketDataWorker.ts`

Current (Binance):
```typescript
const streamName = `${symbol.toLowerCase()}@depth@100ms`
const wsUrl = `wss://stream.binance.com:9443/stream?streams=${streamName}`
ws = new WebSocket(wsUrl)
```

Change to your API:
```typescript
// Replace with your WebSocket URL
const wsUrl = `wss://your-api.com/prices?symbol=${symbol}`
ws = new WebSocket(wsUrl)

// Handle your message format
ws.onmessage = (event) => {
  const { bid, ask, price, timestamp } = JSON.parse(event.data)
  
  // Send to main thread same way
  sendMessage('ORDER_BOOK_UPDATE', {
    symbol: symbol,
    bids: [[bid, '1']],
    asks: [[ask, '1']]
  })
}
```

### **Store Price History**

Create new file: `src/store/priceHistoryStore.ts`

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const usePriceHistoryStore = create(
  persist(
    (set) => ({
      prices: [],
      
      addPrice: (symbol, price, timestamp) => {
        set(state => ({
          prices: [...state.prices, { symbol, price, timestamp }]
            .slice(-10000) // Keep last 10k prices
        }))
      },
      
      getPrices: (symbol) => {
        return get().prices.filter(p => p.symbol === symbol)
      }
    }),
    { name: 'price-history' }
  )
)
```

Then record prices:
```typescript
// In marketDataWorker.ts
import { usePriceHistoryStore } from '../store/priceHistoryStore'

// When price updates:
usePriceHistoryStore.getState().addPrice(
  symbol,
  midPrice,
  Date.now()
)
```

### **Load Previous Prices in Chart**

In `PriceChart.tsx`:
```typescript
import { usePriceHistoryStore } from '../../store/priceHistoryStore'

// Instead of fetching from Binance:
const priceHistory = usePriceHistoryStore(s => s.getPrices(symbol))

// Group by time interval and create candles:
const klines = convertPricesToKlines(priceHistory, timeRange)

// Use in chart
setChartData(klines)
```

---

## 🐛 Debugging Tips

### **Monitor Worker Activity**
```typescript
// In market store, data confidence shows:
dataConfidence = {
  level: 'live'              // ✓ Good, 'stale' = problem
  canTrade: true             // ✓ Safe to trade
  canTrustMetrics: true      // ✓ Prices are reliable
  details: {
    wsConnected: true        // ✓ WebSocket connected
    sequenceContinuous: true // ✓ No data gaps
    latencyOk: true          // ✓ < 500ms latency
    updateFrequencyOk: true  // ✓ Getting regular updates
  }
}
```

### **Check Order Status**
```typescript
const order = tradingStore.getOrder(orderId)
console.log(order.status)
// 'pending' → 'submitted' → 'open' → 'filled' or 'cancelled'

// If stuck on 'pending', market data may not be available
// Order matching only happens when orderBook updates come in
```

### **Monitor Network**
```typescript
const health = useMarketStore(s => s.networkHealth)
console.log({
  uptime: health?.uptimePercent + '%',
  latency: health?.avgLatency + 'ms',
  messageRate: health?.messageRate + ' msgs/sec',
  issues: health?.recentIssues
})
```

---

## 📈 Key Constants to Know

```typescript
// Timing
HEARTBEAT_INTERVAL_MS = 15s        // Check connection health
STALE_RECONNECT_THRESHOLD = 15s    // Reconnect if no data for 15s
METRICS_UPDATE_INTERVAL = 250ms    // Update chart 4x per second

// Message batching (for performance)
MESSAGE_RATE_WINDOW_MS = 1000ms    // Count messages per second
QUEUE_WARNING_THRESHOLD = 100      // Warn if 100+ messages queued

// Order matching
FEE_RATE = 0.001                   // 0.1% trading fee
SIMULATED_DELAY = 50-200ms         // Order processing delay

// Data confidence
LEVEL_UPGRADE_THRESHOLD = 2        // Need 2 good updates to recover
LEVEL_DOWNGRADE_THRESHOLD = 5      // Need 5 bad updates to degrade
STALE_THRESHOLD = 8                // Need 8 bad updates to go stale
```

---

## 🎓 Understanding Order Status Transitions

```
User creates order:

BUY ORDER:
  pending           → submitted (sending to engine)
  submitted         → open (accepted by engine)
  open              → partial (50% filled)
  partial           → filled (100% filled) ✓ Complete!
  
CANCEL:
  pending/open/partial → cancelled ✓ Complete!

ERRORS:
  submitted → rejected (balance insufficient, bad price, etc)

SELL ORDER:
  Same flow as buy order
```

---

## 🚀 Next Steps to Learn More

1. **Read full documentation**: `TRADE_PAGE_EXPLANATION.md` (included)
2. **Explore marketStore**: `src/store/marketStore.ts` - See how data flows
3. **Check worker code**: `src/worker/marketDataWorker.ts` - See WebSocket handling
4. **Test order matching**: `src/store/tradingStore.ts` - See order execution
5. **Customize chart**: `src/components/Chart/PriceChart.tsx` - See indicator calculations

---

## ❓ Common Questions

**Q: Why use a Web Worker?**
A: Binance sends 50-100 updates per second. If we process them on the main thread, it blocks UI rendering. Worker handles it separately.

**Q: Where's the database?**
A: localStorage stores orders/balances. Everything is in-memory (browser). No backend persistence.

**Q: Can I use real prices instead of Binance?**
A: Yes! Replace the WebSocket URL and message handlers in `marketDataWorker.ts`.

**Q: How do orders actually execute?**
A: When orderBook updates come in, `tradingStore` checks if any orders can be matched at current prices.

**Q: Where's the TP/SL logic?**
A: In `tradingStore.checkTPSL()` - runs every time price updates, sells position if TP/SL hit.

**Q: Can I store price history?**
A: Yes! Create a store with `persist` middleware and `localStorage` as shown above.

---

## 📞 Support

For more details on specific features:
- **Chart customization**: See "Chart System Explanation" section
- **Custom data sources**: See "How to Customize" section
- **Order types**: Check `src/types/trading.ts`
- **State structure**: Check `src/types/market.ts`

