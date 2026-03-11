// ────────────────────────────────────────────────
// Enhanced TON Wallet Context
// ────────────────────────────────────────────────
// Wraps @tonconnect/ui-react + BlockchainService.
// Safe for Telegram Mini App (TonConnect SDK skipped).

import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { useTonConnectUI, useTonWallet, useTonAddress } from '@tonconnect/ui-react'
import { CONFIG } from '../config'
import { getWalletSummary, getRecentTransactions } from './BlockchainService'
import { useAuth } from '../context/AuthContext'

const TonWalletContext = createContext(null)

// Detect if TonConnectUIProvider is active (it's skipped in Mini App)
const isMiniApp = !!window.Telegram?.WebApp?.initDataUnsafe?.user

const BALANCE_POLL_INTERVAL = 15000

// ── Inner provider that uses real TonConnect hooks ──
function TonWalletProviderWithConnect({ children }) {
    const { user, saveWalletAddress } = useAuth()
    const [tonConnectUI] = useTonConnectUI()
    const wallet = useTonWallet()
    const connectedWalletAddress = useTonAddress(true)

    // Use backend address if wallet is not connected locally (persistence across browsers)
    const backendAddress = user?.walletAddress
    const address = connectedWalletAddress || backendAddress || ''
    const connected = !!wallet
    const isReadOnly = !connected && !!backendAddress

    const shortAddress = address ? `${address.slice(0, 4)}...${address.slice(-4)}` : ''
    const walletName = wallet?.device?.appName || (isReadOnly ? 'Linked Wallet' : 'Unknown Wallet')

    const [tonBalance, setTonBalance] = useState(0)
    const [hhBalance, setHhBalance] = useState(0)
    const [jettons, setJettons] = useState([])
    const [onChainNfts, setOnChainNfts] = useState([])
    const [telegramNfts, setTelegramNfts] = useState([])
    const [balanceLoading, setBalanceLoading] = useState(false)
    const [lastRefresh, setLastRefresh] = useState(null)
    const [txPending, setTxPending] = useState(false)
    const [lastTxHash, setLastTxHash] = useState(null)
    const [txHistory, setTxHistory] = useState([])
    const [onChainTxHistory, setOnChainTxHistory] = useState([])
    const pollRef = useRef(null)

    // ── Network Check ──
    useEffect(() => {
        if (connected && wallet?.account?.chain) {
            const currentChain = wallet.account.chain // "-239" = Mainnet, "-3" = Testnet
            const isTestnetApp = CONFIG.ton.network === 'testnet'
            
            if (isTestnetApp && currentChain === '-239') {
                alert('⚠️ Внимание! Вы подключены к Mainnet, но приложение работает в Testnet.\nПожалуйста, переключите сеть в кошельке на Testnet.')
            } else if (!isTestnetApp && currentChain === '-3') {
                alert('⚠️ Внимание! Вы подключены к Testnet, но приложение работает в Mainnet.\nПожалуйста, переключите сеть в кошельке на Mainnet.')
            }
        }
    }, [connected, wallet])

    const refreshBalances = useCallback(async () => {
        if (!address) return
        setBalanceLoading(true)
        try {
            const summary = await getWalletSummary(address)
            setTonBalance(summary.tonBalance)
            setHhBalance(summary.hhBalance)
            setJettons(summary.jettons)
            setOnChainNfts(summary.nfts)
            setTelegramNfts(summary.telegramNfts)
            setLastRefresh(Date.now())
        } catch (err) {
            console.warn('[TonWallet] Balance refresh error:', err)
        }
        setBalanceLoading(false)
    }, [address])

    const refreshTransactions = useCallback(async () => {
        if (!address) return
        try {
            const txs = await getRecentTransactions(address, 20)
            setOnChainTxHistory(txs)
        } catch (err) {
            console.warn('[TonWallet] Tx history error:', err)
        }
    }, [address])

    useEffect(() => {
        if (address) {
            refreshBalances()
            refreshTransactions()
            pollRef.current = setInterval(refreshBalances, BALANCE_POLL_INTERVAL)
        } else {
            setTonBalance(0); setHhBalance(0); setJettons([])
            setOnChainNfts([]); setTelegramNfts([]); setOnChainTxHistory([])
        }
        return () => { if (pollRef.current) clearInterval(pollRef.current) }
    }, [address, refreshBalances, refreshTransactions])

    const connect = useCallback(() => tonConnectUI.openModal(), [tonConnectUI])
    const disconnect = useCallback(async () => {
        if (connected) await tonConnectUI.disconnect()
        // Note: we don't clear backendAddress here, as it is part of user profile
    }, [tonConnectUI, connected])

    const sendTon = useCallback(async (amount, toAddress, comment = '') => {
        if (!connected) {
            tonConnectUI.openModal()
            return { success: false, error: 'Пожалуйста, подключите кошелёк для подписи транзакции' }
        }
        setTxPending(true); setLastTxHash(null)
        try {
            const nanoTon = BigInt(Math.floor(amount * 1e9)).toString()
            const result = await tonConnectUI.sendTransaction({
                validUntil: Math.floor(Date.now() / 1000) + 600,
                messages: [{ address: toAddress, amount: nanoTon, ...(comment ? { payload: comment } : {}) }],
            })
            const txRecord = { id: 'ton_tx_' + Date.now(), hash: result?.boc || null, amount, toAddress, comment, timestamp: new Date().toISOString(), status: 'sent', walletName }
            setLastTxHash(txRecord.hash); setTxHistory(prev => [txRecord, ...prev]); setTxPending(false)
            setTimeout(refreshBalances, 3000)
            return { success: true, hash: txRecord.hash, tx: txRecord }
        } catch (err) {
            setTxPending(false)
            if (err?.message?.includes('reject') || err?.message?.includes('cancel')) return { success: false, error: 'Транзакция отменена' }
            return { success: false, error: err.message || 'Ошибка транзакции' }
        }
    }, [connected, tonConnectUI, walletName, refreshBalances])

    const sendTonDeposit = useCallback(async (amount, comment = 'HeadHunters Deposit') => {
        return sendTon(amount, CONFIG.ton?.platformAddress || CONFIG.wallet?.address, comment)
    }, [sendTon])

    useEffect(() => {
        if (connected && address) {
            try {
                const saved = JSON.parse(localStorage.getItem('hh_ton_wallet') || '{}')
                localStorage.setItem('hh_ton_wallet', JSON.stringify({ ...saved, address, walletName, connectedAt: saved.connectedAt || new Date().toISOString(), lastSeen: new Date().toISOString() }))
            } catch { }
            if (user?.id && saveWalletAddress) saveWalletAddress(address)
        }
    }, [connected, address, walletName, user?.id, saveWalletAddress])

    const allWalletNfts = [...onChainNfts, ...telegramNfts]
    const hhNfts = onChainNfts.filter(n => n.isHeadHunters)
    const otherNfts = onChainNfts.filter(n => !n.isHeadHunters && !n.isTelegram)

    return (
        <TonWalletContext.Provider value={{
            wallet, connected, address, shortAddress, walletName,
            connect, disconnect, tonConnectAvailable: true,
            tonBalance, hhBalance, jettons,
            onChainNfts, telegramNfts, hhNfts, otherNfts, allWalletNfts,
            balanceLoading, lastRefresh, refreshBalances,
            sendTon, sendTonDeposit, txPending, lastTxHash,
            txHistory, onChainTxHistory, refreshTransactions,
        }}>
            {children}
        </TonWalletContext.Provider>
    )
}

// ── Stub provider for Mini App (no TonConnect SDK) ──
function TonWalletProviderStub({ children }) {
    const noop = () => { }
    const noopAsync = async () => ({ success: false, error: 'Not available in Mini App' })

    return (
        <TonWalletContext.Provider value={{
            wallet: null, connected: false, address: '', shortAddress: '', walletName: '',
            connect: noop, disconnect: noop, tonConnectAvailable: false,
            tonBalance: 0, hhBalance: 0, jettons: [],
            onChainNfts: [], telegramNfts: [], hhNfts: [], otherNfts: [], allWalletNfts: [],
            balanceLoading: false, lastRefresh: null, refreshBalances: noop,
            sendTon: noopAsync, sendTonDeposit: noopAsync, txPending: false, lastTxHash: null,
            txHistory: [], onChainTxHistory: [], refreshTransactions: noop,
        }}>
            {children}
        </TonWalletContext.Provider>
    )
}

// ── Export ──
// In Mini App, TonConnect bridge crashes mobile WebView.
// Wallet functionality uses custodial wallets instead.
export function TonWalletProvider({ children }) {
    if (isMiniApp) {
        return <TonWalletProviderStub>{children}</TonWalletProviderStub>
    }
    return <TonWalletProviderWithConnect>{children}</TonWalletProviderWithConnect>
}

export function useTonWalletContext() {
    const ctx = useContext(TonWalletContext)
    if (!ctx) throw new Error('useTonWalletContext must be inside TonWalletProvider')
    return ctx
}

export default TonWalletContext
