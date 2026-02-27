# Complete Order Flow - How the System Works

## System Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                    TRADING TERMINAL                           │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  UI Layer (React Components)                                 │
│  ├─ TradePage (Layout)                                       │
│  ├─ MT5OrderEntry (Order Form) ← NEW MT5 STYLE              │
│  ├─ Chart (Price Action)                                    │
│  ├─ OrderBook (Market Depth)                                │
│  └─ Positions/History                                       │
│                                                               │
│  ↓ (Events & Queries)                                       │
│                                                               │
│  State Management (Zustand Stores)                           │
│  ├─ tradingStore.ts (Orders & Positions)                   │
│  ├─ marketStore.ts (Order Book & Metrics)                  │
│  ├─ walletStore.ts (Balances & Freezing)                   │
│  ├─ notificationStore.ts (Alerts)                          │
│  └─ watchlistStore.ts (Symbols)                            │
│                                                               │
│  ↓ (Business Logic)                                         │
│                                                               │
│  Core Engines                                                │
│  ├─ Order Creation Engine (Validation)                      │
│  ├─ Order Matching Engine (Execution)                       │
│  ├─ Position Calculator (PnL)                               │
│  ├─ Balance Manager (Freeze/Unfreeze)                       │
│  └─ Conditional Order Engine (Triggers)                     │
│                                                               │
│  ↓ (Simulated Execution)                                    │
│                                                               │
│  Data Sources                                                │
│  ├─ WebSocket Market Data (Real-time)                       │
│  ├─ Market Data Worker (Processing)                         │
│  └─ Simulated Order Matching                                │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

## Order Lifecycle

### 1. ORDER CREATION

```
User Action (MT5OrderEntry Component)
    ↓
    ├─ Validates Input
    │  ├─ Quantity > 0?
    │  ├─ Price valid?
    │  └─ Order type recognized?
    ↓
    ├─ Checks Data Confidence
    │  ├─ Market data fresh?
    │  └─ Not resyncing?
    ↓
    ├─ Calculates Requirements
    │  ├─ Buy: Need USDT
    │  └─ Sell: Need BTC
    ↓
    └─ Creates Order Object
       ├─ clientOrderId: UUID
       ├─ symbol: 'BTCUSDT'
       ├─ side: 'buy' or 'sell'
       ├─ type: 'market', 'limit', etc
       ├─ status: 'pending'
       └─ createdAt: timestamp
```

**Code Location**: `src/store/tradingStore.ts` → `createOrder` function

### 2. BALANCE VALIDATION

```
Order Created → Check Balance
    ↓
For BUY Orders:
    ├─ Asset to check: USDT (quote)
    ├─ Amount needed: price × quantity
    └─ Check: available USDT ≥ amount?
    ↓
For SELL Orders:
    ├─ Asset to check: BTC (base)
    ├─ Amount needed: quantity
    └─ Check: available BTC ≥ quantity?
    ↓
If Insufficient:
    ├─ Set status: 'rejected'
    ├─ Set reason: 'INSUFFICIENT_MARGIN'
    └─ Return null (order not created)
    ↓
If Sufficient:
    ├─ Freeze balance
    ├─ Set status: 'pending'
    └─ Continue to next step
```

**Code Location**: `src/store/walletStore.ts` → `freezeBalance` function

### 3. ORDER SUBMISSION

```
Order State: 'pending'
    ↓
Simulated Delay (50-200ms)
    ├─ Mimics network latency
    └─ Makes simulation feel realistic
    ↓
Transition to 'submitted'
    ↓
    ├─ For Market Orders:
    │  └─ Try immediate matching
    ↓
    ├─ For Limit Orders:
    │  └─ Add to open orders list
    ↓
    ├─ For Conditional Orders:
    │  └─ Wait for trigger price
    ↓
Transition to 'open'
    └─ Order now active in market
```

**Code Location**: `src/store/tradingStore.ts` → `setTimeout` blocks

### 4. ORDER MATCHING

```
Order Status: 'open'
    ↓
On Every Market Update:
    ├─ Check if order can fill
    ├─ Compare order price with order book
    └─ Get matching levels
    ↓
For Market Orders:
    ├─ Buy: Match against ASK levels
    │  └─ Take best prices available
    ├─ Sell: Match against BID levels
    │  └─ Take best prices available
    ↓
For Limit Orders:
    ├─ Buy: Match if price ≤ order.price
    ├─ Sell: Match if price ≥ order.price
    ↓
For Conditional Orders:
    ├─ Check if trigger price reached
    ├─ If triggered: convert to regular order
    └─ Then match according to type
    ↓
If Partial Fill:
    ├─ filledQty += partial amount
    ├─ status = 'partial'
    ├─ avgPrice = weighted average
    └─ Continue monitoring for more fills
    ↓
If Full Fill:
    ├─ filledQty = quantity
    ├─ status = 'filled'
    ├─ Calculate fees
    └─ Update position
```

**Code Location**: `src/store/tradingStore.ts` → `attemptMatch` function

### 5. POSITION MANAGEMENT

```
When Order Fills:
    ↓
    ├─ Is this a new position?
    │  ├─ Yes: Create position with entry price
    │  └─ No: Update existing position
    ↓
Update Position Fields:
    ├─ quantity = accumulated amount
    ├─ avgEntryPrice = weighted average fill price
    ├─ unrealizedPnl = current market price - entry
    └─ updatedAt = current timestamp
    ↓
Apply Take Profit:
    ├─ If TP price set
    ├─ AND current price ≥ TP price (for longs)
    └─ Then trigger TP sell order
    ↓
Apply Stop Loss:
    ├─ If SL price set
    ├─ AND current price ≤ SL price (for longs)
    └─ Then trigger SL sell order
```

**Code Location**: `src/store/tradingStore.ts` → `updatePosition` function

### 6. BALANCE UPDATES

```
Order Fills:
    ↓
    ├─ Calculate fees: filledAmount × 0.1%
    ├─ Unfreeze original amount
    └─ Apply fee (deduct from quote asset)
    ↓
For BUY Orders:
    ├─ Deduct: USDT amount spent
    ├─ Add: BTC received (minus fees)
    ├─ Position: +BTC (long)
    └─ Balance: -USDT
    ↓
For SELL Orders:
    ├─ Deduct: BTC sold
    ├─ Add: USDT received (minus fees)
    ├─ Position: Reduce BTC holding
    └─ Balance: +USDT
    ↓
Update walletStore:
    ├─ available: recalculate
    ├─ frozen: recalculate
    └─ total: update
```

**Code Location**: `src/store/walletStore.ts` → Various balance update functions

## Complete Order Example

### Scenario: Buy BTC with Take Profit

**STEP 1: User Input**
```
- Symbol: BTCUSDT
- Side: Buy
- Type: Market
- Quantity: 1.5 BTC
- Price: Current market (let's say 45,000 USDT)
- Take Profit: 46,000 USDT
- Stop Loss: 44,000 USDT
```

**STEP 2: Validation**
```
✓ Quantity > 0? YES (1.5)
✓ Data confidence OK? YES (live)
✓ Need: 45,000 × 1.5 = 67,500 USDT
✓ Have: 100,000 USDT available? YES
✓ Create order: clientOrderId = "abc123xyz"
```

**STEP 3: Balance Freeze**
```
Before:
  USDT: available=100,000, frozen=0

After freeze:
  USDT: available=34,500, frozen=65,500

(We freeze a bit extra for market volatility)
```

**STEP 4: Order State**
```
{
  clientOrderId: "abc123xyz",
  symbol: "BTCUSDT",
  side: "buy",
  type: "market",
  quantity: "1.5",
  status: "pending" → (50ms delay) → "open",
  takeProfitPrice: "46000",
  stopLossPrice: "44000",
  createdAt: 1704067200000,
  fills: []
}
```

**STEP 5: Market Matching**
```
Order: Buy 1.5 BTC at market
Order Book ASK levels:
  45,000.00 → 0.5 BTC ✓ Match 0.5 BTC @ 45,000
  45,010.00 → 1.0 BTC ✓ Match 1.0 BTC @ 45,010
  (Total filled: 1.5 BTC)

Fills created:
  [
    { price: "45000", qty: "0.5", fee: "22.5" },
    { price: "45010", qty: "1.0", fee: "45.01" }
  ]

Status: 'pending' → 'open' → 'filled'
```

**STEP 6: Position Creation**
```
Position:
  {
    symbol: "BTCUSDT",
    side: "long",
    quantity: "1.5",
    avgEntryPrice: "45003.33", // weighted average
    unrealizedPnl: "-3.33", // if price drops slightly
    takeProfitPrice: "46000",
    stopLossPrice: "44000",
    updatedAt: 1704067200000
  }
```

**STEP 7: Final Balance**
```
Fees paid: 22.5 + 45.01 = 67.51 USDT

Final balances:
  BTC: available=1.5, frozen=0, total=1.5
  USDT: available=32,432.49, frozen=0, total=32,432.49

(100,000 - 67,500 - 67.51 = 32,432.49)
```

**STEP 8: TP/SL Monitoring**
```
Market price: 45,500
→ ≥ TP price (46,000)? NO → Wait

Market price: 46,100
→ ≥ TP price (46,000)? YES → Trigger TP order
  - Auto create SELL order for 1.5 BTC
  - Price: 46,100 (market)
  - Status: filled
  
Position closed:
  Sell proceeds: 46,100 × 1.5 = 69,150 USDT
  Fees on sell: 69.15 USDT
  Net proceeds: 69,080.85 USDT
  
  Profit: 69,080.85 - 67,500 = 1,580.85 USDT gain!
```

## Data Flow Diagram

```
MT5OrderEntry (UI)
    ↓
    └─ createOrder(params)
        ↓
        ├─ walletStore.getBalance() [Check]
        ├─ walletStore.freezeBalance() [Freeze]
        └─ tradingStore.orders.push() [Store]
            ↓
            └─ setTimeout() [Simulate delay]
                ↓
                ├─ Update status: pending → open
                ├─ marketStore.getOrderBook()
                └─ attemptMatch(order, orderBook)
                    ↓
                    ├─ Generate fills []
                    ├─ Calculate fees
                    ├─ updatePosition()
                    ├─ walletStore.unfreezeBalance()
                    ├─ walletStore.updateBalance()
                    └─ Update status: open → filled
                        ↓
                        ├─ UI re-renders via Zustand
                        ├─ Position appears in holdings
                        ├─ Order appears in history
                        └─ User sees success notification
```

## Conditional Orders

### Stop Order (Stop-Limit)
```
Trigger Condition: Price moves AGAINST position
├─ Buy Stop: Price goes UP (prepare to buy higher)
├─ Sell Stop: Price goes DOWN (protect from loss)

When Triggered:
├─ isTriggered = true
├─ Convert to limit order
├─ Set status to 'open'
└─ Now behaves like normal limit order

Example:
  BTC currently at 45,000
  Set Buy Stop @ 46,000
  When price reaches 46,000 → Buy triggers
  Useful when you think trend will break through
```

### Take Profit (TP-Limit)
```
Trigger Condition: Price moves FOR your position
├─ Buy TP: Price goes DOWN (close long profitably)
├─ Sell TP: Price goes UP (close short profitably)

When Triggered:
├─ isTriggered = true
├─ Convert to limit order
├─ Set status to 'open'
└─ Execute when limit price reached

Example:
  You bought at 45,000
  Set TP @ 46,000
  When price reaches 46,000 → Sell triggers
  Locks in 1,000 USDT profit
```

## Real-Time Updates

```
Market Data Worker receives:
├─ Order Book updates (bid/ask levels)
├─ Trade updates (recent fills)
├─ Metrics updates (mid price, VWAP)
└─ Price ticks

For each update:
├─ tradingStore checks conditional orders
├─ attemptMatch() runs for open orders
├─ Positions updated with unrealizedPnl
├─ UI re-renders with fresh data
└─ User sees real-time order fills

Latency:
├─ Market data: WebSocket (milliseconds)
├─ Order matching: Immediate (JavaScript)
├─ UI update: React batching (16ms)
└─ Total: ~20-50ms from market event to UI
```

## Error Handling

```
Insufficient Balance:
├─ Order rejected before submission
├─ Status set to 'rejected'
├─ Balance NOT frozen
└─ User gets notification

Data Confidence Low:
├─ Warning shown to user
├─ Can override with confirmation
├─ Order execution blocked if critical

Invalid Input:
├─ UI validation prevents submission
├─ Toast warning shown
├─ Form highlighted

Order Matching Failure:
├─ Order stays open (limit order)
├─ Waits for better prices
├─ Can be manually cancelled
```

## Performance Optimization

```
Rendering:
├─ Zustand selectors prevent re-renders
├─ Only components using data re-render
├─ Memoized callbacks reduce deps

Matching:
├─ Only check open orders
├─ Skip fully filled orders
├─ Skip cancelled orders

Balance:
├─ Cached calculations
├─ Only update when changed
└─ Avoid unnecessary freezing

Memory:
├─ Clean up old orders from state
├─ Limit order history size
└─ Archive old trades
```

## Testing Checklist

```
✓ Market Order Buy/Sell
✓ Limit Order Buy/Sell
✓ Pending Stop Order
✓ Pending Limit Order
✓ Take Profit Trigger
✓ Stop Loss Trigger
✓ Partial Fills
✓ Order Cancellation
✓ Balance Update
✓ Position Calculation
✓ Fee Deduction
✓ Multiple Orders Simultaneously
✓ Order History Retention
✓ Mobile Responsiveness
✓ Real-time Updates
```

This system provides a complete, realistic paper trading simulation with all the core features of a professional exchange!
