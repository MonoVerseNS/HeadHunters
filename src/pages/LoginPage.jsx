import { useState, useEffect, useRef } from 'react'
import { Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { FiShield, FiCheckCircle, FiZap, FiKey } from 'react-icons/fi'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/UI/Toast'
import { CONFIG } from '../config'

export default function LoginPage() {
    const { isAuthenticated, loginWithTelegram } = useAuth()
    const { addToast } = useToast()
    const telegramRef = useRef(null)
    const handleTelegramDataRef = useRef(null)
    const loginCalledRef = useRef(false)

    const [isProcessing, setIsProcessing] = useState(false)
    const [isMiniApp, setIsMiniApp] = useState(false)

    // Invite code flow
    const [needsInvite, setNeedsInvite] = useState(false)
    const [inviteCode, setInviteCode] = useState('')
    const [pendingTelegramData, setPendingTelegramData] = useState(null)
    const [inviteError, setInviteError] = useState('')

    // ── Handle Telegram data (async!) ──
    const handleTelegramData = async (data, invCode) => {
        if (loginCalledRef.current && !invCode) return
        loginCalledRef.current = true

        console.log('[HH] Processing Telegram Data:', data)
        setIsProcessing(true)

        try {
            const payload = { ...data }
            if (invCode) {
                payload.inviteCode = invCode
            }

            const result = await loginWithTelegram(payload)

            if (result.success) {
                addToast('Добро пожаловать!', 'success')
                setNeedsInvite(false)
            } else if (result.code === 'INVITE_REQUIRED') {
                // New user — needs invite code
                setPendingTelegramData(data)
                setNeedsInvite(true)
                setInviteError('')
                loginCalledRef.current = false
            } else if (result.code === 'INVALID_INVITE') {
                setInviteError('Неверный или использованный код')
                loginCalledRef.current = false
            } else {
                addToast(result.error || 'Ошибка входа', 'error')
                loginCalledRef.current = false
            }
        } catch (e) {
            console.error('[HH] Login error:', e)
            addToast('Ошибка подключения к серверу', 'error')
            loginCalledRef.current = false
        }

        setIsProcessing(false)
    }
    handleTelegramDataRef.current = handleTelegramData

    // Submit invite code
    const handleInviteSubmit = async (e) => {
        e.preventDefault()
        if (!inviteCode.trim() || !pendingTelegramData) return
        setInviteError('')
        await handleTelegramData(pendingTelegramData, inviteCode.trim().toUpperCase())
    }

    if (isAuthenticated) return <Navigate to="/" replace />

    // ── Telegram Mini App: autologin ──
    useEffect(() => {
        const tgWebApp = window.Telegram?.WebApp
        if (tgWebApp?.initDataUnsafe?.user) {
            setIsMiniApp(true)
            const tgUser = tgWebApp.initDataUnsafe.user

            try {
                tgWebApp.ready()
                tgWebApp.expand()
                tgWebApp.setHeaderColor('#06060e')
                tgWebApp.setBackgroundColor('#06060e')
            } catch (e) {
                console.warn('[HH] WebApp theme error:', e)
            }

            handleTelegramData({
                id: String(tgUser.id),
                username: tgUser.username || `user_${tgUser.id}`,
                first_name: tgUser.first_name || 'User',
                last_name: tgUser.last_name || '',
                photo_url: tgUser.photo_url || null,
            })
        }
    }, [])

    // ── Telegram Login Widget (browser) ──
    useEffect(() => {
        if (window.location.search.includes('reset=true')) {
            localStorage.clear()
            window.location.href = window.location.pathname
            return
        }

        window.onTelegramLoginSuccess = (tgUser) => {
            console.log('[HH] onTelegramLoginSuccess', tgUser)
            loginCalledRef.current = false

            if (handleTelegramDataRef.current) {
                try {
                    handleTelegramDataRef.current({
                        id: String(tgUser.id),
                        username: tgUser.username || `user_${tgUser.id}`,
                        first_name: tgUser.first_name || 'User',
                        last_name: tgUser.last_name || '',
                        photo_url: tgUser.photo_url || null,
                    })
                } catch (e) {
                    console.error('[HH] Login callback error:', e)
                }
            }
        }

        return () => {
            delete window.onTelegramLoginSuccess
        }
    }, [])

    useEffect(() => {
        if (isMiniApp) return

        if (telegramRef.current && telegramRef.current.childElementCount === 0) {
            const script = document.createElement('script')
            script.src = 'https://telegram.org/js/telegram-widget.js?22'
            script.setAttribute('data-telegram-login', CONFIG.telegram.botId)
            script.setAttribute('data-size', 'large')
            script.setAttribute('data-userpic', 'false')
            script.setAttribute('data-onauth', 'onTelegramLoginSuccess(user)')
            script.setAttribute('data-request-access', 'write')
            script.async = true
            script.onerror = () => console.info('[HH] Telegram widget failed to load')
            telegramRef.current.appendChild(script)
        }
    }, [isMiniApp])

    return (
        <div className="login-page">
            <motion.div
                className="login-container"
                initial={{ opacity: 0, y: 30, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
            >
                <motion.div
                    className="login-logo"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200, delay: 0.2 }}
                >
                    <div className="login-logo-icon">HH</div>
                </motion.div>

                <h1 className="login-title">HeadHunters</h1>
                <p className="login-subtitle">Закрытая крипто-платформа на TON</p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '32px', alignItems: 'center', width: '100%' }}>

                    {/* Invite Code Form (shown when new user detected) */}
                    {needsInvite && !isProcessing && (
                        <motion.form
                            onSubmit={handleInviteSubmit}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            style={{
                                display: 'flex', flexDirection: 'column', gap: '12px',
                                width: '100%', maxWidth: '300px',
                            }}
                        >
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                color: 'var(--color-warning)', fontSize: '13px',
                                justifyContent: 'center'
                            }}>
                                <FiKey />
                                <span>Введите код приглашения</span>
                            </div>
                            <input
                                type="text"
                                className="input"
                                value={inviteCode}
                                onChange={e => setInviteCode(e.target.value.toUpperCase())}
                                placeholder="КОД"
                                autoFocus
                                style={{
                                    textAlign: 'center', letterSpacing: '4px',
                                    fontWeight: 700, textTransform: 'uppercase',
                                    fontSize: '18px',
                                }}
                            />
                            {inviteError && (
                                <p style={{ color: 'var(--color-danger)', fontSize: '12px', textAlign: 'center', margin: 0 }}>
                                    {inviteError}
                                </p>
                            )}
                            <button
                                type="submit"
                                className="btn btn-accent"
                                disabled={!inviteCode.trim()}
                                style={{ width: '100%' }}
                            >
                                Войти
                            </button>
                        </motion.form>
                    )}

                    {/* Telegram Login Widget (browser) — hide after invite flow triggers */}
                    {!isMiniApp && !isProcessing && !needsInvite && (
                        <div ref={telegramRef} style={{ minHeight: '40px' }} />
                    )}

                    {/* Processing spinner */}
                    {isProcessing && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '10px',
                            color: 'var(--color-text-secondary)', fontSize: '14px',
                        }}>
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                style={{ width: 20, height: 20, border: '2px solid var(--color-accent)', borderTopColor: 'transparent', borderRadius: '50%' }}
                            />
                            Подключение...
                        </div>
                    )}

                    {!isMiniApp && !isProcessing && !needsInvite && (
                        <p style={{
                            fontSize: 'var(--font-size-xs)',
                            color: 'var(--color-text-muted)',
                            textAlign: 'center',
                            lineHeight: 1.4,
                        }}>
                            Войдите через виджет Telegram выше.
                        </p>
                    )}
                </div>

                <div className="login-features">
                    <div className="login-feature-item">
                        <FiShield style={{ color: 'var(--color-accent-light)', flexShrink: 0 }} />
                        <span>Безопасный вход через Telegram</span>
                    </div>
                    <div className="login-feature-item">
                        <FiZap style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
                        <span>Только по приглашению</span>
                    </div>
                    <div className="login-feature-item">
                        <FiCheckCircle style={{ color: 'var(--color-success)', flexShrink: 0 }} />
                        <span>Торговля, NFT, кошелёк — всё в одном</span>
                    </div>
                </div>

                <p className="login-footer">
                    Авторизуйтесь через Telegram для входа
                </p>
            </motion.div>
        </div>
    )
}
