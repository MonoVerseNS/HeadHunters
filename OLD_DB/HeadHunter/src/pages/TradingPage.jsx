import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { FiTrendingUp, FiTrendingDown, FiActivity, FiClock } from 'react-icons/fi'
import { useWallet } from '../context/WalletContext'
import { useToast } from '../components/UI/Toast'
import { CONFIG } from '../config'

// Mini price chart on canvas
function PriceChart({ data }) {
    const canvasRef = useRef(null)

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas || data.length < 2) return
        const ctx = canvas.getContext('2d')
        const dpr = window.devicePixelRatio || 1
        const rect = canvas.getBoundingClientRect()
        canvas.width = rect.width * dpr
        canvas.height = rect.height * dpr
        ctx.scale(dpr, dpr)
        const w = rect.width
        const h = rect.height

        ctx.clearRect(0, 0, w, h)

        const min = Math.min(...data)
        const max = Math.max(...data)
        const range = max - min || 1
        const stepX = w / (data.length - 1)

        // Grid lines
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.06)'
        ctx.lineWidth = 1
        for (let i = 0; i < 5; i++) {
            const y = (h / 5) * i
            ctx.beginPath()
            ctx.moveTo(0, y)
            ctx.lineTo(w, y)
            ctx.stroke()
        }

        // Price line
        const isUp = data[data.length - 1] >= data[0]
        const lineColor = isUp ? '#10b981' : '#ef4444'
        const gradColor = isUp ? 'rgba(16, 185, 129,' : 'rgba(239, 68, 68,'

        ctx.beginPath()
        data.forEach((val, i) => {
            const x = i * stepX
            const y = h - ((val - min) / range) * (h * 0.85) - h * 0.075
            if (i === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
        })
        ctx.strokeStyle = lineColor
        ctx.lineWidth = 2.5
        ctx.lineJoin = 'round'
        ctx.stroke()

        // Gradient fill
        const lastX = (data.length - 1) * stepX
        ctx.lineTo(lastX, h)
        ctx.lineTo(0, h)
        ctx.closePath()
        const gradient = ctx.createLinearGradient(0, 0, 0, h)
        gradient.addColorStop(0, `${gradColor} 0.25)`)
        gradient.addColorStop(1, `${gradColor} 0)`)
        ctx.fillStyle = gradient
        ctx.fill()

        // Current price dot
        const lastY = h - ((data[data.length - 1] - min) / range) * (h * 0.85) - h * 0.075
        ctx.beginPath()
        ctx.arc(lastX, lastY, 4, 0, Math.PI * 2)
        ctx.fillStyle = lineColor
        ctx.fill()
        ctx.beginPath()
        ctx.arc(lastX, lastY, 8, 0, Math.PI * 2)
        ctx.fillStyle = `${gradColor} 0.3)`
        ctx.fill()
    }, [data])

    return <canvas ref={canvasRef} className="chart-canvas" style={{ width: '100%', height: '100%' }} />
}

// Order Book Component
function OrderBook({ currentPrice }) {
    const [orders, setOrders] = useState({ bids: [], asks: [] })

    useEffect(() => {
        const generateOrders = () => {
            const bids = Array.from({ length: 8 }, (_, i) => ({
                price: (currentPrice - (i + 1) * 0.00005).toFixed(5),
                amount: Math.floor(Math.random() * 500000 + 50000),
                total: 0
            }))
            const asks = Array.from({ length: 8 }, (_, i) => ({
                price: (currentPrice + (i + 1) * 0.00005).toFixed(5),
                amount: Math.floor(Math.random() * 500000 + 50000),
                total: 0
            }))
            bids.forEach((b, i) => b.total = bids.slice(0, i + 1).reduce((s, x) => s + x.amount, 0))
            asks.forEach((a, i) => a.total = asks.slice(0, i + 1).reduce((s, x) => s + x.amount, 0))
            setOrders({ bids, asks: asks.reverse() })
        }
        generateOrders()
        const interval = setInterval(generateOrders, CONFIG.intervals.tradingOrders)
        return () => clearInterval(interval)
    }, [currentPrice])

    const maxTotal = Math.max(
        ...orders.bids.map(b => b.total),
        ...orders.asks.map(a => a.total),
        1
    )

    return (
        <div>
            <div style={{ fontSize: 'var(--font-size-xs)', display: 'flex', justifyContent: 'space-between', padding: '0 var(--space-sm)', marginBottom: 'var(--space-sm)', color: 'var(--color-text-muted)' }}>
                <span>Цена</span>
                <span>Объём (HH)</span>
            </div>
            {/* Asks (sells) */}
            {orders.asks.map((order, i) => (
                <div key={`ask-${i}`} className="order-row sell-row">
                    <div className="bar" style={{ width: `${(order.total / maxTotal) * 100}%` }} />
                    <span className="price">{order.price}</span>
                    <span>{order.amount.toLocaleString()}</span>
                </div>
            ))}
            {/* Spread */}
            <div style={{
                padding: 'var(--space-sm)',
                textAlign: 'center',
                fontSize: 'var(--font-size-lg)',
                fontWeight: 700,
                color: 'var(--color-text-primary)',
                borderTop: '1px solid var(--color-border)',
                borderBottom: '1px solid var(--color-border)',
                margin: 'var(--space-xs) 0'
            }}>
                ${currentPrice.toFixed(4)}
            </div>
            {/* Bids (buys) */}
            {orders.bids.map((order, i) => (
                <div key={`bid-${i}`} className="order-row buy-row">
                    <div className="bar" style={{ width: `${(order.total / maxTotal) * 100}%` }} />
                    <span className="price">{order.price}</span>
                    <span>{order.amount.toLocaleString()}</span>
                </div>
            ))}
        </div>
    )
}

// Recent Trades
function RecentTrades({ currentPrice }) {
    const [trades, setTrades] = useState([])

    useEffect(() => {
        const generateTrade = () => {
            const isBuy = Math.random() > 0.45
            return {
                id: Date.now() + Math.random(),
                side: isBuy ? 'buy' : 'sell',
                price: (currentPrice + (Math.random() - 0.5) * 0.0003).toFixed(5),
                amount: Math.floor(Math.random() * 100000 + 1000),
                time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            }
        }

        setTrades(Array.from({ length: 15 }, generateTrade))

        const interval = setInterval(() => {
            setTrades(prev => [generateTrade(), ...prev.slice(0, 14)])
        }, CONFIG.intervals.tradingTicker)
        return () => clearInterval(interval)
    }, [currentPrice])

    return (
        <div>
            <div style={{ fontSize: 'var(--font-size-xs)', display: 'flex', justifyContent: 'space-between', padding: '0 var(--space-sm) var(--space-sm)', color: 'var(--color-text-muted)' }}>
                <span>Цена</span>
                <span>Объём</span>
                <span>Время</span>
            </div>
            {trades.map(trade => (
                <div key={trade.id} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '3px var(--space-sm)',
                    fontSize: 'var(--font-size-xs)',
                    transition: 'background 0.2s'
                }}>
                    <span style={{ color: trade.side === 'buy' ? 'var(--color-success)' : 'var(--color-danger)' }}>
                        {trade.price}
                    </span>
                    <span>{trade.amount.toLocaleString()}</span>
                    <span style={{ color: 'var(--color-text-muted)' }}>{trade.time}</span>
                </div>
            ))}
        </div>
    )
}

export default function TradingPage() {
    const { balances, buyCoin, sellCoin } = useWallet()
    const { addToast } = useToast()
    const [tradeTab, setTradeTab] = useState('buy')
    const [amount, setAmount] = useState('')
    const [priceHistory, setPriceHistory] = useState([])
    const [currentPrice, setCurrentPrice] = useState(0.004)

    useEffect(() => {
        const initial = Array.from({ length: 60 }, (_, i) => {
            return 0.0035 + Math.sin(i / 8) * 0.0005 + Math.random() * 0.0003
        })
        setPriceHistory(initial)

        const interval = setInterval(() => {
            setCurrentPrice(prev => {
                const delta = (Math.random() - 0.48) * 0.00015
                const newP = Math.max(0.001, prev + delta)
                setPriceHistory(h => [...h.slice(-99), newP])
                return newP
            })
        }, CONFIG.intervals.tradingCandles)
        return () => clearInterval(interval)
    }, [])

    const handleTrade = () => {
        if (!amount || parseFloat(amount) <= 0) {
            addToast('Введите сумму', 'warning')
            return
        }
        if (tradeTab === 'buy') {
            const result = buyCoin(amount)
            if (result.success) {
                addToast(`Куплено ${result.received?.toLocaleString()} HH!`, 'success')
                setAmount('')
            } else {
                addToast(result.error || 'Ошибка', 'error')
            }
        } else {
            const result = sellCoin(amount)
            if (result.success) {
                addToast(`Продано! Получено ${result.received} TON`, 'success')
                setAmount('')
            } else {
                addToast(result.error || 'Ошибка', 'error')
            }
        }
    }

    const estimatedReceive = tradeTab === 'buy'
        ? amount ? `≈ ${Math.floor(parseFloat(amount || 0) * 250).toLocaleString()} HH` : ''
        : amount ? `≈ ${(parseFloat(amount || 0) / 250).toFixed(2)} TON` : ''

    return (
        <div className="fade-in">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Торговля <span className="gradient-text">HH</span></h1>
                    <p className="page-subtitle">Покупка и продажа HeadHunters Coin</p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'center' }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-sm)',
                        padding: 'var(--space-sm) var(--space-md)',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--color-bg-card)',
                        border: '1px solid var(--color-border)'
                    }}>
                        <FiActivity style={{ color: 'var(--color-accent-light)' }} />
                        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>24ч объём:</span>
                        <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700 }}>$128,450</span>
                    </div>
                </div>
            </div>

            <div className="trading-layout">
                {/* Chart */}
                <div className="trading-chart-area">
                    <motion.div
                        className="chart-container glass"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                    >
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 'var(--space-md)'
                        }}>
                            <div>
                                <span style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800 }}>
                                    ${currentPrice.toFixed(4)}
                                </span>
                                <span style={{
                                    marginLeft: 'var(--space-sm)',
                                    fontSize: 'var(--font-size-sm)',
                                    color: currentPrice >= 0.004 ? 'var(--color-success)' : 'var(--color-danger)',
                                    fontWeight: 600
                                }}>
                                    {currentPrice >= 0.004 ? '↑' : '↓'}
                                    {Math.abs(((currentPrice - 0.004) / 0.004) * 100).toFixed(1)}%
                                </span>
                            </div>
                            <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                                {['1Ч', '4Ч', '1Д', '1Н'].map(tf => (
                                    <button key={tf} className="btn btn-ghost btn-sm" style={{
                                        padding: '4px 10px',
                                        background: tf === '1Ч' ? 'rgba(124,58,237,0.15)' : undefined,
                                        color: tf === '1Ч' ? 'var(--color-accent-light)' : undefined
                                    }}>{tf}</button>
                                ))}
                            </div>
                        </div>
                        <div style={{ height: 'calc(100% - 60px)' }}>
                            <PriceChart data={priceHistory} />
                        </div>
                    </motion.div>

                    {/* Recent Trades below chart */}
                    <motion.div
                        className="section-card glass"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        style={{ marginTop: 'var(--space-lg)' }}
                    >
                        <div className="section-card-header">
                            <h3 className="section-card-title"><FiClock style={{ marginRight: '0.5rem' }} /> Последние сделки</h3>
                        </div>
                        <RecentTrades currentPrice={currentPrice} />
                    </motion.div>
                </div>

                {/* Trade Panel */}
                <motion.div
                    className="trading-panel section-card glass"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    <div className="trade-tabs">
                        <button
                            className={`trade-tab buy ${tradeTab === 'buy' ? 'active' : ''}`}
                            onClick={() => { setTradeTab('buy'); setAmount('') }}
                        >
                            <FiTrendingUp style={{ marginRight: 4 }} /> Купить
                        </button>
                        <button
                            className={`trade-tab sell ${tradeTab === 'sell' ? 'active' : ''}`}
                            onClick={() => { setTradeTab('sell'); setAmount('') }}
                        >
                            <FiTrendingDown style={{ marginRight: 4 }} /> Продать
                        </button>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-sm)' }}>
                        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                            Доступно:
                        </span>
                        <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>
                            {tradeTab === 'buy'
                                ? `${balances.TON.toFixed(2)} TON`
                                : `${balances.HH.toLocaleString()} HH`
                            }
                        </span>
                    </div>

                    <div className="input-group" style={{ marginBottom: 'var(--space-md)' }}>
                        <label>{tradeTab === 'buy' ? 'Сумма (TON)' : 'Количество (HH)'}</label>
                        <input
                            className="input"
                            type="number"
                            placeholder={tradeTab === 'buy' ? '0.00 TON' : '0 HH'}
                            value={amount}
                            onChange={e => setAmount(e.target.value)}
                            min="0"
                            step={tradeTab === 'buy' ? '0.01' : '1'}
                        />
                    </div>

                    {/* Quick amounts */}
                    <div style={{ display: 'flex', gap: 'var(--space-xs)', marginBottom: 'var(--space-md)' }}>
                        {(tradeTab === 'buy' ? [10, 25, 50, 100] : [1000, 5000, 10000, 20000]).map(val => (
                            <button
                                key={val}
                                className="btn btn-ghost btn-sm"
                                style={{ flex: 1, fontSize: 'var(--font-size-xs)', padding: '4px' }}
                                onClick={() => setAmount(String(val))}
                            >
                                {val.toLocaleString()}
                            </button>
                        ))}
                    </div>

                    {estimatedReceive && (
                        <div style={{
                            padding: 'var(--space-sm) var(--space-md)',
                            background: 'var(--color-bg-input)',
                            borderRadius: 'var(--radius-md)',
                            fontSize: 'var(--font-size-sm)',
                            marginBottom: 'var(--space-md)',
                            display: 'flex',
                            justifyContent: 'space-between'
                        }}>
                            <span style={{ color: 'var(--color-text-muted)' }}>Вы получите:</span>
                            <span style={{ fontWeight: 600, color: 'var(--color-accent-light)' }}>{estimatedReceive}</span>
                        </div>
                    )}

                    <div style={{
                        padding: 'var(--space-sm) var(--space-md)',
                        background: 'var(--color-bg-input)',
                        borderRadius: 'var(--radius-md)',
                        fontSize: 'var(--font-size-xs)',
                        marginBottom: 'var(--space-lg)',
                        color: 'var(--color-text-muted)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span>Курс</span>
                            <span>1 TON = 250 HH</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Комиссия</span>
                            <span style={{ color: 'var(--color-success)' }}>0%</span>
                        </div>
                    </div>

                    <button
                        className={`btn ${tradeTab === 'buy' ? 'btn-success' : 'btn-danger'} btn-lg`}
                        style={{ width: '100%' }}
                        onClick={handleTrade}
                    >
                        {tradeTab === 'buy' ? 'Купить HH' : 'Продать HH'}
                    </button>
                </motion.div>

                {/* Order Book */}
                <motion.div
                    className="trading-orderbook section-card glass"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                >
                    <div className="section-card-header">
                        <h3 className="section-card-title">Книга ордеров</h3>
                    </div>
                    <OrderBook currentPrice={currentPrice} />
                </motion.div>
            </div>
        </div>
    )
}
