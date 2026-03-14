
// ────────────────────────────────────────────────
// Custodial Wallet Service (V5)
// ────────────────────────────────────────────────
// Server-side TON wallet management for each user.
// Generates HD wallets (V5R1), encrypts mnemonics, signs TXs.

import { createRequire } from 'module'
import crypto from 'crypto'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { TonClient, WalletContractV5R1, internal } from '@ton/ton'
import { mnemonicNew, mnemonicToWalletKey } from '@ton/crypto'
import { toNano, Address, beginCell, TupleBuilder } from '@ton/core'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Load config ──
let envConfig = {}
try {
    envConfig = JSON.parse(readFileSync(join(__dirname, '..', 'env.json'), 'utf-8'))
} catch (e) {
    console.warn('[Wallet] env.json not found, using defaults')
}

const NETWORK = envConfig.ton?.network || 'testnet'
const RPC_ENDPOINT = NETWORK === 'mainnet'
    ? 'https://toncenter.com/api/v2/jsonRPC'
    : 'https://testnet.toncenter.com/api/v2/jsonRPC'

// Encryption key for mnemonics — derived from jwtSecret
const ENCRYPTION_KEY = (() => {
    const secret = envConfig.backend?.jwtSecret || 'default-dev-key-change-in-production'
    return crypto.createHash('sha256').update(secret).digest()
})()

import { getHttpEndpoint } from '@orbs-network/ton-access'

// ── TonClient instance ──
let client = null
async function getClient() {
    if (client) return client
    const endpoint = await getHttpEndpoint({ network: NETWORK })
    client = new TonClient({ endpoint })
    return client
}

async function refreshClient() {
    console.log('[Wallet] Refreshing Orbs RPC endpoint...')
    const endpoint = await getHttpEndpoint({ network: NETWORK })
    client = new TonClient({ endpoint })
    return client
}

// ═══════════════════════════════════════
// ENCRYPTION
// ═══════════════════════════════════════

function encryptMnemonic(mnemonic) {
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv)
    let encrypted = cipher.update(mnemonic, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    const authTag = cipher.getAuthTag().toString('hex')
    return `${iv.toString('hex')}:${authTag}:${encrypted}`
}

function decryptMnemonic(encryptedData) {
    const [ivHex, authTagHex, encrypted] = encryptedData.split(':')
    const iv = Buffer.from(ivHex, 'hex')
    const authTag = Buffer.from(authTagHex, 'hex')
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv)
    decipher.setAuthTag(authTag)
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
}

// ═══════════════════════════════════════
// WALLET GENERATION (V5R1)
// ═══════════════════════════════════════

export async function generateWallet() {
    // Generate 24-word mnemonic
    const mnemonic = await mnemonicNew(24)
    const mnemonicStr = mnemonic.join(' ')

    // Derive keypair
    const keyPair = await mnemonicToWalletKey(mnemonic)

    // Create WalletV5R1
    const wallet = WalletContractV5R1.create({
        publicKey: keyPair.publicKey,
        workchain: 0
    })

    // Get address (bounceable=false for wallet usually, but V5 supports both)
    // For UI display usually urlSafe=true, bounceable=true, testOnly based on network
    const address = wallet.address.toString({
        urlSafe: true,
        bounceable: true,
        testOnly: NETWORK === 'testnet'
    })

    return {
        address,
        mnemonic: mnemonicStr,
        encryptedMnemonic: encryptMnemonic(mnemonicStr),
        publicKey: keyPair.publicKey.toString('hex'),
    }
}

// ═══════════════════════════════════════
// BALANCE CACHE (reduce API calls) + stale fallback
// ═══════════════════════════════════════
const _balanceCache = new Map() // key -> { value, ts }
const CACHE_TTL = 120_000 // 2 minutes — longer TTL to avoid 429

function getCached(key) {
    const entry = _balanceCache.get(key)
    if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.value
    return undefined
}

function getStaleCached(key) {
    const entry = _balanceCache.get(key)
    return entry ? entry.value : undefined
}

function setCache(key, value) {
    _balanceCache.set(key, { value, ts: Date.now() })
}

// ═══════════════════════════════════════
// TonAPI REST helpers — with throttle (1 req/sec)
// ═══════════════════════════════════════
const TONAPI_BASE = 'https://tonapi.io/v2'

let _lastTonApiCall = 0
const TONAPI_MIN_INTERVAL = 1100 // ms between requests

async function tonapiGet(path) {
    // Throttle: wait if called too soon
    const now = Date.now()
    const elapsed = now - _lastTonApiCall
    if (elapsed < TONAPI_MIN_INTERVAL) {
        await new Promise(r => setTimeout(r, TONAPI_MIN_INTERVAL - elapsed))
    }
    _lastTonApiCall = Date.now()

    const res = await fetch(`${TONAPI_BASE}${path}`, {
        headers: { 'Accept': 'application/json' }
    })
    if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`TonAPI ${res.status}: ${text}`)
    }
    return res.json()
}

// Convert any address format to raw (0:hex) for TonAPI
function toRawAddress(addressStr) {
    try {
        const addr = Address.parse(addressStr)
        return `${addr.workChain}:${addr.hash.toString('hex')}`
    } catch {
        return addressStr
    }
}

// ═══════════════════════════════════════
// GET BALANCE (via TonAPI — single HTTP call)
// ═══════════════════════════════════════

export async function getWalletBalance(addressStr) {
    const cacheKey = `ton:${addressStr}`
    const cached = getCached(cacheKey)
    if (cached !== undefined) return cached
    try {
        const addr = Address.parse(addressStr)
        const balNano = await executeWithRetry(() => client.getBalance(addr), 'getBalance')
        const bal = Number(balNano) / 1e9
        setCache(cacheKey, bal)
        return bal
    } catch (e) {
        console.warn('[Wallet] Balance fetch error:', e.message)
        const stale = getStaleCached(cacheKey)
        return stale !== undefined ? stale : 0
    }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function executeWithRetry(fn, desc, retries = 5) {
    for (let i = 0; i < retries; i++) {
        try {
            const cl = await getClient()
            return await fn(cl)
        } catch (err) {
            if (i < retries - 1) {
                const backoff = 1500 * Math.pow(2, i);
                console.warn(`[Wallet] RPC error (${err.message}) calling ${desc}. Retrying... (${i + 1}/${retries})`);
                if (err.message?.includes('502') || err.message?.includes('status code 502')) {
                    await refreshClient()
                }
                if (err.message?.includes('Too old seqno') || err.message?.includes('exit_code: -13')) {
                    // Seqno mismatch or transient method error (sometimes -13 is transient right after deploy)
                    await refreshClient()
                    await sleep(2000)
                }
                await sleep(backoff)
                continue
            }
            throw err
        }
    }
}

export async function runMethodWithRetry(address, method, stack, retries = 5) {
    return await executeWithRetry(async (cl) => {
        const res = await cl.runMethod(address, method, stack)
        const exitCode = res.exitCode ?? res.exit_code
        if (exitCode !== undefined && exitCode !== 0 && exitCode !== 1) {
            throw new Error(`Unable to execute get method. Got exit_code: ${exitCode}`)
        }
        return res
    }, `runMethod:${method}`, retries)
}

export async function getJettonBalance(ownerAddressStr, jettonMasterStr) {
    const cacheKey = `jetton:${ownerAddressStr}:${jettonMasterStr}`
    const cached = getCached(cacheKey)
    if (cached !== undefined) return cached
    try {
        const ownerAddress = Address.parse(ownerAddressStr)
        const jettonMaster = Address.parse(jettonMasterStr)

        const tb = new TupleBuilder()
        tb.writeAddress(ownerAddress)

        const res1 = await runMethodWithRetry(jettonMaster, 'get_wallet_address', tb.build())
        const jWallet = res1.stack.readAddress()

        try {
            const res2 = await runMethodWithRetry(jWallet, 'get_wallet_data', [])
            const bal = res2.stack.readBigNumber()
            const finalBal = Number(bal) / 1e9
            setCache(cacheKey, finalBal)
            return finalBal
        } catch (e) {
            // Uninitialized wallet throws error, balance is 0
            setCache(cacheKey, 0)
            return 0
        }
    } catch (e) {
        console.warn('[Wallet] Jetton balance fetch error:', e.message)
        const stale = getStaleCached(cacheKey)
        return stale !== undefined ? stale : 0
    }
}

// ═══════════════════════════════════════
// GET INCOMING TON TRANSACTIONS (via TonAPI)
// ═══════════════════════════════════════
export async function getIncomingTransactions(address, limit = 20) {
    try {
        const raw = toRawAddress(address)
        const data = await tonapiGet(`/blockchain/accounts/${encodeURIComponent(raw)}/transactions?limit=${limit}`)
        const out = []
        for (const tx of (data.transactions || [])) {
            const inMsg = tx.in_msg
            if (inMsg && inMsg.value && Number(inMsg.value) > 0 && inMsg.source?.address) {
                out.push({
                    hash: tx.hash,
                    sender: inMsg.source.address,
                    amount: Number(inMsg.value) / 1e9,
                    timestamp: tx.utime
                })
            }
        }
        return out
    } catch (e) {
        console.error('[Wallet] Get Transactions Error:', e.message)
        return []
    }
}

// ═══════════════════════════════════════
// SEND TON (V5R1)
// ═══════════════════════════════════════

export async function sendTon(encryptedMnemonic, toAddress, amountTon, comment = '') {
    try {
        // Decrypt mnemonic
        const mnemonicStr = decryptMnemonic(encryptedMnemonic)
        const mnemonic = mnemonicStr.split(' ')

        // Derive keypair
        const keyPair = await mnemonicToWalletKey(mnemonic)

        // Rebuild wallet contract
        const wallet = WalletContractV5R1.create({
            publicKey: keyPair.publicKey,
            workchain: 0
        })

        // Open contract with client
        const contract = client.open(wallet)

        // Get seqno
        const seqno = await executeWithRetry(() => contract.getSeqno(), 'getSeqno')

        // Build Transfer
        const amountNano = toNano(amountTon.toString())

        // V5 supports up to 255 messages
        await executeWithRetry(() => contract.sendTransfer({
            seqno,
            secretKey: keyPair.secretKey,
            messages: [
                internal({
                    to: toAddress,
                    value: amountNano,
                    body: comment || undefined,
                    bounce: false,
                })
            ],
            sendMode: 3 // Ignore errors + destroy account if empty (standard mode is usually 3 for full balance, but here we specify amount)
            // Actually for specific amount sendMode 3 means "pay fees separately, send exact amount". 
            // Default in @ton/ton is fine usually.
            // Wait, sendTransfer in V5 takes `messages`. sendMode is optional in some versions but let's stick to defaults or 3.
        }), 'sendTransfer')

        const fromAddress = wallet.address.toString({
            urlSafe: true,
            bounceable: true,
            testOnly: NETWORK === 'testnet'
        })

        console.log(`[Wallet] TX sent (V5): ${amountTon} TON from ${fromAddress} to ${toAddress}`)

        return {
            success: true,
            fromAddress,
            toAddress,
            amount: amountTon,
            // Hash isn't returned directly by sendTransfer usually, need to predict or just return success
            hash: null
        }
    } catch (e) {
        console.error('[Wallet] Send error:', e)
        return {
            success: false,
            error: e.message || 'Transaction failed',
        }
    }
}

// ═══════════════════════════════════════
// SEND TON (FROM RAW MNEMONIC) - Platform use
// ═══════════════════════════════════════
export async function sendTonFromMnemonic(mnemonic, toAddress, amount, message = '') {
    try {
        const keyPair = await mnemonicToWalletKey(mnemonic.split(' '))
        const wallet = WalletContractV5R1.create({
            publicKey: keyPair.publicKey,
            workchain: 0
        })
        const contract = client.open(wallet)

        const seqno = await executeWithRetry(() => contract.getSeqno(), 'getSeqno')

        try {
            await executeWithRetry(() => contract.sendTransfer({
                seqno,
                secretKey: keyPair.secretKey,
                messages: [internal({
                    to: toAddress,
                    value: toNano(amount.toString()),
                    body: message,
                    bounce: false
                })],
                sendMode: 3
            }), 'sendTransfer', 2)
        } catch (sendErr) {
            console.warn(`[Wallet] sendTransfer threw exception (API error?), but tx might be in mempool: ${sendErr.message}`)
        }

        // Poll for confirmation
        let currentSeqno = seqno
        let attempts = 0
        while (currentSeqno === seqno && attempts < 15) {
            await sleep(2000)
            try {
                currentSeqno = await contract.getSeqno()
            } catch (ignore) { }
            attempts++
        }

        if (currentSeqno === seqno) {
            return { success: false, error: 'Транзакция не подтвердилась в сети TON (таймаут 30с)' }
        }

        return { success: true, hash: 'confirmed' }
    } catch (e) {
        console.error('[Wallet] Send Error:', e)
        return { success: false, error: e.message }
    }
}

// ═══════════════════════════════════════
// SEND JETTON (FROM RAW MNEMONIC) - Platform use
// ═══════════════════════════════════════
export async function sendJettonFromMnemonic(mnemonic, toAddress, amountJetton, jettonMasterStr, message = '') {
    try {
        const keyPair = await mnemonicToWalletKey(mnemonic.split(' '))
        const wallet = WalletContractV5R1.create({
            publicKey: keyPair.publicKey,
            workchain: 0
        })
        const contract = client.open(wallet)

        const ownerAddressStr = wallet.address.toString()
        const ownerAddress = Address.parse(ownerAddressStr)
        const jettonMaster = Address.parse(jettonMasterStr)

        console.log(`[Wallet] sendJettonFromMnemonic START. Owner: ${ownerAddressStr}, Target: ${toAddress}, Amount: ${amountJetton}`)

        const tb = new TupleBuilder()
        tb.writeAddress(ownerAddress)

        console.log(`[Wallet] Fetching senderJettonWallet...`)
        const result = await runMethodWithRetry(
            jettonMaster,
            'get_wallet_address',
            tb.build()
        )
        const senderJettonWallet = result.stack.readAddress()
        console.log(`[Wallet] senderJettonWallet resolved: ${senderJettonWallet.toString()}`)

        const amountNano = toNano(amountJetton.toString())
        const coreCell = beginCell()
            .storeUint(0xf8a7ea5, 32) // OP transfer
            .storeUint(Math.floor(Date.now() / 1000), 64) // query_id
            .storeCoins(amountNano) // amount
            .storeAddress(Address.parse(toAddress)) // destination
            .storeAddress(ownerAddress) // response_destination
            .storeBit(false) // custom_payload
            .storeCoins(toNano('0.01')) // forward_ton_amount
            .storeBit(false) // forward_payload
            .endCell()

        console.log(`[Wallet] Fetching seqno...`)
        const seqno = await executeWithRetry(() => contract.getSeqno(), 'getSeqno')
        console.log(`[Wallet] seqno fetched: ${seqno}`)

        try {
            console.log(`[Wallet] Executing sendTransfer...`)
            await executeWithRetry(async (cl) => {
                const innerContract = cl.open(wallet)
                const freshSeqno = await innerContract.getSeqno()
                console.log(`[Wallet] Using fresh seqno: ${freshSeqno}`)

                return await innerContract.sendTransfer({
                    seqno: freshSeqno,
                    secretKey: keyPair.secretKey,
                    messages: [internal({
                        to: senderJettonWallet,
                        value: toNano('0.08'), // Increased to 0.08 for super-safe Jetton ops
                        body: coreCell,
                        bounce: true
                    })],
                    sendMode: 1
                })
            }, 'sendTransfer', 3)
            console.log(`[Wallet] sendTransfer complete.`)
        } catch (sendErr) {
            console.error(`[Wallet] Jetton sendTransfer ERROR: ${sendErr.message}`)
            throw sendErr // Propagate to caller
        }

        // Poll for confirmation
        console.log(`[Wallet] Polling for seqno change from ${seqno}...`)
        let currentSeqno = seqno
        let attempts = 0
        while (currentSeqno === seqno && attempts < 15) {
            await sleep(2000)
            try {
                currentSeqno = await contract.getSeqno()
            } catch (ignore) { }
            console.log(`[Wallet] Poll attempt ${attempts + 1}, seqno is: ${currentSeqno}`)
            attempts++
        }

        if (currentSeqno === seqno) {
            console.log(`[Wallet] seqno timeout!`)
            return { success: false, error: 'Транзакция не подтвердилась в блоке (таймаут 30с). Проверьте баланс TON для комиссии.' }
        }

        console.log(`[Wallet] seqno changed to ${currentSeqno}! Transaction SUCCESS.`)
        return { success: true, hash: 'confirmed' }
    } catch (e) {
        console.error('[Wallet] Jetton Send Error:', e)
        return { success: false, error: e.message }
    }
}

// ═══════════════════════════════════════
// VALIDATE ADDRESS
// ═══════════════════════════════════════

export function isValidTonAddress(address) {
    try {
        Address.parse(address)
        return true
    } catch {
        return false
    }
}

export default {
    generateWallet,
    getWalletBalance,
    getJettonBalance,
    getIncomingTransactions,
    sendTon,
    sendTonFromMnemonic,
    sendJettonFromMnemonic,
    isValidTonAddress,
    encryptMnemonic,
    decryptMnemonic,
}
