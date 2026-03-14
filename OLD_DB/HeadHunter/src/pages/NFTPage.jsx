import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { FiClock, FiPlus, FiBell, FiFilter, FiTrendingUp, FiTrendingDown } from 'react-icons/fi'
import { useWallet } from '../context/WalletContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/UI/Toast'
import Modal from '../components/UI/Modal'
import GiftCard from '../components/UI/GiftCard'
import GiftDetailModal from '../components/UI/GiftDetailModal'
import { CONFIG } from '../config'

const MIN_BID = CONFIG.nft.minBid
const BID_STEP = CONFIG.nft.bidStep || 1

// ── Pattern lookup tables (must match WalletPage) ──
const CSS_PATTERNS = [
    { id: 'dots', name: 'Точки', css: 'radial-gradient(circle, currentColor 1px, transparent 1px)', bgSize: '16px 16px' },
    { id: 'stripes', name: 'Полосы', css: 'repeating-linear-gradient(45deg, transparent, transparent 8px, currentColor 8px, currentColor 9px)', bgSize: null },
    { id: 'grid', name: 'Сетка', css: 'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)', bgSize: '20px 20px' },
    { id: 'diamonds', name: 'Ромбы', css: 'linear-gradient(45deg, currentColor 25%, transparent 25%), linear-gradient(-45deg, currentColor 25%, transparent 25%), linear-gradient(45deg, transparent 75%, currentColor 75%), linear-gradient(-45deg, transparent 75%, currentColor 75%)', bgSize: '20px 20px' },
    { id: 'waves', name: 'Волны', css: 'repeating-linear-gradient(135deg, transparent 0px, transparent 6px, currentColor 6px, currentColor 7px, transparent 7px, transparent 13px)', bgSize: null },
    { id: 'zigzag', name: 'Зигзаг', css: 'linear-gradient(135deg, currentColor 25%, transparent 25%) -10px 0, linear-gradient(225deg, currentColor 25%, transparent 25%) -10px 0, linear-gradient(315deg, currentColor 25%, transparent 25%), linear-gradient(45deg, currentColor 25%, transparent 25%)', bgSize: '20px 20px' },
]

const patternFiles = import.meta.glob('/patterns/*.{png,svg,webp,jpg}', { eager: true, query: '?url', import: 'default' })
const USER_PATTERNS = Object.entries(patternFiles).map(([path, url]) => ({
    id: 'file_' + path.split('/').pop().replace(/\.[^.]+$/, ''),
    name: path.split('/').pop().replace(/\.[^.]+$/, ''),
    url,
}))

function resolveUpgradeStyle(upgrade) {
    if (!upgrade) return {}
    const style = { background: upgrade.bgColor || '#7c3aed' }
    if (upgrade.pattern) {
        const cssP = CSS_PATTERNS.find(p => p.id === upgrade.pattern)
        const fileP = USER_PATTERNS.find(p => p.id === upgrade.pattern)
        if (cssP) {
            style.backgroundImage = cssP.css?.replace(/currentColor/g, 'rgba(255,255,255,0.12)')
            if (cssP.bgSize) style.backgroundSize = cssP.bgSize
        } else if (fileP) {
            style.backgroundImage = `url(${fileP.url})`
            style.backgroundSize = '64px 64px'
            style.backgroundRepeat = 'repeat'
        }
    }
    return style
}

function formatTime(ms) {
    if (ms <= 0) return 'Завершён'
    const d = Math.floor(ms / 86400000)
    const h = Math.floor((ms % 86400000) / 3600000)
    const m = Math.floor((ms % 3600000) / 60000)
    const s = Math.floor((ms % 60000) / 1000)

    if (d > 0) return `${d}д ${h}ч`
    if (h > 0) return `${h}ч ${m}м`
    if (m > 0) return `${m}м ${s}с`
    return `${s}с`
}

// ═══════════════════════════════════
// ── Карточка аукциона ──
// ═══════════════════════════════════
function AuctionCard({ auction, onBid, onClaim, onActivate, onCancel, onCancelSale, onBuyNow, onDetail, userId }) {
    const [timeLeft, setTimeLeft] = useState('')
    const [isExpired, setIsExpired] = useState(false)

    useEffect(() => {
        const tick = () => {
            if (auction.isDirectSale) {
                setTimeLeft('Бессрочно')
                setIsExpired(false)
                return
            }
            const left = auction.endsAt - Date.now()
            setIsExpired(left <= 0)
            setTimeLeft(formatTime(left))
        }
        tick()
        const iv = setInterval(tick, 1000)
        return () => clearInterval(iv)
    }, [auction.endsAt, auction.isDirectSale])

    const isWinner = isExpired && auction.currentBidderId === userId
    const isCreator = auction.creatorId === userId
    const isTopBidder = auction.currentBidderId === userId && !isExpired
    const hasBids = auction.bids?.length > 0
    const isDirectSale = auction.isDirectSale

    // Styles for upgrade
    const getCardStyle = () => {
        const baseStyle = {
            display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
        }

        if (auction.upgrade) {
            Object.assign(baseStyle, resolveUpgradeStyle(auction.upgrade))
        } else {
            baseStyle.background = 'linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(220, 38, 38, 0.2))'
        }
        return baseStyle
    }

    return (
        <div className="nft-card glass nft-card-hover"
        >
            <div className="nft-card-image" style={getCardStyle()}>
                {auction.image ? (
                    <img src={auction.image} alt={auction.name}
                        style={{
                            width: '130px',
                            height: '130px',
                            objectFit: 'cover',
                            borderRadius: auction.upgrade ? 'var(--radius-md)' : 'var(--radius-md)',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                        }} />
                ) : (
                    <div style={{ fontSize: '3.5rem' }}>{auction.emoji || '🖼️'}</div>
                )}

                {/* Timer badge */}
                {!isDirectSale && (
                    <div style={{
                        position: 'absolute', top: '8px', right: '8px',
                        background: isExpired ? 'rgba(220,38,38,0.9)' : 'rgba(0,0,0,0.7)',
                        color: 'white', padding: '3px 10px', borderRadius: 'var(--radius-sm)',
                        fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px',
                    }}>
                        <FiClock size={12} /> {timeLeft}
                    </div>
                )}
                {auction.isGif && (
                    <div style={{ position: 'absolute', top: '8px', left: '8px', background: 'var(--color-accent)', color: 'white', padding: '2px 8px', borderRadius: 'var(--radius-sm)', fontSize: '10px', fontWeight: 700 }}>GIF</div>
                )}
                {isDirectSale && (
                    <div style={{ position: 'absolute', top: '8px', right: '8px', background: 'var(--color-success)', color: 'white', padding: '2px 8px', borderRadius: 'var(--radius-sm)', fontSize: '10px', fontWeight: 700 }}>SALE</div>
                )}
                {auction.upgrade && (
                    <div style={{ position: 'absolute', bottom: '8px', left: '8px', background: 'rgba(255,215,0,0.9)', color: '#000', padding: '2px 8px', borderRadius: 'var(--radius-sm)', fontSize: '10px', fontWeight: 700 }}>✨</div>
                )}
                {(auction.buyNowPrice || isDirectSale) && !isExpired && (
                    <div style={{
                        position: 'absolute', bottom: '8px', right: '8px',
                        background: 'rgba(5,150,105,0.9)', color: 'white',
                        padding: '3px 10px', borderRadius: 'var(--radius-sm)',
                        fontSize: '11px', fontWeight: 700,
                    }}>💰 {auction.buyNowPrice || auction.startPrice} HH</div>
                )}
            </div>

            <div className="nft-card-body">
                <h3 className="nft-card-title">{auction.name}</h3>
                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                    {auction.creatorInitials}
                </p>
                {auction.collectionName && (
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginBottom: 'var(--space-sm)', flexWrap: 'wrap' }}>
                        <span style={{
                            fontSize: '10px', fontWeight: 600,
                            padding: '2px 8px', borderRadius: 'var(--radius-sm)',
                            background: 'rgba(239, 68, 68, 0.12)', color: 'var(--color-accent-light)',
                        }}>{auction.collectionName}</span>
                        {auction.color && !auction.color.startsWith('#') && (
                            <span style={{
                                fontSize: '10px', fontWeight: 600,
                                padding: '2px 8px', borderRadius: 'var(--radius-sm)',
                                background: 'rgba(255, 255, 255, 0.08)', color: 'var(--color-text-muted)',
                            }}>{auction.color}</span>
                        )}
                    </div>
                )}

                {!isDirectSale && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-sm)' }}>
                        <div>
                            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Текущая ставка</div>
                            <div style={{ fontWeight: 700, color: 'var(--color-accent-light)' }}>{auction.currentBid} HH</div>
                        </div>
                        <div>
                            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textAlign: 'right' }}>Ставок</div>
                            <div style={{ fontWeight: 600, textAlign: 'right' }}>{auction.bids?.length || 0}</div>
                        </div>
                    </div>
                )}

                <div className="nft-card-footer" style={{ flexDirection: 'column', gap: '6px', marginTop: isDirectSale ? 'auto' : 0 }}>
                    {isExpired ? (
                        isWinner ? (
                            <div style={{ display: 'flex', gap: '6px', width: '100%' }}>
                                {!auction.onChainIndex ? (
                                    <button className="btn btn-success btn-sm" style={{ flex: 1, padding: '0 4px', fontSize: '11px' }} onClick={() => onActivate(auction)}>🔗 Активировать</button>
                                ) : (
                                    <button className="btn btn-primary btn-sm" style={{ flex: 1, fontSize: '11px' }} onClick={() => onClaim(auction)}>🏆 Забрать NFT</button>
                                )}
                            </div>
                        ) : isCreator && !hasBids ? (
                            <button className="btn btn-ghost btn-sm" style={{ width: '100%' }} onClick={() => onCancel(auction)}>Снять с продажи</button>
                        ) : (
                            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textAlign: 'center' }}>Аукцион завершён</span>
                        )
                    ) : (
                        <>
                            <div style={{ display: 'flex', gap: '6px', width: '100%' }}>
                                {!isDirectSale && (
                                    <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => onBid(auction)}>
                                        🔨 Ставка
                                    </button>
                                )}
                                {(auction.buyNowPrice || isDirectSale) && (
                                    <button className="btn btn-success btn-sm" style={{ flex: 1 }} onClick={() => onBuyNow(auction)}>
                                        🛒 {auction.buyNowPrice || auction.startPrice}
                                    </button>
                                )}
                            </div>
                            {isCreator && !hasBids && (
                                <button className="btn btn-ghost btn-sm" style={{ fontSize: '10px', color: 'var(--color-danger)' }} onClick={() => onCancel(auction)}>
                                    {isDirectSale ? 'Снять с продажи' : 'Отменить аукцион'}
                                </button>
                            )}
                        </>
                    )}
                </div>
                {onDetail && (
                    <button
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: '10px', marginTop: '2px' }}
                        onClick={() => onDetail(auction)}
                    >
                        ℹ️ Подробнее
                    </button>
                )}
            </div>
        </div>
    )
}

export default function NFTPage() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const searchTerm = searchParams.get('search') || ''

    const { user, isAdmin, collections } = useAuth()
    const {
        placeBid, buyNowAuction, claimAuctionNFT, cancelAuction, refundBid, topUpBid,
        balance, addNotification, markNotificationRead, clearNotifications, notifications, allNFTs
    } = useWallet()
    const { addToast } = useToast()

    const [activeTab, setActiveTab] = useState('sales') // 'sales' | 'auctions'
    const [auctions, setAuctions] = useState([])
    const [bidModal, setBidModal] = useState(null)
    const [bidAmount, setBidAmount] = useState('')
    const [buyConfirm, setBuyConfirm] = useState(null)
    const [filterColl, setFilterColl] = useState('')
    const [sortPrice, setSortPrice] = useState('') // '' | 'asc' | 'desc'
    const [priceMin, setPriceMin] = useState('')
    const [detailNft, setDetailNft] = useState(null)
    const [priceMax, setPriceMax] = useState('')

    const loadAuctions = useCallback(async () => {
        try {
            const res = await fetch('/api/auctions')
            if (res.ok) {
                const data = await res.json()
                // Map snake_case DB fields to camelCase for the frontend
                const mapped = data.map(a => ({
                    id: a.id,
                    nftId: a.nft_id,
                    name: a.name,
                    image: a.image,
                    emoji: a.emoji,
                    isGif: !!a.is_gif,
                    collectionName: a.collection_name,
                    color: a.color,
                    creatorId: a.creator_id,
                    creatorName: a.creator_username || a.creator_first_name || 'Аноним',
                    startPrice: a.start_price,
                    currentBid: a.current_bid,
                    currentBidderId: a.current_bidder_id,
                    currentBidderName: a.bidder_username || a.bidder_first_name || 'Аноним',
                    bidStep: a.bid_step || 1,
                    buyNowPrice: a.buy_now_price,
                    isDirectSale: !!a.is_direct_sale,
                    endsAt: a.ends_at,
                    status: a.status,
                    onChainIndex: a.on_chain_index,
                    upgrade: a.upgrade ? JSON.parse(a.upgrade) : null,
                    bids: (a.bids || []).map(b => ({
                        userId: b.user_id,
                        username: b.username || b.first_name || 'Аноним',
                        amount: b.amount,
                        at: new Date(b.created_at).getTime(),
                    })),
                }))
                setAuctions(mapped)
            }
        } catch (e) {
            console.error('[NFT] Load auctions error:', e)
        }
    }, [])

    useEffect(() => {
        loadAuctions()
        const interval = setInterval(loadAuctions, CONFIG.intervals.auctionPoll)
        return () => clearInterval(interval)
    }, [loadAuctions])

    const openBidModal = (auction) => {
        if (!user) { addToast('Войдите, чтобы делать ставки', 'error'); return }
        const step = auction.bidStep || BID_STEP
        const minBid = auction.currentBid + step
        setBidModal({ ...auction, minBid })
        setBidAmount('')
    }

    const confirmBid = async () => {
        if (!bidModal) return
        const amount = parseFloat(bidAmount)
        if (isNaN(amount) || amount < bidModal.minBid) {
            addToast(`Минимальная ставка: ${bidModal.minBid} HH`, 'error')
            return
        }

        addToast('Ожидание on-chain транзакции (~15-30 сек)...', 'info')

        try {
            const res = await fetch(`/api/auctions/${bidModal.id}/bid`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, amount })
            })
            const data = await res.json()
            if (!res.ok) {
                addToast(data.error || 'Ошибка блокчейна (возможно, нужен TON)', 'error')
                return
            }
            addToast(`Ставка ${amount} HH на "${bidModal.name}"! 🔨`, 'success')
            setBidModal(null)
            loadAuctions() // Refresh
        } catch (e) {
            addToast('Ошибка сети при транзакции', 'error')
        }
    }

    const quickBid = (add) => {
        if (!bidModal) return
        const base = Math.max(bidModal.currentBid, bidModal.minBid - 1)
        setBidAmount(String(base + add))
    }

    // ── Handle Activate ──
    const handleActivateAuction = async (auction) => {
        try {
            addToast('Активация в блокчейне... (занимает ~15 сек)', 'info')
            const resAct = await fetch(`/api/nfts/${auction.nftId}/activate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user?.id, color: auction.color })
            })
            const dataAct = await resAct.json()
            if (!resAct.ok) throw new Error(dataAct.error || 'Ошибка активации')

            addToast('Успех! NFT активирован. Теперь вы можете его забрать.', 'success')
            loadAuctions()
        } catch (e) {
            addToast(e.message, 'error')
            loadAuctions()
        }
    }

    const handleClaim = async (auction) => {
        addToast('Завершение аукциона on-chain. Ожидайте...', 'info')
        try {
            const res = await fetch(`/api/auctions/${auction.id}/claim`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id })
            })
            const data = await res.json()
            if (res.ok) {
                addToast(`NFT "${auction.name}" получен! 🎉`, 'success')
                loadAuctions()
            } else {
                addToast(data.error || 'Ошибка блокчейна', 'error')
            }
        } catch (e) {
            addToast('Ошибка сети', 'error')
        }
    }

    const handleCancel = async (auction) => {
        addToast('Отмена аукциона on-chain. Ожидайте...', 'info')
        try {
            const res = await fetch(`/api/auctions/${auction.id}/cancel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id })
            })
            const data = await res.json()
            if (res.ok) {
                addToast('Аукцион отменён', 'info')
                loadAuctions()
            } else {
                addToast(data.error || 'Ошибка блокчейна', 'error')
            }
        } catch (e) {
            addToast('Ошибка сети', 'error')
        }
    }

    const handleBuyNow = (auction) => {
        setBuyConfirm(auction)
    }
    const confirmBuyNow = async () => {
        if (!buyConfirm) return
        addToast('Покупка on-chain (~15-30 сек). Ожидайте...', 'info')
        try {
            const res = await fetch(`/api/auctions/${buyConfirm.id}/buy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id })
            })
            const data = await res.json()
            if (res.ok) {
                addToast(`Куплено "${buyConfirm.name}" за ${buyConfirm.buyNowPrice || buyConfirm.startPrice} HH!`, 'success')
                loadAuctions()
            } else {
                addToast(data.error || 'Ошибка блокчейна (нужен TON для газа?)', 'error')
            }
        } catch (e) {
            addToast('Ошибка сети', 'error')
        }
        setBuyConfirm(null)
    }

    const handleActivate = async (nft) => {
        if (!user) return
        if (balance < 100) {
            addToast('Недостаточно HH для активации. Нужно 100 HH.', 'error')
            return
        }

        addToast('Активация NFT... Это займёт 15-30 сек.', 'info')
        try {
            const res = await fetch(`/api/nfts/${nft.id}/activate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, color: arguments[1] || nft.color })
            })
            const data = await res.json()
            if (res.ok) {
                addToast('NFT успешно активирован в блокчейне! 🔗', 'success')
                loadAuctions()
                // Update detail modal state if currently open
                setDetailNft(prev => prev ? { ...prev, on_chain_index: data.onChainIndex } : null)
            } else {
                addToast(data.error || 'Ошибка активации', 'error')
            }
        } catch (e) {
            addToast('Ошибка сети', 'error')
        }
    }

    // ── Helper: apply price filters + sort ──
    const applyPriceFilter = (items, priceKey) => {
        let result = [...items]
        const min = parseFloat(priceMin)
        const max = parseFloat(priceMax)
        if (!isNaN(min)) result = result.filter(i => (i[priceKey] || 0) >= min)
        if (!isNaN(max)) result = result.filter(i => (i[priceKey] || 0) <= max)
        if (sortPrice === 'asc') result.sort((a, b) => (a[priceKey] || 0) - (b[priceKey] || 0))
        if (sortPrice === 'desc') result.sort((a, b) => (b[priceKey] || 0) - (a[priceKey] || 0))
        return result
    }

    // ── Separate auctions from direct sales ──
    const allListings = auctions.filter(a => {
        const matchesColl = !filterColl || a.collectionId === filterColl
        const matchesSearch = !searchTerm || a.name.toLowerCase().includes(searchTerm.toLowerCase())

        // Filter Banned/Hidden NFTs
        const nft = allNFTs?.find(n => n.id === (a.nftId || a.id))
        const isHidden = nft?.status === 'hidden'
        const isMyNFT = nft?.ownerId === user?.id || a.creatorId === user?.id
        if (isHidden && !isMyNFT) return false

        return matchesColl && matchesSearch
    })

    const filteredSales = applyPriceFilter(
        allListings.filter(a => a.isDirectSale),
        'startPrice'
    )
    const filteredAuctions = applyPriceFilter(
        allListings.filter(a => !a.isDirectSale),
        'currentBid'
    )



    return (
        <div className="fade-in">
            <div className="page-header" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <h1 className="page-title">NFT <span className="gradient-text">Market</span></h1>
                    <p className="page-subtitle">
                        {searchTerm ? `Результаты поиска: "${searchTerm}"` : 'Прямые продажи и аукционы'}
                    </p>
                </div>
                <button className="btn btn-primary" onClick={() => navigate('/nft/create')}>
                    <FiPlus /> Создать
                </button>
            </div>

            {/* ── Tabs ── */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: 'var(--space-md)' }}>
                <button className={activeTab === 'sales' ? 'btn btn-primary' : 'btn btn-ghost'} onClick={() => setActiveTab('sales')}>
                    💰 Продажи ({filteredSales.length})
                </button>
                <button className={activeTab === 'auctions' ? 'btn btn-primary' : 'btn btn-ghost'} onClick={() => setActiveTab('auctions')}>
                    🔨 Аукционы ({filteredAuctions.length})
                </button>
            </div>

            {/* ── Filters Bar ── */}
            <div className="glass" style={{ padding: '12px 16px', marginBottom: 'var(--space-lg)', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <FiFilter style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                <select className="input" style={{ padding: '6px 12px', fontSize: '12px', minWidth: '140px', flex: '0 0 auto' }}
                    value={filterColl} onChange={e => setFilterColl(e.target.value)}>
                    <option value="">Все коллекции</option>
                    {collections.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
                </select>
                <select className="input" style={{ padding: '6px 12px', fontSize: '12px', minWidth: '130px', flex: '0 0 auto' }}
                    value={sortPrice} onChange={e => setSortPrice(e.target.value)}>
                    <option value="">Сортировка</option>
                    <option value="asc">↑ Цена: по возр.</option>
                    <option value="desc">↓ Цена: по убыв.</option>
                </select>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input className="input" type="number" placeholder="От" value={priceMin} onChange={e => setPriceMin(e.target.value)}
                        style={{ padding: '6px 8px', fontSize: '12px', width: '70px' }} />
                    <span style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>—</span>
                    <input className="input" type="number" placeholder="До" value={priceMax} onChange={e => setPriceMax(e.target.value)}
                        style={{ padding: '6px 8px', fontSize: '12px', width: '70px' }} />
                    <span style={{ color: 'var(--color-text-muted)', fontSize: '11px' }}>HH</span>
                </div>
                {(filterColl || sortPrice || priceMin || priceMax) && (
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: '10px' }}
                        onClick={() => { setFilterColl(''); setSortPrice(''); setPriceMin(''); setPriceMax('') }}>
                        ✕ Сбросить
                    </button>
                )}
            </div>

            <AnimatePresence mode="wait">


                {/* ── Direct Sales Tab ── */}
                {activeTab === 'sales' && (
                    <motion.div key="sales" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                        {filteredSales.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '60px', color: 'var(--color-text-muted)' }}>
                                <p style={{ fontSize: '3rem', marginBottom: 'var(--space-md)' }}>💰</p>
                                <p>Нет прямых продаж. Выставьте свой NFT в профиле!</p>
                            </div>
                        ) : (
                            <div className="nft-grid">
                                {filteredSales.map(auction => (
                                    <AuctionCard
                                        key={auction.id}
                                        auction={auction}
                                        userId={user?.id}
                                        onBid={openBidModal}
                                        onClaim={handleClaim}
                                        onActivate={handleActivateAuction}
                                        onCancel={handleCancel}
                                        onBuyNow={handleBuyNow}
                                        onDetail={(auc) => setDetailNft({
                                            id: auc.nftId || auc.id, name: auc.name, image: auc.image,
                                            emoji: auc.emoji, isGif: auc.isGif, upgrade: auc.upgrade,
                                            collectionId: auc.collectionId, collectionName: auc.collectionName,
                                            ownerId: auc.creatorId, status: 'auction',
                                        })}
                                    />
                                ))}
                            </div>
                        )}
                    </motion.div>
                )}

                {/* ── Auctions Tab ── */}
                {activeTab === 'auctions' && (
                    <motion.div key="auctions" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                        {filteredAuctions.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '60px', color: 'var(--color-text-muted)' }}>
                                <p style={{ fontSize: '3rem', marginBottom: 'var(--space-md)' }}>🔨</p>
                                <p>{searchTerm ? 'Ничего не найдено' : 'Аукционов пока нет. Создайте первый!'}</p>
                            </div>
                        ) : (
                            <div className="nft-grid">
                                {filteredAuctions.map(auction => (
                                    <AuctionCard
                                        key={auction.id}
                                        auction={auction}
                                        userId={user?.id}
                                        onBid={openBidModal}
                                        onClaim={handleClaim}
                                        onActivate={handleActivateAuction}
                                        onCancel={handleCancel}
                                        onBuyNow={handleBuyNow}
                                        onDetail={(auc) => setDetailNft({
                                            id: auc.nftId || auc.id, name: auc.name, image: auc.image,
                                            emoji: auc.emoji, isGif: auc.isGif, upgrade: auc.upgrade,
                                            collectionId: auc.collectionId, collectionName: auc.collectionName,
                                            ownerId: auc.creatorId, status: 'auction',
                                        })}
                                    />
                                ))}
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            <Modal isOpen={!!bidModal} onClose={() => setBidModal(null)} title={`Ставка на "${bidModal?.name}"`}
                footer={<>
                    <button className="btn btn-ghost" onClick={() => setBidModal(null)}>Отмена</button>
                    <button className="btn btn-primary" onClick={confirmBid}>Подтвердить</button>
                </>}>
                {bidModal && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                            <span>Текущая ставка:</span>
                            <span style={{ fontWeight: 700, color: 'var(--color-accent-light)' }}>{bidModal.currentBid} HH</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                            <span>Мин. ставка:</span>
                            <span style={{ fontWeight: 700 }}>{bidModal.minBid} HH</span>
                        </div>
                        <div className="input-group">
                            <label>Ваша ставка</label>
                            <input className="input" type="number" placeholder={`Мин. ${bidModal.minBid}`} value={bidAmount} onChange={e => setBidAmount(e.target.value)} autoFocus />
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {[5, 10, 25, 50].map(add => (
                                <button key={add} className="btn btn-ghost btn-sm" onClick={() => quickBid(add)}>+{add}</button>
                            ))}
                        </div>
                        {bidModal.bids && bidModal.bids.length > 0 && (
                            <div style={{ marginTop: '8px', padding: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-md)' }}>
                                <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '6px' }}>ИСТОРИЯ СТАВОК</div>
                                {bidModal.bids.slice(-5).reverse().map((bid, i) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '2px' }}>
                                        <span style={{ color: bid.userId === user?.id ? 'var(--color-success)' : 'var(--color-text-secondary)' }}>{bid.username}</span>
                                        <span style={{ fontWeight: 600 }}>{bid.amount} HH</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                            Ваш баланс: <span style={{ color: balance >= (parseFloat(bidAmount) || 0) ? 'var(--color-success)' : 'var(--color-danger)' }}>{balance} HH</span>
                        </div>
                    </div>
                )}
            </Modal>

            <Modal isOpen={!!buyConfirm} onClose={() => setBuyConfirm(null)} title="Купить сейчас?"
                footer={<>
                    <button className="btn btn-ghost" onClick={() => setBuyConfirm(null)}>Отмена</button>
                    <button className="btn btn-success" onClick={confirmBuyNow}>Купить за {buyConfirm?.buyNowPrice || buyConfirm?.startPrice} HH</button>
                </>}>
                {buyConfirm && (
                    <div style={{ textAlign: 'center', padding: 'var(--space-md)' }}>
                        <p>Вы собираетесь купить <strong>{buyConfirm.name}</strong> моментально.</p>
                        <p style={{ marginTop: '8px' }}>Цена: <strong style={{ color: 'var(--color-success)' }}>{buyConfirm.buyNowPrice || buyConfirm.startPrice} HH</strong></p>
                    </div>
                )}
            </Modal>



            {/* ── Detail Modal ── */}
            <GiftDetailModal nft={detailNft} allNFTs={allNFTs} onClose={() => setDetailNft(null)} onActivate={handleActivate} />
        </div>
    )
}
