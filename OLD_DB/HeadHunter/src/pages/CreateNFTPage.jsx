import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { FiUpload, FiImage, FiCheck, FiX, FiClock } from 'react-icons/fi'
import { useToast } from '../components/UI/Toast'
import { useWallet } from '../context/WalletContext'
import { useAuth } from '../context/AuthContext'
import { COLOR_NAMES } from '../config'

const NFT_CREATE_COST_IMAGE = 100
const NFT_CREATE_COST_GIF = 55
const MAX_IMAGE_SIZE = 256 // пикселей

// Варианты длительности аукциона
const DURATION_OPTIONS = [
    { label: '10 сек', value: 10 * 1000 },
    { label: '30 сек', value: 30 * 1000 },
    { label: '1 мин', value: 60 * 1000 },
    { label: '5 мин', value: 5 * 60 * 1000 },
    { label: '1 час', value: 60 * 60 * 1000 },
    { label: '12 часов', value: 12 * 60 * 60 * 1000 },
    { label: '1 день', value: 24 * 60 * 60 * 1000 },
    { label: '3 дня', value: 3 * 24 * 60 * 60 * 1000 },
    { label: '7 дней', value: 7 * 24 * 60 * 60 * 1000 },
]

// ── Ресайз изображения до 256×256 ──
function resizeImage(dataUrl, maxSize) {
    return new Promise((resolve) => {
        const img = new Image()
        img.onload = () => {
            let w = img.width, h = img.height
            if (w <= maxSize && h <= maxSize) { resolve(dataUrl); return }
            const scale = Math.max(maxSize / w, maxSize / h)
            const sw = Math.round(w * scale)
            const sh = Math.round(h * scale)
            const canvas = document.createElement('canvas')
            canvas.width = maxSize
            canvas.height = maxSize
            const ctx = canvas.getContext('2d')
            ctx.drawImage(img, (maxSize - sw) / 2, (maxSize - sh) / 2, sw, sh)
            resolve(canvas.toDataURL('image/png'))
        }
        img.src = dataUrl
    })
}

// Форматирование длительности для отображения
function formatDurationLabel(ms) {
    if (ms < 60000) return `${ms / 1000} сек`
    if (ms < 3600000) return `${ms / 60000} мин`
    if (ms < 86400000) return `${ms / 3600000} ч`
    return `${ms / 86400000} д`
}

export default function CreateNFTPage() {
    const { addToast } = useToast()
    const { payForNFTCreation, placeBid, balance } = useWallet()
    const { user, collections } = useAuth()
    const navigate = useNavigate()
    const fileInputRef = useRef(null)

    const [form, setForm] = useState({
        name: '',
        firstName: '',
        lastName: '',
        collectionId: '',
    })
    const [selectedColor, setSelectedColor] = useState(Object.keys(COLOR_NAMES)[0] || '')
    const [imagePreview, setImagePreview] = useState(null)
    const [isGif, setIsGif] = useState(false)
    const [isCreating, setIsCreating] = useState(false)

    // Ставка обязательна при создании
    const [firstBid, setFirstBid] = useState('10')
    // Длительность аукциона
    const [auctionDuration, setAuctionDuration] = useState(60 * 60 * 1000) // 1 hour default
    const [durDays, setDurDays] = useState('0')
    const [durHours, setDurHours] = useState('1')
    const [durMinutes, setDurMinutes] = useState('0')
    const [durSeconds, setDurSeconds] = useState('0')

    // Sync fields → duration ms
    const syncDuration = (d, h, m, s) => {
        const days = parseInt(d) || 0
        const hrs = parseInt(h) || 0
        const mins = parseInt(m) || 0
        const secs = parseInt(s) || 0
        setAuctionDuration(((days * 86400) + (hrs * 3600) + (mins * 60) + secs) * 1000)
    }

    // Preset click → fill fields
    const applyPreset = (ms) => {
        let remaining = Math.floor(ms / 1000)
        const d = Math.floor(remaining / 86400); remaining %= 86400
        const h = Math.floor(remaining / 3600); remaining %= 3600
        const m = Math.floor(remaining / 60)
        const s = remaining % 60
        setDurDays(String(d))
        setDurHours(String(h))
        setDurMinutes(String(m))
        setDurSeconds(String(s))
        setAuctionDuration(ms)
    }

    const createCost = isGif ? NFT_CREATE_COST_GIF : NFT_CREATE_COST_IMAGE
    const bidAmount = parseFloat(firstBid) || 0
    const totalCost = createCost + bidAmount // Оплата за создание + ставка

    const handleChange = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }))
    }

    const handleImageSelect = async (e) => {
        const file = e.target.files?.[0]
        if (!file) return
        if (!file.type.startsWith('image/')) {
            addToast('Выберите файл изображения (PNG, JPG, GIF, WebP)', 'error')
            return
        }
        if (file.size > 10 * 1024 * 1024) {
            addToast('Файл слишком большой (макс. 10 МБ)', 'error')
            return
        }

        const gifDetected = file.type === 'image/gif'
        setIsGif(gifDetected)

        const reader = new FileReader()
        reader.onload = async (ev) => {
            const dataUrl = ev.target.result
            if (gifDetected) {
                setImagePreview(dataUrl)
            } else {
                const resized = await resizeImage(dataUrl, MAX_IMAGE_SIZE)
                setImagePreview(resized)
            }
        }
        reader.readAsDataURL(file)
    }

    const removeImage = () => {
        setImagePreview(null)
        setIsGif(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    const getCharacterDisplay = () => {
        const first = form.firstName.trim()
        const last = form.lastName.trim()
        if (!first) return 'Имя Фамилия'
        if (!last) return first
        return `${first} ${last}`
    }

    const selectedCollection = collections.find(c => c.id === form.collectionId)

    const handleCreate = async (e) => {
        e.preventDefault()

        if (!imagePreview) {
            addToast('Загрузите изображение NFT', 'warning')
            return
        }
        if (!form.name.trim()) {
            addToast('Введите название NFT', 'warning')
            return
        }
        if (!selectedColor) {
            addToast('Выберите цвет', 'warning')
            return
        }

        // --- ПРОВЕРКА УНИКАЛЬНОСТИ ИМЕНИ-ФАМИЛИИ (ИФ) ---
        const first = form.firstName.trim().toLowerCase()
        const last = form.lastName.trim().toLowerCase()
        const targetCharacter = `${first} ${last}`.trim()

        if (!first || !last) {
            addToast('Введите имя и фамилию', 'warning')
            return
        }

        const latinOnly = /^[a-zA-Z]+$/
        if (!latinOnly.test(first) || !latinOnly.test(last)) {
            addToast('Имя и Фамилия должны состоять только из латинских букв', 'warning')
            return
        }

        try {
            const checkRes = await fetch('/api/nfts/check-character', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ firstName: first, lastName: last })
            })
            const checkData = await checkRes.json()
            if (!checkRes.ok) {
                addToast(checkData.error || 'Ошибка проверки уникальности', 'error')
                return
            }
            if (!checkData.unique) {
                addToast('Персонаж с такими Именем и Фамилией уже существует', 'error')
                return
            }
        } catch (e) {
            console.error('Error checking uniqueness', e)
            addToast('Ошибка соединения с сервером', 'error')
            return
        }
        // ------------------------------------------------------------------
        if (bidAmount < 10) {
            addToast('Минимальная 1-я ставка: 10 HH', 'warning')
            return
        }
        if (balance < totalCost) {
            addToast(`Недостаточно средств. Нужно ${totalCost} HH (создание + ставка)`, 'error')
            return
        }

        setIsCreating(true)
        addToast('Ожидание on-chain транзакции (~15-30 сек). Не закрывайте страницу...', 'info')

        try {
            const res = await fetch('/api/auctions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.id,
                    name: form.name.trim(),
                    firstName: first,
                    lastName: last,
                    color: selectedColor,
                    image: imagePreview,
                    emoji: null,
                    isGif,
                    collectionId: form.collectionId || null,
                    collectionName: selectedCollection?.name || null,
                    startPrice: bidAmount,
                    bidStep: 1,
                    buyNowPrice: null,
                    auctionDuration,
                    mintCost: createCost
                })
            })

            const data = await res.json()
            if (!res.ok) {
                addToast(data.error || 'Ошибка блокчейна (возможно, нужен TON для газа)', 'error')
                setIsCreating(false)
                return
            }

            addToast(`NFT "${form.name}" на аукционе! 🎉 (on-chain)`, 'success')
            setIsCreating(false)
            navigate('/nft')
        } catch (e) {
            addToast('Ошибка сети при транзакции', 'error')
            setIsCreating(false)
        }
    }

    return (
        <div className="fade-in">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Создать <span className="gradient-text">NFT</span></h1>
                    <p className="page-subtitle">Создайте NFT и выставьте на аукцион</p>
                </div>
            </div>

            <div className="create-nft-layout">
                {/* ── Preview ── */}
                <motion.div
                    className="nft-preview-area"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                >
                    <div className="nft-preview-card">
                        <div
                            className="nft-preview-image"
                            style={{
                                borderStyle: imagePreview ? 'none' : 'dashed',
                                background: imagePreview
                                    ? 'linear-gradient(135deg, rgba(124,58,237,0.3), rgba(37,99,235,0.3))'
                                    : undefined,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                width: '256px', height: '256px', maxWidth: '100%',
                                position: 'relative', overflow: 'hidden',
                            }}
                        >
                            {imagePreview && (
                                <img src={imagePreview} alt="Preview"
                                    style={{
                                        width: '64px', height: '64px',
                                        objectFit: 'cover', borderRadius: '8px',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                                    }} />
                            )}
                            {!imagePreview && (
                                <div style={{ textAlign: 'center' }}>
                                    <FiImage size={40} style={{ marginBottom: '8px', opacity: 0.5 }} />
                                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                                        256×256 пикселей
                                    </div>
                                </div>
                            )}
                            {isGif && imagePreview && (
                                <div style={{
                                    position: 'absolute', top: '6px', left: '6px',
                                    background: 'var(--color-accent)', color: 'white',
                                    padding: '2px 8px', borderRadius: 'var(--radius-sm)',
                                    fontSize: '10px', fontWeight: 700,
                                }}>GIF</div>
                            )}
                        </div>
                        <div className="nft-preview-info">
                            <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, marginBottom: 'var(--space-xs)' }}>
                                {form.name || 'Название NFT'}
                            </h3>
                            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                                {getCharacterDisplay()}
                            </p>
                            {selectedCollection && (
                                <span style={{
                                    display: 'inline-block', fontSize: '10px', fontWeight: 600,
                                    padding: '2px 8px', borderRadius: 'var(--radius-sm)',
                                    background: 'rgba(124,58,237,0.15)', color: 'var(--color-accent-light)',
                                    marginBottom: 'var(--space-sm)',
                                }}>
                                    {selectedCollection.emoji} {selectedCollection.name}
                                </span>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{
                                    fontSize: 'var(--font-size-md)', fontWeight: 700,
                                    color: 'var(--color-accent-light)'
                                }}>
                                    {bidAmount > 0 ? `${bidAmount} HH` : 'от 10 HH'}
                                </span>
                                <span className="badge-status active" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <FiClock size={10} /> {formatDurationLabel(auctionDuration)}
                                </span>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* ── Form ── */}
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    <form onSubmit={handleCreate} className="section-card glass">
                        <h2 className="section-card-title" style={{ marginBottom: 'var(--space-lg)' }}>Детали NFT</h2>

                        {/* Image upload */}
                        <div style={{ marginBottom: 'var(--space-lg)' }}>
                            <label style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 'var(--space-xs)' }}>
                                Изображение / GIF *
                            </label>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/png,image/jpeg,image/gif,image/webp"
                                onChange={handleImageSelect}
                                style={{ display: 'none' }}
                            />
                            {imagePreview ? (
                                <div style={{
                                    position: 'relative', borderRadius: 'var(--radius-md)', overflow: 'hidden',
                                    border: '2px solid var(--color-accent)', width: '256px', height: '256px', maxWidth: '100%',
                                }}>
                                    <img
                                        src={imagePreview}
                                        alt="Preview"
                                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                    />
                                    <button
                                        type="button"
                                        onClick={removeImage}
                                        style={{
                                            position: 'absolute', top: '8px', right: '8px',
                                            width: '28px', height: '28px', borderRadius: 'var(--radius-full)',
                                            background: 'rgba(0,0,0,0.6)', border: 'none', color: 'white',
                                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}
                                    >
                                        <FiX size={14} />
                                    </button>
                                    {isGif && (
                                        <div style={{
                                            position: 'absolute', bottom: '8px', left: '8px',
                                            background: 'var(--color-accent)', color: 'white',
                                            padding: '3px 10px', borderRadius: 'var(--radius-sm)',
                                            fontSize: '11px', fontWeight: 700,
                                        }}>🎬 GIF — {NFT_CREATE_COST_GIF} HH</div>
                                    )}
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    style={{
                                        width: '256px', maxWidth: '100%', height: '180px',
                                        border: '2px dashed var(--color-border)',
                                        borderRadius: 'var(--radius-md)', background: 'var(--color-bg-input)',
                                        cursor: 'pointer', display: 'flex', flexDirection: 'column',
                                        alignItems: 'center', justifyContent: 'center', gap: '8px',
                                        color: 'var(--color-text-muted)',
                                        transition: 'all 0.2s ease', fontFamily: 'var(--font-family)',
                                    }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.borderColor = 'var(--color-accent)'
                                        e.currentTarget.style.color = 'var(--color-accent-light)'
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.borderColor = 'var(--color-border)'
                                        e.currentTarget.style.color = 'var(--color-text-muted)'
                                    }}
                                >
                                    <FiUpload size={24} />
                                    <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>Загрузить изображение</span>
                                    <span style={{ fontSize: 'var(--font-size-xs)' }}>PNG, JPG, WebP — 25 HH | GIF — 55 HH</span>
                                    <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>Макс. 256×256 пикселей • до 10 МБ</span>
                                </button>
                            )}
                        </div>

                        {/* Name */}
                        <div className="input-group" style={{ marginBottom: 'var(--space-lg)' }}>
                            <label>Название NFT *</label>
                            <input
                                className="input"
                                placeholder="Мой NFT"
                                value={form.name}
                                onChange={e => handleChange('name', e.target.value)}
                                maxLength={50}
                            />
                        </div>

                        {/* Character First + Last name */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
                            <div className="input-group">
                                <label>Имя *</label>
                                <input
                                    className="input"
                                    placeholder="Иван"
                                    value={form.firstName}
                                    onChange={e => handleChange('firstName', e.target.value)}
                                    maxLength={30}
                                />
                            </div>
                            <div className="input-group">
                                <label>Фамилия *</label>
                                <input
                                    className="input"
                                    placeholder="Иванов"
                                    value={form.lastName}
                                    onChange={e => handleChange('lastName', e.target.value)}
                                    maxLength={30}
                                />
                            </div>
                        </div>

                        {/* Color Selector */}
                        <div className="input-group" style={{ marginBottom: 'var(--space-lg)' }}>
                            <label>Цвет фона *</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', maxHeight: '150px', overflowY: 'auto', padding: '10px', background: 'var(--color-bg-input)', borderRadius: 'var(--radius-md)' }}>
                                {Object.entries(COLOR_NAMES).map(([hex, name]) => (
                                    <button
                                        key={hex}
                                        type="button"
                                        onClick={() => setSelectedColor(hex)}
                                        title={name}
                                        style={{
                                            width: '28px', height: '28px', borderRadius: '50%', background: hex,
                                            border: selectedColor === hex ? '2px solid white' : '1px solid rgba(255,255,255,0.2)',
                                            outline: selectedColor === hex ? '2px solid var(--color-accent)' : 'none',
                                            cursor: 'pointer'
                                        }}
                                    />
                                ))}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '8px' }}>
                                Выбранный цвет: <strong style={{ color: selectedColor }}>{selectedColor ? COLOR_NAMES[selectedColor] : 'Не выбран'}</strong>
                            </div>
                        </div>

                        {/* Display info */}
                        <div style={{
                            padding: 'var(--space-sm) var(--space-md)',
                            background: 'var(--color-bg-input)',
                            borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-md)',
                            fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)',
                        }}>
                            Имя/Фамилия: <strong style={{ color: 'var(--color-text-primary)' }}>{getCharacterDisplay()}</strong>
                        </div>

                        {/* Collection selector */}
                        <div className="input-group" style={{ marginBottom: 'var(--space-lg)' }}>
                            <label>Коллекция</label>
                            <select
                                className="input"
                                value={form.collectionId}
                                onChange={e => handleChange('collectionId', e.target.value)}
                            >
                                <option value="">Без коллекции</option>
                                {collections.map(c => (
                                    <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* ═══ Первая ставка (обязательная) ═══ */}
                        <div className="input-group" style={{ marginBottom: 'var(--space-lg)' }}>
                            <label>
                                Первая ставка (обязательная) *
                                <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: '8px' }}>мин. 10 HH</span>
                            </label>
                            <input
                                className="input"
                                type="number"
                                min={10}
                                step={1}
                                placeholder="10"
                                value={firstBid}
                                onChange={e => setFirstBid(e.target.value)}
                                onBlur={e => { if (e.target.value === '') setFirstBid('0') }}
                            />
                            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                                Спишется при создании. Вы станете первым участником аукциона.
                            </div>
                        </div>

                        {/* ═══ Длительность аукциона ═══ */}
                        <div className="input-group" style={{ marginBottom: 'var(--space-lg)' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <FiClock size={14} /> Длительность аукциона
                            </label>

                            {/* Quick presets */}
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
                                {DURATION_OPTIONS.map(opt => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => applyPreset(opt.value)}
                                        className={auctionDuration === opt.value ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                                        style={{ fontSize: '11px' }}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>

                            {/* Manual input — always visible */}
                            <div style={{
                                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px',
                                background: 'rgba(255,255,255,0.03)', padding: '14px',
                                borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)',
                            }}>
                                <div>
                                    <label style={{ fontSize: '10px', color: 'var(--color-text-muted)', display: 'block', marginBottom: '4px', textAlign: 'center' }}>Дни</label>
                                    <input
                                        className="input" type="number" min={0} max={30}
                                        value={durDays}
                                        onChange={e => { setDurDays(e.target.value); syncDuration(e.target.value, durHours, durMinutes, durSeconds) }}
                                        onBlur={e => { if (e.target.value === '') { setDurDays('0'); syncDuration('0', durHours, durMinutes, durSeconds) } }}
                                        style={{ textAlign: 'center', fontSize: '16px', fontWeight: 700 }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '10px', color: 'var(--color-text-muted)', display: 'block', marginBottom: '4px', textAlign: 'center' }}>Часы</label>
                                    <input
                                        className="input" type="number" min={0} max={23}
                                        value={durHours}
                                        onChange={e => { setDurHours(e.target.value); syncDuration(durDays, e.target.value, durMinutes, durSeconds) }}
                                        onBlur={e => { if (e.target.value === '') { setDurHours('0'); syncDuration(durDays, '0', durMinutes, durSeconds) } }}
                                        style={{ textAlign: 'center', fontSize: '16px', fontWeight: 700 }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '10px', color: 'var(--color-text-muted)', display: 'block', marginBottom: '4px', textAlign: 'center' }}>Минуты</label>
                                    <input
                                        className="input" type="number" min={0} max={59}
                                        value={durMinutes}
                                        onChange={e => { setDurMinutes(e.target.value); syncDuration(durDays, durHours, e.target.value, durSeconds) }}
                                        onBlur={e => { if (e.target.value === '') { setDurMinutes('0'); syncDuration(durDays, durHours, '0', durSeconds) } }}
                                        style={{ textAlign: 'center', fontSize: '16px', fontWeight: 700 }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '10px', color: 'var(--color-text-muted)', display: 'block', marginBottom: '4px', textAlign: 'center' }}>Секунды</label>
                                    <input
                                        className="input" type="number" min={0} max={59}
                                        value={durSeconds}
                                        onChange={e => { setDurSeconds(e.target.value); syncDuration(durDays, durHours, durMinutes, e.target.value) }}
                                        onBlur={e => { if (e.target.value === '') { setDurSeconds('0'); syncDuration(durDays, durHours, durMinutes, '0') } }}
                                        style={{ textAlign: 'center', fontSize: '16px', fontWeight: 700 }}
                                    />
                                </div>
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--color-accent-light)', textAlign: 'center', marginTop: '8px', fontWeight: 600 }}>
                                ⏱ Итого: {formatDurationLabel(auctionDuration)}
                            </div>
                        </div>

                        {/* Cost breakdown */}
                        <div style={{
                            padding: 'var(--space-md)', background: 'var(--color-bg-input)',
                            borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-lg)',
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                                    Создание NFT {isGif ? '(GIF)' : '(изображение)'}
                                </span>
                                <span style={{ fontWeight: 700, color: isGif ? 'var(--color-warning)' : 'var(--color-accent-light)' }}>
                                    {createCost} HH
                                </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                                    Первая ставка
                                </span>
                                <span style={{ fontWeight: 700, color: 'var(--color-warning)' }}>
                                    {bidAmount > 0 ? `${bidAmount} HH` : '—'}
                                </span>
                            </div>
                            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontWeight: 700 }}>Итого</span>
                                <span style={{ fontWeight: 800, fontSize: 'var(--font-size-md)', color: 'var(--color-accent-light)' }}>
                                    {totalCost} HH
                                </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
                                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Длительность аукциона</span>
                                <span style={{ fontSize: 'var(--font-size-xs)' }}>{formatDurationLabel(auctionDuration)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Комиссия при продаже</span>
                                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-warning)' }}>30%</span>
                            </div>
                        </div>

                        {/* Balance */}
                        <div style={{
                            fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)',
                            marginBottom: 'var(--space-md)',
                        }}>
                            Ваш баланс: <strong style={{ color: balance >= totalCost ? 'var(--color-success)' : 'var(--color-danger)' }}>
                                {balance.toLocaleString()} HH
                            </strong>
                            {balance < totalCost && (
                                <span style={{ color: 'var(--color-danger)', marginLeft: '8px' }}>
                                    (нужно ещё {totalCost - balance} HH)
                                </span>
                            )}
                        </div>

                        <button
                            type="submit"
                            className="btn btn-primary btn-lg"
                            style={{ width: '100%' }}
                            disabled={isCreating || balance < totalCost || bidAmount < 10}
                        >
                            {isCreating ? (
                                <>Создание...</>
                            ) : (
                                <><FiCheck /> Создать NFT + ставка ({totalCost} HH)</>
                            )}
                        </button>
                    </form>
                </motion.div>
            </div>
        </div>
    )
}
