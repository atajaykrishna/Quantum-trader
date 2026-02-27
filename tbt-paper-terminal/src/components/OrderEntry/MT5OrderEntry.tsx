import { useState, useCallback, useMemo } from 'react';
import { useMarketStore, selectOrderBook, selectMetrics, selectBestBid, selectBestAsk } from '../../store/marketStore';
import { useTradingStore } from '../../store/tradingStore';
import { useWalletStore, selectBalances } from '../../store/walletStore';
import { toast } from '../Toast';
import { Icon } from '../Icon';
import type { OrderSide } from '../../types/trading';
import styles from './MT5OrderEntry.module.css';

interface OrderInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suffix?: string;
  placeholder?: string;
  onFocus?: () => void;
  onBlur?: () => void;
}

function OrderInput({ label, value, onChange, suffix, placeholder, onFocus, onBlur }: OrderInputProps) {
  return (
    <div className={styles.orderInputGroup}>
      <label className={styles.orderInputLabel}>{label}</label>
      <div className={styles.orderInputWrapper}>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={placeholder || '0.00'}
          className={styles.orderInput}
        />
        {suffix && <span className={styles.orderInputSuffix}>{suffix}</span>}
      </div>
    </div>
  );
}

interface MT5OrderEntryProps {
  priceFromOrderBook?: string;
  sideFromOrderBook?: OrderSide;
}

export function MT5OrderEntry({ priceFromOrderBook, sideFromOrderBook }: MT5OrderEntryProps) {
  const [side, setSide] = useState<OrderSide>(sideFromOrderBook || 'buy');
  const [orderType, setOrderType] = useState<'market' | 'limit' | 'pending'>('market');
  
  // Market/Limit order fields
  const [price, setPrice] = useState(priceFromOrderBook || '');
  const [quantity, setQuantity] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  
  // Pending order fields (Stop/Limit for take profit/stop loss)
  const [pendingPrice, setPendingPrice] = useState('');
  const [pendingType, setPendingType] = useState<'stop' | 'limit'>('stop');
  
  const orderBook = useMarketStore(selectOrderBook);
  const metrics = useMarketStore(selectMetrics);
  const bestBid = useMarketStore(selectBestBid);
  const bestAsk = useMarketStore(selectBestAsk);
  const balances = useWalletStore(selectBalances);
  const createOrder = useTradingStore((state) => state.createOrder);
  const orders = useTradingStore((state) => state.orders);
  const cancelOrder = useTradingStore((state) => state.cancelOrder);
  
  const symbol = orderBook?.symbol ?? 'BTCUSDT';
  const baseAsset = symbol.replace('USDT', '');
  const quoteAsset = 'USDT';
  const baseBalance = balances.find(b => b.asset === baseAsset);
  const quoteBalance = balances.find(b => b.asset === quoteAsset);
  
  // Calculate total for display
  const total = useMemo(() => {
    const p = orderType === 'market' && metrics ? parseFloat(metrics.mid) : parseFloat(price || '0');
    const q = parseFloat(quantity || '0');
    return !isNaN(p) && !isNaN(q) && p > 0 && q > 0 ? (p * q).toFixed(2) : '0';
  }, [price, quantity, orderType, metrics]);
  
  // Get max quantity based on balance and price
  const maxQuantity = useMemo(() => {
    if (side === 'buy' && quoteBalance && metrics) {
      const available = parseFloat(quoteBalance.available);
      const p = orderType === 'market' ? parseFloat(metrics.mid) : parseFloat(price || '0');
      return p > 0 ? (available / p).toFixed(6) : '0';
    } else if (side === 'sell' && baseBalance) {
      return parseFloat(baseBalance.available).toFixed(6);
    }
    return '0';
  }, [side, orderType, price, quoteBalance, baseBalance, metrics]);
  
  // Available balance display
  const availableBalance = side === 'buy' 
    ? `${parseFloat(quoteBalance?.available || '0').toFixed(2)} ${quoteAsset}`
    : `${parseFloat(baseBalance?.available || '0').toFixed(6)} ${baseAsset}`;
  
  // Open orders for this symbol
  const openOrders = useMemo(() => 
    orders.filter(o => o.symbol === symbol && ['open', 'partial', 'pending', 'submitted'].includes(o.status))
      .sort((a, b) => b.createdAt - a.createdAt)
  , [orders, symbol]);
  
  // Quick set price buttons
  const setFromBestBid = () => {
    if (bestBid) {
      setPrice(bestBid.price);
      setSide('buy');
    }
  };
  
  const setFromBestAsk = () => {
    if (bestAsk) {
      setPrice(bestAsk.price);
      setSide('sell');
    }
  };
  
  const setFromMid = () => {
    if (metrics) setPrice(metrics.mid);
  };
  
  // Quick quantity buttons
  const setQuantityPercent = (percent: number) => {
    const maxQty = parseFloat(maxQuantity);
    if (maxQty > 0) {
      setQuantity(((maxQty * percent) / 100).toFixed(6));
    }
  };
  
  // Submit order
  const handleSubmitOrder = useCallback(async () => {
    if (!quantity || parseFloat(quantity) <= 0) {
      toast.warning('Please enter quantity');
      return;
    }
    
    if (orderType === 'limit' && (!price || parseFloat(price) <= 0)) {
      toast.warning('Please enter price');
      return;
    }
    
    const order = createOrder({
      symbol,
      side,
      type: orderType === 'market' ? 'market' : 'limit',
      price: orderType === 'limit' ? price : undefined,
      quantity,
      takeProfitPrice: takeProfit || undefined,
      stopLossPrice: stopLoss || undefined,
    }, metrics?.mid);
    
    if (order) {
      toast.success(`${side.toUpperCase()} order placed`);
      setQuantity('');
      setTakeProfit('');
      setStopLoss('');
      if (orderType === 'limit') setPrice('');
    } else {
      toast.error('Order rejected - insufficient balance');
    }
  }, [quantity, price, orderType, side, symbol, takeProfit, stopLoss, createOrder, metrics?.mid]);
  
  // Submit pending order (stop/limit)
  const handleSubmitPendingOrder = useCallback(() => {
    if (!quantity || parseFloat(quantity) <= 0) {
      toast.warning('Please enter quantity');
      return;
    }
    
    if (!pendingPrice || parseFloat(pendingPrice) <= 0) {
      toast.warning('Please enter trigger price');
      return;
    }
    
    const orderTypeMap: Record<string, 'stop_limit' | 'take_profit_limit'> = {
      'stop': 'stop_limit',
      'limit': 'take_profit_limit'
    };
    
    const order = createOrder({
      symbol,
      side,
      type: orderTypeMap[pendingType] as any,
      triggerPrice: pendingPrice,
      price: pendingPrice, // For pending orders, use same price as trigger
      quantity,
    }, metrics?.mid);
    
    if (order) {
      toast.success(`Pending ${pendingType} order placed`);
      setQuantity('');
      setPendingPrice('');
    } else {
      toast.error('Order rejected');
    }
  }, [quantity, pendingPrice, pendingType, side, symbol, createOrder, metrics?.mid]);
  
  const isSubmitDisabled = !quantity || parseFloat(quantity) <= 0 || (orderType === 'limit' && (!price || parseFloat(price) <= 0));
  const isPendingDisabled = !quantity || parseFloat(quantity) <= 0 || !pendingPrice || parseFloat(pendingPrice) <= 0;
  
  return (
    <div className={`card ${styles.mt5Container}`}>
      {/* Quick Action Buttons - Market Orders */}
      <div className={styles.quickActionSection}>
        <button
          className={`${styles.quickActionBtn} ${styles.buyBtn}`}
          onClick={() => {
            handleSubmitOrder();
            setSide('buy');
            setOrderType('market');
          }}
          disabled={!quantity}
        >
          <Icon name="arrow-up" size="xs" />
          <span>BUY</span>
          <span className={styles.price}>{bestAsk ? bestAsk.price : '—'}</span>
        </button>
        
        <button
          className={`${styles.quickActionBtn} ${styles.sellBtn}`}
          onClick={() => {
            handleSubmitOrder();
            setSide('sell');
            setOrderType('market');
          }}
          disabled={!quantity}
        >
          <Icon name="arrow-down" size="xs" />
          <span>SELL</span>
          <span className={styles.price}>{bestBid ? bestBid.price : '—'}</span>
        </button>
      </div>
      
      {/* Order Type Tabs */}
      <div className={styles.orderTypeTabs}>
        <button
          className={`${styles.tab} ${orderType === 'market' ? styles.active : ''}`}
          onClick={() => setOrderType('market')}
        >
          Market
        </button>
        <button
          className={`${styles.tab} ${orderType === 'limit' ? styles.active : ''}`}
          onClick={() => setOrderType('limit')}
        >
          Limit
        </button>
        <button
          className={`${styles.tab} ${orderType === 'pending' ? styles.active : ''}`}
          onClick={() => setOrderType('pending')}
        >
          Pending
        </button>
      </div>
      
      {/* Market/Limit Order Entry */}
      {(orderType === 'market' || orderType === 'limit') && (
        <div className={styles.orderSection}>
          {orderType === 'limit' && (
            <>
              <OrderInput
                label="Limit Price"
                value={price}
                onChange={setPrice}
                suffix={quoteAsset}
                placeholder="0.00"
              />
              <div className={styles.quickPriceButtons}>
                <button className={styles.quickBtn} onClick={setFromBestBid}>Bid</button>
                <button className={styles.quickBtn} onClick={setFromMid}>Mid</button>
                <button className={styles.quickBtn} onClick={setFromBestAsk}>Ask</button>
              </div>
            </>
          )}
          
          <OrderInput
            label="Quantity"
            value={quantity}
            onChange={setQuantity}
            suffix={baseAsset}
            placeholder="0.00"
          />
          
          <div className={styles.quickQuantityButtons}>
            <button className={styles.quickBtn} onClick={() => setQuantityPercent(25)}>25%</button>
            <button className={styles.quickBtn} onClick={() => setQuantityPercent(50)}>50%</button>
            <button className={styles.quickBtn} onClick={() => setQuantityPercent(75)}>75%</button>
            <button className={styles.quickBtn} onClick={() => setQuantityPercent(100)}>100%</button>
          </div>
          
          <div className={styles.twoColumnInputs}>
            <OrderInput
              label="Take Profit"
              value={takeProfit}
              onChange={setTakeProfit}
              suffix={quoteAsset}
              placeholder="—"
            />
            <OrderInput
              label="Stop Loss"
              value={stopLoss}
              onChange={setStopLoss}
              suffix={quoteAsset}
              placeholder="—"
            />
          </div>
          
          <div className={styles.orderSummary}>
            <div className={styles.summaryRow}>
              <span>Total:</span>
              <span className={styles.summaryValue}>{total} {quoteAsset}</span>
            </div>
            <div className={styles.summaryRow}>
              <span>Available:</span>
              <span className={styles.summaryValue}>{availableBalance}</span>
            </div>
          </div>
          
          <div className={styles.sideToggle}>
            <button
              className={`${styles.sideBtn} ${side === 'buy' ? styles.active : ''}`}
              onClick={() => setSide('buy')}
            >
              BUY
            </button>
            <button
              className={`${styles.sideBtn} ${side === 'sell' ? styles.active : ''}`}
              onClick={() => setSide('sell')}
            >
              SELL
            </button>
          </div>
          
          <button
            className={`btn ${styles.submitBtn} ${side === 'buy' ? styles.buySubmit : styles.sellSubmit}`}
            onClick={handleSubmitOrder}
            disabled={isSubmitDisabled}
          >
            {side === 'buy' ? 'BUY' : 'SELL'} {baseAsset}
          </button>
        </div>
      )}
      
      {/* Pending Order Entry */}
      {orderType === 'pending' && (
        <div className={styles.orderSection}>
          <div className={styles.pendingTypeToggle}>
            <button
              className={`${styles.pendingTypeBtn} ${pendingType === 'stop' ? styles.active : ''}`}
              onClick={() => setPendingType('stop')}
            >
              Stop Order
            </button>
            <button
              className={`${styles.pendingTypeBtn} ${pendingType === 'limit' ? styles.active : ''}`}
              onClick={() => setPendingType('limit')}
            >
              Limit Order
            </button>
          </div>
          
          <OrderInput
            label="Trigger Price"
            value={pendingPrice}
            onChange={setPendingPrice}
            suffix={quoteAsset}
            placeholder="0.00"
          />
          
          <OrderInput
            label="Quantity"
            value={quantity}
            onChange={setQuantity}
            suffix={baseAsset}
            placeholder="0.00"
          />
          
          <div className={styles.quickQuantityButtons}>
            <button className={styles.quickBtn} onClick={() => setQuantityPercent(25)}>25%</button>
            <button className={styles.quickBtn} onClick={() => setQuantityPercent(50)}>50%</button>
            <button className={styles.quickBtn} onClick={() => setQuantityPercent(75)}>75%</button>
            <button className={styles.quickBtn} onClick={() => setQuantityPercent(100)}>100%</button>
          </div>
          
          <div className={styles.sideToggle}>
            <button
              className={`${styles.sideBtn} ${side === 'buy' ? styles.active : ''}`}
              onClick={() => setSide('buy')}
            >
              BUY
            </button>
            <button
              className={`${styles.sideBtn} ${side === 'sell' ? styles.active : ''}`}
              onClick={() => setSide('sell')}
            >
              SELL
            </button>
          </div>
          
          <button
            className={`btn ${styles.submitBtn} ${side === 'buy' ? styles.buySubmit : styles.sellSubmit}`}
            onClick={handleSubmitPendingOrder}
            disabled={isPendingDisabled}
          >
            CREATE PENDING {pendingType === 'stop' ? 'STOP' : 'LIMIT'}
          </button>
        </div>
      )}
      
      {/* Open Orders List */}
      {openOrders.length > 0 && (
        <div className={styles.openOrdersSection}>
          <div className={styles.sectionTitle}>Open Orders</div>
          <div className={styles.ordersList}>
            {openOrders.map((order) => (
              <div key={order.clientOrderId} className={styles.orderItem}>
                <div className={styles.orderItemTop}>
                  <span className={`${styles.orderSide} ${styles[order.side]}`}>
                    {order.side.toUpperCase()}
                  </span>
                  <span className={styles.orderQty}>{parseFloat(order.quantity).toFixed(6)} {baseAsset}</span>
                  <button
                    className={styles.cancelOrderBtn}
                    onClick={() => {
                      if (cancelOrder(order.clientOrderId)) {
                        toast.success('Order cancelled');
                      }
                    }}
                  >
                    ✕
                  </button>
                </div>
                <div className={styles.orderItemBottom}>
                  <span className={styles.orderType}>{order.type.toUpperCase()}</span>
                  {order.type === 'limit' && (
                    <span className={styles.orderPrice}>{order.price} {quoteAsset}</span>
                  )}
                  {(order.type === 'stop_limit' || order.type === 'take_profit_limit') && order.triggerPrice && (
                    <span className={styles.orderPrice}>
                      {order.type === 'stop_limit' ? 'Stop' : 'TP'} @ {order.triggerPrice}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
