# Implementation Guide - Customizing the Trade Page

## Complete Examples for Custom Modifications

---

## 1️⃣ Using Custom Price Data Source

### Problem
You want to use prices from your own data source instead of Binance.

### Solution

#### Step 1: Create Custom Data Service

**File**: `src/services/customPriceService.ts`

```typescript
// Define your custom price data interface
export interface CustomPrice {
  symbol: string
  bid: string
  ask: string
  bidVolume: string
  askVolume: string
  timestamp: number
  source: 'api' | 'manual' | 'file'
}

export interface CustomKline {
  time: number              // Unix timestamp in seconds
  open: number
  high: number
  low: number
  close: number
  volume: number
}

// Your WebSocket or API connection
let customWs: WebSocket | null = null
let priceUpdateCallback: ((price: CustomPrice) => void) | null = null

export async function connectToCustomPriceSource(
  apiUrl: string,
  symbol: string,
  onPriceUpdate: (price: CustomPrice) => void
) {
  priceUpdateCallback = onPriceUpdate
  
  try {
    // Example: Connect to WebSocket
    customWs = new WebSocket(apiUrl)
    
    customWs.onopen = () => {
      console.log('Connected to custom price source')
      // Subscribe to symbol
      customWs?.send(JSON.stringify({
        action: 'subscribe',
        symbol: symbol,
        streams: ['price']
      }))
    }
    
    customWs.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        
        // Transform your data format to CustomPrice format
        const price: CustomPrice = {
          symbol: data.ticker || symbol,
          bid: String(data.bid_price || data.lastPrice),
          ask: String(data.ask_price || data.lastPrice),
          bidVolume: String(data.bid_size || 0),
          askVolume: String(data.ask_size || 0),
          timestamp: data.timestamp || Date.now(),
          source: 'api'
        }
        
        onPriceUpdate(price)
      } catch (error) {
        console.error('Error parsing custom price data:', error)
      }
    }
    
    customWs.onerror = (error) => {
      console.error('Custom price source error:', error)
    }
    
    customWs.onclose = () => {
      console.log('Disconnected from custom price source')
    }
  } catch (error) {
    console.error('Failed to connect to custom price source:', error)
    throw error
  }
}

export function disconnectFromCustomPriceSource() {
  if (customWs) {
    customWs.close()
    customWs = null
    priceUpdateCallback = null
  }
}

// Fetch historical klines from your API
export async function fetchCustomKlines(
  symbol: string,
  interval: '1m' | '5m' | '15m' | '1h' | '4h' | '1d',
  limit: number = 500
): Promise<CustomKline[]> {
  try {
    const response = await fetch('/api/custom-klines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol,
        interval,
        limit,
        startTime: Date.now() - (limit * getIntervalMs(interval))
      })
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    
    const data = await response.json()
    
    // Transform response to CustomKline[]
    return data.klines.map((k: any) => ({
      time: Math.floor(k.openTime / 1000), // Convert to seconds
      open: parseFloat(k.open),
      high: parseFloat(k.high),
      low: parseFloat(k.low),
      close: parseFloat(k.close),
      volume: parseFloat(k.volume)
    }))
  } catch (error) {
    console.error('Failed to fetch custom klines:', error)
    return []
  }
}

// Helper function
function getIntervalMs(interval: string): number {
  const map: Record<string, number> = {
    '1m': 60000,
    '5m': 300000,
    '15m': 900000,
    '1h': 3600000,
    '4h': 14400000,
    '1d': 86400000
  }
  return map[interval] || 60000
}
```

#### Step 2: Modify Worker to Use Custom Data

**File**: `src/worker/marketDataWorker.ts`

Replace the Binance connection with:

```typescript
import { connectToCustomPriceSource, disconnectFromCustomPriceSource } from '../services/customPriceService'

let useCustomData = false  // Flag to toggle between Binance and custom

async function connect(symbol: string): Promise<void> {
  if (useCustomData) {
    try {
      // Connect to custom price source
      await connectToCustomPriceSource(
        'wss://your-api.example.com/prices',  // Your API URL
        symbol,
        (price) => {
          // Handle custom price update
          handleCustomPriceUpdate(price)
        }
      )
    } catch (error) {
      log('error', 'custom', 'connection_failed', { error: String(error) })
      scheduleReconnect()
    }
  } else {
    // Original Binance connection
    connectToBinance(symbol)
  }
}

function handleCustomPriceUpdate(price: CustomPrice) {
  if (!orderBookManager) {
    orderBookManager = new OrderBookManager()
  }
  
  // Update order book with custom price
  orderBookManager.updateOrderBook({
    bids: [[price.bid, price.bidVolume]],
    asks: [[price.ask, price.askVolume]],
    symbol: price.symbol
  })
  
  // Send to main thread
  sendOrderBookUpdate()
  
  // Record trade if needed
  sendMessage('TRADE_UPDATE', {
    trades: [{
      id: String(Date.now()),
      symbol: price.symbol,
      price: price.ask,  // Use ask as trade price
      quantity: '1',
      time: price.timestamp,
      isBuyerMaker: false
    }]
  })
}

function disconnect(): void {
  if (useCustomData) {
    disconnectFromCustomPriceSource()
  } else {
    // Original disconnect logic
  }
  
  // ... rest of disconnect logic
}

// Toggle custom data source
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { type, payload } = event.data
  
  switch (type) {
    case 'SUBSCRIBE':
      const { symbol } = payload as SubscribePayload
      connect(symbol)
      break
    
    case 'UNSUBSCRIBE':
      disconnect()
      break
    
    case 'USE_CUSTOM_DATA':
      useCustomData = (payload as any).enabled
      log('info', 'system', 'data_source_changed', { useCustomData })
      break
    
    default:
      log('warn', 'system', 'unknown_message_type', { type })
  }
}
```

#### Step 3: Create Store to Switch Data Sources

**File**: `src/store/dataSourceStore.ts`

```typescript
import { create } from 'zustand'

export type DataSourceType = 'binance' | 'custom'

interface DataSourceState {
  currentSource: DataSourceType
  customApiUrl: string
  switchToCustom: (apiUrl: string) => void
  switchToBinance: () => void
}

export const useDataSourceStore = create<DataSourceState>((set, get) => ({
  currentSource: 'binance',
  customApiUrl: '',
  
  switchToCustom: (apiUrl: string) => {
    set({ currentSource: 'custom', customApiUrl: apiUrl })
    
    // Notify worker to switch
    const marketStore = useMarketStore.getState()
    if (marketStore.worker) {
      marketStore.worker.postMessage({
        type: 'USE_CUSTOM_DATA',
        payload: { enabled: true, apiUrl }
      })
    }
  },
  
  switchToBinance: () => {
    set({ currentSource: 'binance' })
    
    // Notify worker to switch back
    const marketStore = useMarketStore.getState()
    if (marketStore.worker) {
      marketStore.worker.postMessage({
        type: 'USE_CUSTOM_DATA',
        payload: { enabled: false }
      })
    }
  }
}))
```

#### Step 4: Update Chart to Use Custom Klines

**File**: `src/components/Chart/PriceChart.tsx`

Replace the kline fetching:

```typescript
import { fetchCustomKlines } from '../../services/customPriceService'
import { useDataSourceStore } from '../../store/dataSourceStore'

// In the loadHistoricalData function:
const loadHistoricalData = async () => {
  const currentSource = useDataSourceStore.getState().currentSource
  
  if (currentSource === 'custom') {
    // Load from custom source
    const klines = await fetchCustomKlines(symbol, timeRange as any, 500)
    setChartData(klines)
  } else {
    // Original Binance loading
    // ... existing code
  }
}
```

---

## 2️⃣ Storing & Using Price History

### Problem
You want to keep a history of all prices seen, and use them to form custom candles.

### Solution

#### Step 1: Create Price History Store

**File**: `src/store/priceHistoryStore.ts`

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Decimal } from 'decimal.js'

export interface PriceSnapshot {
  symbol: string
  bid: string
  ask: string
  mid: string
  timestamp: number      // milliseconds
  source: 'binance' | 'custom'
}

interface PriceHistoryState {
  // Data
  snapshots: PriceSnapshot[]
  
  // Methods
  recordPrice: (snapshot: PriceSnapshot) => void
  getPricesBetween: (symbol: string, startTime: number, endTime: number) => PriceSnapshot[]
  getLatestPrice: (symbol: string) => PriceSnapshot | undefined
  generateKlines: (symbol: string, interval: number, count: number) => KlineData[]
  getStats: (symbol: string, timeRange: number) => {
    high: string
    low: string
    avg: string
    count: number
  }
  
  // Maintenance
  clearOldSnapshots: (olderThanMs: number) => void
  clearAll: () => void
  getStorageSize: () => number
}

interface KlineData {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export const usePriceHistoryStore = create<PriceHistoryState>()(
  persist(
    (set, get) => ({
      snapshots: [],
      
      // Record a price snapshot
      recordPrice: (snapshot: PriceSnapshot) => {
        set((state) => {
          // Keep only last 100,000 snapshots to avoid memory issues
          const updated = [...state.snapshots, snapshot]
          return {
            snapshots: updated.slice(-100000)
          }
        })
      },
      
      // Get prices in time range
      getPricesBetween: (symbol: string, startTime: number, endTime: number) => {
        return get().snapshots.filter(
          (s) => s.symbol === symbol && s.timestamp >= startTime && s.timestamp <= endTime
        )
      },
      
      // Get most recent price
      getLatestPrice: (symbol: string) => {
        const prices = get().snapshots.filter((s) => s.symbol === symbol)
        return prices[prices.length - 1]
      },
      
      // Generate klines from price snapshots
      generateKlines: (symbol: string, intervalMs: number, count: number) => {
        const prices = get().snapshots.filter((s) => s.symbol === symbol)
        if (prices.length === 0) return []
        
        const klines: KlineData[] = []
        let currentKline: KlineData | null = null
        let currentInterval: number = 0
        
        for (const price of prices) {
          const interval = Math.floor(price.timestamp / intervalMs) * intervalMs
          
          if (!currentKline || interval !== currentInterval) {
            if (currentKline) klines.push(currentKline)
            
            const mid = parseFloat(price.mid)
            currentKline = {
              time: interval,
              open: mid,
              high: mid,
              low: mid,
              close: mid,
              volume: 0
            }
            currentInterval = interval
          }
          
          if (currentKline) {
            const mid = parseFloat(price.mid)
            currentKline.high = Math.max(currentKline.high, mid)
            currentKline.low = Math.min(currentKline.low, mid)
            currentKline.close = mid
            currentKline.volume += 1  // Count number of prices
          }
        }
        
        if (currentKline) klines.push(currentKline)
        
        return klines.slice(-count)  // Return last N candles
      },
      
      // Get price statistics
      getStats: (symbol: string, timeRange: number) => {
        const now = Date.now()
        const prices = get().getPricesBetween(
          symbol,
          now - timeRange,
          now
        )
        
        if (prices.length === 0) {
          return { high: '0', low: '0', avg: '0', count: 0 }
        }
        
        const mids = prices.map((p) => new Decimal(p.mid))
        const high = Decimal.max(...mids).toString()
        const low = Decimal.min(...mids).toString()
        const avg = mids
          .reduce((a, b) => a.plus(b))
          .div(mids.length)
          .toString()
        
        return { high, low, avg, count: prices.length }
      },
      
      // Clean up old data
      clearOldSnapshots: (olderThanMs: number) => {
        const cutoff = Date.now() - olderThanMs
        set((state) => ({
          snapshots: state.snapshots.filter((s) => s.timestamp > cutoff)
        }))
      },
      
      clearAll: () => set({ snapshots: [] }),
      
      getStorageSize: () => {
        return JSON.stringify(get().snapshots).length / 1024  // KB
      }
    }),
    {
      name: 'price-history-storage',
      version: 1,
      // Limit storage size to 10MB
      migrate: (persistedState: any, version: number) => {
        if (version === 0) {
          // Handle migrations if needed
          return persistedState
        }
        return persistedState
      }
    }
  )
)
```

#### Step 2: Record Prices Automatically

**File**: `src/worker/marketDataWorker.ts`

```typescript
import { usePriceHistoryStore } from '../store/priceHistoryStore'

// In handleDepthUpdate or when you have bid/ask prices:
function recordPriceSnapshot(symbol: string, bid: string, ask: string) {
  const mid = new Decimal(bid).plus(ask).div(2).toString()
  
  usePriceHistoryStore.getState().recordPrice({
    symbol,
    bid,
    ask,
    mid,
    timestamp: Date.now(),
    source: 'binance'  // or 'custom'
  })
}

// Or in marketStore subscriber:
worker.onmessage = (event) => {
  if (event.data.type === 'ORDER_BOOK_UPDATE') {
    const { symbol, bids, asks } = event.data.payload
    
    if (bids.length > 0 && asks.length > 0) {
      recordPriceSnapshot(symbol, bids[0][0], asks[0][0])
    }
  }
}
```

#### Step 3: Use Price History in Chart

**File**: `src/components/Chart/PriceChart.tsx`

```typescript
import { usePriceHistoryStore } from '../../store/priceHistoryStore'

// Replace historical data loading:
const loadHistoricalData = async () => {
  // Try to use price history first
  const klines = usePriceHistoryStore
    .getState()
    .generateKlines(symbol, getIntervalMs(timeRange), 500)
  
  if (klines.length > 100) {
    // Enough history available
    setChartData(klines)
  } else {
    // Not enough history, fetch from Binance or custom API
    const response = await fetch(
      `/binance-api/api/v3/klines?symbol=${symbol}&interval=${INTERVAL_MAP[timeRange]}&limit=500`
    )
    const data = await response.json()
    setChartData(data.map((k: any[]) => ({
      time: k[0] / 1000,
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[7])
    })))
  }
}
```

#### Step 4: Display Price Statistics

**File**: Create `src/components/PriceStats/PriceStats.tsx`

```typescript
import { usePriceHistoryStore } from '../../store/priceHistoryStore'
import { useWatchlistStore, selectSelectedSymbol } from '../../store/watchlistStore'
import styles from './PriceStats.module.css'

export function PriceStats() {
  const symbol = useWatchlistStore(selectSelectedSymbol)
  const stats = usePriceHistoryStore((s) => s.getStats(symbol, 86400000)) // 24h
  
  return (
    <div className={styles.container}>
      <div className={styles.stat}>
        <span className={styles.label}>24h High</span>
        <span className={styles.value}>${stats.high}</span>
      </div>
      <div className={styles.stat}>
        <span className={styles.label}>24h Low</span>
        <span className={styles.value}>${stats.low}</span>
      </div>
      <div className={styles.stat}>
        <span className={styles.label}>24h Avg</span>
        <span className={styles.value}>${stats.avg}</span>
      </div>
      <div className={styles.stat}>
        <span className={styles.label}>Samples</span>
        <span className={styles.value}>{stats.count}</span>
      </div>
    </div>
  )
}
```

---

## 3️⃣ Loading Custom Prices from Previous Session

### Problem
You want to load prices that were recorded in a previous session and continue from where you left off.

### Solution

```typescript
// In your app initialization:
import { usePriceHistoryStore } from './store/priceHistoryStore'
import { useDataSourceStore } from './store/dataSourceStore'

export function App() {
  useEffect(() => {
    // Load previous price history from localStorage
    // This happens automatically with persist middleware
    
    const priceHistory = usePriceHistoryStore.getState().snapshots
    console.log(`Loaded ${priceHistory.length} price snapshots from storage`)
    
    if (priceHistory.length > 0) {
      const oldest = priceHistory[0]
      const newest = priceHistory[priceHistory.length - 1]
      console.log(`Price history: ${new Date(oldest.timestamp)} to ${new Date(newest.timestamp)}`)
    }
    
    // Clean up old data (older than 7 days)
    usePriceHistoryStore.getState().clearOldSnapshots(7 * 24 * 60 * 60 * 1000)
    
    // Check storage size
    const sizeKb = usePriceHistoryStore.getState().getStorageSize()
    console.log(`Price history storage: ${sizeKb.toFixed(2)} KB`)
  }, [])
  
  return (
    // Your app components
  )
}
```

---

## 4️⃣ Manual Price Input

### Problem
You want to manually input prices for testing/simulation.

### Solution

**File**: `src/components/ManualPriceInput/ManualPriceInput.tsx`

```typescript
import { useState } from 'react'
import { usePriceHistoryStore } from '../../store/priceHistoryStore'
import { useMarketStore } from '../../store/marketStore'
import { useWatchlistStore, selectSelectedSymbol } from '../../store/watchlistStore'
import styles from './ManualPriceInput.module.css'

export function ManualPriceInput() {
  const symbol = useWatchlistStore(selectSelectedSymbol)
  const [bid, setBid] = useState('')
  const [ask, setAsk] = useState('')
  
  const recordPrice = usePriceHistoryStore((s) => s.recordPrice)
  
  const handleSubmit = () => {
    if (!bid || !ask) return
    
    // Record the manual price
    recordPrice({
      symbol,
      bid,
      ask,
      mid: String((parseFloat(bid) + parseFloat(ask)) / 2),
      timestamp: Date.now(),
      source: 'custom'
    })
    
    // Optionally update the market store
    // so chart shows this price immediately
    const marketStore = useMarketStore.getState()
    // You may want to dispatch an update event
    
    // Reset form
    setBid('')
    setAsk('')
  }
  
  return (
    <div className={styles.container}>
      <input
        type="number"
        placeholder="Bid price"
        value={bid}
        onChange={(e) => setBid(e.target.value)}
        step="0.01"
      />
      <input
        type="number"
        placeholder="Ask price"
        value={ask}
        onChange={(e) => setAsk(e.target.value)}
        step="0.01"
      />
      <button onClick={handleSubmit}>Record Price</button>
    </div>
  )
}
```

---

## 5️⃣ Comparing Binance vs Custom Prices

### Problem
You want to compare prices from Binance and your custom source side-by-side.

### Solution

**File**: `src/components/PriceComparison/PriceComparison.tsx`

```typescript
import { useEffect, useState } from 'react'
import { usePriceHistoryStore } from '../../store/priceHistoryStore'
import { useWatchlistStore, selectSelectedSymbol } from '../../store/watchlistStore'
import { useMarketStore, selectMetrics } from '../../store/marketStore'
import styles from './PriceComparison.module.css'

interface Comparison {
  binancePrice: string
  customPrice: string
  difference: string
  diffPercent: string
  timestamp: number
}

export function PriceComparison() {
  const symbol = useWatchlistStore(selectSelectedSymbol)
  const binanceMetrics = useMarketStore(selectMetrics)
  const [comparisons, setComparisons] = useState<Comparison[]>([])
  
  useEffect(() => {
    const latestCustom = usePriceHistoryStore
      .getState()
      .getLatestPrice(symbol)
    
    if (binanceMetrics && latestCustom) {
      const binancePrice = binanceMetrics.mid
      const customPrice = latestCustom.mid
      
      const diff = parseFloat(customPrice) - parseFloat(binancePrice)
      const diffPercent = (diff / parseFloat(binancePrice)) * 100
      
      const comparison: Comparison = {
        binancePrice,
        customPrice,
        difference: diff.toFixed(8),
        diffPercent: diffPercent.toFixed(4),
        timestamp: Date.now()
      }
      
      setComparisons((prev) => [...prev, comparison].slice(-100))
    }
  }, [binanceMetrics, symbol])
  
  return (
    <div className={styles.container}>
      <h3>Price Comparison</h3>
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Binance</th>
            <th>Custom</th>
            <th>Diff</th>
            <th>%</th>
          </tr>
        </thead>
        <tbody>
          {comparisons.map((c, i) => (
            <tr key={i}>
              <td>{new Date(c.timestamp).toLocaleTimeString()}</td>
              <td>${c.binancePrice}</td>
              <td>${c.customPrice}</td>
              <td>{c.difference}</td>
              <td className={parseFloat(c.diffPercent) > 0 ? 'positive' : 'negative'}>
                {c.diffPercent}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

---

## 6️⃣ Exporting Price History

### Problem
You want to export recorded prices for analysis/backup.

### Solution

```typescript
// In any component
import { usePriceHistoryStore } from '../../store/priceHistoryStore'

export function PriceExport() {
  const exportAsJSON = () => {
    const snapshots = usePriceHistoryStore.getState().snapshots
    const json = JSON.stringify(snapshots, null, 2)
    
    // Download as file
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `price-history-${Date.now()}.json`
    a.click()
  }
  
  const exportAsCSV = () => {
    const snapshots = usePriceHistoryStore.getState().snapshots
    
    // CSV header
    const csv = [
      'Symbol,Bid,Ask,Mid,Timestamp,Source',
      ...snapshots.map(
        (s) => `${s.symbol},${s.bid},${s.ask},${s.mid},${s.timestamp},${s.source}`
      )
    ].join('\n')
    
    // Download as file
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `price-history-${Date.now()}.csv`
    a.click()
  }
  
  return (
    <div>
      <button onClick={exportAsJSON}>Export as JSON</button>
      <button onClick={exportAsCSV}>Export as CSV</button>
    </div>
  )
}
```

---

## Summary

These examples show you how to:

1. ✅ **Connect to custom price source** instead of Binance
2. ✅ **Store price history** for later use
3. ✅ **Generate candles from price history**
4. ✅ **Compare prices** from different sources
5. ✅ **Export price data** for analysis
6. ✅ **Switch between data sources** dynamically

All changes are **backward compatible** - you can run with Binance or switch to custom data anytime!

