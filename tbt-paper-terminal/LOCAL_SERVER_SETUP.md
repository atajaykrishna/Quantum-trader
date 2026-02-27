# Local Market Data Server Configuration

## Overview
All Binance API endpoints have been replaced with your local market data server running on:
- **WebSocket**: `ws://localhost:8765`
- **REST API**: `http://localhost:8080/api/v3`

## Files Modified

### 1. `src/worker/marketDataWorker.ts` (3 changes)
**Lines 19-21**: Updated WebSocket and REST API URLs
```typescript
const CUSTOM_WS_URL = 'ws://localhost:8765';
const CUSTOM_REST_URL = 'http://localhost:8080/api/v3';
```

**Lines 330-333**: Updated WebSocket stream subscription format
```typescript
const wsUrl = `${CUSTOM_WS_URL}/stream?streams=${streamName}/${tradeStreamName}/${tickerStreamName}`;
```

**Line 451**: Updated REST API call for order book snapshot
```typescript
const url = `${CUSTOM_REST_URL}/depth?symbol=${symbol.toUpperCase()}&limit=1000`;
```

### 2. `src/services/marketDataService.ts` (1 change)
**Line 58**: Updated API base URL
```typescript
const API_BASE = 'http://localhost:8080/api/v3';
```

This affects all REST API calls:
- `fetchAllTickers()` → `GET /api/v3/ticker/24hr`
- `fetchSparkline()` → `GET /api/v3/klines`
- Other market data endpoints

### 3. `src/components/Chart/PriceChart.tsx` (1 change)
**Line 191**: Updated klines endpoint
```typescript
const url = `http://localhost:8080/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=500`;
```

### 4. `src/components/Watchlist/Watchlist.tsx` (1 change)
**Line 204**: Updated ticker data fetch
```typescript
const response = await fetch(`http://localhost:8080/api/v3/ticker/24hr?symbols=[...]`);
```

## Data Flow After Changes

```
┌─────────────────────────────────────────┐
│  React UI Components (Trade Page, etc)  │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│  Zustand State Stores                   │
│  (marketStore, tradingStore, etc)       │
└──────────────┬──────────────────────────┘
               │
     ┌─────────┴──────────┐
     │                    │
┌────▼────────────┐  ┌───▼─────────────┐
│  REST API Call  │  │  WebSocket      │
│ localhost:8080  │  │ localhost:8765  │
└────┬────────────┘  └───┬─────────────┘
     │                    │
     └────────┬───────────┘
              │
     ┌────────▼────────────┐
     │ Your Local Server   │
     │ (Custom Market Data)│
     └─────────────────────┘
```

## Expected Endpoints From Your Server

### WebSocket Stream Format
```
ws://localhost:8765/stream?streams=btcusdt@depth@100ms/btcusdt@trade/btcusdt@miniTicker
```

Your server should send messages in this format:

```json
{
  "stream": "BTCUSDT@depth@100ms",
  "data": {
    "e": "depthUpdate",
    "E": 1234567890,
    "s": "BTCUSDT",
    "U": 123456,
    "u": 123457,
    "b": [["10.00", "1.0"], ...],
    "a": [["10.01", "2.0"], ...]
  }
}
```

### REST API Endpoints Expected

#### 1. Depth (Order Book)
```
GET http://localhost:8080/api/v3/depth?symbol=BTCUSDT&limit=1000
Response:
{
  "lastUpdateId": 12345,
  "bids": [["10.00", "1.0"], ...],
  "asks": [["10.01", "2.0"], ...]
}
```

#### 2. Tickers (24h data)
```
GET http://localhost:8080/api/v3/ticker/24hr?symbols=["BTCUSDT","ETHUSDT"]
Response:
[
  {
    "symbol": "BTCUSDT",
    "lastPrice": "10.50",
    "priceChange": "0.50",
    "priceChangePercent": "5.00",
    "highPrice": "11.00",
    "lowPrice": "9.00",
    "volume": "1000.0",
    "quoteVolume": "10500.0",
    "openPrice": "10.00",
    "count": 1000
  },
  ...
]
```

#### 3. Klines (Candlestick data)
```
GET http://localhost:8080/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=500
Response:
[
  [
    1234567890000,  // Time
    "10.00",        // Open
    "11.00",        // High
    "9.00",         // Low
    "10.50",        // Close
    "1000.0",       // Volume
    1234567899999,  // Close time
    "10500.0",      // Quote asset volume
    100,            // Number of trades
    "500.0",        // Taker buy base asset volume
    "5250.0"        // Taker buy quote asset volume
  ],
  ...
]
```

## Testing the Connection

### 1. Check WebSocket Connection
Open browser DevTools Console and test:
```javascript
const ws = new WebSocket('ws://localhost:8765/stream?streams=btcusdt@depth@100ms/btcusdt@trade/btcusdt@miniTicker');
ws.onopen = () => console.log('Connected!');
ws.onmessage = (e) => console.log(JSON.parse(e.data));
ws.onerror = (e) => console.error('Error:', e);
```

### 2. Check REST API
```bash
curl http://localhost:8080/api/v3/depth?symbol=BTCUSDT&limit=100
curl http://localhost:8080/api/v3/ticker/24hr?symbols=["BTCUSDT"]
curl http://localhost:8080/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=10
```

### 3. Monitor in Browser
1. Open Trade Page
2. Select a symbol (BTCUSDT, ETHUSDT, etc)
3. Open DevTools → Network tab
4. Should see requests to `localhost:8080`
5. Should see WebSocket connection to `localhost:8765` in Console

## Troubleshooting

### No data appearing?
1. Check server is running on correct ports
2. Verify WebSocket server is accepting connections
3. Check browser Console for error messages
4. Look at Network tab for failed requests

### Connection refused?
1. Ensure local server is running
2. Check ports: WS=8765, HTTP=8080
3. Verify no firewall blocking localhost connections

### Wrong data format?
1. Check message structure matches expected format
2. Verify `E` field (Event time in ms) is present for latency calculation
3. Verify `e` field (Event type) is correct:
   - `"depthUpdate"` for order book
   - `"trade"` for trades
   - `"24hrMiniTicker"` for ticker data

## Supported Symbols
Your server supports these symbols:
- BTCUSDT
- ETHUSDT
- BNBUSDT
- ADAUSDT
- DOGEUSDT
- XRPUSDT
- SOLUSDT

## Notes
- All calls are now **synchronous** and **local** (no CORS issues)
- All data flows through your server (no external API calls)
- Perfect for development, testing, and paper trading
- Performance depends on your local server implementation
