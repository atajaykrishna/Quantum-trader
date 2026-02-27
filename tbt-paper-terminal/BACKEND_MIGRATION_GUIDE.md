# Backend Migration Guide: Binance + LocalStorage → Real Server + Database

## Overview
This document provides comprehensive details on all current external API calls, data structures, request/response formats, and what needs to be replaced for a production-grade server/database backend implementation.

---

## Table of Contents
1. [Current Architecture](#current-architecture)
2. [External APIs Currently Used](#external-apis-currently-used)
3. [Data Structures & Request/Response Formats](#data-structures--requestresponse-formats)
4. [Storage Currently Used](#storage-currently-used)
5. [Real-Time Data Requirements](#real-time-data-requirements)
6. [Trading Engine Requirements](#trading-engine-requirements)
7. [Migration Checklist](#migration-checklist)
8. [Proposed Server Architecture](#proposed-server-architecture)

---

## Current Architecture

### External Data Sources
- **Market Data**: Binance WebSocket + REST APIs
- **Data Storage**: Browser LocalStorage (Zustand persist middleware)
- **Order Management**: Client-side simulation (no server)
- **User Authentication**: Client-side only (simulated)

### Key Files Processing External APIs
```
src/
├── services/marketDataService.ts          # Binance API calls
├── worker/marketDataWorker.ts              # WebSocket data processing
├── store/
│   ├── tradingStore.ts                     # Order management (client-side)
│   ├── walletStore.ts                      # Balance management (localStorage)
│   ├── marketStore.ts                      # Market data state
│   └── watchlistStore.ts                   # Watchlist persistence
└── components/
    ├── OrderEntry/MT5OrderEntry.tsx        # Order submission UI
    ├── OrderBook/                          # Order book display
    └── Chart/                              # Chart data visualization
```

---

## External APIs Currently Used

### 1. BINANCE REST API - Market Data

#### 1.1 GET /api/v3/ticker/24hr
**Purpose**: Get 24-hour price statistics for all symbols
**Current Usage**: Markets page, asset detail cards
**Request**:
```bash
GET https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT
```

**Response Format**:
```json
{
  "symbol": "BTCUSDT",
  "priceChange": "-94.99999800",
  "priceChangePercent": "-95.960",
  "weightedAvgPrice": "0.29578479",
  "prevClosePrice": "0.10002000",
  "lastPrice": "4.00000200",
  "lastQty": "200.00000000",
  "bidPrice": "4.00000000",
  "bidQty": "100.00000000",
  "askPrice": "4.00000200",
  "askQty": "50.00000000",
  "openPrice": "99.00000000",
  "highPrice": "100.00000000",
  "lowPrice": "0.10000000",
  "volume": "8913.30000000",
  "quoteAsset": "8381463.89000000",
  "openTime": 1499783499652,
  "closeTime": 1499869899652,
  "firstId": 28385,
  "lastId": 161378,
  "count": 132981
}
```

**File Implementation**: `src/services/marketDataService.ts`
```typescript
export async function fetch24hStats(symbol: string) {
  const response = await fetch(
    `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`
  );
  return response.json();
}
```

**What Needs to Replace This**:
- Server endpoint: `GET /api/v1/symbols/{symbol}/stats/24h`
- Should return same fields from database
- Should be cached server-side with TTL of 5-60 seconds

---

#### 1.2 GET /api/v3/klines
**Purpose**: Get candlestick/OHLCV data for price charts
**Current Usage**: Chart component, technical analysis
**Request**:
```bash
GET https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=1000
```

**Response Format** (Array of Candles):
```json
[
  [
    1499040000000,      // kline open time
    "0.01634790",       // open price
    "0.80765069",       // high price
    "0.01575800",       // low price
    "0.01577100",       // close price
    "148976.11427815",  // volume
    1499644799999,      // kline close time
    "2434.19055334",    // quote asset volume
    308,                // number of trades
    "1756.87402397",    // taker buy base asset volume
    "28457.92345479",   // taker buy quote asset volume
    "0"                 // unused field, ignore
  ]
]
```

**File Implementation**: `src/services/marketDataService.ts`
```typescript
export async function fetchKlines(
  symbol: string,
  interval: string = '1m',
  limit: number = 1000
) {
  const response = await fetch(
    `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
  );
  return response.json();
}
```

**What Needs to Replace This**:
- Server endpoint: `GET /api/v1/symbols/{symbol}/klines?interval=1m&limit=1000`
- Supported intervals: 1m, 5m, 15m, 1h, 4h, 1d, 1w
- Return same array of OHLCV candles
- Can cache candles for closed periods (older than 1 minute)
- Must stream new candles as they form

---

#### 1.3 GET /api/v3/ticker/price
**Purpose**: Get current latest price for a symbol
**Current Usage**: Order entry price display, position calculations
**Request**:
```bash
GET https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT
```

**Response Format**:
```json
{
  "symbol": "BTCUSDT",
  "price": "9001.67"
}
```

**File Implementation**: `src/services/marketDataService.ts`
```typescript
export async function fetchPrice(symbol: string) {
  const response = await fetch(
    `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`
  );
  return response.json();
}
```

**What Needs to Replace This**:
- Server endpoint: `GET /api/v1/symbols/{symbol}/price`
- Should fetch from real-time market data source or cache
- Update frequency: minimum every 100ms, ideally via WebSocket

---

#### 1.4 GET /api/v3/depth
**Purpose**: Get order book depth (bid/ask levels)
**Current Usage**: Order book display, order matching visualization
**Request**:
```bash
GET https://api.binance.com/api/v3/depth?symbol=BTCUSDT&limit=20
```

**Response Format**:
```json
{
  "lastUpdateId": 1027024,
  "bids": [
    [
      "4.00000000",     // bid price
      "431.00000000"    // bid quantity
    ]
  ],
  "asks": [
    [
      "4.00000200",     // ask price
      "12.00000000"     // ask quantity
    ]
  ]
}
```

**File Implementation**: `src/worker/marketDataWorker.ts`
```typescript
// WebSocket subscription to depth data
socket.on('depth@100ms', (data) => {
  processDepthUpdate(data);
});
```

**What Needs to Replace This**:
- Server endpoint: `GET /api/v1/symbols/{symbol}/depth?limit=20`
- OR WebSocket: `ws://server/stream/depth/{symbol}`
- Maintain real-time order book on client
- Push updates via WebSocket when book changes

---

### 2. BINANCE WebSocket APIs - Real-Time Data

#### 2.1 aggTrade Stream
**Purpose**: Stream real-time executed trades
**Current Usage**: Recent trades display, market activity
**WebSocket URL**:
```
wss://stream.binance.com:9443/ws/{symbol.toLowerCase()}@aggTrade
```

**Message Format**:
```json
{
  "e": "aggTrade",              // event type
  "E": 1499405254326,           // event time
  "s": "ETHBTC",                // symbol
  "a": 70662,                   // aggregated trade id
  "p": "0.002500",              // price
  "q": "1000",                  // quantity
  "f": 56410,                   // first trade id
  "l": 56420,                   // last trade id
  "T": 1499405254326,           // trade time
  "m": true,                    // is buyer maker
  "M": true                     // ignore
}
```

**File Implementation**: `src/worker/marketDataWorker.ts`
```typescript
const socket = new WebSocket(
  `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@aggTrade`
);
socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  addToRecentTrades(data);
};
```

**What Needs to Replace This**:
- WebSocket: `ws://server/stream/trades/{symbol}`
- Message format can remain same or simplify
- Should broadcast to all connected clients watching this symbol
- Need persistent trade history in database (queryable by time range)

---

#### 2.2 depth@100ms Stream
**Purpose**: Stream real-time order book updates
**Current Usage**: Order book component, depth chart
**WebSocket URL**:
```
wss://stream.binance.com:9443/ws/{symbol.toLowerCase()}@depth20@100ms
```

**Message Format**:
```json
{
  "e": "depthUpdate",
  "E": 1577854428805,           // event time
  "s": "BNBBTC",
  "U": 157987044,               // first update id
  "u": 157987250,               // final update id
  "b": [                        // bid updates
    [
      "0.01905500",             // price
      "114.21000000"            // quantity
    ]
  ],
  "a": [                        // ask updates
    [
      "0.01905600",
      "7.02000000"
    ]
  ]
}
```

**File Implementation**: `src/worker/marketDataWorker.ts`
```typescript
const socket = new WebSocket(
  `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@depth20@100ms`
);
socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  updateOrderBook(data);
};
```

**What Needs to Replace This**:
- WebSocket: `ws://server/stream/depth/{symbol}?level=20&interval=100ms`
- Should send full order book on connection
- Then send delta updates as bid/ask levels change
- Must maintain sequence number for gap detection
- Critical for trading - needs to be reliable and fast

---

### 3. CURRENT STORAGE MECHANISM - LocalStorage

#### 3.1 Storage Structure
**File**: `src/store/tradingStore.ts`
**Persistence Method**: Zustand with persist middleware
```typescript
export const useTradingStore = create<TradingState>()(
  persist(
    (set) => ({
      // State...
    }),
    {
      name: 'trading-storage', // localStorage key
      storage: localStorage,
    }
  )
);
```

**What's Stored in LocalStorage**:

1. **Trading Store** (`trading-storage`):
```json
{
  "state": {
    "orders": [
      {
        "id": "order-123",
        "symbol": "BTCUSDT",
        "side": "buy",
        "type": "limit",
        "price": 45000,
        "quantity": 0.5,
        "filledQuantity": 0.25,
        "totalValue": 22500,
        "filledValue": 11250,
        "status": "open",
        "createdAt": 1704816000000,
        "executedAt": 1704816030000,
        "fee": 2.25,
        "feeAsset": "USDT",
        "triggerPrice": null
      }
    ],
    "positions": [
      {
        "symbol": "BTCUSDT",
        "side": "long",
        "quantity": 1.5,
        "avgPrice": 44500,
        "currentPrice": 45000,
        "unrealizedPnL": 750,
        "pnlPercent": 0.337,
        "notionalValue": 67500,
        "marginUsed": 3375,
        "liquidationPrice": 30000
      }
    ],
    "recentTrades": [
      {
        "id": "trade-123",
        "symbol": "BTCUSDT",
        "type": "fill",
        "side": "buy",
        "price": 45000,
        "quantity": 0.5,
        "totalValue": 22500,
        "fee": 2.25,
        "feeAsset": "USDT",
        "timestamp": 1704816030000,
        "orderId": "order-123"
      }
    ]
  }
}
```

2. **Wallet Store** (`wallet-storage`):
```json
{
  "state": {
    "balances": {
      "USDT": {
        "total": 300000,
        "available": 250000,
        "locked": 50000
      },
      "BTC": {
        "total": 0.5,
        "available": 0.5,
        "locked": 0
      }
    },
    "ledger": [
      {
        "id": "ledger-1",
        "type": "INITIAL_GRANT",
        "asset": "USDT",
        "change": 300000,
        "balance": 300000,
        "timestamp": 1704700000000,
        "description": "Welcome Bonus"
      },
      {
        "id": "ledger-2",
        "type": "FILL",
        "asset": "USDT",
        "change": -22500,
        "balance": 277500,
        "timestamp": 1704816030000,
        "description": "Buy BTCUSDT"
      }
    ]
  }
}
```

3. **Market Store** (`market-storage`):
```json
{
  "state": {
    "symbols": {
      "BTCUSDT": {
        "symbol": "BTCUSDT",
        "baseAsset": "BTC",
        "quoteAsset": "USDT",
        "current": 45000,
        "bid": 44999,
        "ask": 45001,
        "high24h": 46000,
        "low24h": 43000,
        "volume24h": 1000000,
        "volumeQuote24h": 45000000000,
        "priceChangePercent24h": 2.27
      }
    }
  }
}
```

4. **Watchlist Store** (`watchlist-storage`):
```json
{
  "state": {
    "watchlist": ["BTCUSDT", "ETHUSDT", "BNBUSDT"],
    "favorites": ["BTCUSDT"]
  }
}
```

5. **Notification Store** (`notification-storage`):
```json
{
  "state": {
    "notifications": [
      {
        "id": "notif-1",
        "type": "order_filled",
        "title": "Order Filled",
        "message": "Your buy order for 0.5 BTC at 45000 USDT filled",
        "read": false,
        "timestamp": 1704816030000
      }
    ]
  }
}
```

6. **Settings Store** (`settings-storage`):
```json
{
  "state": {
    "theme": "dark",
    "language": "en-US",
    "preferences": {
      "showConfirmation": true,
      "soundEnabled": true,
      "notifications": true
    }
  }
}
```

**What Needs to Replace This**:
- Database tables for:
  - Users
  - Accounts (for each user)
  - Orders
  - Trades/Executions
  - Positions
  - Balances/Ledger
  - User Preferences/Settings

---

## Data Structures & Request/Response Formats

### Request/Response Pattern

#### Authentication
**All requests to new server must include**:
```
Authorization: Bearer {jwt_token}
```

#### Standard Response Format
```json
{
  "success": true,
  "code": 200,
  "message": "Operation successful",
  "data": {
    // response data
  },
  "timestamp": 1704816030000
}
```

#### Error Response Format
```json
{
  "success": false,
  "code": 400,
  "message": "Invalid input",
  "error": "Price must be greater than 0",
  "timestamp": 1704816030000
}
```

---

## Storage Currently Used

### Files Using localStorage

1. **src/store/tradingStore.ts** - Zustand persist
   - Orders, positions, trades, execution history
   
2. **src/store/walletStore.ts** - Zustand persist
   - Balances, transaction history, ledger
   
3. **src/store/marketStore.ts** - Zustand persist
   - Symbol prices, market data cache
   
4. **src/store/watchlistStore.ts** - Zustand persist
   - Favorite symbols, watchlist
   
5. **src/store/notificationStore.ts** - Zustand persist
   - Notification history
   
6. **src/store/settingsStore.ts** - Zustand persist
   - User preferences, theme, language
   
7. **src/i18n/index.ts** - Zustand persist
   - Language preference

### Search for localStorage Usage
```bash
# Find all files using localStorage
grep -r "localStorage" src/
grep -r "persist" src/store/
grep -r "sessionStorage" src/
```

---

## Real-Time Data Requirements

### Market Data Stream Architecture

#### Current WebSocket Usage
```typescript
// Current: Direct Binance WebSocket
const streams = [
  `${symbol.toLowerCase()}@aggTrade`,      // Recent trades
  `${symbol.toLowerCase()}@depth20@100ms`  // Order book
];

const socket = new WebSocket(
  `wss://stream.binance.com:9443/stream?streams=${streams.join('/')}`
);
```

#### What Server Must Provide

**1. Trade Stream**
- WebSocket: `ws://server/stream/trades/{symbol}`
- Frequency: Real-time (every trade)
- Message:
```json
{
  "type": "trade",
  "symbol": "BTCUSDT",
  "price": "45000.00",
  "quantity": "1.5",
  "side": "buy",
  "timestamp": 1704816030000,
  "tradeId": "123456"
}
```

**2. Order Book Stream**
- WebSocket: `ws://server/stream/depth/{symbol}?level=20&speed=100ms`
- Frequency: Every 100ms (or on change)
- Initial message (full book):
```json
{
  "type": "depth_snapshot",
  "symbol": "BTCUSDT",
  "bids": [
    ["44999.00", "10.5"],
    ["44998.00", "20.3"]
  ],
  "asks": [
    ["45001.00", "15.2"],
    ["45002.00", "25.1"]
  ],
  "timestamp": 1704816030000,
  "sequenceNumber": 1000000
}
```

- Update message (delta):
```json
{
  "type": "depth_update",
  "symbol": "BTCUSDT",
  "sequenceNumber": 1000001,
  "bids": [
    ["44999.00", "11.0"]  // updated quantity
  ],
  "asks": [],
  "timestamp": 1704816030100
}
```

**3. Price Tick Stream**
- WebSocket: `ws://server/stream/ticker/{symbol}`
- Frequency: Every 100ms or price change
- Message:
```json
{
  "type": "ticker",
  "symbol": "BTCUSDT",
  "lastPrice": "45000.50",
  "bid": "45000.00",
  "ask": "45001.00",
  "high24h": "46000.00",
  "low24h": "43000.00",
  "volume24h": "1000000",
  "timestamp": 1704816030000
}
```

---

## Trading Engine Requirements

### Current Order Matching (Client-Side)
**File**: `src/store/tradingStore.ts`

Orders are currently submitted and matched locally:
1. User submits order via `createOrder()`
2. Order status: pending → submitted → open → filled/cancelled
3. Matching happens in `matchOrder()` function (50-200ms simulated delay)
4. All stored in localStorage

### What Server Must Provide

#### 1. Order Submission API
**Endpoint**: `POST /api/v1/orders`
**Request**:
```json
{
  "symbol": "BTCUSDT",
  "side": "buy",
  "type": "limit",
  "quantity": 1.5,
  "price": 45000.00,
  "timeInForce": "GTC",
  "clientOrderId": "order-123-abc",
  "takeProfit": {
    "type": "limit",
    "triggerPrice": 46000.00,
    "limitPrice": 45999.00
  },
  "stopLoss": {
    "type": "market",
    "triggerPrice": 44000.00
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "orderId": "srv-order-12345",
    "clientOrderId": "order-123-abc",
    "symbol": "BTCUSDT",
    "side": "buy",
    "type": "limit",
    "quantity": 1.5,
    "price": 45000.00,
    "status": "submitted",
    "createdAt": 1704816030000,
    "serverTime": 1704816030050
  }
}
```

#### 2. Order Status Updates (WebSocket)
**WebSocket**: `ws://server/stream/orders`
**Subscribe on connection**:
```json
{
  "method": "subscribe",
  "channel": "orders",
  "userId": "user-123"
}
```

**Order Update Message**:
```json
{
  "type": "order_update",
  "orderId": "srv-order-12345",
  "clientOrderId": "order-123-abc",
  "symbol": "BTCUSDT",
  "side": "buy",
  "type": "limit",
  "status": "open",
  "quantity": 1.5,
  "price": 45000.00,
  "filledQuantity": 0.0,
  "averageExecutionPrice": null,
  "totalFilledValue": 0.0,
  "fee": 0.0,
  "feeAsset": "USDT",
  "createdAt": 1704816030000,
  "updatedAt": 1704816030050,
  "serverTime": 1704816030050
}
```

#### 3. Execution Notification (WebSocket)
**Message Type**: `execution`
```json
{
  "type": "execution",
  "orderId": "srv-order-12345",
  "executionId": "exec-98765",
  "symbol": "BTCUSDT",
  "side": "buy",
  "executionPrice": 44999.50,
  "executionQuantity": 0.5,
  "cumulativeQuantity": 0.5,
  "totalFilledValue": 22499.75,
  "fee": 2.25,
  "feeAsset": "USDT",
  "remainingQuantity": 1.0,
  "status": "partially_filled",
  "executionTimestamp": 1704816030100,
  "serverTime": 1704816030120
}
```

#### 4. Order Cancellation
**Endpoint**: `DELETE /api/v1/orders/{orderId}`
**Request**:
```json
{
  "orderId": "srv-order-12345",
  "clientOrderId": "order-123-abc"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "orderId": "srv-order-12345",
    "status": "cancelled",
    "cancelledAt": 1704816030200,
    "serverTime": 1704816030220
  }
}
```

#### 5. Open Orders Query
**Endpoint**: `GET /api/v1/orders?symbol=BTCUSDT&status=open`
**Response**:
```json
{
  "success": true,
  "data": [
    {
      "orderId": "srv-order-12345",
      "clientOrderId": "order-123-abc",
      "symbol": "BTCUSDT",
      "side": "buy",
      "type": "limit",
      "quantity": 1.5,
      "price": 45000.00,
      "filledQuantity": 0.5,
      "status": "open",
      "createdAt": 1704816030000,
      "updatedAt": 1704816030100
    }
  ]
}
```

#### 6. Position Management
**Endpoint**: `GET /api/v1/positions?symbol=BTCUSDT`
**Response**:
```json
{
  "success": true,
  "data": [
    {
      "symbol": "BTCUSDT",
      "side": "long",
      "quantity": 1.5,
      "avgOpenPrice": 44500.00,
      "currentPrice": 45000.00,
      "notionalValue": 67500.00,
      "unrealizedPnL": 750.00,
      "pnlPercent": 1.688,
      "marginUsed": 3375.00,
      "liquidationPrice": 30000.00,
      "createdAt": 1704816000000,
      "updatedAt": 1704816030000
    }
  ]
}
```

#### 7. Live P&L Calculation (WebSocket)
**Message Type**: `position_update`
```json
{
  "type": "position_update",
  "symbol": "BTCUSDT",
  "side": "long",
  "quantity": 1.5,
  "avgOpenPrice": 44500.00,
  "currentPrice": 45025.50,
  "notionalValue": 67538.25,
  "unrealizedPnL": 788.25,
  "pnlPercent": 1.769,
  "timestamp": 1704816030150,
  "serverTime": 1704816030160
}
```

#### 8. Trade History
**Endpoint**: `GET /api/v1/trades?symbol=BTCUSDT&limit=100&offset=0`
**Response**:
```json
{
  "success": true,
  "data": [
    {
      "tradeId": "trade-123",
      "orderId": "srv-order-12345",
      "symbol": "BTCUSDT",
      "side": "buy",
      "price": 44999.50,
      "quantity": 0.5,
      "totalValue": 22499.75,
      "fee": 2.25,
      "feeAsset": "USDT",
      "executionTime": 1704816030100,
      "isMaker": false
    }
  ]
}
```

---

## Market Data APIs

### 1. Symbols List
**Endpoint**: `GET /api/v1/symbols`
**Response**:
```json
{
  "success": true,
  "data": [
    {
      "symbol": "BTCUSDT",
      "baseAsset": "BTC",
      "quoteAsset": "USDT",
      "baseAssetPrecision": 8,
      "quoteAssetPrecision": 2,
      "minPrice": "0.01",
      "maxPrice": "1000000.00",
      "minQuantity": "0.00000001",
      "maxQuantity": "10000",
      "stepSize": "0.00000001",
      "tickSize": "0.01"
    }
  ]
}
```

### 2. 24h Statistics
**Endpoint**: `GET /api/v1/symbols/{symbol}/stats/24h`
**Response**:
```json
{
  "success": true,
  "data": {
    "symbol": "BTCUSDT",
    "current": 45000.00,
    "bid": 44999.00,
    "ask": 45001.00,
    "high24h": 46000.00,
    "low24h": 43000.00,
    "volume24h": 1000000.0,
    "volumeQuote24h": 45000000000.0,
    "priceChange24h": 1000.00,
    "priceChangePercent24h": 2.27,
    "openPrice": 44000.00,
    "timestamp": 1704816030000
  }
}
```

### 3. Klines/Candles
**Endpoint**: `GET /api/v1/symbols/{symbol}/klines?interval=1m&limit=1000&startTime=1704815430000&endTime=1704816030000`
**Response**:
```json
{
  "success": true,
  "data": [
    {
      "time": 1704815400000,
      "open": 44950.00,
      "high": 45050.00,
      "low": 44900.00,
      "close": 45000.00,
      "volume": 150.5,
      "quoteAssetVolume": 6754687.5,
      "numberOfTrades": 1250,
      "takerBuyBaseAssetVolume": 75.25,
      "takerBuyQuoteAssetVolume": 3387343.75
    }
  ]
}
```

### 4. Recent Trades History
**Endpoint**: `GET /api/v1/symbols/{symbol}/trades?limit=100`
**Response**:
```json
{
  "success": true,
  "data": [
    {
      "tradeId": "123456",
      "price": "45000.00",
      "quantity": "1.5",
      "quoteQuantity": "67500.00",
      "time": 1704816030000,
      "isBuyerMaker": false,
      "isBestMatch": true
    }
  ]
}
```

### 5. Depth/Order Book
**Endpoint**: `GET /api/v1/symbols/{symbol}/depth?limit=20`
**Response**:
```json
{
  "success": true,
  "data": {
    "symbol": "BTCUSDT",
    "timestamp": 1704816030000,
    "bids": [
      ["44999.00", "10.5"],
      ["44998.00", "20.3"],
      ["44997.00", "15.8"]
    ],
    "asks": [
      ["45001.00", "15.2"],
      ["45002.00", "25.1"],
      ["45003.00", "18.7"]
    ]
  }
}
```

---

## Account & Wallet APIs

### 1. Account Information
**Endpoint**: `GET /api/v1/account`
**Response**:
```json
{
  "success": true,
  "data": {
    "accountId": "account-123",
    "userId": "user-123",
    "makerCommission": 10,
    "takerCommission": 10,
    "buyerCommission": 0,
    "sellerCommission": 0,
    "canTrade": true,
    "canDeposit": true,
    "canWithdraw": true,
    "updateTime": 1704816030000
  }
}
```

### 2. Account Balances
**Endpoint**: `GET /api/v1/account/balances`
**Response**:
```json
{
  "success": true,
  "data": [
    {
      "asset": "USDT",
      "total": 300000.00,
      "available": 250000.00,
      "locked": 50000.00
    },
    {
      "asset": "BTC",
      "total": 0.5,
      "available": 0.5,
      "locked": 0.0
    }
  ]
}
```

### 3. Account Ledger
**Endpoint**: `GET /api/v1/account/ledger?limit=100&offset=0`
**Response**:
```json
{
  "success": true,
  "data": [
    {
      "transactionId": "txn-1",
      "type": "DEPOSIT",
      "asset": "USDT",
      "change": 300000.00,
      "balance": 300000.00,
      "timestamp": 1704700000000,
      "description": "Welcome Bonus"
    },
    {
      "transactionId": "txn-2",
      "type": "TRADE",
      "asset": "USDT",
      "change": -22500.00,
      "balance": 277500.00,
      "timestamp": 1704816030100,
      "description": "Buy BTCUSDT"
    }
  ]
}
```

---

## Database Schema (Recommended)

### Users Table
```sql
CREATE TABLE users (
  id VARCHAR(36) PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  passwordHash VARCHAR(255) NOT NULL,
  displayName VARCHAR(255),
  avatar_url VARCHAR(255),
  status ENUM('active', 'suspended', 'deleted') DEFAULT 'active',
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  lastLoginAt TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_createdAt (createdAt)
);
```

### Accounts Table
```sql
CREATE TABLE accounts (
  id VARCHAR(36) PRIMARY KEY,
  userId VARCHAR(36) NOT NULL,
  makerCommission DECIMAL(10, 2) DEFAULT 0.1,
  takerCommission DECIMAL(10, 2) DEFAULT 0.1,
  buyerCommission DECIMAL(10, 2) DEFAULT 0,
  sellerCommission DECIMAL(10, 2) DEFAULT 0,
  canTrade BOOLEAN DEFAULT true,
  canDeposit BOOLEAN DEFAULT true,
  canWithdraw BOOLEAN DEFAULT true,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id),
  INDEX idx_userId (userId)
);
```

### Orders Table
```sql
CREATE TABLE orders (
  id VARCHAR(36) PRIMARY KEY,
  accountId VARCHAR(36) NOT NULL,
  clientOrderId VARCHAR(255) UNIQUE,
  symbol VARCHAR(20) NOT NULL,
  side ENUM('buy', 'sell') NOT NULL,
  type ENUM('market', 'limit', 'stop_limit', 'take_profit_limit', 'stop_market', 'take_profit_market', 'trailing_stop') NOT NULL,
  quantity DECIMAL(20, 8) NOT NULL,
  price DECIMAL(20, 8),
  triggerPrice DECIMAL(20, 8),
  limitPrice DECIMAL(20, 8),
  filledQuantity DECIMAL(20, 8) DEFAULT 0,
  filledValue DECIMAL(20, 8) DEFAULT 0,
  averageExecutionPrice DECIMAL(20, 8),
  fee DECIMAL(20, 8) DEFAULT 0,
  feeAsset VARCHAR(10),
  status ENUM('pending', 'submitted', 'open', 'partial', 'filled', 'cancelled', 'rejected', 'expired') NOT NULL,
  timeInForce ENUM('GTC', 'IOC', 'FOK', 'GTX') DEFAULT 'GTC',
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  cancelledAt TIMESTAMP,
  FOREIGN KEY (accountId) REFERENCES accounts(id),
  INDEX idx_accountId (accountId),
  INDEX idx_symbol (symbol),
  INDEX idx_status (status),
  INDEX idx_createdAt (createdAt)
);
```

### Executions/Trades Table
```sql
CREATE TABLE executions (
  id VARCHAR(36) PRIMARY KEY,
  orderId VARCHAR(36) NOT NULL,
  accountId VARCHAR(36) NOT NULL,
  symbol VARCHAR(20) NOT NULL,
  side ENUM('buy', 'sell') NOT NULL,
  executionPrice DECIMAL(20, 8) NOT NULL,
  executionQuantity DECIMAL(20, 8) NOT NULL,
  totalValue DECIMAL(20, 8) NOT NULL,
  fee DECIMAL(20, 8),
  feeAsset VARCHAR(10),
  isMaker BOOLEAN,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (orderId) REFERENCES orders(id),
  FOREIGN KEY (accountId) REFERENCES accounts(id),
  INDEX idx_orderId (orderId),
  INDEX idx_accountId (accountId),
  INDEX idx_symbol (symbol),
  INDEX idx_createdAt (createdAt)
);
```

### Balances Table
```sql
CREATE TABLE balances (
  id VARCHAR(36) PRIMARY KEY,
  accountId VARCHAR(36) NOT NULL,
  asset VARCHAR(20) NOT NULL,
  total DECIMAL(20, 8) NOT NULL,
  available DECIMAL(20, 8) NOT NULL,
  locked DECIMAL(20, 8) NOT NULL DEFAULT 0,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (accountId) REFERENCES accounts(id),
  UNIQUE KEY unique_account_asset (accountId, asset),
  INDEX idx_accountId (accountId),
  INDEX idx_asset (asset)
);
```

### Ledger Table
```sql
CREATE TABLE ledger (
  id VARCHAR(36) PRIMARY KEY,
  accountId VARCHAR(36) NOT NULL,
  type ENUM('DEPOSIT', 'WITHDRAW', 'TRADE', 'FEE', 'TRANSFER_IN', 'TRANSFER_OUT', 'INITIAL_GRANT') NOT NULL,
  asset VARCHAR(20) NOT NULL,
  change DECIMAL(20, 8) NOT NULL,
  balance DECIMAL(20, 8) NOT NULL,
  description VARCHAR(255),
  referenceId VARCHAR(36),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (accountId) REFERENCES accounts(id),
  INDEX idx_accountId (accountId),
  INDEX idx_type (type),
  INDEX idx_createdAt (createdAt)
);
```

### User Settings Table
```sql
CREATE TABLE user_settings (
  id VARCHAR(36) PRIMARY KEY,
  userId VARCHAR(36) NOT NULL UNIQUE,
  theme ENUM('light', 'dark', 'system') DEFAULT 'dark',
  language VARCHAR(10) DEFAULT 'en-US',
  soundEnabled BOOLEAN DEFAULT true,
  notificationsEnabled BOOLEAN DEFAULT true,
  showConfirmation BOOLEAN DEFAULT true,
  defaultQuoteAsset VARCHAR(10) DEFAULT 'USDT',
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id),
  INDEX idx_userId (userId)
);
```

---

## Migration Checklist

### Phase 1: Backend Setup
- [ ] Create server infrastructure (Node.js/Python/Go)
- [ ] Set up database (PostgreSQL/MySQL)
- [ ] Implement authentication (JWT)
- [ ] Create all API endpoints listed above
- [ ] Set up WebSocket server for real-time data
- [ ] Implement data validation and error handling
- [ ] Set up logging and monitoring

### Phase 2: API Implementation
- [ ] Market data APIs (symbols, stats, klines, depth, trades)
- [ ] Order management APIs (create, cancel, list, history)
- [ ] Account APIs (balances, ledger, positions)
- [ ] User profile APIs (settings, preferences)

### Phase 3: WebSocket Implementation
- [ ] Trade stream (`/stream/trades/{symbol}`)
- [ ] Depth stream (`/stream/depth/{symbol}`)
- [ ] Ticker stream (`/stream/ticker/{symbol}`)
- [ ] Order updates stream (`/stream/orders`)
- [ ] Position updates stream (`/stream/positions`)
- [ ] Sequence validation for gap detection

### Phase 4: Frontend Migration
- [ ] Replace Binance API calls with server endpoints
- [ ] Replace WebSocket connections to server
- [ ] Update localStorage to API calls for fetching data
- [ ] Update all Zustand stores to sync with server
- [ ] Implement token refresh logic
- [ ] Add error handling and reconnection logic
- [ ] Update component to handle server latency

### Phase 5: Testing
- [ ] Unit tests for API endpoints
- [ ] Integration tests for order flow
- [ ] Load testing WebSocket connections
- [ ] Stress test concurrent orders
- [ ] End-to-end testing of trading scenarios
- [ ] Data consistency checks

### Phase 6: Deployment
- [ ] Set up production database
- [ ] Configure SSL/TLS
- [ ] Implement rate limiting
- [ ] Set up CDN for static assets
- [ ] Configure firewall rules
- [ ] Set up backups and disaster recovery
- [ ] Monitor performance metrics

---

## Proposed Server Architecture

### Tech Stack Recommendation
```
Frontend: React (current)
Backend: Node.js (Express/Fastify) or Python (FastAPI)
Database: PostgreSQL
Message Queue: Redis (for real-time operations)
WebSocket: Socket.io or native WebSocket
Caching: Redis
Deployment: Docker + Kubernetes or AWS/GCP/Azure
```

### Directory Structure
```
backend/
├── src/
│   ├── api/
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── orders.ts
│   │   │   ├── markets.ts
│   │   │   ├── accounts.ts
│   │   │   └── users.ts
│   │   └── middleware/
│   │       ├── auth.ts
│   │       ├── validation.ts
│   │       └── errorHandler.ts
│   ├── services/
│   │   ├── orderService.ts
│   │   ├── marketService.ts
│   │   ├── accountService.ts
│   │   └── userService.ts
│   ├── database/
│   │   ├── migrations/
│   │   ├── seeders/
│   │   └── models/
│   ├── websocket/
│   │   ├── handlers/
│   │   ├── streams/
│   │   └── manager.ts
│   ├── workers/
│   │   ├── orderMatchingWorker.ts
│   │   ├── positionUpdateWorker.ts
│   │   └── marketDataWorker.ts
│   └── config/
│       ├── database.ts
│       ├── redis.ts
│       └── env.ts
├── tests/
├── docker-compose.yml
└── package.json
```

---

## Key Implementation Points

### 1. Order Execution Flow
```
Client Order Submission
    ↓
Server Validation
    ↓
Database: Insert Order (status: submitted)
    ↓
WebSocket: Send Order Confirmation to Client
    ↓
Order Matching Engine (checks liquidity against market data)
    ↓
Database: Create Execution Record
    ↓
Update Order Status (status: filled/partial)
    ↓
Update Account Balance
    ↓
Create Ledger Entry
    ↓
WebSocket: Send Execution Notification to Client
    ↓
WebSocket: Send Position Update to Client
```

### 2. Real-Time P&L Calculation
```
On Price Update from Market Data:
    ↓
Fetch User's Open Positions
    ↓
Calculate P&L for each position
    ↓
Broadcast Position Update via WebSocket
```

### 3. WebSocket Connection Lifecycle
```
Client Connects
    ↓
Server: Send Last 100 Orders & Open Positions
    ↓
Server: Send Last 50 Trades
    ↓
Server: Send Current Account Balance
    ↓
Subscribe to Real-Time Streams
    ↓
Send Updates as they happen
    ↓
On Disconnect: Clean up subscriptions
```

### 4. Data Consistency Strategy
```
For each trade execution:
    1. Start Database Transaction
    2. Lock Order for Update
    3. Verify Quantity and Price
    4. Update Order Status
    5. Create Execution Record
    6. Update Position
    7. Update Balance
    8. Create Ledger Entry
    9. Commit Transaction
    10. Send WebSocket Notifications
```

---

## Files to Modify in Frontend

### Primary Files Requiring Updates

1. **src/services/marketDataService.ts**
   - Replace Binance API calls with server endpoints
   - Update request headers to include JWT token
   - Update response handling for new data formats

2. **src/worker/marketDataWorker.ts**
   - Replace Binance WebSocket with server WebSocket
   - Update message handling for new formats
   - Add sequence validation

3. **src/store/tradingStore.ts**
   - Remove local order matching logic
   - Add API calls for order submission/cancellation
   - Listen to WebSocket for order updates
   - Remove localStorage persistence (sync with server instead)

4. **src/store/walletStore.ts**
   - Replace localStorage with API calls
   - Fetch balances from server
   - Listen to WebSocket for balance updates

5. **src/store/marketStore.ts**
   - Replace localStorage with server cache
   - Update on WebSocket messages

6. **src/store/settingsStore.ts**
   - Sync with server user settings API
   - Persist to server instead of localStorage

7. **src/components/OrderEntry/MT5OrderEntry.tsx**
   - Update order submission to use API
   - Handle server-side validation errors
   - Show real-time P&L from server data

8. **src/App.tsx**
   - Add authentication token management
   - Initialize server connections on app load
   - Handle reconnection logic

---

## Summary

### Current State
- **Market Data**: Binance REST + WebSocket
- **Order Management**: Client-side simulation
- **Storage**: Browser localStorage
- **Real-Time**: Binance WebSocket streams
- **Latency**: ~100-500ms (simulated)

### Target State
- **Market Data**: Server endpoints + WebSocket
- **Order Management**: Server-side order book + matching engine
- **Storage**: Database with server syncing
- **Real-Time**: Server WebSocket with sequence tracking
- **Latency**: <50ms (actual network latency)

### Key Migration Points
1. All Binance API calls → Server APIs
2. All WebSocket subscriptions → Server WebSocket
3. All localStorage state → Server database
4. All order matching → Server-side matching
5. All user preferences → Server-side storage

This guide provides a complete technical specification for migrating from the current paper trading simulator to a production-grade system with real server backend and database persistence.

