import { useState } from 'react'
import { FiX, FiClock, FiUser, FiHash, FiActivity, FiSend, FiExternalLink } from 'react-icons/fi'
import { getColorName, getColorHex } from '../../config'

// ── GiftDetailModal ──
// Full NFT info: color/pattern/rarity, collection price stats,
// last 5 history items, transfer + withdraw actions.
export default function GiftDetailModal({ nft, allNFTs = [], onClose, onTransfer, onWithdraw, onActivate, tonFeeRate = 0.05 }) {
    const [transferTarget, setTransferTarget] = useState('')
    const [withdrawAddr, setWithdrawAddr] = useState('')
    const [actionMode, setActionMode] = useState(nft?.forceActivate ? 'activate' : null) // 'transfer' | 'withdraw' | 'activate' | null

    if (!nft) return null

    const displayId = nft.on_chain_index !== null && nft.on_chain_index !== undefined ? `#${nft.on_chain_index}` : (nft.id ? `#${nft.id.slice(-8)}` : '')
    const isBanned = nft.status === 'hidden'

    // ── Collection price stats ──
    const collectionNFTs = allNFTs.filter(n => n.collectionId === nft.collectionId && n.collectionId)
    const collPrices = collectionNFTs.map(n => n.price).filter(p => p != null && p > 0)
    const collMin = collPrices.length > 0 ? Math.min(...collPrices) : null
    const collMax = collPrices.length > 0 ? Math.max(...collPrices) : null

    // Last sale price from history
    const saleHistory = (nft.history || []).filter(h => h.action === 'sale' && h.price > 0)
    const lastSalePrice = saleHistory.length > 0 ? saleHistory[saleHistory.length - 1].price : null

    // ── Color & Pattern rarity across platform ──
    const nftColor = nft.color
    const colorName = getColorName(nftColor) || (nftColor ? nftColor : null)

    // Count how many NFTs across the entire platform share this color
    const colorCount = nftColor
        ? allNFTs.filter(n => n.color && (getColorName(n.color) === getColorName(nftColor))).length
        : 0
    const colorRarity = colorCount > 0 && allNFTs.length > 0
        ? ((colorCount / allNFTs.length) * 100).toFixed(1)
        : null

    // ── Build visual bg ──
    const buildBg = () => {

        // Resolve named color if it's not a hex or direct CSS color
        const baseColor = nft.color
        const isHex = baseColor?.startsWith('#')
        const isGradient = baseColor?.includes('gradient')

        let c = baseColor
        if (baseColor && !isHex && !isGradient) {
            const hex = getColorHex(baseColor)
            if (hex) c = hex
        }

        if (c) return { background: c }
        return { background: 'var(--color-bg-tertiary, rgba(255,255,255,0.05))' }
    }

    const formatDate = (dateStr) => {
        try {
            const d = new Date(dateStr)
            return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        } catch { return dateStr }
    }

    const actionLabel = (action) => {
        switch (action) {
            case 'mint': return '🎨 Создан'
            case 'sale': return '💰 Продажа'
            case 'claim': return '🏆 Забран с аукциона'

            case 'transfer': return '📤 Передача'
            case 'withdraw': return '🔗 Вывод'
            default: return action
        }
    }

    const handleTransfer = () => {
        if (!transferTarget.trim()) return
        onTransfer && onTransfer(nft.id, transferTarget.trim())
        setActionMode(null)
        setTransferTarget('')
    }

    const handleWithdraw = () => {
        if (!withdrawAddr.trim()) return
        onWithdraw && onWithdraw(nft.id, withdrawAddr.trim())
        setActionMode(null)
        setWithdrawAddr('')
    }

    const handleActivate = () => {
        onActivate && onActivate(nft)
        setActionMode(null)
    }

    // ── Last 5 history items ──
    const historyItems = nft.history && nft.history.length > 0
        ? [...nft.history].reverse().slice(0, 5)
        : []

    // Helper: color circle
    const ColorDot = ({ hex, size = 12 }) => {
        if (!hex) return null

        // Resolve named color if needed
        const resolved = (hex && !hex.startsWith('#') && !hex.includes('gradient')) ? getColorHex(hex) : hex

        // Extract first hex from gradient or use resolved
        const match = String(resolved).match(/#[0-9a-fA-F]{6}/)
        const c = match ? match[0] : resolved
        return (
            <span style={{
                display: 'inline-block', width: size, height: size,
                borderRadius: '50%', background: c,
                border: '1px solid rgba(255,255,255,0.2)',
                verticalAlign: 'middle', marginRight: '6px', flexShrink: 0
            }} />
        )
    }

    return (
        <div className="gift-detail-overlay" onClick={onClose}>
            <div className="gift-detail-modal" onClick={e => e.stopPropagation()}>
                <button className="gift-detail-close" onClick={onClose}><FiX size={20} /></button>

                <div className="gift-detail-layout">
                    {/* ── Left: Visual ── */}
                    <div className="gift-detail-visual" style={buildBg()}>
                        {nft.image ? (
                            <img src={nft.image} alt={nft.name} className="gift-detail-img" />
                        ) : (
                            <div className="gift-detail-emoji">{nft.emoji || '🎁'}</div>
                        )}
                        <div className="gift-detail-badges">
                            {nft.isGif && <span className="gift-badge-pill" style={{ background: nft.color || 'var(--color-accent)' }}>GIF</span>}
                            {isBanned && <span className="gift-badge-pill gift-badge-banned">🚫 Скрыт</span>}
                        </div>
                    </div>

                    {/* ── Right: Info ── */}
                    <div className="gift-detail-info">
                        <h2 className="gift-detail-name">{nft.name || 'Unnamed'}</h2>

                        <div className="gift-detail-meta-grid">
                            <div className="gift-detail-meta-item">
                                <FiHash size={13} />
                                <span className="gift-detail-meta-label">Название</span>
                                <span className="gift-detail-meta-value">{nft.name || 'Unnamed'}</span>
                            </div>

                            {(nft.first_name || nft.firstName) && (
                                <div className="gift-detail-meta-item">
                                    <FiUser size={13} />
                                    <span className="gift-detail-meta-label">Имя</span>
                                    <span className="gift-detail-meta-value">{nft.first_name || nft.firstName}</span>
                                </div>
                            )}

                            {(nft.last_name || nft.lastName) && (
                                <div className="gift-detail-meta-item">
                                    <FiUser size={13} />
                                    <span className="gift-detail-meta-label">Фамилия</span>
                                    <span className="gift-detail-meta-value">{nft.last_name || nft.lastName}</span>
                                </div>
                            )}

                            {displayId && (
                                <div className="gift-detail-meta-item">
                                    <FiHash size={13} />
                                    <span className="gift-detail-meta-label">ID</span>
                                    <span className="gift-detail-meta-value" style={{ fontFamily: 'monospace' }}>{displayId}</span>
                                </div>
                            )}
                            {nft.collectionName && (
                                <div className="gift-detail-meta-item">
                                    <FiActivity size={13} />
                                    <span className="gift-detail-meta-label">Коллекция</span>
                                    <span className="gift-detail-meta-value">{nft.collectionName}</span>
                                </div>
                            )}
                            {nft.ownerId && (
                                <div className="gift-detail-meta-item">
                                    <FiUser size={13} />
                                    <span className="gift-detail-meta-label">Владелец</span>
                                    <span className="gift-detail-meta-value">{nft.ownerId === 'system' ? 'Магазин' : (nft.ownerUsername ? `@${nft.ownerUsername}` : String(nft.ownerId).slice(0, 12))}</span>
                                </div>
                            )}
                            {nft.status && (
                                <div className="gift-detail-meta-item">
                                    <FiClock size={13} />
                                    <span className="gift-detail-meta-label">Статус</span>
                                    <span className="gift-detail-meta-value" style={{
                                        color: nft.status === 'active' ? 'var(--color-success)' : nft.status === 'hidden' ? 'var(--color-danger)' : 'var(--color-warning)'
                                    }}>
                                        {nft.status === 'active' ? '✅ Активен' : nft.status === 'hidden' ? '🚫 Скрыт' : '🔨 Аукцион'}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* ── Color, Pattern & Rarity ── */}
                        <div className="gift-detail-prices" style={{ marginTop: '12px' }}>
                            <h3 className="gift-detail-section-title">🎨 Внешний вид</h3>
                            <div className="gift-detail-price-grid" style={{ gridTemplateColumns: '1fr' }}>
                                {/* Color */}
                                <div className="gift-price-stat">
                                    <span className="gift-price-label">Цвет</span>
                                    <span className="gift-price-value" style={{ display: 'flex', alignItems: 'center' }}>
                                        <ColorDot hex={nftColor} />
                                        {colorName || '—'}
                                    </span>
                                    {colorRarity && (
                                        <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                                            {colorCount} шт · {colorRarity}% всех NFT
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* ── Price Stats ── */}
                        <div className="gift-detail-prices">
                            <h3 className="gift-detail-section-title">💰 Цены</h3>
                            <div className="gift-detail-price-grid">
                                <div className="gift-price-stat">
                                    <span className="gift-price-label">Последняя цена</span>
                                    <span className="gift-price-value">{lastSalePrice != null ? `${lastSalePrice} HH` : '—'}</span>
                                </div>
                                <div className="gift-price-stat">
                                    <span className="gift-price-label">Мин. (коллекция)</span>
                                    <span className="gift-price-value" style={{ color: 'var(--color-success)' }}>
                                        {collMin != null ? `${collMin} HH` : '—'}
                                    </span>
                                </div>
                                <div className="gift-price-stat">
                                    <span className="gift-price-label">Макс. (коллекция)</span>
                                    <span className="gift-price-value" style={{ color: 'var(--color-danger)' }}>
                                        {collMax != null ? `${collMax} HH` : '—'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* ── History (last 5) ── */}
                        <div className="gift-detail-history">
                            <h3 className="gift-detail-section-title">📜 История (последние 5)</h3>
                            {historyItems.length > 0 ? (
                                <div className="gift-detail-history-list">
                                    {historyItems.map((entry, i) => (
                                        <div key={i} className="gift-detail-history-item">
                                            <span className="gift-history-action">{actionLabel(entry.action)}</span>
                                            <div className="gift-history-details">
                                                {entry.price > 0 && <span className="gift-history-price">{entry.price} HH</span>}
                                                {entry.date && <span className="gift-history-date">{formatDate(entry.date)}</span>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="gift-detail-empty">Нет истории</p>
                            )}
                        </div>

                        {/* ── Actions: Transfer / Withdraw / Activate ── */}
                        {(onTransfer || onWithdraw || onActivate) && nft.status === 'active' && (
                            <div className="gift-detail-actions-panel">
                                {actionMode === null && (
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                        {onTransfer && (
                                            <button className="btn btn-primary btn-sm" style={{ flex: 1, minWidth: '45%' }} onClick={() => setActionMode('transfer')}>
                                                <FiSend size={13} /> Передать
                                            </button>
                                        )}
                                        {onActivate && (!nft.on_chain_index) && (
                                            <button className="btn btn-success btn-sm" style={{ flex: 1, minWidth: '45%' }} onClick={() => setActionMode('activate')}>
                                                🔗 Активировать (100 HH)
                                            </button>
                                        )}
                                        {onWithdraw && (nft.on_chain_index) && (
                                            <button className="btn btn-ghost btn-sm" style={{ flex: 1, minWidth: '45%' }} onClick={() => setActionMode('withdraw')}>
                                                <FiExternalLink size={13} /> Вывод на кошелёк
                                            </button>
                                        )}
                                    </div>
                                )}

                                {actionMode === 'transfer' && (
                                    <div className="gift-detail-action-form">
                                        <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '6px' }}>
                                            Комиссия сети TON: {(tonFeeRate * 100).toFixed(0)}%
                                        </p>
                                        <input
                                            className="input" placeholder="Telegram ID получателя"
                                            value={transferTarget} onChange={e => setTransferTarget(e.target.value)}
                                            style={{ marginBottom: '8px' }}
                                        />
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            <button className="btn btn-ghost btn-sm" onClick={() => setActionMode(null)}>Отмена</button>
                                            <button className="btn btn-primary btn-sm" onClick={handleTransfer}>Отправить</button>
                                        </div>
                                    </div>
                                )}

                                {actionMode === 'withdraw' && (
                                    <div className="gift-detail-action-form">
                                        <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '6px' }}>
                                            Убедитесь, что у вас есть Tonkeeper. Вывод бесплатен!
                                        </p>
                                        <input
                                            className="input" placeholder="Адрес TON кошелька"
                                            value={withdrawAddr} onChange={e => setWithdrawAddr(e.target.value)}
                                            style={{ marginBottom: '8px' }}
                                        />
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            <button className="btn btn-ghost btn-sm" onClick={() => setActionMode(null)}>Отмена</button>
                                            <button className="btn btn-primary btn-sm" onClick={handleWithdraw}>Вывести</button>
                                        </div>
                                    </div>
                                )}

                                {actionMode === 'activate' && (
                                    <div className="gift-detail-action-form">
                                        <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '6px' }}>
                                            Активация превратит этот виртуальный подарок в настоящий NFT в сети TON.
                                            Стоимость: <strong style={{ color: 'var(--color-success)' }}>100 HH</strong>
                                        </p>
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            <button className="btn btn-ghost btn-sm" onClick={() => setActionMode(null)}>Отмена</button>
                                            <button className="btn btn-success btn-sm" onClick={handleActivate}>Подтвердить (100 HH)</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div >
    )
}
