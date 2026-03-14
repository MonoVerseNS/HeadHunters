import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { FiHeart, FiCopy, FiCheckCircle } from 'react-icons/fi'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/UI/Toast'
import { toUserFriendlyAddress } from '../utils/ton'

export default function DonatePage() {
    const { user } = useAuth()
    const { addToast } = useToast()
    const [platformTonBalance, setPlatformTonBalance] = useState(0)
    const [platformAddress, setPlatformAddress] = useState('')
    const [senderWallet, setSenderWallet] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        const fetchPlatformWallet = async () => {
            try {
                const res = await fetch('/api/platform-wallet')
                if (res.ok) {
                    const data = await res.json()
                    setPlatformTonBalance(data.tonBalance || data.balance || 0)
                    setPlatformAddress(data.address || '')
                }
            } catch (err) {
                console.error('Failed to fetch platform wallet', err)
            }
        }
        fetchPlatformWallet()
        const interval = setInterval(fetchPlatformWallet, 30000)
        return () => clearInterval(interval)
    }, [])

    const copyAddress = () => {
        if (!platformAddress) return
        navigator.clipboard.writeText(toUserFriendlyAddress(platformAddress))
        setCopied(true)
        addToast('Адрес скопирован!', 'success')
        setTimeout(() => setCopied(false), 2000)
    }

    const handleSubmitDonate = async (e) => {
        e.preventDefault()
        if (!senderWallet.trim()) {
            addToast('Укажите ваш кошелек TON', 'error')
            return
        }

        setIsSubmitting(true)
        try {
            const res = await fetch('/api/donate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user?.id, senderWallet: senderWallet.trim() })
            })
            const data = await res.json()
            if (res.ok && data.success) {
                addToast('Ожидаем перевода! Автоматическая система начислит награду.', 'success')
                setSenderWallet('')
            } else {
                addToast(data.error || 'Ошибка при отправке', 'error')
            }
        } catch (error) {
            console.error(error)
            addToast('Ошибка сети', 'error')
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="fade-in" style={{ paddingBottom: '80px' }}>
            <div className="page-header">
                <div>
                    <h1 className="page-title"><span style={{ fontSize: '28px', marginRight: '10px' }}>❤️</span>Пожертвования</h1>
                    <p className="page-subtitle">Поддержите проект и оплатите газ платформы</p>
                </div>
            </div>

            <motion.div
                className="glass"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ padding: 'var(--space-xl)', marginBottom: 'var(--space-xl)' }}
            >
                <div style={{ textAlign: 'center', marginBottom: 'var(--space-xl)' }}>
                    <div style={{
                        width: '64px', height: '64px',
                        background: 'rgba(239, 68, 68, 0.1)',
                        color: 'var(--color-danger)',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 16px',
                        fontSize: '32px'
                    }}>
                        <FiHeart />
                    </div>
                    <h2 style={{ fontSize: '24px', marginBottom: '12px' }}>Зачем нам TON?</h2>
                    <p style={{ color: 'var(--color-text-secondary)', maxWidth: '600px', margin: '0 auto', lineHeight: '1.6' }}>
                        За счёт TON оплачиваются комиссии (gas) всех действий на платформе: минт NFT, трансферы и управление смарт-контрактами.
                        Если баланс платформы в TON заканчивается (менее ~0.05 TON), транзакции могут не проходить.
                    </p>
                </div>

                {platformTonBalance < 0.05 && (
                    <div style={{
                        background: 'rgba(239, 68, 68, 0.15)',
                        border: '1px solid var(--color-danger)',
                        borderRadius: 'var(--radius-md)',
                        padding: '16px',
                        marginBottom: '24px',
                        color: '#f87171',
                        textAlign: 'center'
                    }}>
                        **Ошибка:** На бирже не хватает TON. Транзакции могут не проходить.
                        Напишите администратору, или сами покройте газ за вознаграждение ниже!
                    </div>
                )}

                <div className="two-col-grid" style={{ gap: '24px' }}>
                    {/* INFO SIDE */}
                    <div style={{
                        background: 'rgba(0,0,0,0.2)',
                        borderRadius: 'var(--radius-lg)',
                        padding: '24px',
                        border: '1px solid var(--color-border)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center'
                    }}>
                        <h3 style={{ marginBottom: '16px', fontSize: '18px' }}>Баланс биржи</h3>
                        <div style={{ fontSize: '32px', fontWeight: 800, color: '#00B2FF', marginBottom: '8px' }}>
                            {platformTonBalance.toFixed(4)} <span style={{ fontSize: '18px' }}>TON</span>
                        </div>
                        <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '24px' }}>
                            Для бесперебойной работы нужно минимум 0.05 TON.
                        </p>

                        <h4 style={{ fontSize: '14px', marginBottom: '12px', color: 'var(--color-text-secondary)' }}>Адрес для пожертвований (TON)</h4>

                        <div style={{ marginBottom: '12px' }}>
                            <div style={{ fontSize: '14px', color: 'var(--color-primary)', fontWeight: 'bold' }}>
                                head-hunters.ton
                            </div>
                        </div>

                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: 'var(--radius-sm)'
                        }}>
                            <code style={{ flex: 1, fontSize: '11px', wordBreak: 'break-all', color: 'var(--color-primary)' }}>
                                {toUserFriendlyAddress(platformAddress) || 'Загрузка...'}
                            </code>
                            <button className="btn btn-ghost btn-sm" onClick={copyAddress} title="Копировать">
                                {copied ? <FiCheckCircle color="#22c55e" /> : <FiCopy />}
                            </button>
                        </div>
                    </div>
                    <div style={{
                        background: 'rgba(59, 130, 246, 0.05)',
                        border: '1px solid rgba(59, 130, 246, 0.2)',
                        borderRadius: 'var(--radius-lg)',
                        padding: '24px'
                    }}>
                        <h3 style={{ marginBottom: '16px', fontSize: '18px', color: 'var(--color-accent-light)' }}>Вознаграждения 🎉</h3>
                        <p style={{ fontSize: '14px', marginBottom: '20px', lineHeight: '1.5' }}>
                            В знак благодарности, за <strong>каждые 0.25 TON мы начисляем 500 HH</strong> на ваш баланс.
                            <br /><br />
                            <span style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>(Начисление пропорционально: 2000 HH = 1 TON)</span>
                        </p>

                        <div style={{
                            background: 'rgba(34, 197, 94, 0.1)',
                            border: '1px solid rgba(34, 197, 94, 0.3)',
                            padding: '16px', borderRadius: 'var(--radius-md)',
                            display: 'flex', gap: '12px', alignItems: 'flex-start',
                            marginBottom: '20px'
                        }}>
                            <FiCheckCircle size={24} color="#22c55e" style={{ flexShrink: 0, marginTop: '2px' }} />
                            <div>
                                <h4 style={{ color: '#22c55e', marginBottom: '4px', fontSize: '14px' }}>Система проверяет переводы</h4>
                                <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                                    Укажите здесь адрес кошелька, с которого будете делать (или уже сделали) донат. Наша система найдет его и начислит HeadHunter Coin!
                                </p>
                            </div>
                        </div>

                        <form onSubmit={handleSubmitDonate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div className="input-group">
                                <label style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                                    С какого TON кошелька вы отправили средства?
                                </label>
                                <input
                                    type="text"
                                    className="input"
                                    value={senderWallet}
                                    onChange={e => setSenderWallet(e.target.value)}
                                    placeholder="EQ... (Адрес Вашего кошелька)"
                                    required
                                />
                            </div>
                            <button
                                type="submit"
                                className="btn btn-primary"
                                disabled={isSubmitting}
                                style={{ width: '100%', padding: '12px' }}
                            >
                                {isSubmitting ? 'Отправка...' : 'Отправить адрес для проверки'}
                            </button>
                        </form>
                    </div>
                </div >
            </motion.div >
        </div >
    )
}
