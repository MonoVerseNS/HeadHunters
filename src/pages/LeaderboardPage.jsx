import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FiDollarSign, FiImage, FiZap, FiTrendingUp, FiAward } from 'react-icons/fi'
import { useAuth } from '../context/AuthContext'
import UserAvatar from '../components/UI/UserAvatar'

const TABS = [
    { id: 'balance', label: 'Баланс', icon: <FiDollarSign />, emoji: '💰' },
    // Temporarily hidden or disabled until backend supports them? 
    // Or keep them but they will show 0 for others.
    { id: 'nfts', label: 'NFT', icon: <FiImage />, emoji: '🖼️' },
    { id: 'clicker', label: 'Кликер', icon: <FiZap />, emoji: '⚡' },
    { id: 'sales', label: 'Продажи', icon: <FiTrendingUp />, emoji: '📈' },
]

const MEDALS = ['🥇', '🥈', '🥉']

export default function LeaderboardPage() {
    const { user } = useAuth()
    const [activeTab, setActiveTab] = useState('balance')
    const [leaderboardData, setLeaderboardData] = useState([])
    const [isLoading, setIsLoading] = useState(true)

    // Fetch leaderboard from API
    useEffect(() => {
        const fetchLeaderboard = async () => {
            try {
                const res = await fetch('/api/leaderboard')
                if (res.ok) {
                    const data = await res.json()
                    setLeaderboardData(data)
                }
            } catch (e) {
                console.error('Leaderboard fetch error:', e)
            } finally {
                setIsLoading(false)
            }
        }
        fetchLeaderboard()
        // Poll every 30s
        const interval = setInterval(fetchLeaderboard, 5000)
        return () => clearInterval(interval)
    }, [])

    // ── Build rankings ──
    const rankings = useMemo(() => {
        // Map API data to view model
        // API returns: id, username, first_name, avatar, balance, role
        // Missing: nftCount, clickerScore, salesRevenue (default 0 for now)
        const entries = leaderboardData.map(u => ({
            id: u.id,
            username: u.username,
            firstName: u.first_name, // API uses snake_case, but db.js maps it? 
            // Wait, server/server.js: SELECT id, username, first_name ...
            // SQLite returns column names. 'first_name'.
            avatar: u.avatar,
            balance: u.balance || 0,
            nftCount: u.nft_count || 0,
            clickerScore: 0,
            salesRevenue: 0,
        }))

        return {
            balance: [...entries].sort((a, b) => b.balance - a.balance),
            nfts: [...entries].sort((a, b) => b.nftCount - a.nftCount),
            clicker: [...entries].sort((a, b) => b.clickerScore - a.clickerScore),
            sales: [...entries].sort((a, b) => b.salesRevenue - a.salesRevenue),
        }
    }, [leaderboardData])

    const getValue = (entry, tab) => {
        switch (tab) {
            case 'balance': return `${entry.balance.toLocaleString()} HH`
            case 'nfts': return `${entry.nftCount} шт.`
            case 'clicker': return `${entry.clickerScore.toLocaleString()} HH`
            case 'sales': return `${entry.salesRevenue.toLocaleString()} HH`
            default: return ''
        }
    }

    const currentRanking = rankings[activeTab] || []
    const currentUserRank = currentRanking.findIndex(u => u.id === user?.id)

    return (
        <div className="fade-in">
            <div className="page-header">
                <div>
                    <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <FiAward style={{ color: 'var(--color-warning)' }} /> Лидерборд
                    </h1>
                    <p className="page-subtitle">Рейтинг пользователей платформы</p>
                </div>
                {currentUserRank >= 0 && (
                    <div style={{
                        padding: '8px 16px', borderRadius: 'var(--radius-md)',
                        background: 'linear-gradient(135deg, rgba(124,58,237,0.2), rgba(99,102,241,0.2))',
                        border: '1px solid rgba(124,58,237,0.3)',
                        fontSize: '13px', fontWeight: 600,
                    }}>
                        Вы на <span style={{ color: 'var(--color-accent-light)', fontSize: '16px' }}>#{currentUserRank + 1}</span> месте
                    </div>
                )}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: 'var(--space-lg)', flexWrap: 'wrap' }}>
                {TABS.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                        className={activeTab === tab.id ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {tab.emoji} {tab.label}
                    </button>
                ))}
            </div>

            {isLoading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}>Загрузка рейтинга...</div>
            ) : (
                <>
                    {/* Top 3 Podium */}
                    {currentRanking.length >= 3 && activeTab === 'balance' && (
                        <div style={{
                            display: 'grid', 
                            gridTemplateColumns: window.innerWidth < 480 ? '1fr' : '1fr 1fr 1fr', 
                            gap: '12px',
                            marginBottom: 'var(--space-xl)',
                        }}>
                            {[1, 0, 2].map(idx => {
                                const entry = currentRanking[idx]
                                if (!entry) return null
                                const isFirst = idx === 0
                                return (
                                    <motion.div key={entry.id}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: idx * 0.1 }}
                                        style={{
                                            background: isFirst
                                                ? 'linear-gradient(135deg, rgba(250,204,21,0.15), rgba(245,158,11,0.1))'
                                                : 'rgba(255,255,255,0.03)',
                                            border: `1px solid ${isFirst ? 'rgba(250,204,21,0.3)' : 'var(--color-border)'}`,
                                            borderRadius: 'var(--radius-lg)',
                                            padding: isFirst ? '24px 16px' : '20px 16px',
                                            textAlign: 'center',
                                            order: idx === 1 ? 0 : idx === 0 ? 1 : 2,
                                            transform: isFirst ? 'scale(1.05)' : 'none',
                                        }}
                                    >
                                        <div style={{ fontSize: isFirst ? '40px' : '32px', marginBottom: '8px' }}>
                                            {MEDALS[idx]}
                                        </div>
                                        <div style={{
                                            width: isFirst ? '56px' : '44px', height: isFirst ? '56px' : '44px',
                                            borderRadius: '50%', margin: '0 auto 8px',
                                            background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent))',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: isFirst ? '24px' : '18px',
                                            border: isFirst ? '3px solid rgba(250,204,21,0.5)' : '2px solid var(--color-border)',
                                        }}>
                                            <UserAvatar user={entry} style={{ fontSize: isFirst ? '24px' : '18px', color: 'white', fontWeight: 700 }} />
                                        </div>
                                        <div style={{
                                            fontWeight: 700, fontSize: isFirst ? '15px' : '13px',
                                            marginBottom: '4px', color: 'var(--color-text-primary)',
                                        }}>
                                            @{entry.username}
                                        </div>
                                        <div style={{
                                            fontWeight: 800, fontSize: isFirst ? '18px' : '14px',
                                            color: isFirst ? 'var(--color-warning)' : 'var(--color-accent-light)',
                                        }}>
                                            {getValue(entry, activeTab)}
                                        </div>
                                    </motion.div>
                                )
                            })}
                        </div>
                    )}

                    {/* Full List */}
                    <AnimatePresence mode="wait">
                        <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                            <div className="glass" style={{ padding: '0', overflow: 'hidden' }}>
                                <div style={{
                                    padding: '16px 20px', borderBottom: '1px solid var(--color-border)',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                }}>
                                    <h3 style={{ fontSize: '14px', fontWeight: 600 }}>
                                        Полный рейтинг · {TABS.find(t => t.id === activeTab)?.label}
                                    </h3>
                                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                        {currentRanking.length} участников
                                    </span>
                                </div>

                                <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                                    {currentRanking.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--color-text-muted)' }}>
                                            <FiAward size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
                                            <p>Пока нет данных для рейтинга</p>
                                        </div>
                                    ) : currentRanking.map((entry, idx) => {
                                        const isCurrentUser = entry.id === user?.id
                                        const isTop3 = idx < 3
                                        return (
                                            <motion.div key={entry.id}
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: Math.min(idx * 0.03, 0.5) }}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '12px',
                                                    padding: '12px 20px',
                                                    borderBottom: '1px solid var(--color-border)',
                                                    background: isCurrentUser
                                                        ? 'linear-gradient(90deg, rgba(124,58,237,0.1), transparent)'
                                                        : 'transparent',
                                                    transition: 'background 0.2s ease',
                                                }}
                                                onMouseEnter={e => { if (!isCurrentUser) e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                                                onMouseLeave={e => { if (!isCurrentUser) e.currentTarget.style.background = 'transparent' }}
                                            >
                                                {/* Rank */}
                                                <div style={{
                                                    width: '32px', textAlign: 'center', fontWeight: 800,
                                                    fontSize: isTop3 ? '18px' : '13px',
                                                    color: isTop3 ? 'var(--color-warning)' : 'var(--color-text-muted)',
                                                }}>
                                                    {isTop3 ? MEDALS[idx] : `#${idx + 1}`}
                                                </div>

                                                {/* Avatar */}
                                                <div style={{
                                                    width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                                                    background: isCurrentUser
                                                        ? 'linear-gradient(135deg, var(--color-primary), var(--color-accent))'
                                                        : 'var(--color-bg-input)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: '16px',
                                                    border: isCurrentUser ? '2px solid var(--color-accent-light)' : '1px solid var(--color-border)',
                                                }}>
                                                    <UserAvatar user={entry} style={{ fontSize: '14px', color: isCurrentUser ? 'white' : 'var(--color-text-secondary)', fontWeight: 600 }} />
                                                </div>

                                                {/* Name */}
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{
                                                        fontWeight: isCurrentUser ? 700 : 500,
                                                        fontSize: '13px', color: 'var(--color-text-primary)',
                                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                    }}>
                                                        @{entry.username}
                                                        {isCurrentUser && (
                                                            <span style={{
                                                                marginLeft: '6px', fontSize: '9px', padding: '2px 6px',
                                                                borderRadius: '4px', background: 'var(--color-primary)',
                                                                color: '#fff', fontWeight: 700,
                                                            }}>ВЫ</span>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                                                        {entry.firstName}
                                                    </div>
                                                </div>

                                                {/* Value */}
                                                <div style={{
                                                    fontWeight: 700, fontSize: '14px', whiteSpace: 'nowrap',
                                                    color: isTop3 ? 'var(--color-accent-light)' : 'var(--color-text-secondary)',
                                                }}>
                                                    {getValue(entry, activeTab)}
                                                </div>
                                            </motion.div>
                                        )
                                    })}
                                </div>
                            </div>
                        </motion.div>
                    </AnimatePresence>
                </>
            )}
        </div>
    )
}
