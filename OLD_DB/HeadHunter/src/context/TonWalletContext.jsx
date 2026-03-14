// ── TON Wallet Context ──
// Wraps @tonconnect/ui-react SDK — provides wallet connection, address, and real transaction sending.
import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { useTonConnectUI, useTonWallet, useTonAddress } from '@tonconnect/ui-react'
import { CONFIG } from '../config'

const TonWalletContext = createContext(null)

export function TonWalletProvider({ children }) {
    const [tonConnectUI] = useTonConnectUI()
    const wallet = useTonWallet()
    const rawAddress = useTonAddress(false) // raw address
    const friendlyAddress = useTonAddress(true) // friendly (bounced)

    const [txPending, setTxPending] = useState(false)
    const [lastTxHash, setLastTxHash] = useState(null)
    const [txHistory, setTxHistory] = useState([])

    const connected = !!wallet
    const address = friendlyAddress || ''

    // Truncate address for display: UQAB...xY3z
    const shortAddress = address
        ? `${address.slice(0, 4)}...${address.slice(-4)}`
        : ''

    // Wallet name (TonKeeper, MyTonWallet, etc.)
    const walletName = wallet?.device?.appName || 'Unknown Wallet'

    // ── Connect / Disconnect ──
    const connect = useCallback(() => {
        tonConnectUI.openModal()
    }, [tonConnectUI])

    const disconnect = useCallback(async () => {
        await tonConnectUI.disconnect()
    }, [tonConnectUI])

    // ── Send TON Transaction (Real) ──
    // amount in TON (e.g. 1.5), toAddress = destination
    const sendTon = useCallback(async (amount, toAddress, comment = '') => {
        if (!connected) {
            return { success: false, error: 'Кошелёк не подключён' }
        }

        setTxPending(true)
        setLastTxHash(null)

        try {
            // Amount in nanoTON (1 TON = 10^9 nanoTON)
            const nanoTon = BigInt(Math.floor(amount * 1e9)).toString()

            const transaction = {
                validUntil: Math.floor(Date.now() / 1000) + 600, // 10 min validity
                messages: [
                    {
                        address: toAddress,
                        amount: nanoTon,
                        ...(comment ? {
                            payload: comment // TonConnect will handle encoding
                        } : {})
                    }
                ]
            }

            const result = await tonConnectUI.sendTransaction(transaction)

            const txRecord = {
                id: 'ton_tx_' + Date.now(),
                hash: result?.boc || null,
                amount,
                toAddress,
                comment,
                timestamp: new Date().toISOString(),
                status: 'sent',
                walletName,
            }

            setLastTxHash(txRecord.hash)
            setTxHistory(prev => [txRecord, ...prev])
            setTxPending(false)

            return { success: true, hash: txRecord.hash, tx: txRecord }
        } catch (err) {
            setTxPending(false)

            // User rejected
            if (err?.message?.includes('reject') || err?.message?.includes('cancel')) {
                return { success: false, error: 'Транзакция отменена пользователем' }
            }

            return { success: false, error: err.message || 'Ошибка транзакции' }
        }
    }, [connected, tonConnectUI, walletName])

    // ── Send TON to Platform (Deposit) ──
    const sendTonDeposit = useCallback(async (amount, comment = 'HeadHunters Deposit') => {
        const platformAddress = CONFIG.ton?.platformAddress || CONFIG.wallet?.address || 'UQBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
        return sendTon(amount, platformAddress, comment)
    }, [sendTon])

    // ── Persist connection state ──
    useEffect(() => {
        if (connected && address) {
            try {
                const saved = JSON.parse(localStorage.getItem('hh_ton_wallet') || '{}')
                localStorage.setItem('hh_ton_wallet', JSON.stringify({
                    ...saved,
                    address,
                    walletName,
                    connectedAt: saved.connectedAt || new Date().toISOString(),
                    lastSeen: new Date().toISOString(),
                }))
            } catch (e) { /* ignore */ }
        }
    }, [connected, address, walletName])

    const value = {
        // Connection
        wallet,
        connected,
        address,
        shortAddress,
        walletName,
        connect,
        disconnect,

        // Transactions
        sendTon,
        sendTonDeposit,
        txPending,
        lastTxHash,
        txHistory,
    }

    return (
        <TonWalletContext.Provider value={value}>
            {children}
        </TonWalletContext.Provider>
    )
}

export function useTonWalletContext() {
    const ctx = useContext(TonWalletContext)
    if (!ctx) throw new Error('useTonWalletContext must be inside TonWalletProvider')
    return ctx
}

export default TonWalletContext
