import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { io } from 'socket.io-client'

const AuthContext = createContext(null)

// Map DB snake_case fields to frontend camelCase
function mapUser(u) {
    if (!u) return null
    return {
        ...u,
        telegramId: u.telegram_id,
        firstName: u.first_name,
        lastName: u.last_name,
        walletAddress: u.wallet_address,
        isBlocked: !!u.is_blocked,
        createdAt: u.created_at,
        lastLogin: u.last_login,
        photoUrl: u.avatar || u.photo_url || null,
    }
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null)
    const [allUsers, setAllUsers] = useState([])
    const [adminIds, setAdminIds] = useState([])
    const [inviteCodes, setInviteCodes] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [collections, setCollections] = useState([])
    const [socket, setSocket] = useState(null)

    // ── WebSocket Logic ──
    useEffect(() => {
        const newSocket = io(window.location.origin, { transports: ['websocket'] })
        setSocket(newSocket)

        newSocket.on('balance_updated', (data) => {
            console.log('[WS] Balance updated:', data)
            setUser(prev => prev ? { ...prev, balance: data.balance } : null)
        })

        newSocket.on('outbid', (data) => {
            console.log('[WS] Outbid alert:', data)
            // You can add a toast notification here if you have a toast system
        })

        return () => newSocket.close()
    }, [])

    useEffect(() => {
        if (socket && user?.id) {
            socket.emit('join_user', user.id)
        }
    }, [socket, user?.id])

    const logout = useCallback(() => {
        setUser(null)
        localStorage.removeItem('hh_user')
        localStorage.removeItem('hh_token')
    }, [])

    /**
     * Centralized fetch with JWT support and error handling
     */
    const fetchWithAuth = useCallback(async (url, options = {}) => {
        const token = localStorage.getItem('hh_token')
        const headers = {
            ...options.headers,
            'Content-Type': 'application/json',
        }
        if (token) {
            headers['Authorization'] = `Bearer ${token}`
        }

        try {
            const res = await fetch(url, { ...options, headers })
            if (res.status === 401 || res.status === 403) {
                console.warn('[Auth] Session expired or unauthorized')
                logout()
                return res
            }
            return res
        } catch (e) {
            console.error('[Auth] Fetch error:', e.message)
            throw e
        }
    }, [logout])

    // ── Load User from Backend on Mount ──
    useEffect(() => {
        const loadUser = async () => {
            try {
                const savedUser = localStorage.getItem('hh_user')
                const token = localStorage.getItem('hh_token')
                
                if (savedUser && token) {
                    const parsed = JSON.parse(savedUser)
                    if (parsed.id) {
                        try {
                            setUser({ ...parsed, balance: 0 })
                            const res = await fetchWithAuth(`/api/user/${parsed.id}`)
                            if (res.ok) {
                                const data = await res.json()
                                const mapped = mapUser(data)
                                setUser(mapped)
                                localStorage.setItem('hh_user', JSON.stringify(mapped))
                            }
                        } catch (e) {
                            console.error('[Auth] Init error, using cache:', e.message)
                            setUser(parsed)
                        }
                    }
                }
            } catch (e) {
                console.error('[Auth] Init error:', e)
            } finally {
                setIsLoading(false)
            }
        }

        try {
            const savedCol = localStorage.getItem('hh_collections')
            if (savedCol) setCollections(JSON.parse(savedCol))
        } catch { }

        loadUser()
    }, [fetchWithAuth])

    useEffect(() => {
        if (!isLoading) {
            localStorage.setItem('hh_collections', JSON.stringify(collections))
        }
    }, [collections, isLoading])

    // ── Fetch All Users (for admin) ──
    const fetchAllUsers = useCallback(async () => {
        try {
            const res = await fetchWithAuth('/api/users')
            if (res.ok) {
                const data = await res.json()
                setAllUsers(data.map(mapUser))
            }
        } catch (e) {
            console.error('[Auth] Fetch all users error:', e)
        }
    }, [fetchWithAuth])

    // ── Fetch Admin IDs ──
    const fetchAdminIds = useCallback(async () => {
        try {
            const res = await fetchWithAuth('/api/admin/admins')
            if (res.ok) {
                const data = await res.json()
                setAdminIds(data.map(a => a.telegram_id))
            }
        } catch (e) {
            console.error('[Auth] Fetch admins error:', e)
        }
    }, [fetchWithAuth])

    // ── Fetch Invite Codes ──
    const fetchInviteCodes = useCallback(async () => {
        try {
            const res = await fetchWithAuth('/api/admin/invite-codes')
            if (res.ok) {
                const data = await res.json()
                setInviteCodes(data.map(c => c.code))
            }
        } catch (e) {
            console.error('[Auth] Fetch invite codes error:', e)
        }
    }, [fetchWithAuth])

    // When user is admin, auto-fetch all data
    useEffect(() => {
        if (user?.role === 'admin') {
            fetchAllUsers()
            fetchAdminIds()
            fetchInviteCodes()
        }
    }, [user?.role, fetchAllUsers, fetchAdminIds, fetchInviteCodes])

    // ── Login via Telegram (calls backend API) ──
    const loginWithTelegram = useCallback(async (telegramData) => {
        try {
            const res = await fetch('/api/auth/telegram', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(telegramData)
            })

            if (!res.ok) {
                const err = await res.json().catch(() => ({}))
                return { success: false, error: err.message || err.error || 'Login failed', code: err.error }
            }

            const data = await res.json()
            const mapped = mapUser(data)
            
            // Save token and user separately
            if (data.token) {
                localStorage.setItem('hh_token', data.token)
            }
            setUser(mapped)
            localStorage.setItem('hh_user', JSON.stringify(mapped))

            return { success: true }
        } catch (error) {
            console.error('[Auth] Login error:', error)
            return { success: false, error: error.message || 'Ошибка входа' }
        }
    }, [])

    // Legacy compat
    const registerWithCode = useCallback(async (code, telegramData) => {
        return loginWithTelegram(telegramData)
    }, [loginWithTelegram])

    // ── Refresh User Data from API ──
    const refreshUser = useCallback(async () => {
        if (!user?.id) return
        try {
            const res = await fetchWithAuth(`/api/user/${user.id}`)
            if (res.ok) {
                const data = await res.json()
                const mapped = mapUser(data)
                setUser(mapped)
                localStorage.setItem('hh_user', JSON.stringify(mapped))
            }
        } catch (e) {
            console.error('[Auth] Refresh error:', e)
        }
    }, [user?.id, fetchWithAuth])

    // ── Background Polling for Dynamic Balances ──
    useEffect(() => {
        if (!user?.id) return
        const interval = setInterval(() => {
            refreshUser()
        }, 30000) // Poll every 30 seconds
        return () => clearInterval(interval)
    }, [user?.id, refreshUser])

    // ── Save Wallet Address to Account ──
    const saveWalletAddress = useCallback(async (address) => {
        if (!user?.id) return
        try {
            const res = await fetchWithAuth(`/api/user/${user.id}/wallet`, {
                method: 'POST',
                body: JSON.stringify({ address })
            })
            if (res.ok) {
                const data = await res.json()
                const mapped = mapUser(data)
                setUser(mapped)
                localStorage.setItem('hh_user', JSON.stringify(mapped))
            }
        } catch (e) {
            console.error('[Auth] Wallet save error:', e)
        }
    }, [user?.id, fetchWithAuth])

    // ═══════════════════════════════════════
    // ADMIN OPERATIONS (real API calls)
    // ═══════════════════════════════════════

    const toggleUserBlock = useCallback(async (userId) => {
        try {
            const res = await fetchWithAuth(`/api/admin/user/${userId}/toggle-block`, { method: 'POST' })
            if (res.ok) {
                await fetchAllUsers() // Refresh list
                return { success: true }
            }
            const err = await res.json()
            return { success: false, error: err.error }
        } catch (e) {
            console.error('[Auth] Block error:', e)
            return { success: false, error: e.message }
        }
    }, [fetchAllUsers, fetchWithAuth])

    const deleteUser = useCallback(async (userId) => {
        try {
            const res = await fetchWithAuth(`/api/admin/user/${userId}`, { method: 'DELETE' })
            if (res.ok) {
                await fetchAllUsers() // Refresh list
                return { success: true }
            }
            const err = await res.json()
            return { success: false, error: err.error }
        } catch (e) {
            console.error('[Auth] Delete error:', e)
            return { success: false, error: e.message }
        }
    }, [fetchAllUsers, fetchWithAuth])

    const addAdminId = useCallback(async (telegramId) => {
        if (!telegramId?.trim()) return { success: false, error: 'Введите Telegram ID' }
        try {
            const userRes = await fetchWithAuth(`/api/user/by-telegram/${telegramId.trim()}`)
            if (!userRes.ok) return { success: false, error: 'Пользователь не найден' }
            const userData = await userRes.json()

            const res = await fetchWithAuth(`/api/admin/user/${userData.id}/role`, {
                method: 'POST',
                body: JSON.stringify({ role: 'admin' })
            })
            if (res.ok) {
                await fetchAdminIds()
                await fetchAllUsers()
                return { success: true }
            }
            return { success: false, error: 'Ошибка назначения' }
        } catch (e) {
            return { success: false, error: e.message }
        }
    }, [fetchAdminIds, fetchAllUsers, fetchWithAuth])

    const removeAdminId = useCallback(async (telegramId) => {
        try {
            const userRes = await fetchWithAuth(`/api/user/by-telegram/${telegramId}`)
            if (!userRes.ok) return { success: false, error: 'Пользователь не найден' }
            const userData = await userRes.json()

            const res = await fetchWithAuth(`/api/admin/user/${userData.id}/role`, {
                method: 'POST',
                body: JSON.stringify({ role: 'user' })
            })
            if (res.ok) {
                await fetchAdminIds()
                await fetchAllUsers()
                return { success: true }
            }
            return { success: false, error: 'Ошибка удаления' }
        } catch (e) {
            return { success: false, error: e.message }
        }
    }, [fetchAdminIds, fetchAllUsers, fetchWithAuth])

    const addInviteCode = useCallback(async (code) => {
        if (!code?.trim()) return { success: false, error: 'Введите код' }
        try {
            const res = await fetchWithAuth('/api/admin/invite-codes', {
                method: 'POST',
                body: JSON.stringify({ code: code.trim(), createdBy: user?.id })
            })
            if (res.ok) {
                await fetchInviteCodes()
                return { success: true }
            }
            const err = await res.json()
            return { success: false, error: err.error || 'Ошибка создания кода' }
        } catch (e) {
            return { success: false, error: e.message }
        }
    }, [user?.id, fetchInviteCodes, fetchWithAuth])

    const removeInviteCode = useCallback(async (code) => {
        try {
            const res = await fetchWithAuth(`/api/admin/invite-codes/${encodeURIComponent(code)}`, { method: 'DELETE' })
            if (res.ok) {
                await fetchInviteCodes()
                return { success: true }
            }
            return { success: false, error: 'Ошибка удаления' }
        } catch (e) {
            return { success: false, error: e.message }
        }
    }, [fetchInviteCodes, fetchWithAuth])

    const updateUserProfile = useCallback(() => { }, [])

    // ── Collections (Local) ──
    const addCollection = useCallback((data) => {
        const newCol = {
            id: 'col_' + Date.now(),
            name: data.name,
            description: data.description,
            image: data.image,
            emoji: data.emoji || '📦',
            createdBy: user?.id || 'unknown'
        }
        setCollections(prev => [...prev, newCol])
        return { success: true, collection: newCol }
    }, [user])

    const deleteCollection = useCallback((id) => {
        setCollections(prev => prev.filter(c => c.id !== id))
        return { success: true }
    }, [])

    const editCollection = useCallback(() => { }, [])

    const isAdmin = user?.role === 'admin'
    const isAuthenticated = !!user

    return (
        <AuthContext.Provider value={{
            user,
            isLoading,
            isAuthenticated,
            isAdmin,
            refreshUser,
            fetchAllUsers,
            saveWalletAddress,
            loginWithTelegram,
            registerWithCode,
            logout,
            collections,
            addCollection,
            deleteCollection,
            editCollection,
            // Real admin data from API
            allUsers,
            inviteCodes,
            adminIds,
            addInviteCode, removeInviteCode,
            addAdminId, removeAdminId,
            toggleUserBlock, deleteUser,
            updateUserProfile,
            socket // Expose socket for room joining
        }}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    return useContext(AuthContext)
}
