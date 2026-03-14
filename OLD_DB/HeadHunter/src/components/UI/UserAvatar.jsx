import { useState, useEffect } from 'react'

export default function UserAvatar({ user, className, style }) {
    const [imgError, setImgError] = useState(false)
    const rawAvatar = user?.avatar || user?.photoUrl

    useEffect(() => {
        setImgError(false)
    }, [rawAvatar])

    // Proxy Telegram URLs through our server to bypass CORS / referrer issues
    const getAvatarSrc = () => {
        if (!rawAvatar || typeof rawAvatar !== 'string' || !rawAvatar.trim().startsWith('http')) return null
        if (rawAvatar.includes('t.me/') || rawAvatar.includes('telegram.org/')) {
            return `/api/avatar/proxy?url=${encodeURIComponent(rawAvatar)}`
        }
        return rawAvatar
    }

    const avatar = getAvatarSrc()
    const isUrl = !imgError && !!avatar

    // Robust initials calculation — try ALL possible fields
    const getInitials = () => {
        if (!user) return '??'

        // 1. Try firstName (camelCase from mapUser)
        const fn = (user.firstName || user.first_name || '')?.trim()
        if (fn) return fn[0].toUpperCase()

        // 2. Try Username
        const un = (user.username || '')?.trim()
        if (un) return un.slice(0, 2).toUpperCase()

        // 3. Try telegram_id last digits
        const tg = user.telegramId || user.telegram_id || ''
        if (tg) return tg.slice(-2)

        return '??'
    }

    const initials = getInitials()

    if (isUrl) {
        return (
            <img
                src={avatar}
                alt={user?.username || 'Avatar'}
                className={className}
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', ...style }}
                onError={() => setImgError(true)}
                referrerPolicy="no-referrer"
            />
        )
    }

    // Return text initials with explicit white color
    return (
        <div
            className={className}
            style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                cursor: 'default',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: 'inherit',
                ...style
            }}
            title={user?.username || 'User'}
        >
            {initials}
        </div>
    )
}
