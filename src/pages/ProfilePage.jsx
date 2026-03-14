import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FiCreditCard, FiArrowUpRight, FiArrowDownLeft, FiImage, FiSettings, FiActivity, FiEdit2, FiUser, FiGlobe, FiLink, FiCopy, FiCheck } from 'react-icons/fi'
import { QRCodeSVG } from 'qrcode.react'
import { useWallet } from '../context/WalletContext'
import { useTonWalletContext } from '../blockchain/TonWalletContext'
import { validateTonAddress } from '../blockchain/addressValidator'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/UI/Toast'
import Modal from '../components/UI/Modal'
import GiftCard from '../components/UI/GiftCard'
import GiftDetailModal from '../components/UI/GiftDetailModal'
import UserAvatar from '../components/UI/UserAvatar'
import { CONFIG, generateId } from '../config'
import { logger } from '../api/logger'



import { toUserFriendlyAddress } from '../utils/ton'

export default function ProfilePage() {
    const { user, updateUserProfile, fetchWithAuth } = useAuth()
    const {
        balance, transactions, ownedNFTs, allNFTs,
        startAuction, cancelAuction, removeOwnedNFT, returnNFTToOwner,
        transferNFT, withdrawNFT, refreshNFTs
    } = useWallet()
    const { addToast } = useToast()

    const [activeTab, setActiveTab] = useState('nfts') // 'nfts' | 'auctions' | 'wallet'

    // My Auctions logic
    const [myAuctions, setMyAuctions] = useState([])
    const [isLoadingAuctions, setIsLoadingAuctions] = useState(false)

    const loadMyAuctions = useCallback(async () => {
        if (!user?.id) return
        setIsLoadingAuctions(true)
        try {
            const res = await fetchWithAuth(`/api/user/${user.id}/auctions`)
            if (res.ok) {
                const data = await res.json()
                setMyAuctions(data.map(a => ({
                    id: a.id,
                    nftId: a.nft_id,
                    name: a.name,
                    image: a.image,
                    emoji: a.emoji,
                    color: a.color,
                    creatorId: a.creator_id,
                    startPrice: a.start_price,
                    currentBid: a.current_bid,
                    currentBidderId: a.current_bidder_id,
                    endsAt: a.ends_at,
                    status: a.status,
                    bidsCount: a.bids_count || 0,
                    isDirectSale: !!a.buy_now_price && a.start_price === a.buy_now_price
                })))
            }
        } catch (e) {
            console.error('[Profile] Load auctions error:', e)
        } finally {
            setIsLoadingAuctions(false)
        }
    }, [user?.id, fetchWithAuth])

    useEffect(() => {
        loadMyAuctions()
        const iv = setInterval(loadMyAuctions, 15000)
        return () => clearInterval(iv)
    }, [loadMyAuctions])

    // Edit Profile Modal
    const [editProfileModal, setEditProfileModal] = useState(false)
    const [editDesc, setEditDesc] = useState('')

    // Detail Modal
    const [detailNft, setDetailNft] = useState(null)

    // Sell Modal
    const [sellModal, setSellModal] = useState(null) // NFT object
    const [sellMode, setSellMode] = useState('direct') // 'direct' | 'auction'

    // Sell settings
    const [sellPrice, setSellPrice] = useState('') // For direct sale
    const [startBid, setStartBid] = useState('') // For auction
    const [durationDays, setDurationDays] = useState(0)
    const [durationHours, setDurationHours] = useState(0)
    const [durationMinutes, setDurationMinutes] = useState(0)
    const [durationSeconds, setDurationSeconds] = useState(0)
    const [bidStep, setBidStep] = useState(1) // Configurable bid increment

    useEffect(() => {
        if (user) setEditDesc(user.description || '')
    }, [user])

    // ── Edit Profile ──
    const saveProfile = () => {
        updateUserProfile({ description: editDesc })
        addToast('Профиль обновлен', 'success')
        setEditProfileModal(false)
    }


    // ── Sell Logic ──
    const handleSell = async () => {
        if (!sellModal) return

        let finalStartPrice, finalBuyNowPrice, finalDuration

        if (sellMode === 'direct') {
            const price = parseFloat(sellPrice)
            if (isNaN(price) || price <= 0) { addToast('Укажите корректную цену', 'error'); return }
            finalStartPrice = price
            finalBuyNowPrice = price
            finalDuration = 10 * 365 * 24 * 60 * 60 * 1000 // 10 years
        } else {
            const bid = parseFloat(startBid)
            if (isNaN(bid) || bid <= 0) { addToast('Укажите начальную ставку', 'error'); return }
            finalStartPrice = bid
            finalBuyNowPrice = null

            const d = parseInt(durationDays) || 0
            const h = parseInt(durationHours) || 0
            const m = parseInt(durationMinutes) || 0
            const s = parseInt(durationSeconds) || 0
            finalDuration = (d * 24 * 3600000) + (h * 3600000) + (m * 60000) + (s * 1000)

            if (finalDuration < 10000) { addToast('Минимальная длительность 10 сек', 'error'); return }
        }

        try {
            const res = await fetch('/api/auctions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.id,
                    nftId: sellModal.id,
                    name: sellModal.name,
                    image: sellModal.image,
                    emoji: sellModal.emoji,
                    isGif: sellModal.isGif,
                    collectionId: sellModal.collectionId,
                    collectionName: sellModal.collectionName,
                    startPrice: finalStartPrice,
                    bidStep: sellMode === 'auction' ? (parseInt(bidStep) || 1) : 0,
                    buyNowPrice: finalBuyNowPrice,
                    auctionDuration: finalDuration,
                    mintCost: 0 // No mint cost for existing NFTs
                })
            })
            const data = await res.json()
            if (res.ok) {
                addToast(`NFT "${sellModal.name}" выставлен на продажу!`, 'success')
                setSellModal(null)
            } else {
                addToast(data.error || 'Ошибка', 'error')
            }
        } catch (e) {
            addToast('Ошибка сети', 'error')
        }
    }

    const cancelMyAuction = async (auction) => {
        try {
            const res = await fetch(`/api/auctions/${auction.id}/cancel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id })
            })
            const data = await res.json()
            if (res.ok) {
                addToast('Аукцион отменён, NFT возвращён', 'success')
                // Refresh auctions list
                setMyAuctions(prev => prev.filter(a => a.id !== auction.id))
            } else {
                addToast(data.error || 'Ошибка отмены', 'error')
            }
        } catch (e) {
            addToast('Ошибка сети', 'error')
        }
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
                // Update detail modal state if currently open
                setDetailNft(prev => prev ? { ...prev, on_chain_index: data.onChainIndex } : null)
            } else {
                addToast(data.error || 'Ошибка активации', 'error')
            }
        } catch (e) {
            addToast('Ошибка сети', 'error')
        }
    }


    return (
        <div className="fade-in">
            {/* ── User Header ── */}
            <div className="glass" style={{ padding: '24px', marginBottom: '24px', display: 'flex', gap: '24px', alignItems: 'center' }}>
                {/* Avatar */}
                <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', border: '3px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                    <UserAvatar user={user} style={{ fontSize: '32px', fontWeight: 700, color: 'white' }} />
                </div>

                {/* Info */}
                <div style={{ flex: 1 }}>
                    <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '4px' }}>
                        {user?.firstName} ({user?.username})
                    </h1>
                    <div style={{ display: 'flex', gap: '16px', fontSize: '14px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <FiUser /> ID: {user?.telegramId}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <FiGlobe /> Telegram: @{user?.username}
                        </span>
                    </div>
                    {user?.description && (
                        <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', fontStyle: 'italic', marginBottom: '12px' }}>
                            "{user.description}"
                        </p>
                    )}
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditProfileModal(true)}>
                        <FiEdit2 /> Редактировать профиль
                    </button>
                </div>

                {/* Stats */}
                <div style={{ minWidth: '180px', textAlign: 'right' }}>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Баланс</div>
                    <div className="text-accent" style={{ fontSize: '24px', fontWeight: 700 }}>{balance.toLocaleString()} HH</div>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: 'var(--space-md)' }}>
                {['nfts', 'auctions', 'wallet'].map(tab => (
                    <button
                        key={tab}
                        className={activeTab === tab ? 'btn btn-primary' : 'btn btn-ghost'}
                        onClick={() => setActiveTab(tab)}
                    >
                        {tab === 'nfts' && <><FiImage /> Галерея NFT</>}
                        {tab === 'auctions' && <><FiActivity /> Активные лоты</>}
                        {tab === 'wallet' && <><FiCreditCard /> Кошелёк</>}
                    </button>
                ))}
            </div>

            <AnimatePresence mode="wait">
                {/* ── My NFTs Tab ── */}
                {activeTab === 'nfts' && (
                    <motion.div key="nfts" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                        <div className="nft-grid">
                            {ownedNFTs.length === 0 ? (
                                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}>
                                    У вас нет NFT. Купите или создайте новые!
                                </div>
                            ) : ownedNFTs.map(nft => (
                                <GiftCard
                                    key={nft.id}
                                    id={nft.id}
                                    name={nft.name}
                                    image={nft.image}
                                    emoji={nft.emoji}
                                    isGif={nft.isGif}
                                    color={nft.color}
                                    collectionName={nft.collectionName}
                                    upgrade={nft.upgrade}
                                    status={nft.status}
                                    onClick={() => setDetailNft(nft)}
                                >
                                    <div style={{ padding: '0 8px', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                        {nft.price_paid ? `Последняя цена: ${nft.price_paid} HH` : ''}
                                    </div>
                                    <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={(e) => { e.stopPropagation(); setSellModal(nft); }}>
                                        💸 Продать
                                    </button>
                                    {!nft.on_chain_index && (
                                        <button className="btn btn-success btn-sm" style={{ flex: 1, padding: '0 4px' }} onClick={(e) => { e.stopPropagation(); setDetailNft({ ...nft, forceActivate: true }); }}>
                                            🔗 Активировать
                                        </button>
                                    )}
                                </GiftCard>
                            ))}
                        </div>
                    </motion.div>
                )}

                {/* ── My Auctions Tab ── */}
                {activeTab === 'auctions' && (
                    <motion.div key="auctions" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                        <div className="table-container glass">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>NFT</th>
                                        <th>Тип</th>
                                        <th>Цена / Ставка</th>
                                        <th>Статус</th>
                                        <th>Действия</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {myAuctions.length === 0 ? (
                                        <tr><td colSpan="5" style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>Нет активных лотов</td></tr>
                                    ) : myAuctions.map(auc => (
                                        <tr key={auc.id}>
                                            <td>{auc.name}</td>
                                            <td>
                                                {auc.creatorId === user?.id ? (
                                                    auc.isDirectSale
                                                        ? <span className="badge-status active">Продажа</span>
                                                        : <span className="badge-status pending">Аукцион</span>
                                                ) : (
                                                    <span className="badge-status" style={{ background: '#f59e0b20', color: '#f59e0b' }}>Участие</span>
                                                )}
                                            </td>
                                            <td>
                                                {auc.isDirectSale ? `${auc.startPrice} HH` : `${auc.currentBid} HH (${auc.bids?.length || 0} ст.)`}
                                            </td>
                                            <td>
                                                {auc.endsAt > Date.now()
                                                    ? (auc.isDirectSale && auc.endsAt > Date.now() + 315360000000 ? 'Бессрочно' : 'Активен')
                                                    : 'Завершен'}
                                            </td>
                                            <td>
                                                {auc.creatorId === user?.id && (
                                                    <button className="btn btn-danger btn-sm" disabled={auc.bids?.length > 0 && !auc.isDirectSale} onClick={() => cancelMyAuction(auc)}>
                                                        Снять
                                                    </button>
                                                )}
                                                {auc.creatorId !== user?.id && auc.currentBidderId === user?.id && (
                                                    <span style={{ fontSize: '11px', color: '#22c55e', fontWeight: 600 }}>Вы лидируете</span>
                                                )}
                                                {auc.creatorId !== user?.id && auc.currentBidderId !== user?.id && (
                                                    <span style={{ fontSize: '11px', color: '#ef4444', fontWeight: 600 }}>Перебита ({auc.currentBid} HH)</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </motion.div>
                )}

                {/* ── Wallet Tab ── */}
                {activeTab === 'wallet' && (
                    <motion.div key="wallet" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                        <WalletTabContent
                            transactions={transactions}
                            addToast={addToast}
                        />
                    </motion.div>
                )}
            </AnimatePresence>



            {/* ── Modal: Edit Profile ── */}
            <Modal isOpen={editProfileModal} onClose={() => setEditProfileModal(false)} title="Редактировать профиль"
                footer={<>
                    <button className="btn btn-ghost" onClick={() => setEditProfileModal(false)}>Отмена</button>
                    <button className="btn btn-primary" onClick={saveProfile}>Сохранить</button>
                </>}>
                <div className="input-group">
                    <label>Описание (Bio)</label>
                    <textarea
                        className="input"
                        rows="4"
                        value={editDesc}
                        onChange={e => setEditDesc(e.target.value)}
                        placeholder="Расскажите о себе..."
                    />
                </div>
            </Modal>

            {/* ── Sell Modal ── */}
            <Modal isOpen={!!sellModal} onClose={() => setSellModal(null)} title={`Продажа "${sellModal?.name}"`}>
                {/* Same sell modal... */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                    <button className={`btn btn-sm ${sellMode === 'direct' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setSellMode('direct')}>
                        Фикс. цена
                    </button>
                    <button className={`btn btn-sm ${sellMode === 'auction' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setSellMode('auction')}>
                        Аукцион
                    </button>
                </div>

                {sellMode === 'direct' ? (
                    <div className="input-group">
                        <label>Цена продажи (HH)</label>
                        <input className="input" type="number" value={sellPrice} onChange={e => setSellPrice(e.target.value)} placeholder="Например: 500" autoFocus />
                        <p style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                            Товар будет выставлен на продажу бессрочно.
                        </p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div className="input-group">
                            <label>Начальная ставка (HH)</label>
                            <input className="input" type="number" value={startBid} onChange={e => setStartBid(e.target.value)} placeholder="Мин. ставка" />
                        </div>

                        <div className="input-group">
                            <label>Шаг ставки (HH)</label>
                            <input className="input" type="number" value={bidStep} onChange={e => setBidStep(e.target.value)} placeholder="1" min="1" />
                            <p style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                                Минимальное повышение ставки каждым участником.
                            </p>
                        </div>

                        <div className="input-group">
                            <label>Длительность</label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <div style={{ flex: 1 }}>
                                    <input className="input" type="number" value={durationDays} onChange={e => setDurationDays(e.target.value)} min="0" />
                                    <span style={{ fontSize: '10px' }}>Дней</span>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <input className="input" type="number" value={durationHours} onChange={e => setDurationHours(e.target.value)} min="0" max="23" />
                                    <span style={{ fontSize: '10px' }}>Часов</span>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <input className="input" type="number" value={durationMinutes} onChange={e => setDurationMinutes(e.target.value)} min="0" max="59" />
                                    <span style={{ fontSize: '10px' }}>Минут</span>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <input className="input" type="number" value={durationSeconds} onChange={e => setDurationSeconds(e.target.value)} min="0" max="59" />
                                    <span style={{ fontSize: '10px' }}>Секунд</span>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
                                {[
                                    { label: '10с', d: 0, h: 0, m: 0, s: 10 },
                                    { label: '1м', d: 0, h: 0, m: 1, s: 0 },
                                    { label: '5м', d: 0, h: 0, m: 5, s: 0 },
                                    { label: '30м', d: 0, h: 0, m: 30, s: 0 },
                                    { label: '1ч', d: 0, h: 1, m: 0, s: 0 },
                                    { label: '6ч', d: 0, h: 6, m: 0, s: 0 },
                                    { label: '12ч', d: 0, h: 12, m: 0, s: 0 },
                                    { label: '1д', d: 1, h: 0, m: 0, s: 0 },
                                    { label: '3д', d: 3, h: 0, m: 0, s: 0 },
                                    { label: '7д', d: 7, h: 0, m: 0, s: 0 },
                                ].map(p => (
                                    <button key={p.label} className="btn btn-ghost btn-sm"
                                        style={{ fontSize: '9px', padding: '2px 6px' }}
                                        onClick={() => { setDurationDays(p.d); setDurationHours(p.h); setDurationMinutes(p.m); setDurationSeconds(p.s) }}
                                    >{p.label}</button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button className="btn btn-ghost" onClick={() => setSellModal(null)}>Отмена</button>
                    <button className="btn btn-success" onClick={handleSell}>
                        {sellMode === 'direct' ? 'Выставить на продажу' : 'Запустить аукцион'}
                    </button>
                </div>
            </Modal>



            {/* ── Detail Modal ── */}
            <GiftDetailModal
                nft={detailNft}
                allNFTs={allNFTs}
                onClose={() => setDetailNft(null)}
                onTransfer={(nftId, target) => {
                    const res = transferNFT(nftId, target)
                    if (res.success) { addToast('NFT передан!', 'success'); setDetailNft(null) }
                    else addToast(res.error || 'Ошибка', 'error')
                }}
                onWithdraw={(nftId, addr) => {
                    const res = withdrawNFT(nftId, addr)
                    if (res.success) { addToast('NFT выведен!', 'success'); setDetailNft(null) }
                    else addToast(res.error || 'Ошибка', 'error')
                }}
                onActivate={handleActivate}
                tonFeeRate={CONFIG.fees.tonNetworkFee}
            />
        </div>
    )
}

// ── Wallet Tab Content (with TON integration + real balances) ──
function WalletTabContent({ transactions, addToast }) {
    const {
        txHistory, connected,
        hhNfts, telegramNfts, otherNfts, allWalletNfts
    } = useTonWalletContext()

    const [nftTab, setNftTab] = useState('all') // all | hh | telegram | other

    return (
        <div className="two-col-grid">
            {/* ── Left: Wallet Operations ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <WalletManagementCard addToast={addToast} />

                {/* ── On-Chain NFTs ── */}
                {connected && allWalletNfts.length > 0 && (
                    <div className="glass" style={{ padding: '20px' }}>
                        <h3 style={{ fontSize: '16px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            🖼️ NFT на кошельке
                            <span style={{
                                fontSize: '11px', background: 'rgba(0, 152, 234, 0.12)',
                                color: '#00B2FF', padding: '2px 8px', borderRadius: '8px',
                            }}>
                                {allWalletNfts.length}
                            </span>
                        </h3>

                        {/* NFT filter tabs */}
                        <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
                            {[
                                { key: 'all', label: 'Все', count: allWalletNfts.length },
                                ...(hhNfts.length > 0 ? [{ key: 'hh', label: '🎯 HH', count: hhNfts.length }] : []),
                                ...(telegramNfts.length > 0 ? [{ key: 'telegram', label: '✈️ TG', count: telegramNfts.length }] : []),
                                ...(otherNfts.length > 0 ? [{ key: 'other', label: '🖼️ Другие', count: otherNfts.length }] : []),
                            ].map(tab => (
                                <button
                                    key={tab.key}
                                    className="btn btn-sm"
                                    onClick={() => setNftTab(tab.key)}
                                    style={{
                                        background: nftTab === tab.key ? 'rgba(0, 152, 234, 0.2)' : 'rgba(255,255,255,0.04)',
                                        border: nftTab === tab.key ? '1px solid rgba(0, 152, 234, 0.4)' : '1px solid rgba(255,255,255,0.08)',
                                        color: nftTab === tab.key ? '#00B2FF' : 'var(--color-text-muted)',
                                        fontSize: '11px', padding: '4px 10px', borderRadius: '8px',
                                    }}
                                >
                                    {tab.label} ({tab.count})
                                </button>
                            ))}
                        </div>

                        {/* NFT Grid */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                            gap: '10px',
                            maxHeight: '420px',
                            overflowY: 'auto',
                        }}>
                            {(nftTab === 'all' ? allWalletNfts :
                                nftTab === 'hh' ? hhNfts :
                                    nftTab === 'telegram' ? telegramNfts :
                                        otherNfts
                            ).map((nft, i) => (
                                <div key={nft.address || i} style={{
                                    borderRadius: '10px',
                                    overflow: 'hidden',
                                    border: nft.isTelegram ? '1px solid rgba(88, 166, 255, 0.25)' :
                                        nft.isHeadHunters ? '1px solid rgba(0, 152, 234, 0.25)' :
                                            '1px solid rgba(255,255,255,0.08)',
                                    background: 'rgba(0,0,0,0.2)',
                                    position: 'relative',
                                }}>
                                    <div style={{ width: '100%', paddingBottom: '100%', position: 'relative' }}>
                                        {nft.image ? (
                                            <img src={nft.image} alt={nft.name}
                                                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                                                onError={e => { e.target.style.display = 'none' }}
                                            />
                                        ) : (
                                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px' }}>🖼️</div>
                                        )}
                                    </div>
                                    <div style={{
                                        padding: '6px 8px',
                                        fontSize: '10px',
                                        fontWeight: 600,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                    }}>
                                        {nft.name}
                                    </div>
                                    {(nft.isTelegram || nft.isHeadHunters) && (
                                        <div style={{
                                            position: 'absolute', top: '4px', right: '4px',
                                            fontSize: '10px', background: 'rgba(0,0,0,0.7)',
                                            borderRadius: '4px', padding: '1px 4px',
                                        }}>
                                            {nft.isTelegram ? '✈️' : '🎯'}
                                        </div>
                                    )}
                                </div>
                            ))}
                            {allWalletNfts.length === 0 && <div style={{ fontSize: '11px', color: '#aaa', padding: '10px' }}>Нет NFT</div>}
                        </div>
                    </div>
                )}
            </div>

            {/* ── Right: Transaction History ── */}
            <div className="glass" style={{ padding: 'var(--space-lg)', maxHeight: '600px', overflowY: 'auto' }}>
                <h3 style={{ marginBottom: '16px', fontSize: '16px' }}>📜 История транзакций</h3>

                {/* TON TX history */}
                {txHistory.length > 0 && (
                    <div style={{ marginBottom: '16px' }}>
                        <h4 style={{ fontSize: '12px', color: '#00B2FF', marginBottom: '8px' }}>TON транзакции</h4>
                        {txHistory.map(tx => (
                            <div key={tx.id} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                marginBottom: '8px', paddingBottom: '8px',
                                borderBottom: '1px solid rgba(0, 152, 234, 0.1)',
                            }}>
                                <div>
                                    <div style={{ fontSize: '12px', fontWeight: 600 }}>💎 {tx.amount} TON</div>
                                    <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>
                                        {tx.comment} · {new Date(tx.timestamp).toLocaleTimeString()}
                                    </div>
                                </div>
                                <span style={{
                                    fontSize: '10px', padding: '2px 8px', borderRadius: '8px',
                                    background: tx.status === 'sent' ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)',
                                    color: tx.status === 'sent' ? '#22c55e' : '#f59e0b',
                                }}>
                                    {tx.status === 'sent' ? '✓ Отправлено' : '⏳ Ожидание'}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                {/* HH TX history */}
                {transactions.length === 0 && txHistory.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-muted)', fontSize: '13px' }}>
                        Транзакций пока нет
                    </div>
                ) : (
                    transactions.map(tx => (
                        <div key={tx.id} style={{
                            display: 'flex', justifyContent: 'space-between',
                            marginBottom: '10px', paddingBottom: '8px',
                            borderBottom: '1px solid var(--color-border)',
                        }}>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: '13px' }}>{tx.description || tx.type}</div>
                                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{tx.created_at ? new Date(tx.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</div>
                            </div>
                            <div style={{
                                color: tx.type === 'deposit' || tx.type.includes('refund') || tx.type === 'sale' ? 'var(--color-success)' : 'var(--color-danger)',
                                fontWeight: 700,
                            }}>
                                {tx.type === 'deposit' || tx.type.includes('refund') || tx.type === 'sale' ? '+' : '-'}{tx.amount} HH
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}

// ── Simplified Wallet Management Card ──
function WalletManagementCard({ addToast }) {
    const { user } = useAuth()

    // External Wallet Context
    const {
        connected, address, shortAddress, walletName, connect, disconnect,
        tonBalance, hhBalance, refreshBalances, balanceLoading
    } = useTonWalletContext()

    return (
        <div className="glass" style={{
            padding: '20px',
            background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.6), rgba(15, 23, 42, 0.4))',
            border: '1px solid var(--color-border)',
        }}>
            {/* ── Internal HH Balance ── */}
            <div style={{ marginBottom: '20px' }}>
                <h4 style={{ fontSize: '13px', marginBottom: '12px', color: 'var(--color-text-secondary)' }}>Ваш внутренний баланс</h4>
                <div style={{ background: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.2)', padding: '16px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: '14px', color: '#fde68a', fontWeight: 600 }}>HH Points</div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: '#fbbf24' }}>
                        {user?.balance?.toFixed(2) || '0.00'}
                    </div>
                </div>
                <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '8px' }}>
                    Используется для ставок и покупок на платформе.
                </p>
            </div>

            {/* ── EXTERNAL WALLET (TON Connect) ── */}
            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '20px' }}>
                <h4 style={{ fontSize: '13px', marginBottom: '16px', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: '#00B2FF' }}>💎</span> Внешний кошелёк (TON)
                </h4>

                <div className="fade-in">
                    {!connected ? (
                        <div style={{ textAlign: 'center', padding: '10px 0' }}>
                            <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
                                Подключите ваш личный кошелёк (Tonkeeper и др.) для взаимодействия с сетью.
                            </p>
                            <button className="btn btn-primary" onClick={connect} style={{ background: 'linear-gradient(135deg, #0098EA, #00B2FF)', border: 'none', width: '100%' }}>
                                <FiLink /> Подключить TON Connect
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* Connected Info */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '10px' }}>
                                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#00B2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>💎</div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '14px', fontWeight: 700 }}>{walletName || 'Wallet'}</div>
                                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>{shortAddress}</div>
                                </div>
                                <button className="btn btn-ghost btn-sm" onClick={disconnect} style={{ color: '#ef4444' }}>Выйти</button>
                            </div>

                            {/* Balances */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <div style={{ background: 'rgba(0, 152, 234, 0.08)', border: '1px solid rgba(0, 152, 234, 0.2)', padding: '12px', borderRadius: '10px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '11px', color: '#00B2FF', marginBottom: '4px' }}>TON</div>
                                    <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff' }}>{tonBalance.toFixed(4)}</div>
                                </div>
                                <div style={{ background: 'rgba(255, 215, 0, 0.06)', border: '1px solid rgba(255, 215, 0, 0.2)', padding: '12px', borderRadius: '10px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '11px', color: '#ffd700', marginBottom: '4px' }}>On-Chain HH</div>
                                    <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff' }}>{hhBalance.toFixed(2)}</div>
                                </div>
                            </div>

                            <div style={{ textAlign: 'center', marginTop: '16px' }}>
                                <button className="btn btn-ghost btn-sm" onClick={refreshBalances} disabled={balanceLoading}>
                                    {balanceLoading ? '🔄 Обновление...' : '🔄 Обновить балансы'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

