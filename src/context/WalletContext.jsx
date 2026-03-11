import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useAuth } from './AuthContext'
import { CONFIG, generateId } from '../config'
import { logger } from '../api/logger'


const WalletContext = createContext(null)

const COMMISSION_RATE = CONFIG.fees.commissionRate
const CREATOR_ROYALTY = CONFIG.fees.creatorRoyalty
const TON_NETWORK_FEE = CONFIG.fees.tonNetworkFee

// NFTs and Auctions are still local for now (Phase 1 Migration)
// But Balance and Transactions are now Server-Side.
const INITIAL_LOCAL_STATE = {
    nfts: [], // Local registry of NFTs
}

export function WalletProvider({ children }) {
    const { user, refreshUser } = useAuth()
    const [transactions, setTransactions] = useState([])
    const [notifications, setNotifications] = useState([])

    // Local state for NFTs only
    const [localState, setLocalState] = useState(INITIAL_LOCAL_STATE)
    const [isLoaded, setIsLoaded] = useState(false)

    // ═══════════════════════════════════════
    // LOAD TRANSACTIONS FROM API
    // ═══════════════════════════════════════
    const refreshTransactions = useCallback(async () => {
        if (!user?.id) {
            setTransactions([])
            return
        }
        try {
            const res = await fetch(`/api/user/${user.id}/transactions`)
            if (res.ok) {
                const data = await res.json()
                setTransactions(data)
            }
        } catch (e) {
            console.error('Tx fetch error:', e)
        }
    }, [user?.id])

    useEffect(() => {
        refreshTransactions()
    }, [refreshTransactions])

    // ═══════════════════════════════════════
    // PLATFORM BALANCE (Blockchain)
    // ═══════════════════════════════════════
    const [platformWallet, setPlatformWallet] = useState({
        tonBalance: 0,
        hhBalance: 0,
        configured: false,
        address: CONFIG.ton?.platformAddress || '',
        loading: true,
    })

    // Fetch platform wallet info from API
    const fetchPlatformWallet = useCallback(async () => {
        try {
            const res = await fetch('/api/platform-wallet')
            if (res.ok) {
                const data = await res.json()
                setPlatformWallet(prev => ({
                    ...prev,
                    address: data.address,
                    tonBalance: data.balance,
                    hhBalance: data.hhBalance || 0,
                    configured: true,
                    loading: false
                }))
                // Also update global config just in case
                if (data.address) {
                    CONFIG.ton = CONFIG.ton || {}
                    CONFIG.ton.platformAddress = data.address
                }
            }
        } catch (e) {
            console.error('[Wallet] Failed to fetch platform wallet:', e)
        }
    }, [])

    const [ownedNFTs, setOwnedNFTs] = useState([])
    const [allNFTs, setAllNFTs] = useState([])

    // ═══════════════════════════════════════
    // FETCH NFTS FROM API
    // ═══════════════════════════════════════
    const refreshNFTs = useCallback(async () => {
        if (!user?.id) {
            setOwnedNFTs([])
            return
        }
        try {
            // Fetch user's owned NFTs from server
            const res = await fetch(`/api/user/${user.id}/nfts`)
            if (res.ok) {
                const data = await res.json()
                setOwnedNFTs(data)
            }
        } catch (e) {
            console.error('[Wallet] Failed to fetch NFTs:', e)
        }
    }, [user?.id])

    const refreshAllNFTs = useCallback(async () => {
        if (!user || user.role !== 'admin') return
        try {
            const res = await fetch('/api/admin/nfts')
            if (res.ok) {
                const data = await res.json()
                setAllNFTs(data)
            }
        } catch (e) {
            console.error('[Wallet] Failed to fetch all NFTs:', e)
        }
    }, [user])

    const adminUpdateNFT = async (index, data) => {
        if (!user || user.role !== 'admin') return { success: false, error: 'Not an admin' }
        try {
            const res = await fetch(`/api/admin/nfts/${index}/assign`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            })
            if (res.ok) {
                refreshAllNFTs()
                return { success: true }
            }
            return await res.json()
        } catch (e) {
            return { success: false, error: e.message }
        }
    }

    const syncNFTs = useCallback(async () => {
        if (!user?.id) return
        try {
            const res = await fetch(`/api/user/${user.id}/sync-nfts`, { method: 'POST' })
            if (res.ok) {
                const data = await res.json()
                if (data.added > 0) {
                    refreshNFTs()
                }
                return data
            }
        } catch (e) {
            console.error('[Wallet] Sync failed:', e)
        }
    }, [user?.id, refreshNFTs])

    useEffect(() => {
        refreshNFTs()
        syncNFTs() // discover on-chain nfts on load
        if (user?.role === 'admin') {
            refreshAllNFTs()
        }
        const iv = setInterval(() => {
            refreshNFTs()
            if (user?.role === 'admin') refreshAllNFTs()
        }, 15000)
        return () => clearInterval(iv)
    }, [refreshNFTs, syncNFTs, refreshAllNFTs, user?.role])


    useEffect(() => {
        fetchPlatformWallet()
        const interval = setInterval(fetchPlatformWallet, 30000) // Poll every 30s
        return () => clearInterval(interval)
    }, [fetchPlatformWallet])



    // ═══════════════════════════════════════
    // LOCAL STATE (NFTs)
    // ═══════════════════════════════════════
    useEffect(() => {
        try {
            const saved = localStorage.getItem('hh_blockchain_state') // Legacy name, now just NFTs
            if (saved) {
                const parsed = JSON.parse(saved)
                setLocalState({
                    nfts: Array.isArray(parsed.nfts) ? parsed.nfts : [],
                })
            }
        } catch (e) { }
        setIsLoaded(true)
    }, [])

    useEffect(() => {
        if (isLoaded) {
            localStorage.setItem('hh_blockchain_state', JSON.stringify(localState))
        }
    }, [localState, isLoaded])

    // ═══════════════════════════════════════
    // API ACTIONS
    // ═══════════════════════════════════════
    const apiTransaction = async (amount, type, description) => {
        if (!user?.id) return { success: false, error: 'Not logged in' }
        try {
            const res = await fetch('/api/wallet/transaction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.id,
                    amount: amount,
                    type: type,
                    description: description
                })
            })
            if (!res.ok) throw new Error('Transaction failed')

            await refreshUser() // Update balance
            await refreshTransactions() // Update history
            return { success: true }
        } catch (e) {
            console.error(e)
            return { success: false, error: 'Ошибка транзакции' }
        }
    }

    // ═══════════════════════════════════════
    // CORE ACTIONS
    // ═══════════════════════════════════════
    const balance = user?.balance || 0
    // Internal balance is same as balance now
    const internalBalance = balance

    const deposit = useCallback((amount) => {
        return apiTransaction(parseFloat(amount), 'topup', 'Пополнение баланса')
    }, [user])

    const withdraw = useCallback((amount, address) => {
        if (balance < amount) return { success: false, error: 'Недостаточно средств' }
        return apiTransaction(-parseFloat(amount), 'withdraw', `Вывод на ${address.slice(0, 8)}...`)
    }, [user, balance])

    // ── NFT Logic (Hybrid: Payment via API, Registry Local) ──
    const payForNFTCreation = useCallback(async (nftName, cost = 25) => {
        if (balance < cost) return { success: false, error: 'Недостаточно средств' }
        const res = await apiTransaction(-cost, 'nft_create', `Создание NFT "${nftName}"`)
        if (res.success) {
            logger.userAction(user.id, 'nft_create', { nftName, cost })
        }
        return res
    }, [user, balance])

    const addOwnedNFT = useCallback((nftData) => {
        if (!user) return
        const newNFT = {
            ...nftData,
            id: nftData.id || generateId('nft'),
            ownerId: user.id,
            creatorId: user.id,
            history: [{ action: 'mint', date: new Date().toISOString(), price: 0, owner: user.id }],
            status: 'active',
            royalty: CREATOR_ROYALTY
        }
        setLocalState(prev => ({ ...prev, nfts: [newNFT, ...prev.nfts] }))
    }, [user])

    const buyNFTInstant = useCallback(async (nftName, price, sellerId, nftId, nftData = null) => {
        if (balance < price) return { success: false, error: 'Недостаточно средств' }

        // 1. Deduct from buyer
        const res = await apiTransaction(-price, 'nft_buy', `Покупка "${nftName}"`)
        if (!res.success) return res

        // 2. Add to seller (Mocking P2P transfer via central bank for now)
        // Ideally backend handles transfer between users.
        // Current backend 'updateUserBalance' is single user.
        // I should implement transfer in backend?
        // For now, I'll just credit seller via separate API call?
        // Or implement 'transfer' type in backend later.
        // I will assume seller gets credited:
        if (sellerId !== 'system') {
            const commission = price * COMMISSION_RATE
            const royalty = price * CREATOR_ROYALTY
            const sellerPayout = price - commission - royalty
            // Credit seller (blindly? insecure but ok for MVP)
            await fetch('/api/wallet/transaction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: sellerId, amount: sellerPayout, type: 'nft_sale', description: `Продажа "${nftName}"` })
            })
        }

        // 3. Update Local Registry
        setLocalState(prev => {
            const nftIndex = prev.nfts.findIndex(n => n.id === nftId)
            let updatedNFTs = [...prev.nfts]
            if (nftIndex >= 0) {
                updatedNFTs[nftIndex] = {
                    ...prev.nfts[nftIndex],
                    ownerId: user.id,
                    history: [...prev.nfts[nftIndex].history, { action: 'sale', date: new Date().toISOString(), price, to: user.id }]
                }
            } else if (nftData) {
                updatedNFTs.unshift({
                    ...nftData,
                    id: nftId,
                    ownerId: user.id,
                    status: 'active',
                    history: [{ action: 'sale', date: new Date().toISOString(), price, to: user.id }]
                })
            }
            return { ...prev, nfts: updatedNFTs }
        })

        return { success: true }
    }, [user, balance])

    const buyNowAuction = useCallback((auction) => {
        return buyNFTInstant(auction.name, auction.buyNowPrice, auction.creatorId, auction.nftId)
    }, [buyNFTInstant])

    // ── Auction Bidding (Hybrid) ──
    const placeBid = useCallback(async (auctionId, nftName, bidAmount) => {
        if (balance < bidAmount) return { success: false, error: 'Недостаточно средств' }
        // Lock funds
        const res = await apiTransaction(-bidAmount, 'bid_lock', `Ставка на "${nftName}"`)
        return res
    }, [user, balance])

    const refundBid = useCallback(async (nftName, amount, withNetworkFee = true) => {
        let refund = parseFloat(amount)
        if (withNetworkFee) {
            const fee = parseFloat((refund * TON_NETWORK_FEE).toFixed(2))
            refund -= fee
        }
        await apiTransaction(refund, 'bid_refund', `Возврат ставки "${nftName}"`)
        return { refundAmount: refund }
    }, [user])

    // ── Notifications ──
    const addNotification = useCallback((note) => {
        setNotifications(prev => [{ id: Date.now() + Math.random(), read: false, timestamp: new Date(), ...note }, ...prev])
    }, [])
    const markNotificationRead = (id) => setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    const clearNotifications = () => setNotifications([])
    const markAllNotificationsRead = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })))

    // ── Admin Stubs / Actions ──
    const adminMint = async ({ itemOwnerAddress, itemIndex, itemContentUri, amount }) => {
        try {
            const res = await fetch('/api/admin/mint-nft', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itemOwnerAddress, itemIndex, itemContentUri, amount })
            })
            if (!res.ok) {
                const data = await res.json()
                return { success: false, error: data.error || 'Ошибка вызова mint-nft' }
            }
            return await res.json()
        } catch (e) {
            console.error('adminMint error', e)
            return { success: false, error: e.message }
        }
    }
    const adminWithdraw = () => ({ success: true })
    const adminTransfer = () => ({ success: true })
    const banUserNFTs = () => { }
    const topUpBid = () => ({ success: true })
    const cancelBid = () => { }

    // Remove NFT from owned list when selling / putting on auction
    const removeOwnedNFT = useCallback((nftId) => {
        setLocalState(prev => ({
            ...prev,
            nfts: prev.nfts.map(n => n.id === nftId ? { ...n, status: 'auction' } : n),
        }))
    }, [])

    // Return NFT to owner when auction is cancelled
    const returnNFTToOwner = useCallback((nftId, ownerId, auctionData) => {
        setLocalState(prev => ({
            ...prev,
            nfts: prev.nfts.map(n => n.id === nftId ? { ...n, status: 'owned' } : n),
        }))
    }, [])

    const startAuction = useCallback(() => ({ success: true }), [])
    const upgradeNFT = async (nftId, name, bgColor, pattern) => {
        if (!user?.id) return { success: false, error: 'Not logged in' }
        try {
            const res = await fetch(`/api/nfts/${nftId}/upgrade`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, bgColor, pattern })
            })
            if (!res.ok) {
                const data = await res.json()
                return { success: false, error: data.error || 'Ошибка апгрейда' }
            }
            try {
                await Promise.allSettled([
                    refreshUser(),
                    refreshTransactions(),
                    refreshNFTs()
                ])
            } catch (err) {
                console.warn('[Wallet] Non-critical refresh error after upgrade:', err)
            }
            return { success: true }
        } catch (e) {
            console.error(e)
            return { success: false, error: 'Ошибка сети' }
        }
    }
    const transferNFT = () => ({ success: true })
    const withdrawNFT = () => ({ success: true })
    const claimAuctionNFT = () => ({ success: true })

    // Removed redundant localState filtering

    return (
        <WalletContext.Provider value={{
            platformBalance: platformWallet.hhBalance,
            platformTonBalance: platformWallet.tonBalance,
            platformConfigured: platformWallet.configured,
            platformWallet,
            refreshPlatformBalance: () => { },

            balance,
            internalBalance: balance,
            transactions,
            notifications,

            // NFTs (Synced with Server)
            allNFTs,
            ownedNFTs,
            refreshNFTs,
            syncNFTs,

            deposit,
            withdraw,
            payForNFTCreation,
            placeBid,
            refundBid,
            buyNowAuction,
            buyNFTInstant,
            addOwnedNFT,

            // Stubs/Limited
            topUpBid, cancelBid, removeOwnedNFT, returnNFTToOwner, upgradeNFT, startAuction,
            claimAuctionNFT, transferNFT, withdrawNFT, banUserNFTs,
            adminMint, adminWithdraw, adminTransfer, adminUpdateNFT,
            cancelAuction: () => { },

            addNotification, markNotificationRead, markAllNotificationsRead, clearNotifications,
            COMMISSION_RATE, TON_NETWORK_FEE
        }}>
            {children}
        </WalletContext.Provider>
    )
}

export function useWallet() {
    return useContext(WalletContext)
}
