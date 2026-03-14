import { useLocation } from 'react-router-dom'
import { useState, useRef, useEffect, useCallback } from 'react'
import { FiBell, FiCheck, FiCheckCircle } from 'react-icons/fi'
import { useAuth } from '../../context/AuthContext'
import WalletConnectButton from '../UI/WalletConnectButton'

const PAGE_TITLES = {
    '/': 'Дашборд',
    '/nft': 'NFT Аукцион',
    '/profile': 'Профиль',
    '/clicker': 'Кликер',
    '/leaderboard': 'Лидеры',
    '/admin': 'Модерация',
}

export default function Header() {
    const location = useLocation()
    const { user } = useAuth()

    const [notifOpen, setNotifOpen] = useState(false)
    const [notifications, setNotifications] = useState([])
    const [unreadCount, setUnreadCount] = useState(0)
    const notifRef = useRef(null)

    const title = PAGE_TITLES[location.pathname] || 'HeadHunters'

    // Fetch notifications
    const fetchNotifications = useCallback(async () => {
        if (!user?.id) return
        try {
            const [notifsRes, countRes] = await Promise.all([
                fetch(`/api/notifications/${user.id}`),
                fetch(`/api/notifications/${user.id}/unread-count`)
            ])
            if (notifsRes.ok) setNotifications(await notifsRes.json())
            if (countRes.ok) {
                const data = await countRes.json()
                setUnreadCount(data.count || 0)
            }
        } catch (e) {
            // Silently fail
        }
    }, [user?.id])

    // Poll every 30s + fetch on mount
    useEffect(() => {
        fetchNotifications()
        const interval = setInterval(fetchNotifications, 30000)
        return () => clearInterval(interval)
    }, [fetchNotifications])

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (notifRef.current && !notifRef.current.contains(event.target)) {
                setNotifOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    // Mark all as read
    const markAllRead = async () => {
        if (!user?.id) return
        try {
            await fetch(`/api/notifications/${user.id}/read-all`, { method: 'POST' })
            setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })))
            setUnreadCount(0)
        } catch (e) { /* ignore */ }
    }

    // Mark single as read
    const markRead = async (id) => {
        try {
            await fetch(`/api/notifications/${id}/read`, { method: 'POST' })
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n))
            setUnreadCount(prev => Math.max(0, prev - 1))
        } catch (e) { /* ignore */ }
    }

    // Format time
    const timeAgo = (dateStr) => {
        const diff = Date.now() - new Date(dateStr + 'Z').getTime()
        const mins = Math.floor(diff / 60000)
        if (mins < 1) return 'сейчас'
        if (mins < 60) return `${mins} мин`
        const hours = Math.floor(mins / 60)
        if (hours < 24) return `${hours}ч`
        return `${Math.floor(hours / 24)}д`
    }

    return (
        <header className="header">
            <div className="header-left">
                <h1 className="header-title">{title}</h1>
            </div>

            <div className="header-right">
                {/* TON Wallet Connect */}
                <WalletConnectButton />

                {/* Notifications */}
                <div style={{ position: 'relative' }} ref={notifRef} className="header-notif-wrap">
                    <button className="header-icon-btn" title="Уведомления" onClick={() => { setNotifOpen(!notifOpen); if (!notifOpen) fetchNotifications() }}>
                        <FiBell />
                        {unreadCount > 0 && (
                            <span style={{
                                position: 'absolute', top: '-2px', right: '-2px',
                                background: 'var(--color-danger)', color: '#fff',
                                borderRadius: '50%', width: '18px', height: '18px',
                                fontSize: '10px', fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                border: '2px solid var(--color-bg)',
                            }}>
                                {unreadCount > 9 ? '9+' : unreadCount}
                            </span>
                        )}
                    </button>

                    {notifOpen && (
                        <div className="glass" style={{
                            position: 'absolute', top: '120%', right: 0, width: '320px',
                            background: '#1e1e2e', border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-md)', zIndex: 1000,
                            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                            maxHeight: '400px', overflow: 'hidden', display: 'flex', flexDirection: 'column',
                        }}>
                            {/* Header */}
                            <div style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '12px 16px', borderBottom: '1px solid var(--color-border)',
                            }}>
                                <span style={{ fontWeight: 600, fontSize: '13px' }}>Уведомления</span>
                                {unreadCount > 0 && (
                                    <button onClick={markAllRead} style={{
                                        background: 'none', border: 'none', cursor: 'pointer',
                                        color: 'var(--color-primary)', fontSize: '12px',
                                        display: 'flex', alignItems: 'center', gap: '4px',
                                    }}>
                                        <FiCheckCircle size={12} /> Прочитать все
                                    </button>
                                )}
                            </div>

                            {/* List */}
                            <div style={{ overflowY: 'auto', maxHeight: '340px' }}>
                                {notifications.length === 0 ? (
                                    <div style={{
                                        textAlign: 'center', padding: '30px 20px',
                                        color: 'var(--color-text-muted)', fontSize: '12px',
                                    }}>
                                        Нет уведомлений
                                    </div>
                                ) : (
                                    notifications.map(n => (
                                        <div key={n.id} onClick={() => !n.is_read && markRead(n.id)} style={{
                                            padding: '10px 16px',
                                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                                            background: n.is_read ? 'transparent' : 'rgba(var(--color-primary-rgb, 99, 102, 241), 0.08)',
                                            cursor: n.is_read ? 'default' : 'pointer',
                                            display: 'flex', gap: '10px', alignItems: 'flex-start',
                                        }}>
                                            {!n.is_read && (
                                                <div style={{
                                                    width: '6px', height: '6px', borderRadius: '50%',
                                                    background: 'var(--color-primary)', marginTop: '6px', flexShrink: 0,
                                                }} />
                                            )}
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '13px', lineHeight: '1.4', wordBreak: 'break-word' }}>
                                                    {n.message}
                                                </div>
                                                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                                                    {timeAgo(n.created_at)}
                                                </div>
                                            </div>
                                            {n.is_read && <FiCheck size={14} style={{ color: 'var(--color-text-muted)', marginTop: '2px', flexShrink: 0 }} />}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </header>
    )
}
