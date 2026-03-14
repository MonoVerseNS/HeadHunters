import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { FiDollarSign, FiUsers, FiImage, FiArrowUpRight, FiPlus, FiCreditCard } from 'react-icons/fi'
import StatCard from '../components/UI/StatCard'
import { useWallet } from '../context/WalletContext'
import { useAuth } from '../context/AuthContext'

export default function DashboardPage() {
    const { balance, transactions, ownedNFTs } = useWallet()
    const { allUsers } = useAuth()

    // Подсчёт активных аукционов
    const [activeAuctions, setActiveAuctions] = useState(0)
    useEffect(() => {
        try {
            const auctions = JSON.parse(localStorage.getItem('hh_auctions') || '[]')
            setActiveAuctions(auctions.filter(a => a.endsAt > Date.now()).length)
        } catch { setActiveAuctions(0) }
    }, [])

    const recentTx = transactions.slice(0, 5)

    const txTypeLabels = {
        deposit: 'Пополнение',
        withdraw: 'Вывод',
        nft_create: 'Создание NFT',
        bid: 'Ставка',
        refund: 'Возврат',
        sale: 'Продажа',
    }

    const txTypeColors = {
        deposit: 'var(--color-success)',
        withdraw: 'var(--color-danger)',
        nft_create: 'var(--color-accent-light)',
        bid: 'var(--color-warning)',
        refund: 'var(--color-info)',
        sale: 'var(--color-success)',
    }

    return (
        <div className="fade-in">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Добро пожаловать 👋</h1>
                    <p className="page-subtitle">Обзор платформы HeadHunters</p>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="stats-grid" style={{ marginBottom: 'var(--space-xl)' }}>
                <StatCard
                    icon={<FiDollarSign />}
                    label="Баланс"
                    value={`${balance.toLocaleString()} HH`}
                    change="HeadHunters Coins"
                    colorClass="purple"
                    delay={0}
                />
                <StatCard
                    icon={<FiImage />}
                    label="Мои NFT"
                    value={ownedNFTs.length}
                    change="В кошельке"
                    colorClass="blue"
                    delay={0.1}
                />
                <StatCard
                    icon={<FiCreditCard />}
                    label="Активные аукционы"
                    value={activeAuctions}
                    change="Идут сейчас"
                    colorClass="green"
                    delay={0.2}
                />
                <StatCard
                    icon={<FiUsers />}
                    label="Пользователи"
                    value={allUsers.length}
                    change="На платформе"
                    colorClass="purple"
                    delay={0.3}
                />
            </div>

            {/* Quick Actions */}
            <motion.div
                className="section-card glass"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                style={{ marginBottom: 'var(--space-xl)' }}
            >
                <div className="section-card-header">
                    <h2 className="section-card-title">Быстрые действия</h2>
                </div>
                <div className="quick-actions">
                    <Link to="/nft" className="quick-action-card glass">
                        <div className="quick-action-icon" style={{ background: 'rgba(124,58,237,0.15)', color: 'var(--color-accent-light)' }}>
                            <FiImage />
                        </div>
                        <span className="quick-action-label">Аукцион NFT</span>
                    </Link>
                    <Link to="/nft/create" className="quick-action-card glass">
                        <div className="quick-action-icon" style={{ background: 'rgba(59,130,246,0.15)', color: 'var(--color-info)' }}>
                            <FiPlus />
                        </div>
                        <span className="quick-action-label">Создать NFT</span>
                    </Link>
                    <Link to="/profile" className="quick-action-card glass">
                        <div className="quick-action-icon" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}>
                            <FiCreditCard />
                        </div>
                        <span className="quick-action-label">Кошелёк</span>
                    </Link>
                </div>
            </motion.div>

            {/* Recent Transactions */}
            <motion.div
                className="section-card glass"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
            >
                <div className="section-card-header">
                    <h2 className="section-card-title">Последние транзакции</h2>
                    <Link to="/profile" className="btn btn-ghost btn-sm">
                        Все транзакции <FiArrowUpRight />
                    </Link>
                </div>
                <div className="table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Тип</th>
                                <th>Сумма</th>
                                <th>Описание</th>
                                <th>Статус</th>
                                <th>Время</th>
                            </tr>
                        </thead>
                        <tbody>
                            {recentTx.map(tx => {
                                const isPositive = ['deposit', 'refund', 'sale'].includes(tx.type)
                                return (
                                    <tr key={tx.id}>
                                        <td>
                                            <span style={{
                                                color: txTypeColors[tx.type] || 'var(--color-text-muted)',
                                                fontWeight: 600,
                                                fontSize: 'var(--font-size-xs)'
                                            }}>
                                                {txTypeLabels[tx.type] || tx.type}
                                            </span>
                                        </td>
                                        <td style={{
                                            fontWeight: 600, fontFamily: 'monospace',
                                            color: isPositive ? 'var(--color-success)' : 'var(--color-danger)',
                                        }}>
                                            {isPositive ? '+' : '-'}{tx.amount.toLocaleString()} HH
                                        </td>
                                        <td style={{ color: 'var(--color-text-secondary)' }}>{tx.description}</td>
                                        <td>
                                            <span className="badge-status active">
                                                Выполнен
                                            </span>
                                        </td>
                                        <td style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>
                                            {tx.created_at ? new Date(tx.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </motion.div>
        </div>
    )
}
