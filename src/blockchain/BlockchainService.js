// ────────────────────────────────────────────────
// BlockchainService — On-chain data queries
// ────────────────────────────────────────────────
// Fetches real balances/NFTs from TON blockchain.
// Works client-side via TonCenter or TonAPI.

import { CONFIG } from '../config'

const TON_API_BASE = CONFIG.ton?.network === 'mainnet'
    ? 'https://tonapi.io/v2'
    : 'https://testnet.tonapi.io/v2'

const TONCENTER_BASE = CONFIG.ton?.network === 'mainnet'
    ? 'https://toncenter.com/api/v2'
    : 'https://testnet.toncenter.com/api/v2'

// ── Fetch helper ──
async function tonApiFetch(path, fallbackValue = null) {
    try {
        const res = await fetch(`${TON_API_BASE}${path}`, {
            headers: { 'Accept': 'application/json' }
        })
        if (!res.ok) return fallbackValue
        return await res.json()
    } catch (err) {
        console.warn('[BlockchainService]', path, err.message)
        return fallbackValue
    }
}

// ══════════════════════════════════════════
// TON Balance
// ══════════════════════════════════════════

export async function getTonBalance(address) {
    if (!address) return 0
    const data = await tonApiFetch(`/accounts/${address}`)
    if (!data || !data.balance) return 0
    return Number(data.balance) / 1e9 // Convert nanoTON to TON
}

// ══════════════════════════════════════════
// Jetton (HH Token) Balance
// ══════════════════════════════════════════

export async function getJettonBalance(ownerAddress, jettonMasterAddress) {
    if (!ownerAddress) return 0
    const master = jettonMasterAddress || CONFIG.ton?.jettonMasterAddress
    if (!master) return 0

    const data = await tonApiFetch(`/accounts/${ownerAddress}/jettons/${master}`)
    if (!data || !data.balance) return 0

    // HH has 9 decimals by default
    const decimals = data.jetton?.decimals || 9
    return Number(data.balance) / Math.pow(10, decimals)
}

// Get ALL jettons for an address
export async function getAllJettons(ownerAddress) {
    if (!ownerAddress) return []
    const data = await tonApiFetch(`/accounts/${ownerAddress}/jettons`)
    if (!data || !data.balances) return []

    return data.balances.map(j => ({
        address: j.jetton?.address || '',
        name: j.jetton?.name || 'Unknown',
        symbol: j.jetton?.symbol || '???',
        balance: Number(j.balance) / Math.pow(10, j.jetton?.decimals || 9),
        image: j.jetton?.image || null,
        decimals: j.jetton?.decimals || 9,
        verified: j.jetton?.verification === 'whitelist',
    }))
}

// ══════════════════════════════════════════
// NFTs — HeadHunters Collection
// ══════════════════════════════════════════

export async function getOwnedNFTs(ownerAddress, collectionAddress) {
    if (!ownerAddress) return []
    const collection = collectionAddress || CONFIG.ton?.nftContractAddress

    let path = `/accounts/${ownerAddress}/nfts`
    if (collection) {
        path += `?collection=${collection}`
    }

    const data = await tonApiFetch(path)
    if (!data || !data.nft_items) return []

    return data.nft_items.map(nft => ({
        address: nft.address,
        index: nft.index,
        name: nft.metadata?.name || `NFT #${nft.index}`,
        description: nft.metadata?.description || '',
        image: nft.metadata?.image || nft.previews?.[1]?.url || null,
        collectionAddress: nft.collection?.address || null,
        collectionName: nft.collection?.name || null,
        isHeadHunters: collection ? nft.collection?.address === collection : false,
        attributes: nft.metadata?.attributes || [],
        // For Telegram gifts/fragments NFTs
        isTelegram: (nft.collection?.name || '').toLowerCase().includes('telegram') ||
            (nft.collection?.name || '').toLowerCase().includes('fragment'),
        owner: nft.owner?.address || ownerAddress,
    }))
}

// ══════════════════════════════════════════
// Telegram Gifts (Fragment NFTs)
// ══════════════════════════════════════════

export async function getTelegramNFTs(ownerAddress) {
    if (!ownerAddress) return []

    // Fetch ALL nfts and filter for telegram/fragment collections
    const data = await tonApiFetch(`/accounts/${ownerAddress}/nfts?limit=100`)
    if (!data || !data.nft_items) return []

    return data.nft_items
        .filter(nft => {
            const colName = (nft.collection?.name || '').toLowerCase()
            return colName.includes('telegram') ||
                colName.includes('fragment') ||
                colName.includes('anonymous') ||
                colName.includes('gift')
        })
        .map(nft => ({
            address: nft.address,
            index: nft.index,
            name: nft.metadata?.name || `TG NFT #${nft.index}`,
            description: nft.metadata?.description || '',
            image: nft.metadata?.image || nft.previews?.[1]?.url || null,
            collectionAddress: nft.collection?.address || null,
            collectionName: nft.collection?.name || 'Telegram',
            isTelegram: true,
            attributes: nft.metadata?.attributes || [],
        }))
}

// ══════════════════════════════════════════
// Combined Balance Summary
// ══════════════════════════════════════════

export async function getWalletSummary(address) {
    if (!address) return {
        tonBalance: 0,
        hhBalance: 0,
        jettons: [],
        nfts: [],
        telegramNfts: [],
        totalNfts: 0,
    }

    // Fetch all data in parallel
    const [tonBalance, hhBalance, jettons, nfts, telegramNfts] = await Promise.all([
        getTonBalance(address),
        getJettonBalance(address),
        getAllJettons(address),
        getOwnedNFTs(address),
        getTelegramNFTs(address),
    ])

    return {
        tonBalance,
        hhBalance,
        jettons,
        nfts,
        telegramNfts,
        totalNfts: nfts.length + telegramNfts.length,
    }
}

// ══════════════════════════════════════════
// Transaction History (recent)
// ══════════════════════════════════════════

export async function getRecentTransactions(address, limit = 20) {
    if (!address) return []

    const data = await tonApiFetch(`/accounts/${address}/events?limit=${limit}`)
    if (!data || !data.events) return []

    return data.events.map(evt => ({
        id: evt.event_id,
        timestamp: evt.timestamp * 1000,
        fee: Number(evt.fee || 0) / 1e9,
        actions: (evt.actions || []).map(a => ({
            type: a.type,
            status: a.status,
            amount: a.TonTransfer
                ? Number(a.TonTransfer.amount) / 1e9
                : a.JettonTransfer
                    ? Number(a.JettonTransfer.amount) / Math.pow(10, a.JettonTransfer.jetton?.decimals || 9)
                    : 0,
            symbol: a.TonTransfer ? 'TON' : a.JettonTransfer?.jetton?.symbol || '',
            sender: a.TonTransfer?.sender?.address || a.JettonTransfer?.sender?.address || '',
            recipient: a.TonTransfer?.recipient?.address || a.JettonTransfer?.recipient?.address || '',
            comment: a.TonTransfer?.comment || '',
            nftAddress: a.NftItemTransfer?.nft || null,
        })),
    }))
}

// ══════════════════════════════════════════
// Platform Wallet Balance (Exchange Treasury)
// ══════════════════════════════════════════

export async function getPlatformBalance() {
    const platformAddress = CONFIG.ton?.platformAddress || CONFIG.wallet?.address
    if (!platformAddress || platformAddress.includes('xxx')) {
        // Not configured yet
        return { tonBalance: 0, hhBalance: 0, configured: false }
    }

    const [tonBalance, hhBalance] = await Promise.all([
        getTonBalance(platformAddress),
        getJettonBalance(platformAddress),
    ])

    return { tonBalance, hhBalance, configured: true, address: platformAddress }
}
