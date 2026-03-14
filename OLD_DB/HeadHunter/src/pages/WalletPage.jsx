import { useState } from 'react'
import { motion } from 'framer-motion'
import { FiArrowDownLeft, FiArrowUpRight, FiAlertTriangle, FiImage, FiTag, FiStar, FiClock, FiCheck } from 'react-icons/fi'
import { useWallet } from '../context/WalletContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/UI/Toast'
import Modal from '../components/UI/Modal'

// ── CSS-паттерны (дефолтные) ──
const CSS_PATTERNS = [
    { id: 'dots', name: 'Точки', css: 'radial-gradient(circle, currentColor 1px, transparent 1px)', bgSize: '16px 16px' },
    { id: 'stripes', name: 'Полосы', css: 'repeating-linear-gradient(45deg, transparent, transparent 8px, currentColor 8px, currentColor 9px)', bgSize: null },
    { id: 'grid', name: 'Сетка', css: 'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)', bgSize: '20px 20px' },
    { id: 'diamonds', name: 'Ромбы', css: 'linear-gradient(45deg, currentColor 25%, transparent 25%), linear-gradient(-45deg, currentColor 25%, transparent 25%), linear-gradient(45deg, transparent 75%, currentColor 75%), linear-gradient(-45deg, transparent 75%, currentColor 75%)', bgSize: '20px 20px' },
    { id: 'waves', name: 'Волны', css: 'repeating-linear-gradient(135deg, transparent 0px, transparent 6px, currentColor 6px, currentColor 7px, transparent 7px, transparent 13px)', bgSize: null },
    { id: 'zigzag', name: 'Зигзаг', css: 'linear-gradient(135deg, currentColor 25%, transparent 25%) -10px 0, linear-gradient(225deg, currentColor 25%, transparent 25%) -10px 0, linear-gradient(315deg, currentColor 25%, transparent 25%), linear-gradient(45deg, currentColor 25%, transparent 25%)', bgSize: '20px 20px' },
]

const UPGRADE_COST = 100

// ── Загрузка пользовательских паттернов из public/patterns/ ──
const patternFiles = import.meta.glob('/patterns/*.{png,svg,webp,jpg}', { eager: true, query: '?url', import: 'default' })
const USER_PATTERNS = Object.entries(patternFiles).map(([path, url]) => ({
    id: 'file_' + path.split('/').pop().replace(/\.[^.]+$/, ''),
    name: path.split('/').pop().replace(/\.[^.]+$/, ''),
    url,
}))

// Combine all patterns for random selection
const ALL_PATTERNS = [...CSS_PATTERNS, ...USER_PATTERNS]

// Color palette for random selection
const RANDOM_COLORS = [
    '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#10b981', '#14b8a6', '#06b6d4',
    '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e'
]

export default function WalletPage() {
    const {
        balance, transactions, ownedNFTs,
        deposit, withdraw, updateOwnedNFT, removeOwnedNFT, upgradeNFT,
    } = useWallet()
    const { user } = useAuth()
    const { addToast } = useToast()
    const [modal, setModal] = useState(null)
    const [amount, setAmount] = useState('')
    const [walletAddress, setWalletAddress] = useState('')
    const [priceModal, setPriceModal] = useState(null)
    const [buyNowPrice, setBuyNowPrice] = useState('')

    // Upgrade state
    const [upgradeModal, setUpgradeModal] = useState(null)
    const [isUpgrading, setIsUpgrading] = useState(false)

    // Direct sell state
    const [sellDuration, setSellDuration] = useState(7 * 24 * 60 * 60 * 1000)

    const handleAction = () => {
        if (!modal) return
        let result
        if (modal.type === 'deposit') {
            result = deposit(amount)
        } else {
            if (!walletAddress.trim()) { addToast('Введите адрес кошелька', 'warning'); return }
            if (walletAddress.trim().length < 10) { addToast('Некорректный адрес кошелька', 'error'); return }
            result = withdraw(amount, walletAddress)
        }
        if (result.success) {
            addToast(modal.type === 'deposit' ? `Пополнено ${amount} HH` : `Выведено ${amount} HH`, 'success')
            closeModal()
        } else {
            addToast(result.error || 'Ошибка', 'error')
        }
    }

    const closeModal = () => { setModal(null); setAmount(''); setWalletAddress('') }

    // ── Установить цену Buy Now для NFT ──
    const handleSetPrice = (nft) => {
        setPriceModal(nft)
        setBuyNowPrice(nft.buyNowPrice || '')
        setSellDuration(7 * 24 * 60 * 60 * 1000) // Default 7 days
    }

    const confirmSetPrice = () => {
        if (!priceModal) return
        const price = parseFloat(buyNowPrice)
        if (buyNowPrice && (isNaN(price) || price < 10)) {
            addToast('Минимальная цена: 10 HH', 'error'); return
        }

        updateOwnedNFT(priceModal.id, { buyNowPrice: buyNowPrice ? price : null })

        if (buyNowPrice && price > 0) {
            try {
                const auctions = JSON.parse(localStorage.getItem('hh_auctions') || '[]')
                const now = Date.now()
                auctions.unshift({
                    id: 'a_sell_' + now,
                    nftId: priceModal.id,
                    name: priceModal.name,
                    creatorId: user?.id || 'current_user',
                    creatorInitials: priceModal.creatorInitials || priceModal.creator,
                    image: priceModal.image,
                    isGif: priceModal.isGif || false,
                    emoji: priceModal.emoji,
                    collectionId: priceModal.collectionId || null,
                    collectionName: priceModal.collectionName || null,
                    startPrice: 10,
                    currentBid: 10,
                    currentBidderId: null,
                    currentBidderName: null,
                    buyNowPrice: price,
                    cancelled: false,
                    upgrade: priceModal.upgrade || null,
                    startedAt: now,
                    endsAt: now + sellDuration,
                    bids: [],
                })
                localStorage.setItem('hh_auctions', JSON.stringify(auctions))
                removeOwnedNFT(priceModal.id)
                addToast(`"${priceModal.name}" выставлен на продажу за ${price} HH! 🏷️`, 'success')
            } catch { addToast('Ошибка при создании аукциона', 'error') }
        } else {
            addToast('Цена сброшена', 'info')
        }

        setPriceModal(null)
        setBuyNowPrice('')
    }

    // ── Апгрейд NFT (Random) ──
    const openUpgrade = (nft) => {
        setUpgradeModal(nft)
        setIsUpgrading(false)
    }

    const confirmRandomUpgrade = async () => {
        if (!upgradeModal) return
        if (balance < UPGRADE_COST) {
            addToast(`Недостаточно средств. Требуется ${UPGRADE_COST} HH`, 'error')
            return
        }

        setIsUpgrading(true)

        // Simulate "rolling" effect
        await new Promise(r => setTimeout(r, 1500))

        const randomBg = RANDOM_COLORS[Math.floor(Math.random() * RANDOM_COLORS.length)]
        const randomPattern = null // ALL_PATTERNS[Math.floor(Math.random() * ALL_PATTERNS.length)]?.id || null

        const result = await upgradeNFT(upgradeModal.id, upgradeModal.name, randomBg, randomPattern)

        if (result.success) {
            addToast(`NFT "${upgradeModal.name}" успешно улучшен! ✨ (−${UPGRADE_COST} HH)`, 'success')
            // Обновляем аукционы в localStorage если NFT на аукционе
            try {
                const auctions = JSON.parse(localStorage.getItem('hh_auctions') || '[]')
                const updated = auctions.map(a =>
                    a.nftId === upgradeModal.id ? { ...a, upgrade: { bgColor: randomBg, pattern: randomPattern } } : a
                )
                localStorage.setItem('hh_auctions', JSON.stringify(updated))
            } catch { /* ignore */ }
        } else {
            addToast(result.error || 'Ошибка', 'error')
        }

        setIsUpgrading(false)
        setUpgradeModal(null)
    }

    // Получить CSS стиль фона для апгрейда
    const getUpgradeStyle = (upgrade) => {
        if (!upgrade) return {}
        const style = { backgroundColor: upgrade.bgColor || '#7c3aed' }
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

    const txTypeStyles = {
        deposit: { icon: '↓', color: 'var(--color-success)', label: 'Пополнение' },
        withdraw: { icon: '↑', color: 'var(--color-danger)', label: 'Вывод' },
        nft_create: { icon: '🎨', color: 'var(--color-accent-light)', label: 'Создание NFT' },
        bid: { icon: '🔨', color: 'var(--color-warning)', label: 'Ставка' },
        bid_topup: { icon: '💰', color: 'var(--color-warning)', label: 'Доплата' },
        bid_cancel: { icon: '❌', color: 'var(--color-danger)', label: 'Отмена ставки' },
        refund: { icon: '↩', color: 'var(--color-info)', label: 'Возврат' },
        sale: { icon: '💰', color: 'var(--color-success)', label: 'Продажа' },
        nft_buy: { icon: '🛒', color: 'var(--color-accent-light)', label: 'Покупка NFT' },
        nft_upgrade: { icon: '✨', color: 'var(--color-warning)', label: 'Апгрейд' },
    }

    return (
        <div className="fade-in">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Кошелёк</h1>
                    <p className="page-subtitle">Баланс и мои NFT</p>
                </div>
            </div>

            {/* ── Balance Card ── */}
            <motion.div
                className="wallet-balance-card glass"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                    marginBottom: 'var(--space-xl)', padding: 'var(--space-xl)',
                    background: 'linear-gradient(135deg, rgba(124,58,237,0.15), rgba(37,99,235,0.15))',
                }}
            >
                <div className="wallet-balance-label">Баланс HH</div>
                <div className="wallet-balance-amount" style={{ fontSize: '2.5rem' }}>
                    {balance.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-lg)' }}>
                    HeadHunters Coins
                </div>
                <div className="wallet-actions">
                    <button className="btn btn-success" onClick={() => { setModal({ type: 'deposit' }); setAmount('') }}>
                        <FiArrowDownLeft /> Пополнить
                    </button>
                    <button className="btn btn-danger" onClick={() => { setModal({ type: 'withdraw' }); setAmount(''); setWalletAddress('') }}>
                        <FiArrowUpRight /> Вывести
                    </button>
                </div>
            </motion.div>

            {/* ── Мои NFT ── */}
            <motion.div
                className="section-card glass"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                style={{ marginBottom: 'var(--space-xl)' }}
            >
                <div className="section-card-header">
                    <h2 className="section-card-title"><FiImage style={{ marginRight: '8px' }} />Мои NFT</h2>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                        {ownedNFTs.length} шт.
                    </span>
                </div>

                {ownedNFTs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--color-text-muted)' }}>
                        <p style={{ fontSize: '2rem', marginBottom: 'var(--space-sm)' }}>🖼️</p>
                        <p>У вас пока нет NFT</p>
                        <p style={{ fontSize: 'var(--font-size-xs)', marginTop: '4px' }}>Выиграйте аукцион, чтобы получить NFT</p>
                    </div>
                ) : (
                    <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                        gap: 'var(--space-md)',
                    }}>
                        {ownedNFTs.map(nft => (
                            <div key={nft.id} style={{
                                borderRadius: 'var(--radius-md)', overflow: 'hidden',
                                background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
                                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                            }}
                                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.15)' }}
                                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
                            >
                                {/* Image with optional upgrade background */}
                                <div style={{
                                    width: '100%', height: '160px', position: 'relative',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: nft.upgrade ? undefined : 'linear-gradient(135deg, rgba(124,58,237,0.1), rgba(37,99,235,0.1))',
                                    ...(nft.upgrade ? getUpgradeStyle(nft.upgrade) : {}),
                                }}>
                                    {nft.image ? (
                                        <img src={nft.image} alt={nft.name}
                                            style={{
                                                // Если есть апгрейд — картинка "эмодзи-сайз" (80px), иначе 100%
                                                width: nft.upgrade ? '80px' : '100%',
                                                height: nft.upgrade ? '80px' : '100%',
                                                objectFit: 'cover',
                                                borderRadius: nft.upgrade ? 'var(--radius-md)' : 0,
                                                boxShadow: nft.upgrade ? '0 4px 16px rgba(0,0,0,0.3)' : 'none',
                                            }} />
                                    ) : (
                                        <div style={{ fontSize: '3rem' }}>{nft.emoji || '🖼️'}</div>
                                    )}
                                    {nft.isGif && (
                                        <div style={{
                                            position: 'absolute', top: '6px', left: '6px',
                                            background: 'var(--color-accent)', color: 'white',
                                            padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 700,
                                        }}>GIF</div>
                                    )}
                                    {nft.upgrade && (
                                        <div style={{
                                            position: 'absolute', top: '6px', right: '6px',
                                            background: 'rgba(255,215,0,0.9)', color: '#000',
                                            padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 700,
                                        }}>✨ UPGRADED</div>
                                    )}
                                    {nft.collectionName && (
                                        <div style={{
                                            position: 'absolute', bottom: '6px', left: '6px',
                                            background: 'rgba(0,0,0,0.7)', color: 'white',
                                            padding: '2px 6px', borderRadius: '4px', fontSize: '9px',
                                        }}>{nft.collectionName}</div>
                                    )}
                                </div>
                                <div style={{ padding: 'var(--space-sm) var(--space-md)' }}>
                                    <div style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', marginBottom: '2px' }}>
                                        {nft.name}
                                    </div>
                                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                                        {nft.creatorInitials || nft.creator}
                                    </div>
                                    <div style={{
                                        fontSize: 'var(--font-size-xs)', fontWeight: 600,
                                        color: 'var(--color-accent-light)', marginTop: '4px',
                                    }}>
                                        Куплено за {nft.pricePaid || nft.price || 0} HH
                                    </div>

                                    <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            style={{ flex: 1, fontSize: '10px', gap: '3px' }}
                                            onClick={() => handleSetPrice(nft)}
                                        >
                                            <FiTag size={11} /> Продать
                                        </button>
                                        {!nft.upgrade && (
                                            <button
                                                className="btn btn-ghost btn-sm"
                                                style={{ flex: 1, fontSize: '10px', gap: '3px', color: 'var(--color-warning)' }}
                                                onClick={() => openUpgrade(nft)}
                                            >
                                                <FiStar size={11} /> Апгрейд
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </motion.div>

            {/* ── Transaction History ── */}
            <motion.div
                className="section-card glass"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
            >
                <div className="section-card-header">
                    <h2 className="section-card-title">История транзакций</h2>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                        Всего: {transactions.length}
                    </span>
                </div>
                <div className="table-container">
                    <table className="data-table">
                        <thead>
                            <tr><th></th><th>Тип</th><th>Сумма</th><th>Описание</th><th>Статус</th><th>Дата</th></tr>
                        </thead>
                        <tbody>
                            {transactions.map(tx => {
                                const meta = txTypeStyles[tx.type] || { icon: '•', color: 'var(--color-text-muted)', label: tx.type }
                                const isPositive = ['deposit', 'refund', 'sale'].includes(tx.type)
                                return (
                                    <tr key={tx.id}>
                                        <td>
                                            <div style={{
                                                width: 28, height: 28, borderRadius: 'var(--radius-full)',
                                                background: `${meta.color}15`, color: meta.color,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: 'var(--font-size-sm)', fontWeight: 700,
                                            }}>{meta.icon}</div>
                                        </td>
                                        <td style={{ fontWeight: 600, fontSize: 'var(--font-size-xs)' }}>{meta.label}</td>
                                        <td style={{
                                            fontWeight: 700, fontFamily: 'monospace',
                                            color: isPositive ? 'var(--color-success)' : 'var(--color-danger)',
                                        }}>
                                            {isPositive ? '+' : '-'}{tx.amount.toLocaleString()} HH
                                        </td>
                                        <td style={{
                                            color: 'var(--color-text-secondary)', maxWidth: 200,
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        }}>{tx.description}</td>
                                        <td>
                                            <span className="badge-status active">
                                                Выполнено
                                            </span>
                                        </td>
                                        <td style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                                            {tx.created_at ? new Date(tx.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </motion.div>

            {/* ── MOdal: Deposit/Withdraw ── */}
            <Modal isOpen={!!modal} onClose={closeModal} title={modal?.type === 'deposit' ? 'Пополнение баланса' : 'Вывод средств'}
                footer={<>
                    <button className="btn btn-ghost" onClick={closeModal}>Отмена</button>
                    <button className={`btn ${modal?.type === 'deposit' ? 'btn-success' : 'btn-danger'}`} onClick={handleAction}>
                        {modal?.type === 'deposit' ? 'Пополнить' : 'Вывести'}
                    </button>
                </>}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div className="input-group">
                        <label>Сумма (HH)</label>
                        <input className="input" type="number" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} autoFocus />
                    </div>
                    {modal?.type === 'withdraw' && (
                        <div className="input-group">
                            <label>Адрес кошелька TON</label>
                            <input className="input" placeholder="UQ..." value={walletAddress} onChange={e => setWalletAddress(e.target.value)} />
                        </div>
                    )}
                </div>
            </Modal>

            {/* ── Modal: Set Buy Now Price ── */}
            <Modal isOpen={!!priceModal} onClose={() => setPriceModal(null)} title="Продать NFT (Buy Now)"
                footer={<>
                    <button className="btn btn-ghost" onClick={() => setPriceModal(null)}>Отмена</button>
                    <button className="btn btn-success" onClick={confirmSetPrice}>
                        {buyNowPrice ? 'Выставить на продажу' : 'Снять с продажи'}
                    </button>
                </>}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                        Укажите фиксированную цену, за которую любой пользователь сможет купить этот NFT мгновенно, без торга.
                    </p>
                    <div className="input-group">
                        <label>Цена Buy Now (HH)</label>
                        <input className="input" type="number" min="10" placeholder="Например: 150" value={buyNowPrice} onChange={e => setBuyNowPrice(e.target.value)} autoFocus />
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                            Комиссия при продаже: 30%
                        </div>
                    </div>
                    {/* Duration selector for direct sell */}
                    <div className="input-group">
                        <label>Длительность продажи</label>
                        <select
                            className="input"
                            value={sellDuration}
                            onChange={(e) => setSellDuration(Number(e.target.value))}
                        >
                            <option value={10 * 1000}>10 секунд (Тест)</option>
                            <option value={60 * 60 * 1000}>1 час</option>
                            <option value={24 * 60 * 60 * 1000}>1 день</option>
                            <option value={3 * 24 * 60 * 60 * 1000}>3 дня</option>
                            <option value={7 * 24 * 60 * 60 * 1000}>7 дней</option>
                        </select>
                    </div>
                </div>
            </Modal>

            {/* ── Modal: Random Upgrade ── */}
            <Modal isOpen={!!upgradeModal} onClose={() => !isUpgrading && setUpgradeModal(null)} title="Случайный Апгрейд NFT"
                footer={null}>
                {upgradeModal && (
                    <div style={{ textAlign: 'center', padding: 'var(--space-md)' }}>
                        <div style={{
                            fontSize: '4rem', marginBottom: 'var(--space-md)',
                            animation: isUpgrading ? 'spin 1s linear infinite' : 'none'
                        }}>
                            ✨
                        </div>
                        <h3 style={{ marginBottom: '8px' }}>Испытай удачу!</h3>
                        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-lg)' }}>
                            За {UPGRADE_COST} HH вы получите случайный уникальный фон и узор для вашего NFT.
                            <br />Это навсегда изменит вид вашей карточки.
                        </p>

                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                            <button
                                className="btn btn-ghost"
                                onClick={() => setUpgradeModal(null)}
                                disabled={isUpgrading}
                            >
                                Отмена
                            </button>
                            <button
                                className="btn btn-warning"
                                onClick={confirmRandomUpgrade}
                                disabled={isUpgrading || balance < UPGRADE_COST}
                                style={{ minWidth: '160px' }}
                            >
                                {isUpgrading ? 'Генерируем...' : `Апгрейд (${UPGRADE_COST} HH)`}
                            </button>
                        </div>
                        {balance < UPGRADE_COST && (
                            <div style={{ color: 'var(--color-danger)', fontSize: '10px', marginTop: '8px' }}>
                                Недостаточно средств
                            </div>
                        )}
                    </div>
                )}
            </Modal>
        </div>
    )
}
