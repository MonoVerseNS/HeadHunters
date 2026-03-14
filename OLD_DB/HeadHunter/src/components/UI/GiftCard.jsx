import { useRef, useEffect, useState } from 'react'
import { getColorHex } from '../../config'


// ── GiftCard ──
// Reusable card for gifts/NFTs.
// color → renders as background tint (NOT a label).
// No upgrade badge on card — upgrade info lives in detail modal only.
export default function GiftCard({
    id,
    name,
    image,
    emoji,
    isGif,
    price,         // null = no price shown (for profile cards)
    color,         // used as background tint color
    collectionName,

    status,        // 'active' | 'hidden' | 'auction'
    children,
    onClick,
}) {
    const isBanned = status === 'hidden'

    // Resolve named color if needed
    const resolvedColor = (color && !color.startsWith('#') && !color.includes('gradient')) ? getColorHex(color) : color

    // Visual style: color tint > default
    const visualStyle = resolvedColor
        ? {
            background: `linear-gradient(135deg, ${resolvedColor}80, ${resolvedColor}25)`,
            borderColor: `${resolvedColor}50`,
            boxShadow: `0 0 25px ${resolvedColor}15`
        }
        : { background: 'var(--color-bg-tertiary, rgba(255,255,255,0.03))' }

    // ── One-shot GIF: freeze after first play ──
    const imgRef = useRef(null)
    const canvasRef = useRef(null)
    const [frozen, setFrozen] = useState(false)

    useEffect(() => {
        if (!isGif || !image || frozen) return
        const img = imgRef.current
        if (!img) return

        const freeze = () => {
            const canvas = canvasRef.current
            if (canvas && img.naturalWidth) {
                canvas.width = img.naturalWidth
                canvas.height = img.naturalHeight
                const ctx = canvas.getContext('2d')
                ctx.drawImage(img, 0, 0)
                setFrozen(true)
            }
        }

        if (img.complete && img.naturalWidth) {
            const t = setTimeout(freeze, 3000)
            return () => clearTimeout(t)
        }
        const onLoad = () => { const t = setTimeout(freeze, 3000); img._ft = t }
        img.addEventListener('load', onLoad, { once: true })
        return () => { img.removeEventListener('load', onLoad); clearTimeout(img._ft) }
    }, [isGif, image, frozen])

    const shortId = id ? `#${id.slice(-8)}` : ''

    return (
        <div
            className={`gift-card nft-card-hover ${isBanned ? 'gift-card-banned' : ''}`}
            style={{ cursor: onClick ? 'pointer' : 'default' }}
            onClick={onClick}
        >
            {/* ── Visual area ── */}
            <div className="gift-card-visual" style={visualStyle}>
                {image ? (
                    frozen ? (
                        <canvas ref={canvasRef} className="gift-card-img" />
                    ) : (
                        <img ref={imgRef} src={image} alt={name} className="gift-card-img" />
                    )
                ) : (
                    <div className="gift-card-emoji">{emoji || '🎁'}</div>
                )}

                {isGif && <span className="gift-card-badge" style={{ background: color || 'var(--color-accent)' }}>GIF</span>}
                {isBanned && <span className="gift-card-badge gift-card-badge-ban">🚫 Скрыт</span>}

                {price != null && (
                    <span className="gift-card-price">{price} HH</span>
                )}
            </div>

            {/* ── Info area ── */}
            <div className="gift-card-info">
                <div className="gift-card-name">{name || 'Unnamed'}</div>
                <div className="gift-card-meta">
                    {shortId && <span className="gift-card-id" title={id}>{shortId}</span>}
                    {color && !color.startsWith('#') && <span className="gift-card-color-tag" style={{ fontSize: '10px', color: 'var(--color-text-muted)', border: '1px solid rgba(255,255,255,0.1)', padding: '0 4px', borderRadius: '4px' }}>{color}</span>}
                    {collectionName && <span className="gift-card-collection">{collectionName}</span>}
                </div>
                {children && (
                    <div className="gift-card-actions" onClick={e => e.stopPropagation()}>
                        {children}
                    </div>
                )}
            </div>
        </div>
    )
}
