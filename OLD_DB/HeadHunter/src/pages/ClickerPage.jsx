import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FiZap, FiDollarSign, FiBattery } from 'react-icons/fi'
import { useWallet } from '../context/WalletContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/UI/Toast'
import { CONFIG } from '../config'

const REWARD = CONFIG.clicker?.rewardPerTap || 0.1
const DAILY_LIMIT_HH = CONFIG.clicker?.dailyLimitHH || 15
const MAX_ENERGY = CONFIG.clicker?.maxEnergy || 20
const REGEN_MIN_S = CONFIG.clicker?.energyRegenMin || 60
const REGEN_MAX_S = CONFIG.clicker?.energyRegenMax || 180
const MIN_WITHDRAW = CONFIG.clicker?.minWithdraw || 10
const TON_FEE = CONFIG.fees.tonNetworkFee

const todayKey = () => new Date().toISOString().split('T')[0]

export default function ClickerPage() {
    const { user } = useAuth()
    const { deposit } = useWallet()
    const { addToast } = useToast()
    const uid = user?.id || 'anon'

    // ── State ──
    const [clickerBalance, setClickerBalance] = useState(() => {
        try { return parseFloat(localStorage.getItem(`hh_clicker_bal_${uid}`) || '0') } catch { return 0 }
    })
    const [earnedToday, setEarnedToday] = useState(() => {
        try {
            const s = JSON.parse(localStorage.getItem(`hh_clicker_earned_${uid}`) || '{}')
            return s.date === todayKey() ? s.amount : 0
        } catch { return 0 }
    })
    const [energy, setEnergy] = useState(() => {
        try {
            const s = JSON.parse(localStorage.getItem(`hh_clicker_energy_${uid}`) || '{}')
            if (s.energy != null) return Math.min(s.energy, MAX_ENERGY)
            return MAX_ENERGY
        } catch { return MAX_ENERGY }
    })
    const [nextRegenAt, setNextRegenAt] = useState(() => {
        try {
            const s = JSON.parse(localStorage.getItem(`hh_clicker_energy_${uid}`) || '{}')
            return s.nextRegen || Date.now()
        } catch { return Date.now() }
    })

    const [tapAnimation, setTapAnimation] = useState(false)
    const [regenCountdown, setRegenCountdown] = useState(0)
    const [withdrawing, setWithdrawing] = useState(false)

    // ── Persist ──
    useEffect(() => {
        localStorage.setItem(`hh_clicker_bal_${uid}`, clickerBalance.toString())
    }, [clickerBalance, uid])

    useEffect(() => {
        localStorage.setItem(`hh_clicker_earned_${uid}`, JSON.stringify({ date: todayKey(), amount: earnedToday }))
    }, [earnedToday, uid])

    useEffect(() => {
        localStorage.setItem(`hh_clicker_energy_${uid}`, JSON.stringify({ energy, nextRegen: nextRegenAt }))
    }, [energy, nextRegenAt, uid])

    // ── Energy regen timer ──
    const energyRef = useRef(energy)
    const nextRegenRef = useRef(nextRegenAt)
    useEffect(() => { energyRef.current = energy }, [energy])
    useEffect(() => { nextRegenRef.current = nextRegenAt }, [nextRegenAt])

    useEffect(() => {
        const tick = setInterval(() => {
            const now = Date.now()
            if (energyRef.current < MAX_ENERGY && now >= nextRegenRef.current) {
                setEnergy(prev => Math.min(prev + 1, MAX_ENERGY))
                const regenMs = (REGEN_MIN_S + Math.random() * (REGEN_MAX_S - REGEN_MIN_S)) * 1000
                const next = now + regenMs
                setNextRegenAt(next)
                nextRegenRef.current = next
            }
            // Update countdown display
            const remaining = Math.max(0, Math.ceil((nextRegenRef.current - now) / 1000))
            setRegenCountdown(energyRef.current >= MAX_ENERGY ? 0 : remaining)
        }, 1000)
        return () => clearInterval(tick)
    }, []) // no deps — uses refs


    // ── Handle tap ──
    const handleTap = useCallback(() => {
        if (!user) return
        if (energy <= 0) { addToast('Нет энергии! Подождите восстановления ⚡', 'warning'); return }
        if (earnedToday >= DAILY_LIMIT_HH) { addToast(`Лимит ${DAILY_LIMIT_HH} HH на сегодня`, 'warning'); return }

        // Perform tap
        setEnergy(prev => prev - 1)
        setEarnedToday(prev => parseFloat((prev + REWARD).toFixed(2)))
        setClickerBalance(prev => parseFloat((prev + REWARD).toFixed(2)))
        setTapAnimation(true)
        setTimeout(() => setTapAnimation(false), 300)

        // Start regen timer if at max-1
        if (energy === MAX_ENERGY) {
            const regenMs = (REGEN_MIN_S + Math.random() * (REGEN_MAX_S - REGEN_MIN_S)) * 1000
            setNextRegenAt(Date.now() + regenMs)
        }
    }, [user, energy, earnedToday, addToast])

    // ── Withdraw ──
    const handleWithdraw = () => {
        if (clickerBalance < MIN_WITHDRAW) {
            addToast(`Минимум для вывода: ${MIN_WITHDRAW} HH`, 'warning')
            return
        }
        setWithdrawing(true)
        const fee = parseFloat((clickerBalance * TON_FEE).toFixed(2))
        const net = parseFloat((clickerBalance - fee).toFixed(2))
        if (net <= 0) { addToast('Сумма слишком мала', 'error'); setWithdrawing(false); return }

        deposit(net)
        addToast(`Выведено ${net} HH (комиссия ${fee} HH)`, 'success')
        setClickerBalance(0)
        setWithdrawing(false)
    }

    const progressPct = Math.min((earnedToday / DAILY_LIMIT_HH) * 100, 100)
    const energyPct = (energy / MAX_ENERGY) * 100

    const formatTime = (s) => {
        const m = Math.floor(s / 60)
        const sec = s % 60
        return m > 0 ? `${m}м ${sec}с` : `${sec}с`
    }

    return (
        <div className="page-container" style={{ maxWidth: '520px', margin: '0 auto' }}>
            <h1 className="page-title" style={{ textAlign: 'center' }}>🎮 Кликер</h1>
            <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', marginBottom: '24px', fontSize: '13px' }}>
                Тапай и зарабатывай HH! Лимит: {DAILY_LIMIT_HH} HH в день. Вывод от {MIN_WITHDRAW} HH.
            </p>

            {/* ── Stats ── */}
            <div className="clicker-stats">
                <div className="clicker-stat-card">
                    <FiDollarSign size={18} />
                    <div>
                        <span className="clicker-stat-label">Баланс</span>
                        <span className="clicker-stat-value">{clickerBalance.toFixed(1)} HH</span>
                    </div>
                </div>
                <div className="clicker-stat-card">
                    <FiZap size={18} />
                    <div>
                        <span className="clicker-stat-label">Сегодня</span>
                        <span className="clicker-stat-value">{earnedToday.toFixed(1)} / {DAILY_LIMIT_HH} HH</span>
                    </div>
                </div>
                <div className="clicker-stat-card">
                    <FiBattery size={18} />
                    <div>
                        <span className="clicker-stat-label">Энергия</span>
                        <span className="clicker-stat-value">{energy} / {MAX_ENERGY}</span>
                    </div>
                </div>
            </div>

            {/* ── Progress (daily) ── */}
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                Заработано сегодня
            </div>
            <div className="clicker-progress-bar" style={{ marginBottom: '12px' }}>
                <div className="clicker-progress-fill" style={{ width: `${progressPct}%` }} />
            </div>

            {/* ── Energy bar ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                <span>⚡ Энергия</span>
                {energy < MAX_ENERGY && regenCountdown > 0 && (
                    <span>+1 через {formatTime(regenCountdown)}</span>
                )}
            </div>
            <div className="clicker-progress-bar" style={{ marginBottom: '24px' }}>
                <div className="clicker-progress-fill" style={{
                    width: `${energyPct}%`,
                    background: energy <= 3
                        ? 'var(--color-danger)'
                        : energy <= 8
                            ? 'var(--color-warning)'
                            : 'linear-gradient(90deg, var(--color-success), var(--color-accent))'
                }} />
            </div>


            {/* ── Tap button ── */}
            <div style={{ display: 'flex', justifyContent: 'center', margin: '24px 0' }}>
                <motion.button
                    className={`clicker-tap-btn ${energy <= 0 || earnedToday >= DAILY_LIMIT_HH ? 'clicker-tap-exhausted' : ''}`}
                    onClick={handleTap}
                    disabled={energy <= 0 || earnedToday >= DAILY_LIMIT_HH}
                    whileTap={{ scale: 0.9 }}
                    animate={tapAnimation ? { scale: [1, 1.15, 1] } : {}}
                    transition={{ duration: 0.2 }}
                >
                    <span className="clicker-tap-emoji">
                        {energy <= 0 ? '😴' : earnedToday >= DAILY_LIMIT_HH ? '🏆' : '👆'}
                    </span>
                    <span className="clicker-tap-label">
                        {energy <= 0 ? 'Нет энергии' : earnedToday >= DAILY_LIMIT_HH ? 'Лимит!' : `+${REWARD} HH`}
                    </span>
                </motion.button>
            </div>

            {/* ── Float reward ── */}
            <AnimatePresence>
                {tapAnimation && (
                    <motion.div
                        className="clicker-float-reward"
                        initial={{ opacity: 1, y: 0 }}
                        animate={{ opacity: 0, y: -60 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.8 }}
                    >
                        +{REWARD} HH
                    </motion.div>
                )}
            </AnimatePresence>


            {/* ── Withdraw ── */}
            <div className="clicker-withdraw-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                        💰 Накоплено: <strong>{clickerBalance.toFixed(1)} HH</strong>
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                        Комиссия TON: {(TON_FEE * 100).toFixed(0)}% · Мин. {MIN_WITHDRAW} HH
                    </span>
                </div>
                <button
                    className="btn btn-primary"
                    style={{ width: '100%' }}
                    onClick={handleWithdraw}
                    disabled={clickerBalance < MIN_WITHDRAW || withdrawing}
                >
                    {clickerBalance < MIN_WITHDRAW
                        ? `Мин. ${MIN_WITHDRAW} HH (ещё ${(MIN_WITHDRAW - clickerBalance).toFixed(1)})`
                        : withdrawing
                            ? 'Выводим...'
                            : `Вывести ${Math.max(0, clickerBalance - clickerBalance * TON_FEE).toFixed(1)} HH на баланс`
                    }
                </button>
                <p style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '6px', textAlign: 'center' }}>
                    Средства переводятся на основной баланс с вычетом комиссии TON сети
                </p>
            </div>
        </div>
    )
}
