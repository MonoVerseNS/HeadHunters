import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FiUsers, FiShield, FiKey, FiSearch, FiLock, FiUnlock, FiPlus, FiTrash2, FiEye, FiAlertTriangle, FiDollarSign, FiLayers, FiBell, FiSend, FiArrowUpRight, FiArrowDownLeft, FiImage, FiSlash, FiUpload, FiSettings, FiGlobe, FiSave, FiEyeOff } from 'react-icons/fi'
import { useAuth } from '../context/AuthContext'
import { useWallet } from '../context/WalletContext'
import { useToast } from '../components/UI/Toast'
import Modal from '../components/UI/Modal'
import StatCard from '../components/UI/StatCard'
import { CONFIG, getSettings, saveSettings } from '../config'
import { logger } from '../api/logger'
import api from '../api/index'
import { apiKeyManager, API_PERMISSIONS } from '../api/apiKeys'
import { appManager } from '../api/apps'
import { useInterval } from '../hooks/useInterval'

import { toUserFriendlyAddress } from '../utils/ton'

export default function AdminPage() {
    const {
        allUsers, adminIds, inviteCodes, isAdmin, collections,
        toggleUserBlock, deleteUser, addAdminId, removeAdminId,
        addInviteCode, removeInviteCode,
        addCollection, editCollection, deleteCollection,
    } = useAuth()
    const {
        platformBalance, platformTonBalance, platformConfigured, platformWallet, transactions, addNotification,
        adminMint, adminWithdraw, adminTransfer, adminUpdateNFT, allNFTs,
        banUserNFTs,
        COMMISSION_RATE, TON_NETWORK_FEE
    } = useWallet()
    const { addToast } = useToast()

    const [activeTab, setActiveTab] = useState('platform') // Default to platform to show money logic first
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedUser, setSelectedUser] = useState(null)
    const [confirmBlock, setConfirmBlock] = useState(null)
    const [confirmDelete, setConfirmDelete] = useState(null)

    const [newAdminId, setNewAdminId] = useState('')
    const [newInviteCode, setNewInviteCode] = useState('')

    // Collections
    const [collModal, setCollModal] = useState(null)
    const [collName, setCollName] = useState('')
    const [collImage, setCollImage] = useState('') // Replaces Emoji
    const [collDesc, setCollDesc] = useState('')

    // Broadcast
    const [broadcastMsg, setBroadcastMsg] = useState('')

    // Logs
    const [activityLogs, setActivityLogs] = useState(logger.getLast(100))
    const [logFilter, setLogFilter] = useState('')
    const [apiLogs, setApiLogs] = useState([])

    // Subscribe to API request logs
    useEffect(() => {
        const unsub = api.onRequest(entry => setApiLogs(prev => [entry, ...prev].slice(0, 200)))
        return unsub
    }, [])

    // Poll for updates every 5s
    useInterval(() => {
        refreshUsers()
    }, 5000)

    const refreshLogs = () => setActivityLogs(logger.getLast(100))

    // Funds Management
    const [mintAmount, setMintAmount] = useState('')
    const [withdrawAmount, setWithdrawAmount] = useState('')
    const [withdrawAddress, setWithdrawAddress] = useState('')
    const [withdrawComment, setWithdrawComment] = useState('')
    const [withdrawType, setWithdrawType] = useState('ton') // ton | hh
    const [loading, setLoading] = useState(false)
    const [transferAmount, setTransferAmount] = useState('')
    const [transferTarget, setTransferTarget] = useState('') // User ID
    const [transferType, setTransferType] = useState('ton')
    const [transferComment, setTransferComment] = useState('')

    // API Keys & Apps
    const [apiKeys, setApiKeys] = useState(apiKeyManager.getAll())
    const [apps, setApps] = useState(appManager.getAll())
    const [newKeyName, setNewKeyName] = useState('')
    const [newKeyType, setNewKeyType] = useState('app')
    const [newKeyPerms, setNewKeyPerms] = useState([])
    const [newAppName, setNewAppName] = useState('')
    const [newAppDesc, setNewAppDesc] = useState('')
    const [newAppKeyId, setNewAppKeyId] = useState('')
    const [editingKeyId, setEditingKeyId] = useState(null)

    // Settings tab
    const [settings, setSettings] = useState(() => {
        const saved = getSettings()
        return {
            botToken: saved.botToken || CONFIG.telegram.botToken || '',
            botUsername: saved.botUsername || CONFIG.telegram.botId || '',
            webhookUrl: saved.webhookUrl || CONFIG.telegram.webhookUrl || '',
            adminChatId: saved.adminChatId || CONFIG.telegram.adminChatId || '',
            domain: saved.domain || CONFIG.domain.url || '',
            appUrl: saved.appUrl || CONFIG.domain.appUrl || '',
            corsOrigins: (saved.corsOrigins || CONFIG.domain.corsOrigins || []).join(', '),
        }
    })

    const refreshUsers = async () => {
        try {
            await api.request('admin/users')
            console.log('Users refreshed')
        } catch (e) {
            console.error('Failed to refresh users:', e)
        }
    }
    const [showBotToken, setShowBotToken] = useState(false)
    const [settingsSaved, setSettingsSaved] = useState(false)

    const handleSaveSettings = () => {
        const toSave = {
            ...settings,
            corsOrigins: settings.corsOrigins.split(',').map(s => s.trim()).filter(Boolean),
        }
        saveSettings(toSave)
        setSettingsSaved(true)
        addToast('Настройки сохранены! Изменения применены.', 'success')
        setTimeout(() => setSettingsSaved(false), 2000)
    }

    const updateSetting = (key, value) => setSettings(prev => ({ ...prev, [key]: value }))

    if (!isAdmin) {
        return (
            <div style={{ textAlign: 'center', padding: '80px 20px' }}>
                <FiShield size={48} style={{ color: 'var(--color-danger)', marginBottom: '16px' }} />
                <h2>Доступ запрещён</h2>
            </div>
        )
    }

    const tabs = [
        { id: 'platform', label: 'Баланс', icon: <FiDollarSign /> },
        { id: 'users', label: 'Пользователи', icon: <FiUsers /> },
        { id: 'nfts', label: 'NFT / Подарки', icon: <FiImage /> },
        { id: 'admins', label: 'Админы', icon: <FiShield /> },
        { id: 'codes', label: 'Инвайт-коды', icon: <FiKey /> },
        { id: 'collections', label: 'Коллекции', icon: <FiLayers /> },
        { id: 'broadcast', label: 'Рассылка', icon: <FiBell /> },
        { id: 'settings', label: 'Настройки', icon: <FiSettings /> },
    ]

    const filteredUsers = allUsers.filter(u => {
        const q = searchQuery.toLowerCase()
        return (u.username || '').toLowerCase().includes(q) ||
            (u.telegramId || u.telegram_id || '').includes(searchQuery) ||
            (u.firstName || u.first_name || '').toLowerCase().includes(q)
    })

    const filteredNFTs = (allNFTs || []).filter(n => {
        const q = searchQuery.toLowerCase()
        const indexStr = String(n.index)
        const nameMatch = n.dbNFT?.name?.toLowerCase().includes(q)
        const ownerMatch = String(n.dbNFT?.ownerId || '').includes(q) || n.dbNFT?.ownerUsername?.toLowerCase().includes(q)
        const indexMatch = indexStr.includes(q)
        return !searchQuery || nameMatch || ownerMatch || indexMatch
    })

    // ── User Actions ──
    const handleToggleBlock = (user) => setConfirmBlock(user)
    const confirmToggleBlock = async () => {
        if (!confirmBlock) return
        const blocked = confirmBlock.isBlocked || confirmBlock.is_blocked
        if (!blocked) {
            banUserNFTs(confirmBlock.telegramId || confirmBlock.telegram_id || confirmBlock.id)
        }
        const result = await toggleUserBlock(confirmBlock.id)
        if (result?.success) {
            addToast(blocked ? 'Пользователь разблокирован' : 'Пользователь заблокирован', 'success')
        } else {
            addToast('Ошибка: ' + (result?.error || 'неизвестная'), 'error')
        }
        setConfirmBlock(null); setSelectedUser(null)
    }

    // Delete User
    const handleDeleteUser = (user) => setConfirmDelete(user)
    const confirmDeleteUser = async () => {
        if (!confirmDelete) return
        const result = await deleteUser(confirmDelete.id)
        if (result?.success) {
            addToast(`Пользователь @${confirmDelete.username} удалён`, 'info')
        } else {
            addToast('Ошибка удаления', 'error')
        }
        setConfirmDelete(null); setSelectedUser(null)
    }

    // ── Admin Management ──
    const handleAddAdmin = () => {
        const result = addAdminId(newAdminId)
        if (result.success) { addToast('Admin ID добавлен', 'success'); setNewAdminId('') }
        else addToast(result.error || 'Ошибка', 'error')
    }
    const handleRemoveAdmin = (id) => {
        const result = removeAdminId(id)
        if (result.success) addToast('Admin ID удалён', 'info')
        else addToast(result.error || 'Ошибка', 'error')
    }

    // ── Invite Codes ──
    const handleAddCode = () => {
        const result = addInviteCode(newInviteCode)
        if (result.success) { addToast('Код добавлен', 'success'); setNewInviteCode('') }
        else addToast(result.error || 'Ошибка', 'error')
    }

    // ── Collections ──
    const confirmCollection = () => {
        if (!collName.trim()) { addToast('Введите название', 'error'); return }
        const colData = {
            name: collName.trim(),
            description: collDesc.trim(),
            image: collImage,
            emoji: '📦' // Fallback
        }

        if (collModal.mode === 'add') {
            const res = addCollection(colData)
            if (res.success) addToast('Коллекция создана', 'success')
            else addToast(res.error, 'error')
        } else {
            editCollection(collModal.data.id, colData)
            addToast('Коллекция обновлена', 'success')
        }
        setCollModal(null)
    }

    // ── Funds & NFT Minting ──
    const [mintOwner, setMintOwner] = useState('')
    const [mintIndex, setMintIndex] = useState('')
    const [mintUri, setMintUri] = useState('')

    const handleMint = async () => {
        if (!mintOwner || !mintIndex || !mintUri) {
            addToast('Заполните все поля для минта', 'error')
            return
        }

        const amount = parseFloat(mintAmount) || 0.05

        setLoading(true)
        const result = await adminMint({
            itemOwnerAddress: mintOwner,
            itemIndex: parseInt(mintIndex, 10),
            itemContentUri: mintUri,
            amount: amount.toString()
        })
        setLoading(false)

        if (result.success) {
            addToast(`NFT #${result.itemIndex} успешно отправлен на минт!`, 'success')
            setMintOwner('')
            setMintIndex('')
            setMintUri('')
            setMintAmount('')
        } else {
            addToast(`Ошибка минта: ${result.error}`, 'error')
        }
    }

    const handleWithdraw = async () => {
        if (!withdrawAddress || !withdrawAmount) { addToast('Заполните поля', 'error'); return }
        const amount = parseFloat(withdrawAmount)
        if (isNaN(amount) || amount <= 0) { addToast('Неверная сумма', 'error'); return }

        setLoading(true)
        try {
            const res = await fetch('/api/platform-wallet/withdraw', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: withdrawType,
                    amount,
                    toAddress: withdrawAddress,
                    comment: withdrawComment
                })
            })
            const data = await res.json()
            if (res.ok && data.success) {
                addToast('Вывод успешен!', 'success')
                setWithdrawAmount('')
                setWithdrawAddress('')
                setWithdrawComment('')
                // Refresh balance if function exists
                if (typeof refreshPlatformBalance === 'function') refreshPlatformBalance()
            } else {
                addToast(data.error || 'Ошибка вывода', 'error')
            }
        } catch (e) {
            addToast('Ошибка сети', 'error')
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    const handleTransfer = async () => {
        if (!transferTarget || !transferAmount) { addToast('Заполните поля', 'error'); return }
        const amount = parseFloat(transferAmount)
        if (isNaN(amount) || amount <= 0) { addToast('Неверная сумма', 'error'); return }

        try {
            const res = await fetch('/api/platform-wallet/transfer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: transferTarget,
                    type: 'hh',
                    amount,
                    comment: transferComment
                })
            })
            const data = await res.json()
            if (res.ok && data.success) {
                addToast('Средства отправлены пользователю', 'success')
                setTransferAmount(''); setTransferTarget(''); setTransferComment('')
            } else {
                addToast(data.error || 'Ошибка перевода', 'error')
            }
        } catch (e) {
            addToast('Ошибка сети', 'error')
        }
    }

    const activeCount = allUsers.filter(u => !u.isBlocked && !u.is_blocked).length

    return (
        <div>
            {/* Stats */}
            <div className="stats-grid" style={{ marginBottom: 'var(--space-xl)' }}>
                <StatCard icon={<FiDollarSign />} iconColor="blue" label="Баланс платформы" value={platformConfigured ? `${platformBalance.toFixed(2)} HH` : 'Не настроен'} />
                <StatCard icon={<FiUsers />} iconColor="purple" label="Всего пользователей" value={allUsers.length} />
                <StatCard icon={<FiUnlock />} iconColor="green" label="Активных" value={activeCount} />
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: 'var(--space-lg)', flexWrap: 'wrap' }}>
                {tabs.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                        className={activeTab === tab.id ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}>
                        {tab.icon} <span style={{ marginLeft: '6px' }}>{tab.label}</span>
                    </button>
                ))}
            </div>

            <AnimatePresence mode="wait">
                {/* ── PLATFORM FUNDS ── */}
                {activeTab === 'platform' && (
                    <motion.div key="platform" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                        <div className="two-col-grid">
                            {/* Platform Wallet */}
                            <div className="glass" style={{ padding: 'var(--space-lg)' }}>
                                <h3 style={{ marginBottom: '16px' }}>🔗 Кошелёк платформы (TON)</h3>
                                <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '12px' }}>
                                    Платформа автоматически отслеживает баланс TON кошелька. Средства поступают от пользователей.
                                </p>
                                <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-md)', padding: '12px', marginBottom: '12px' }}>
                                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', display: 'block', marginBottom: '4px' }}>Адрес</span>
                                    <code style={{ fontSize: '12px', color: 'var(--color-accent)', wordBreak: 'break-all' }}>
                                        {toUserFriendlyAddress(platformWallet?.address || CONFIG.ton?.platformAddress) || 'Не задан'}
                                    </code>
                                </div>
                                <div style={{ display: 'flex', gap: '16px' }}>
                                    <div style={{ flex: 1, background: 'rgba(0,0,0,0.15)', borderRadius: 'var(--radius-md)', padding: '12px', textAlign: 'center' }}>
                                        <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', display: 'block' }}>Crypto Кошелёк (Общий)</span>
                                        <span style={{ fontSize: '18px', fontWeight: 700, color: platformConfigured ? '#0098EA' : 'var(--color-text-muted)' }}>
                                            {platformConfigured ? platformTonBalance.toFixed(4) + ' TON' : '—'}
                                        </span>
                                    </div>
                                    <div style={{ flex: 1, background: 'rgba(0,0,0,0.15)', borderRadius: 'var(--radius-md)', padding: '12px', textAlign: 'center' }}>
                                        <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', display: 'block' }}>Пользовательский Резерв</span>
                                        <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-warning)' }}>
                                            {allUsers.reduce((sum, u) => sum + (parseFloat(u.balance) || 0), 0).toFixed(2)} HH
                                        </span>
                                    </div>
                                    <div style={{ flex: 1, background: 'rgba(0,0,0,0.15)', borderRadius: 'var(--radius-md)', padding: '12px', textAlign: 'center' }}>
                                        <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', display: 'block' }}>Свободные средства</span>
                                        <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-success)' }}>
                                            {platformConfigured ? (platformBalance - allUsers.reduce((sum, u) => sum + (parseFloat(u.balance) || 0), 0)).toFixed(2) + ' HH' : '—'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Withdrawal */}
                            <div className="glass" style={{ padding: 'var(--space-lg)' }}>
                                <h3 style={{ marginBottom: '16px' }}>💸 Вывод средств (Admin)</h3>
                                <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '12px' }}>
                                    Вывод из резерва платформы.
                                </p>
                                <div className="input-group" style={{ marginBottom: '12px', border: '1px solid var(--color-border)', padding: '10px', borderRadius: '8px' }}>
                                    <label style={{ display: 'block', marginBottom: '8px' }}>Ассет: HH (Внутренние баллы)</label>
                                </div>
                                <div className="input-group">
                                    <label>Адрес</label>
                                    <input className="input" value={withdrawAddress} onChange={e => setWithdrawAddress(e.target.value)} placeholder="UQC..." />
                                </div>
                                <div className="input-group">
                                    <label>Сумма</label>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <input className="input" type="number" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} placeholder="0.00" style={{ flex: 1 }} />
                                        <button className="btn btn-sm btn-ghost" style={{ border: '1px solid var(--color-border)' }}
                                            onClick={() => {
                                                setWithdrawType('hh')
                                                setWithdrawAmount(platformBalance.toFixed(2))
                                            }}>
                                            MAX
                                        </button>
                                    </div>
                                    <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                                        Комиссия: 0 HH | Доступно: {platformBalance.toFixed(2)} HH
                                    </div>
                                </div>
                                <div className="input-group" style={{ marginTop: '10px' }}>
                                    <input className="input" value={withdrawComment} onChange={e => setWithdrawComment(e.target.value)} placeholder="Комментарий" />
                                </div>
                                <div style={{ marginTop: '16px' }}>
                                    <button className="btn btn-danger" style={{ width: '100%' }} onClick={() => { setWithdrawType('hh'); handleWithdraw(); }} disabled={loading}>
                                        <FiArrowUpRight /> {loading ? '...' : 'Вывести HH'}
                                    </button>
                                </div>
                            </div>

                            {/* Transfer to User */}
                            <div className="glass" style={{ padding: 'var(--space-lg)', gridColumn: '1 / -1' }}>
                                <h3 style={{ marginBottom: '16px' }}>📤 Перевод пользователю</h3>
                                <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '12px' }}>
                                    Отправить средства из резерва платформы конкретному пользователю.
                                </p>
                                <div className="input-group" style={{ marginBottom: '12px' }}>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button className={`btn btn-sm btn-primary`}
                                            style={{ flex: 1, border: '1px solid var(--color-primary)' }} disabled>
                                            HH (Внутренний баланс)
                                        </button>
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                    <div className="input-group">
                                        <label>Пользователь (ID)</label>
                                        <select className="input" value={transferTarget} onChange={e => setTransferTarget(e.target.value)}>
                                            <option value="">Выберите пользователя...</option>
                                            {allUsers.map(u => <option key={u.id} value={u.id}>@{u.username} ({u.firstName})</option>)}
                                        </select>
                                    </div>
                                    <div className="input-group">
                                        <label>Сумма</label>
                                        <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <input className="input" type="number" value={transferAmount} onChange={e => setTransferAmount(e.target.value)} placeholder="0.00" style={{ flex: 1 }} />
                                                <button className="btn btn-sm btn-ghost" style={{ border: '1px solid var(--color-border)' }}
                                                    onClick={() => {
                                                        if (transferType === 'ton') {
                                                            const max = Math.max(0, platformTonBalance - 0.02)
                                                            setTransferAmount(max.toFixed(4))
                                                        } else {
                                                            setTransferAmount(platformBalance.toFixed(2))
                                                        }
                                                    }}>
                                                    MAX
                                                </button>
                                            </div>
                                            <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>
                                                Комиссия платформы: 0 (Оплата газа в сети TON) | Баланс: {transferType === 'ton' ? platformTonBalance.toFixed(4) : platformBalance.toFixed(2)}
                                            </div>

                                            <input className="input" value={transferComment} onChange={e => setTransferComment(e.target.value)} placeholder="Комментарий" />
                                            <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleTransfer}><FiSend /> Отправить</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* ── USERS TAB ── */}
                {activeTab === 'users' && (
                    <motion.div key="users" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                        <div className="glass" style={{ padding: 'var(--space-lg)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                                <h3 style={{ fontSize: '18px' }}>Все пользователи ({allUsers.length})</h3>
                                <input className="input" placeholder="Поиск..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ maxWidth: '200px' }} />
                            </div>
                            <div className="table-container">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>User</th><th>TG ID</th><th>Role</th><th>Status</th><th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredUsers.map(u => {
                                            const blocked = u.isBlocked || u.is_blocked
                                            const rawAvatar = u.avatar || u.photoUrl || null
                                            const avatarSrc = rawAvatar && rawAvatar.startsWith('http')
                                                ? (rawAvatar.includes('t.me/') || rawAvatar.includes('telegram.org/') || rawAvatar.includes('api.telegram.org/')
                                                    ? `/api/avatar/proxy?url=${encodeURIComponent(rawAvatar)}`
                                                    : rawAvatar)
                                                : null
                                            const initials = String(u.firstName || u.first_name || u.username || '?').slice(0, 2).toUpperCase()
                                            return (
                                                <tr key={u.id} style={{ opacity: blocked ? 0.5 : 1 }}>
                                                    <td>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <div style={{ position: 'relative' }}>
                                                                {avatarSrc ? (
                                                                    <img src={avatarSrc} alt="" referrerPolicy="no-referrer"
                                                                        style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }}
                                                                        onError={e => { e.target.style.display = 'none'; if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex' }}
                                                                    />
                                                                ) : null}
                                                                <div style={{
                                                                    width: '28px', height: '28px', borderRadius: '50%',
                                                                    background: blocked ? 'var(--color-danger)' : 'var(--color-accent)',
                                                                    color: 'white', display: avatarSrc ? 'none' : 'flex',
                                                                    alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700,
                                                                }}>{initials}</div>
                                                            </div>
                                                            <div>
                                                                <div style={{ fontSize: '13px' }}>@{u.username || '—'}</div>
                                                                <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{u.firstName || u.first_name || ''} {u.lastName || u.last_name || ''}</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td><small>{u.telegramId || u.telegram_id}</small></td>
                                                    <td><span style={{
                                                        fontSize: '10px', padding: '2px 6px', borderRadius: '8px', fontWeight: 700,
                                                        background: u.role === 'admin' ? 'rgba(239,68,68,0.15)' : 'rgba(124,58,237,0.15)',
                                                        color: u.role === 'admin' ? '#ef4444' : 'var(--color-accent-light)',
                                                    }}>{u.role}</span></td>
                                                    <td>
                                                        <span className={`badge-status ${blocked ? 'blocked' : 'active'}`}>
                                                            {blocked ? 'blocked' : 'active'}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <div style={{ display: 'flex', gap: '6px' }}>
                                                            <button className={`btn btn-sm ${blocked ? 'btn-success' : 'btn-danger'}`} onClick={() => handleToggleBlock(u)}>
                                                                {blocked ? <FiUnlock /> : <FiLock />}
                                                            </button>
                                                            {u.role !== 'admin' && (
                                                                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-danger)' }} onClick={() => handleDeleteUser(u)}>
                                                                    <FiTrash2 />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* ── NFTs TAB ── */}
                {activeTab === 'nfts' && (
                    <motion.div key="nfts" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                        <div className="glass" style={{ padding: 'var(--space-lg)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                                <h3 style={{ fontSize: '18px' }}>Все NFT ({filteredNFTs.length})</h3>
                                <input className="input" placeholder="Поиск по названию или ID владельца..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ maxWidth: '300px' }} />
                            </div>
                            <div className="table-container">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Index</th><th>NFT Data (DB)</th><th>Owner (Blockchain)</th><th>Platform?</th><th>Status</th><th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredNFTs.map(nft => (
                                            <tr key={nft.on_chain_index || nft.dbNFT?.id || nft.address}>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{ fontWeight: 700, fontSize: '18px', color: 'var(--color-accent)' }}>#{nft.on_chain_index !== null ? nft.on_chain_index : '?'}</span>
                                                        <div style={{ width: '32px', height: '32px', borderRadius: '4px', overflow: 'hidden', background: '#333' }}>
                                                            {nft.dbNFT?.image && <img src={nft.dbNFT.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>
                                                    {nft.dbNFT ? (
                                                        <div>
                                                            <div style={{ fontWeight: 600 }}>{nft.dbNFT.name}</div>
                                                            <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>ID: {nft.dbNFT.id.slice(0, 12)}...</div>
                                                            <div style={{ fontSize: '11px', color: 'var(--color-accent-light)' }}>
                                                                {nft.dbNFT.ownerId === 0 ? (
                                                                    <span style={{ color: 'var(--color-text-secondary)' }}>SYSTEM / WITHDRAWN</span>
                                                                ) : (
                                                                    <>Owner: @{nft.dbNFT.ownerUsername} ({nft.dbNFT.ownerId})</>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Missing in DB</span>
                                                    )}
                                                </td>
                                                <td>
                                                    <div style={{ fontSize: '11px', fontFamily: 'monospace', wordBreak: 'break-all', maxWidth: '150px' }}>
                                                        {nft.onChainOwner || (nft.dbNFT?.on_chain_index !== null ? <span style={{ color: 'var(--color-text-secondary)' }}>On-chain (address hidden)</span> : <span style={{ color: 'var(--color-danger)' }}>Not Minted</span>)}
                                                        {nft.onChainOwnerUser && (
                                                            <div style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                                                                @{nft.onChainOwnerUser.username}
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td>
                                                    <span style={{
                                                        fontSize: '10px', padding: '2px 6px', borderRadius: '4px',
                                                        background: nft.isPlatformOwned ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                                                        color: nft.isPlatformOwned ? 'var(--color-success)' : 'var(--color-danger)',
                                                        border: `1px solid ${nft.isPlatformOwned ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`
                                                    }}>
                                                        {nft.isPlatformOwned ? 'PLATFORM (HUB)' : (nft.onChainOwner ? 'EXTERNAL (USER)' : 'N/A')}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className={`badge-status ${nft.status}`}>
                                                        {nft.status === 'verified' || nft.status === 'active' ? 'In Hub' :
                                                            nft.status === 'externally_owned' ? 'Withdrawn' : 'Not Minted'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: '6px' }}>
                                                        {nft.status === 'unassigned' && (
                                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                                <input
                                                                    className="input input-sm"
                                                                    placeholder="User ID"
                                                                    style={{ width: '80px', fontSize: '11px' }}
                                                                    onKeyDown={async (e) => {
                                                                        if (e.key === 'Enter' && e.target.value) {
                                                                            const res = await adminUpdateNFT(nft.on_chain_index, { userId: e.target.value })
                                                                            if (res.success) addToast('NFT Assigned!', 'success')
                                                                            else addToast(res.error, 'error')
                                                                        }
                                                                    }}
                                                                />
                                                                <button className="btn btn-sm btn-primary" title="Assign to User ID and press Enter">
                                                                    <FiPlus />
                                                                </button>
                                                            </div>
                                                        )}
                                                        {nft.dbNFT && (
                                                            <button
                                                                className={`btn btn-sm ${nft.dbNFT.status === 'hidden' ? 'btn-success' : 'btn-danger'}`}
                                                                onClick={() => {
                                                                    const newStatus = nft.dbNFT.status === 'hidden' ? 'active' : 'hidden'
                                                                    adminUpdateNFT(nft.on_chain_index, { status: newStatus }) // Needs fix in context to handle both
                                                                    addToast(newStatus === 'hidden' ? 'NFT скрыт' : 'NFT восстановлен', 'info')
                                                                }}
                                                            >
                                                                {nft.dbNFT.status === 'hidden' ? <FiUnlock /> : <FiLock />}
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* ── ADMINS TAB ── */}
                {activeTab === 'admins' && (
                    <motion.div key="admins" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                        <div className="glass" style={{ padding: 'var(--space-lg)' }}>
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                                <input className="input" value={newAdminId} onChange={e => setNewAdminId(e.target.value)} placeholder="TG ID" style={{ flex: 1 }} />
                                <button className="btn btn-primary" onClick={handleAddAdmin}><FiPlus /> Добавить</button>
                            </div>
                            {adminIds.map(id => (
                                <div key={id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', borderBottom: '1px solid var(--color-border)' }}>
                                    <span>{id} {id === '5178670546' && '(Main)'}</span>
                                    {id !== '5178670546' && <button className="btn btn-ghost btn-sm" onClick={() => handleRemoveAdmin(id)}><FiTrash2 /></button>}
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}

                {/* ── CODES TAB ── */}
                {activeTab === 'codes' && (
                    <div className="glass" style={{ padding: 'var(--space-lg)' }}>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                            <input className="input" value={newInviteCode} onChange={e => setNewInviteCode(e.target.value)} placeholder="CODE" style={{ flex: 1, textTransform: 'uppercase' }} />
                            <button className="btn btn-primary" onClick={handleAddCode}><FiPlus /> Добавить</button>
                        </div>
                        {inviteCodes.map(code => (
                            <div key={code} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', borderBottom: '1px solid var(--color-border)' }}>
                                <code>{code}</code>
                                <button className="btn btn-ghost btn-sm" onClick={() => removeInviteCode(code)}><FiTrash2 /></button>
                            </div>
                        ))}
                    </div>
                )}

                {/* ── COLLECTIONS TAB ── */}
                {activeTab === 'collections' && (
                    <div className="glass" style={{ padding: 'var(--space-lg)' }}>
                        <button className="btn btn-primary" onClick={() => { setCollModal({ mode: 'add' }); setCollName(''); setCollDesc(''); setCollImage(''); }} style={{ marginBottom: '16px' }}>
                            <FiPlus /> Создать коллекцию
                        </button>
                        <div style={{ display: 'grid', gap: '12px' }}>
                            {collections.map(c => (
                                <div key={c.id} style={{ padding: '12px', border: '1px solid var(--color-border)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        {c.image ? (
                                            <img src={c.image} alt={c.name} style={{ width: '40px', height: '40px', borderRadius: '4px', objectFit: 'cover' }} />
                                        ) : (
                                            <span style={{ fontSize: '1.5em' }}>{c.emoji || '📦'}</span>
                                        )}
                                        <div>
                                            <strong>{c.name}</strong>
                                            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{c.description}</div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button className="btn btn-ghost btn-sm" onClick={() => deleteCollection(c.id)}><FiTrash2 /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── BROADCAST ── */}
                {activeTab === 'broadcast' && (
                    <div className="glass" style={{ padding: 'var(--space-lg)' }}>
                        <textarea className="input" rows={4} value={broadcastMsg} onChange={e => setBroadcastMsg(e.target.value)} placeholder="Сообщение для отправки всем пользователям через Telegram бот..." />
                        <button className="btn btn-primary" disabled={!broadcastMsg.trim()} onClick={async () => {
                            try {
                                const res = await fetch('/api/admin/broadcast', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ message: broadcastMsg })
                                })
                                const data = await res.json()
                                if (data.success) {
                                    addToast(`Отправлено: ${data.sent}/${data.total}` + (data.failed ? ` (ошибок: ${data.failed})` : ''), data.failed ? 'warning' : 'success')
                                    setBroadcastMsg('')
                                } else {
                                    addToast(data.error || 'Ошибка отправки', 'error')
                                }
                            } catch (e) {
                                addToast('Ошибка сети', 'error')
                            }
                        }} style={{ marginTop: '12px' }}>
                            <FiSend /> Отправить всем в Telegram
                        </button>
                    </div>
                )}

                {/* ── LOGS TAB ── */}
                {activeTab === 'logs' && (
                    <div className="glass" style={{ padding: 'var(--space-lg)' }}>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                            <input className="input" placeholder="Фильтр по действию..." value={logFilter}
                                onChange={e => setLogFilter(e.target.value)} style={{ flex: 1, minWidth: '200px' }} />
                            <button className="btn btn-ghost btn-sm" onClick={refreshLogs}>🔄 Обновить</button>
                            <button className="btn btn-danger btn-sm" onClick={() => { logger.clear(); refreshLogs(); addToast('Логи очищены', 'info') }}>🗑 Очистить</button>
                        </div>

                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '8px' }}>
                            Всего записей: {activityLogs.length}
                        </div>

                        <div style={{ maxHeight: '500px', overflowY: 'auto', display: 'grid', gap: '4px' }}>
                            {activityLogs
                                .filter(l => !logFilter || l.action?.toLowerCase().includes(logFilter.toLowerCase()) || l.userId?.includes(logFilter))
                                .map(log => (
                                    <div key={log.id} style={{
                                        padding: '8px 12px', borderRadius: '6px',
                                        background: 'rgba(255,255,255,0.03)',
                                        border: '1px solid var(--color-border)',
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        fontSize: '12px', gap: '12px'
                                    }}>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1, minWidth: 0 }}>
                                            <span style={{
                                                padding: '2px 6px', borderRadius: '4px', fontWeight: 600, fontSize: '10px',
                                                background: log.action?.includes('error') ? 'var(--color-danger-bg)' :
                                                    log.action?.includes('delete') ? 'rgba(239,68,68,0.15)' : 'rgba(124,58,237,0.15)',
                                                color: log.action?.includes('error') ? 'var(--color-danger)' :
                                                    log.action?.includes('delete') ? '#ef4444' : 'var(--color-accent-light)'
                                            }}>
                                                {log.action || '?'}
                                            </span>
                                            {log.userId && <span style={{ color: 'var(--color-text-secondary)' }}>user: {log.userId.slice(0, 12)}</span>}
                                            {log.nftId && <span style={{ color: 'var(--color-text-secondary)' }}>nft: {log.nftId.slice(0, 8)}</span>}
                                            {log.amount != null && <span style={{ color: 'var(--color-success)' }}>{log.amount} HH</span>}
                                        </div>
                                        <span style={{ color: 'var(--color-text-muted)', whiteSpace: 'nowrap', fontSize: '10px' }}>
                                            {new Date(log.timestamp).toLocaleTimeString('ru-RU')}
                                        </span>
                                    </div>
                                ))
                            }
                            {activityLogs.length === 0 && (
                                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}>
                                    Логи пусты. Действия будут записываться автоматически.
                                </div>
                            )}
                        </div>

                        {/* API Request Log */}
                        {apiLogs.length > 0 && (
                            <>
                                <h3 style={{ marginTop: '24px', marginBottom: '12px', fontSize: '14px' }}>🔌 API запросы (сессия)</h3>
                                <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'grid', gap: '4px' }}>
                                    {apiLogs.map(log => (
                                        <div key={log.id} style={{
                                            padding: '6px 10px', borderRadius: '4px', fontSize: '11px',
                                            background: log.status === 'ok' ? 'rgba(34,197,94,0.05)' : 'rgba(239,68,68,0.05)',
                                            border: `1px solid ${log.status === 'ok' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                                            display: 'flex', gap: '8px', alignItems: 'center'
                                        }}>
                                            <span style={{
                                                padding: '1px 4px', borderRadius: '3px', fontWeight: 700, fontSize: '9px',
                                                background: log.method === 'GET' ? 'rgba(59,130,246,0.2)' : 'rgba(249,115,22,0.2)',
                                                color: log.method === 'GET' ? '#3b82f6' : '#f97316'
                                            }}>{log.method}</span>
                                            <span style={{ fontFamily: 'monospace', color: 'var(--color-text-secondary)' }}>{log.endpoint}</span>
                                            <span style={{
                                                marginLeft: 'auto', fontWeight: 600,
                                                color: log.status === 'ok' ? 'var(--color-success)' : 'var(--color-danger)'
                                            }}>{log.statusCode} · {log.duration}ms</span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* ── API TAB ── */}
                {activeTab === 'api' && (
                    <div className="glass" style={{ padding: 'var(--space-lg)' }}>
                        <div style={{ marginBottom: '20px' }}>
                            <h3 style={{ fontSize: '16px', marginBottom: '8px' }}>🔌 API Endpoints</h3>
                            <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                Формат: <code style={{ color: 'var(--color-accent-light)' }}>api.domain/request</code> · Режим: <span style={{ color: '#22c55e' }}>Mock (localStorage)</span>
                            </p>
                        </div>
                        {[
                            {
                                group: 'Auth', endpoints: [
                                    { method: 'POST', path: 'auth/login', desc: 'Авторизация по Telegram ID' },
                                    { method: 'GET', path: 'auth/users', desc: 'Все пользователи' },
                                    { method: 'POST', path: 'auth/block', desc: 'Блокировка пользователя' },
                                ]
                            },
                            {
                                group: 'Wallet', endpoints: [
                                    { method: 'GET', path: 'wallet/balance', desc: 'Баланс пользователя' },
                                    { method: 'GET', path: 'wallet/platform', desc: 'Баланс платформы' },
                                    { method: 'POST', path: 'wallet/deposit', desc: 'Пополнение' },
                                    { method: 'POST', path: 'wallet/withdraw', desc: 'Вывод средств' },
                                    { method: 'POST', path: 'wallet/transfer', desc: 'Перевод' },
                                ]
                            },
                            {
                                group: 'NFT', endpoints: [
                                    { method: 'GET', path: 'nft/list', desc: 'Список всех NFT' },
                                    { method: 'GET', path: 'nft/getByUser', desc: 'NFT пользователя (по TG ID)' },
                                    { method: 'POST', path: 'nft/create', desc: 'Создание NFT' },
                                    { method: 'POST', path: 'nft/upgrade', desc: 'Апгрейд NFT' },
                                    { method: 'POST', path: 'nft/transfer', desc: 'Передача NFT' },
                                ]
                            },
                            {
                                group: 'Auction', endpoints: [
                                    { method: 'GET', path: 'auction/list', desc: 'Все аукционы' },
                                    { method: 'POST', path: 'auction/bid', desc: 'Ставка' },
                                    { method: 'POST', path: 'auction/buyNow', desc: 'Купить сейчас' },
                                    { method: 'POST', path: 'auction/claim', desc: 'Забрать выигранный' },
                                ]
                            },
                            {
                                group: 'Clicker', endpoints: [
                                    { method: 'GET', path: 'clicker/state', desc: 'Состояние кликера' },
                                    { method: 'POST', path: 'clicker/tap', desc: 'Тап' },
                                    { method: 'POST', path: 'clicker/withdraw', desc: 'Вывод из кликера' },
                                ]
                            },
                            {
                                group: 'Admin', endpoints: [
                                    { method: 'GET', path: 'admin/stats', desc: 'Статистика платформы' },
                                    { method: 'GET', path: 'admin/logs', desc: 'Логи активности' },
                                    { method: 'GET', path: 'admin/apikeys', desc: 'Ключи API' },
                                    { method: 'GET', path: 'admin/apps', desc: 'Приложения' },
                                    { method: 'POST', path: 'admin/mint', desc: 'Минт HH' },
                                    { method: 'POST', path: 'admin/ban', desc: 'Бан пользователя' },
                                ]
                            },
                        ].map(section => (
                            <div key={section.group} style={{ marginBottom: '20px' }}>
                                <h4 style={{ fontSize: '13px', marginBottom: '8px', color: 'var(--color-accent-light)' }}>{section.group}</h4>
                                <div style={{ display: 'grid', gap: '4px' }}>
                                    {section.endpoints.map(ep => (
                                        <div key={ep.path} style={{
                                            padding: '8px 12px', borderRadius: '6px',
                                            background: 'rgba(255,255,255,0.02)', border: '1px solid var(--color-border)',
                                            display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px'
                                        }}>
                                            <span style={{
                                                padding: '2px 6px', borderRadius: '3px', fontWeight: 700, fontSize: '10px', minWidth: '36px', textAlign: 'center',
                                                background: ep.method === 'GET' ? 'rgba(59,130,246,0.2)' : 'rgba(249,115,22,0.2)',
                                                color: ep.method === 'GET' ? '#3b82f6' : '#f97316'
                                            }}>{ep.method}</span>
                                            <code style={{ fontFamily: 'monospace', color: '#e2e8f0', flex: 1 }}>{ep.path}</code>
                                            <span style={{ color: 'var(--color-text-muted)', fontSize: '11px' }}>{ep.desc}</span>
                                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} title="Online" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* ── Keys & Apps Tab ── */}
                {activeTab === 'keys' && (
                    <motion.div key="keys" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>

                        {/* Documentation / Onboarding */}
                        <div style={{
                            background: 'linear-gradient(135deg, rgba(124,58,237,0.1), rgba(99,102,241,0.08))',
                            border: '1px solid rgba(124,58,237,0.2)',
                            borderRadius: 'var(--radius-lg)', padding: '20px',
                            marginBottom: '20px',
                        }}>
                            <h3 style={{ fontSize: '15px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                📖 API Ключи и Приложения
                            </h3>
                            <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: '1.6', marginBottom: '12px' }}>
                                API ключи позволяют внешним сервисам взаимодействовать с платформой HeadHunters.
                                Каждый ключ имеет набор разрешений, определяющих доступные эндпоинты.
                            </p>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
                                <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: '8px', padding: '10px' }}>
                                    <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>Типы ключей</div>
                                    <div style={{ fontSize: '12px' }}>
                                        <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>Admin</span> — полный доступ<br />
                                        <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>App</span> — выбранные разрешения
                                    </div>
                                </div>
                                <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: '8px', padding: '10px' }}>
                                    <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>Формат ключа</div>
                                    <code style={{ fontSize: '11px', color: 'var(--color-accent-light)' }}>hh_app_Abc123...</code>
                                </div>
                                <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: '8px', padding: '10px' }}>
                                    <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>Использование</div>
                                    <div style={{ fontSize: '11px' }}>
                                        <code style={{ color: 'var(--color-accent-light)' }}>X-API-Key: hh_...</code>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Create Key */}
                        <div className="glass" style={{ padding: '20px', marginBottom: '16px' }}>
                            <h3 style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <FiPlus size={16} /> Создать API ключ
                            </h3>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', marginBottom: '12px' }}>
                                <input className="input" placeholder="Название ключа *" value={newKeyName} onChange={e => setNewKeyName(e.target.value)} />
                                <select className="input" value={newKeyType} onChange={e => setNewKeyType(e.target.value)} style={{ width: '130px' }}>
                                    <option value="app">🔌 App</option>
                                    <option value="admin">🛡️ Admin</option>
                                </select>
                            </div>
                            {newKeyType === 'app' && (
                                <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 'var(--radius-md)', padding: '14px', marginBottom: '12px' }}>
                                    <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '10px', fontWeight: 600 }}>
                                        🔒 Разрешения (выберите доступные эндпоинты):
                                    </p>
                                    <div style={{ display: 'grid', gap: '2px' }}>
                                        {['NFT', 'Auction', 'User', 'Wallet', 'Admin'].map(group => {
                                            const perms = API_PERMISSIONS.filter(p => p.group === group)
                                            return (
                                                <div key={group} style={{ marginBottom: '8px' }}>
                                                    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-accent-light)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                        {group}
                                                    </div>
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '2px' }}>
                                                        {perms.map(p => (
                                                            <label key={p.id} style={{
                                                                fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px',
                                                                cursor: 'pointer', padding: '3px 6px', borderRadius: '4px',
                                                                background: newKeyPerms.includes(p.id) ? 'rgba(124,58,237,0.15)' : 'transparent',
                                                                transition: 'background 0.15s ease',
                                                            }}>
                                                                <input type="checkbox" checked={newKeyPerms.includes(p.id)}
                                                                    onChange={e => setNewKeyPerms(prev => e.target.checked ? [...prev, p.id] : prev.filter(x => x !== p.id))} />
                                                                {p.label}
                                                            </label>
                                                        ))}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                        <button className="btn btn-ghost btn-sm" style={{ fontSize: '10px' }}
                                            onClick={() => setNewKeyPerms(API_PERMISSIONS.map(p => p.id))}>Выбрать все</button>
                                        <button className="btn btn-ghost btn-sm" style={{ fontSize: '10px' }}
                                            onClick={() => setNewKeyPerms([])}>Снять все</button>
                                    </div>
                                </div>
                            )}
                            {newKeyType === 'admin' && (
                                <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-md)', padding: '12px', marginBottom: '12px', fontSize: '12px', color: 'var(--color-danger)' }}>
                                    ⚠️ Admin-ключ имеет полный доступ ко всем эндпоинтам. Используйте с осторожностью.
                                </div>
                            )}
                            <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => {
                                if (!newKeyName.trim()) { addToast('Введите название ключа', 'error'); return }
                                const newKey = apiKeyManager.create({ name: newKeyName, type: newKeyType, permissions: newKeyPerms })
                                setApiKeys(apiKeyManager.getAll())
                                setNewKeyName('')
                                setNewKeyPerms([])
                                // Copy key immediately
                                navigator.clipboard.writeText(newKey.key)
                                addToast(`Ключ "${newKey.name}" создан и скопирован в буфер!`, 'success')
                            }}>
                                <FiKey size={14} /> Создать ключ
                            </button>
                        </div>

                        {/* Keys List */}
                        <div className="glass" style={{ padding: '20px', marginBottom: '16px' }}>
                            <h3 style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>🔑 Ключи ({apiKeys.length})</span>
                                {apiKeys.length > 0 && (
                                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 400 }}>
                                        Активных: {apiKeys.filter(k => k.isActive).length}
                                    </span>
                                )}
                            </h3>
                            {apiKeys.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                                    <FiKey size={48} style={{ color: 'var(--color-text-muted)', opacity: 0.3, marginBottom: '12px' }} />
                                    <p style={{ color: 'var(--color-text-muted)', marginBottom: '8px' }}>Нет API ключей</p>
                                    <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Создайте первый ключ выше для доступа к API</p>
                                </div>
                            ) : apiKeys.map(k => (
                                <div key={k.id} style={{
                                    background: k.isActive ? 'rgba(255,255,255,0.02)' : 'rgba(239,68,68,0.03)',
                                    borderRadius: 'var(--radius-md)', padding: '14px', marginBottom: '10px',
                                    border: `1px solid ${k.isActive ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                                    transition: 'border-color 0.2s ease',
                                }}>
                                    {/* Header */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div style={{
                                                width: '8px', height: '8px', borderRadius: '50%',
                                                background: k.isActive ? 'var(--color-success)' : 'var(--color-danger)',
                                                boxShadow: k.isActive ? '0 0 6px rgba(34,197,94,0.4)' : 'none',
                                            }} />
                                            <strong style={{ fontSize: '14px' }}>{k.name}</strong>
                                            <span style={{
                                                fontSize: '9px', padding: '2px 8px', borderRadius: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px',
                                                background: k.type === 'admin' ? 'rgba(239,68,68,0.15)' : 'rgba(124,58,237,0.15)',
                                                color: k.type === 'admin' ? '#ef4444' : 'var(--color-accent-light)',
                                            }}>{k.type}</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                            <button className="btn btn-ghost btn-sm" title="Скопировать ключ"
                                                onClick={() => { navigator.clipboard.writeText(k.key); addToast('Ключ скопирован', 'success') }}>📋</button>
                                            <button className="btn btn-ghost btn-sm" title={k.isActive ? 'Отключить' : 'Включить'}
                                                onClick={() => { apiKeyManager.toggleActive(k.id); setApiKeys(apiKeyManager.getAll()) }}>
                                                {k.isActive ? '⏸' : '▶'}
                                            </button>
                                            <button className="btn btn-ghost btn-sm" title="Удалить" style={{ color: 'var(--color-danger)' }}
                                                onClick={() => { apiKeyManager.delete(k.id); setApiKeys(apiKeyManager.getAll()); addToast('Ключ удалён', 'success') }}>
                                                <FiTrash2 size={12} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Key preview */}
                                    <div style={{
                                        fontFamily: 'monospace', fontSize: '11px', color: 'var(--color-text-muted)',
                                        background: 'rgba(0,0,0,0.2)', padding: '6px 10px', borderRadius: '6px', marginBottom: '8px',
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    }}>
                                        <span>{k.key.slice(0, 20)}...{k.key.slice(-8)}</span>
                                        <span style={{ fontSize: '10px', opacity: 0.6 }}>🔒</span>
                                    </div>

                                    {/* Stats */}
                                    <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '8px' }}>
                                        <span>📊 Запросов: <strong style={{ color: 'var(--color-text-secondary)' }}>{k.requestCount}</strong></span>
                                        <span>📅 Создан: {new Date(k.createdAt).toLocaleDateString('ru-RU')}</span>
                                        {k.lastUsedAt && <span>🕐 Посл. исп.: {new Date(k.lastUsedAt).toLocaleString('ru-RU')}</span>}
                                    </div>

                                    {/* Permissions */}
                                    {k.type !== 'admin' && k.permissions && (
                                        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '8px' }}>
                                            <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginBottom: '4px', fontWeight: 600 }}>
                                                Разрешения ({k.permissions.length}):
                                            </div>
                                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                {k.permissions.map(perm => (
                                                    <span key={perm} style={{
                                                        fontSize: '9px', padding: '2px 6px', borderRadius: '4px',
                                                        background: 'rgba(124,58,237,0.1)', color: 'var(--color-accent-light)',
                                                        border: '1px solid rgba(124,58,237,0.15)',
                                                    }}>{perm}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {k.type === 'admin' && (
                                        <div style={{ fontSize: '10px', color: 'var(--color-warning)', fontStyle: 'italic' }}>
                                            🛡️ Полный доступ ко всем эндпоинтам
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Create App */}
                        <div className="glass" style={{ padding: '20px', marginBottom: '16px' }}>
                            <h3 style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <FiPlus size={16} /> Создать приложение
                            </h3>
                            <div style={{ display: 'grid', gap: '10px' }}>
                                <input className="input" placeholder="Название приложения *" value={newAppName} onChange={e => setNewAppName(e.target.value)} />
                                <input className="input" placeholder="Описание (например: Мобильное приложение HeadHunters)" value={newAppDesc} onChange={e => setNewAppDesc(e.target.value)} />
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
                                    <div>
                                        <label style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px', display: 'block' }}>Привязка API ключа</label>
                                        <select className="input" value={newAppKeyId} onChange={e => setNewAppKeyId(e.target.value)}>
                                            <option value="">Без API ключа</option>
                                            {apiKeys.filter(k => k.isActive).map(k => (
                                                <option key={k.id} value={k.id}>🔑 {k.name} ({k.type})</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => {
                                    if (!newAppName.trim()) { addToast('Введите название приложения', 'error'); return }
                                    appManager.create({ name: newAppName, description: newAppDesc, apiKeyId: newAppKeyId || null })
                                    setApps(appManager.getAll())
                                    setNewAppName(''); setNewAppDesc(''); setNewAppKeyId('')
                                    addToast('Приложение создано!', 'success')
                                }}>
                                    📱 Создать приложение
                                </button>
                            </div>
                        </div>

                        {/* Apps List */}
                        <div className="glass" style={{ padding: '20px' }}>
                            <h3 style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>📱 Приложения ({apps.length})</span>
                                {apps.length > 0 && (
                                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 400 }}>
                                        Активных: {apps.filter(a => a.isActive).length}
                                    </span>
                                )}
                            </h3>
                            {apps.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                                    <div style={{ fontSize: '48px', opacity: 0.3, marginBottom: '12px' }}>📱</div>
                                    <p style={{ color: 'var(--color-text-muted)', marginBottom: '8px' }}>Нет приложений</p>
                                    <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Создайте приложение и привяжите к нему API ключ для авторизации запросов</p>
                                </div>
                            ) : apps.map(app => {
                                const linkedKey = app.apiKeyId ? apiKeys.find(k => k.id === app.apiKeyId) : null
                                return (
                                    <div key={app.id} style={{
                                        background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-md)',
                                        padding: '14px', marginBottom: '10px',
                                        border: `1px solid ${app.isActive ? 'var(--color-border)' : 'rgba(239,68,68,0.2)'}`,
                                    }}>
                                        {/* Header */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div style={{
                                                    width: '32px', height: '32px', borderRadius: '8px',
                                                    background: 'linear-gradient(135deg, var(--color-primary), var(--color-accent))',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px',
                                                }}>📱</div>
                                                <div>
                                                    <strong style={{ fontSize: '14px' }}>{app.name}</strong>
                                                    {!app.isActive && <span style={{ marginLeft: '6px', fontSize: '10px', color: 'var(--color-danger)', fontWeight: 600 }}>• Выключено</span>}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                <button className="btn btn-ghost btn-sm" title={app.isActive ? 'Отключить' : 'Включить'}
                                                    onClick={() => { appManager.toggleActive(app.id); setApps(appManager.getAll()) }}>
                                                    {app.isActive ? '⏸' : '▶'}
                                                </button>
                                                <button className="btn btn-ghost btn-sm" title="Удалить" style={{ color: 'var(--color-danger)' }}
                                                    onClick={() => { appManager.delete(app.id); setApps(appManager.getAll()); addToast('Приложение удалено', 'success') }}>
                                                    <FiTrash2 size={12} />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Description */}
                                        {app.description && (
                                            <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '8px', lineHeight: '1.4' }}>
                                                {app.description}
                                            </p>
                                        )}

                                        {/* Stats & Key */}
                                        <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--color-text-muted)', flexWrap: 'wrap' }}>
                                            <span>
                                                🔑 Ключ: {linkedKey
                                                    ? <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>{linkedKey.name}</span>
                                                    : <span style={{ color: 'var(--color-warning)' }}>не привязан</span>}
                                            </span>
                                            <span>📊 Запросов: {app.requestCount}</span>
                                            <span>📅 {new Date(app.createdAt).toLocaleDateString('ru-RU')}</span>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </motion.div>
                )}

                {/* ── SETTINGS TAB ── */}
                {activeTab === 'settings' && (
                    <motion.div key="settings" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                        {/* Header */}
                        <div style={{
                            background: 'linear-gradient(135deg, rgba(124,58,237,0.12), rgba(59,130,246,0.08))',
                            border: '1px solid rgba(124,58,237,0.2)',
                            borderRadius: 'var(--radius-lg)', padding: '20px', marginBottom: '20px',
                        }}>
                            <h3 style={{ fontSize: '16px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <FiSettings /> Настройки платформы
                            </h3>
                            <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: '1.5' }}>
                                Конфигурация Telegram-бота, авторизации и домена. Настройки сохраняются локально и применяются в runtime.
                            </p>
                        </div>

                        <div style={{ display: 'grid', gap: '16px' }}>
                            {/* ── Telegram Bot ── */}
                            <div className="glass" style={{ padding: 'var(--space-lg)' }}>
                                <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px' }}>
                                    🤖 Telegram Bot
                                </h3>
                                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '16px', lineHeight: '1.5' }}>
                                    Настройки бота для авторизации через Telegram Login Widget и отправки уведомлений.
                                </p>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div className="input-group">
                                        <label>Bot Token</label>
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            <input
                                                className="input"
                                                type={showBotToken ? 'text' : 'password'}
                                                value={settings.botToken}
                                                onChange={e => updateSetting('botToken', e.target.value)}
                                                placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v..."
                                                style={{ fontFamily: 'monospace', fontSize: '12px' }}
                                            />
                                            <button className="btn btn-ghost btn-sm" onClick={() => setShowBotToken(!showBotToken)} title={showBotToken ? 'Скрыть' : 'Показать'}>
                                                {showBotToken ? <FiEyeOff /> : <FiEye />}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="input-group">
                                        <label>Bot Username</label>
                                        <input
                                            className="input"
                                            value={settings.botUsername}
                                            onChange={e => updateSetting('botUsername', e.target.value)}
                                            placeholder="HeadHuntersBot"
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label>Webhook URL</label>
                                        <input
                                            className="input"
                                            value={settings.webhookUrl}
                                            onChange={e => updateSetting('webhookUrl', e.target.value)}
                                            placeholder="https://yourdomain.com/api/telegram/webhook"
                                            style={{ fontFamily: 'monospace', fontSize: '12px' }}
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label>Admin Chat ID</label>
                                        <input
                                            className="input"
                                            value={settings.adminChatId}
                                            onChange={e => updateSetting('adminChatId', e.target.value)}
                                            placeholder="-1001234567890"
                                        />
                                    </div>
                                </div>
                                {settings.botToken && (
                                    <div style={{
                                        marginTop: '12px', padding: '10px 14px', borderRadius: 'var(--radius-md)',
                                        background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
                                        fontSize: '12px', color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '8px',
                                    }}>
                                        ✅ Токен задан · Telegram Login Widget будет использовать бота <strong>@{settings.botUsername || '?'}</strong>
                                    </div>
                                )}

                                {/* ── Telegram App Credentials (read-only from env.json) ── */}
                                <div style={{ marginTop: '16px', padding: '12px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '10px' }}>
                                        📱 Telegram App (из env.json — только чтение)
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                        <div className="input-group">
                                            <label>API ID</label>
                                            <input className="input" value={CONFIG.telegram.apiId || 'не задан'} readOnly style={{ fontFamily: 'monospace', fontSize: '12px', opacity: 0.7 }} />
                                        </div>
                                        <div className="input-group">
                                            <label>API Hash</label>
                                            <input className="input" value={CONFIG.telegram.apiHash ? CONFIG.telegram.apiHash.slice(0, 8) + '...' : 'не задан'} readOnly style={{ fontFamily: 'monospace', fontSize: '12px', opacity: 0.7 }} />
                                        </div>
                                    </div>
                                </div>
                            </div>


                            {/* ── Domain / Network ── */}
                            <div className="glass" style={{ padding: 'var(--space-lg)' }}>
                                <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px' }}>
                                    <FiGlobe /> Домен и сеть
                                </h3>
                                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '16px', lineHeight: '1.5' }}>
                                    Настройки домена приложения и CORS-политик для API-запросов. Порт: <strong>3310</strong>
                                </p>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div className="input-group">
                                        <label>Домен</label>
                                        <input
                                            className="input"
                                            value={settings.domain}
                                            onChange={e => updateSetting('domain', e.target.value)}
                                            placeholder="yourdomain.com"
                                            style={{ fontFamily: 'monospace', fontSize: '12px' }}
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label>URL приложения</label>
                                        <input
                                            className="input"
                                            value={settings.appUrl}
                                            onChange={e => updateSetting('appUrl', e.target.value)}
                                            placeholder="https://yourdomain.com"
                                            style={{ fontFamily: 'monospace', fontSize: '12px' }}
                                        />
                                    </div>
                                    <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                                        <label>CORS Origins (через запятую)</label>
                                        <input
                                            className="input"
                                            value={settings.corsOrigins}
                                            onChange={e => updateSetting('corsOrigins', e.target.value)}
                                            placeholder="http://localhost:3310, https://yourdomain.com"
                                            style={{ fontFamily: 'monospace', fontSize: '12px' }}
                                        />
                                    </div>
                                </div>
                                {settings.domain && (
                                    <div style={{
                                        marginTop: '12px', padding: '10px 14px', borderRadius: 'var(--radius-md)',
                                        background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)',
                                        fontSize: '12px', color: '#3b82f6',
                                    }}>
                                        🌐 Домен: <strong>{settings.domain}</strong> · Порт: <strong>3310</strong>
                                        {settings.appUrl && <> · URL: <code style={{ color: '#60a5fa' }}>{settings.appUrl}</code></>}
                                    </div>
                                )}
                            </div>

                            {/* ── API & Apps ── */}
                            <div className="glass" style={{ padding: 'var(--space-lg)' }}>
                                <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px' }}>
                                    🔌 Приложения и API ключи
                                </h3>
                                <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '16px', lineHeight: '1.5' }}>
                                    Создайте приложение — оно автоматически получит API ключ для доступа к эндпоинтам платформы.
                                </p>

                                {/* Create App → auto-generates API key */}
                                <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 'var(--radius-md)', padding: '16px', marginBottom: '16px' }}>
                                    <div style={{ display: 'grid', gap: '10px', marginBottom: '12px' }}>
                                        <input className="input" placeholder="Название приложения *" value={newAppName} onChange={e => setNewAppName(e.target.value)} />
                                        <input className="input" placeholder="Описание (необязательно)" value={newAppDesc} onChange={e => setNewAppDesc(e.target.value)} />
                                        <select className="input" value={newKeyType} onChange={e => setNewKeyType(e.target.value)}>
                                            <option value="app">🔌 Ключ типа App (выборочные разрешения)</option>
                                            <option value="admin">🛡️ Ключ типа Admin (полный доступ)</option>
                                        </select>
                                    </div>
                                    {newKeyType === 'app' && (
                                        <div style={{ background: 'rgba(0,0,0,0.1)', borderRadius: 'var(--radius-sm)', padding: '12px', marginBottom: '12px' }}>
                                            <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '8px', fontWeight: 600 }}>
                                                🔒 Разрешения:
                                            </p>
                                            <div style={{ display: 'grid', gap: '2px' }}>
                                                {['NFT', 'Auction', 'User', 'Wallet', 'Admin'].map(group => {
                                                    const perms = API_PERMISSIONS.filter(p => p.group === group)
                                                    return (
                                                        <div key={group} style={{ marginBottom: '6px' }}>
                                                            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-accent-light)', marginBottom: '2px', textTransform: 'uppercase' }}>
                                                                {group}
                                                            </div>
                                                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                                {perms.map(p => (
                                                                    <label key={p.id} style={{
                                                                        fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px',
                                                                        cursor: 'pointer', padding: '2px 6px', borderRadius: '4px',
                                                                        background: newKeyPerms.includes(p.id) ? 'rgba(124,58,237,0.15)' : 'transparent',
                                                                    }}>
                                                                        <input type="checkbox" checked={newKeyPerms.includes(p.id)}
                                                                            onChange={e => setNewKeyPerms(prev => e.target.checked ? [...prev, p.id] : prev.filter(x => x !== p.id))} />
                                                                        {p.label}
                                                                    </label>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                                                <button className="btn btn-ghost btn-sm" style={{ fontSize: '10px' }}
                                                    onClick={() => setNewKeyPerms(API_PERMISSIONS.map(p => p.id))}>Выбрать все</button>
                                                <button className="btn btn-ghost btn-sm" style={{ fontSize: '10px' }}
                                                    onClick={() => setNewKeyPerms([])}>Снять все</button>
                                            </div>
                                        </div>
                                    )}
                                    {newKeyType === 'admin' && (
                                        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-sm)', padding: '10px', marginBottom: '12px', fontSize: '11px', color: 'var(--color-danger)' }}>
                                            ⚠️ Admin-ключ имеет полный доступ ко всем эндпоинтам.
                                        </div>
                                    )}
                                    <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => {
                                        if (!newAppName.trim()) { addToast('Введите название приложения', 'error'); return }
                                        // 1. Create API key
                                        const newKey = apiKeyManager.create({ name: newAppName, type: newKeyType, permissions: newKeyPerms })
                                        setApiKeys(apiKeyManager.getAll())
                                        // 2. Create app linked to the key
                                        appManager.create({ name: newAppName, description: newAppDesc, apiKeyId: newKey.id })
                                        setApps(appManager.getAll())
                                        // 3. Copy key
                                        navigator.clipboard.writeText(newKey.key)
                                        setNewAppName(''); setNewAppDesc(''); setNewKeyPerms([])
                                        addToast(`Приложение "${newAppName}" создано! API ключ скопирован в буфер.`, 'success')
                                    }}>
                                        <FiPlus size={14} /> Создать приложение и ключ
                                    </button>
                                </div>

                                {/* Apps List */}
                                {apps.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '30px 20px' }}>
                                        <div style={{ fontSize: '36px', opacity: 0.3, marginBottom: '10px' }}>📱</div>
                                        <p style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>Нет приложений. Создайте первое выше.</p>
                                    </div>
                                ) : apps.map(app => {
                                    const linkedKey = app.apiKeyId ? apiKeys.find(k => k.id === app.apiKeyId) : null
                                    return (
                                        <div key={app.id} style={{
                                            background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-md)',
                                            padding: '14px', marginBottom: '10px',
                                            border: `1px solid ${app.isActive ? 'var(--color-border)' : 'rgba(239,68,68,0.2)'}`,
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <div style={{
                                                        width: '8px', height: '8px', borderRadius: '50%',
                                                        background: app.isActive ? 'var(--color-success)' : 'var(--color-danger)',
                                                        boxShadow: app.isActive ? '0 0 6px rgba(34,197,94,0.4)' : 'none',
                                                    }} />
                                                    <strong style={{ fontSize: '13px' }}>{app.name}</strong>
                                                    {linkedKey && (
                                                        <span style={{
                                                            fontSize: '9px', padding: '2px 8px', borderRadius: '10px', fontWeight: 700, textTransform: 'uppercase',
                                                            background: linkedKey.type === 'admin' ? 'rgba(239,68,68,0.15)' : 'rgba(124,58,237,0.15)',
                                                            color: linkedKey.type === 'admin' ? '#ef4444' : 'var(--color-accent-light)',
                                                        }}>{linkedKey.type}</span>
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', gap: '4px' }}>
                                                    {linkedKey && (
                                                        <button className="btn btn-ghost btn-sm" title="Скопировать API ключ"
                                                            onClick={() => { navigator.clipboard.writeText(linkedKey.key); addToast('Ключ скопирован', 'success') }}>📋</button>
                                                    )}
                                                    <button className="btn btn-ghost btn-sm" title={app.isActive ? 'Отключить' : 'Включить'}
                                                        onClick={() => { appManager.toggleActive(app.id); setApps(appManager.getAll()) }}>
                                                        {app.isActive ? '⏸' : '▶'}
                                                    </button>
                                                    <button className="btn btn-ghost btn-sm" title="Удалить" style={{ color: 'var(--color-danger)' }}
                                                        onClick={() => {
                                                            if (app.apiKeyId) { apiKeyManager.delete(app.apiKeyId); setApiKeys(apiKeyManager.getAll()) }
                                                            appManager.delete(app.id); setApps(appManager.getAll())
                                                            addToast('Приложение и ключ удалены', 'success')
                                                        }}>
                                                        <FiTrash2 size={12} />
                                                    </button>
                                                </div>
                                            </div>
                                            {app.description && <p style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>{app.description}</p>}
                                            {linkedKey && (
                                                <div style={{
                                                    fontFamily: 'monospace', fontSize: '10px', color: 'var(--color-text-muted)',
                                                    background: 'rgba(0,0,0,0.2)', padding: '5px 8px', borderRadius: '4px',
                                                }}>
                                                    🔑 {linkedKey.key.slice(0, 16)}...{linkedKey.key.slice(-6)}
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>

                            {/* Save button */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', alignItems: 'center' }}>
                                {settingsSaved && (
                                    <motion.span
                                        initial={{ opacity: 0, x: 10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        style={{ color: 'var(--color-success)', fontSize: '13px', fontWeight: 600 }}
                                    >
                                        ✅ Сохранено
                                    </motion.span>
                                )}
                                <button className="btn btn-primary" onClick={handleSaveSettings} style={{ padding: '12px 32px', fontSize: '14px' }}>
                                    <FiSave /> Сохранить настройки
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Modal: Delete User */}
            <Modal isOpen={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Удалить пользователя?"
                footer={<>
                    <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Отмена</button>
                    <button className="btn btn-danger" onClick={confirmDeleteUser}>Удалить навсегда</button>
                </>}>
                <div style={{ textAlign: 'center', padding: '20px' }}>
                    <p>Вы уверены, что хотите удалить <strong>@{confirmDelete?.username}</strong>?</p>
                    <p style={{ color: 'var(--color-danger)', fontSize: '12px' }}>Это действие необратимо.</p>
                </div>
            </Modal>

            {/* Modal: Block User */}
            <Modal isOpen={!!confirmBlock} onClose={() => setConfirmBlock(null)} title={confirmBlock?.isBlocked || confirmBlock?.is_blocked ? 'Разблокировать пользователя?' : 'Заблокировать пользователя?'}
                footer={<>
                    <button className="btn btn-ghost" onClick={() => setConfirmBlock(null)}>Отмена</button>
                    <button className={`btn ${confirmBlock?.isBlocked || confirmBlock?.is_blocked ? 'btn-success' : 'btn-danger'}`} onClick={confirmToggleBlock}>
                        {confirmBlock?.isBlocked || confirmBlock?.is_blocked ? 'Разблокировать' : 'Заблокировать'}
                    </button>
                </>}>
                <div style={{ textAlign: 'center', padding: '20px' }}>
                    <p>{confirmBlock?.isBlocked || confirmBlock?.is_blocked ? 'Пользователь' : 'Вы уверены, что хотите заблокировать'} <strong>@{confirmBlock?.username || '—'}</strong>{confirmBlock?.isBlocked || confirmBlock?.is_blocked ? ' будет разблокирован' : '?'}</p>
                </div>
            </Modal>

            {/* Modal: Collection */}
            <Modal isOpen={!!collModal} onClose={() => setCollModal(null)} title="Коллекция"
                footer={<><button className="btn btn-primary" onClick={confirmCollection}>Сохранить</button></>}>
                <div className="input-group">
                    <label>Название</label>
                    <input className="input" value={collName} onChange={e => setCollName(e.target.value)} />
                </div>
                <div className="input-group">
                    <label>Изображение</label>
                    <label className="btn btn-ghost" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', border: '1px dashed var(--color-border)', padding: '12px', borderRadius: 'var(--radius-sm)' }}>
                        <FiUpload /> {collImage ? 'Файл загружен ✓' : 'Выбрать файл'}
                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                            const file = e.target.files[0]
                            if (file) {
                                const reader = new FileReader()
                                reader.onload = ev => setCollImage(ev.target.result)
                                reader.readAsDataURL(file)
                            }
                        }} />
                    </label>
                    {collImage && <img src={collImage} alt="preview" style={{ width: '60px', height: '60px', borderRadius: '6px', objectFit: 'cover', marginTop: '8px' }} />}
                </div>
                <div className="input-group">
                    <label>Описание</label>
                    <input className="input" value={collDesc} onChange={e => setCollDesc(e.target.value)} />
                </div>
            </Modal>
        </div>
    )
}
