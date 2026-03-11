import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
import { TonClient, WalletContractV5R1, internal, beginCell, Address, toNano } from '@ton/ton'
import { mnemonicToWalletKey } from '@ton/crypto'
import { getHttpEndpoint } from '@orbs-network/ton-access'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envConfigStr = fs.readFileSync(path.join(__dirname, '..', 'env.json'), 'utf-8')
const envConfig = JSON.parse(envConfigStr)

const NETWORK = envConfig.ton?.network || 'testnet'
const PLATFORM_WALLET = envConfig.ton?.platformWalletAddress || 'EQDCJRB46bxjMbpura7ejtxYgBTsKfnP1wvNf9a7kxnMbjkp'
const JETTON_MASTER = envConfig.ton?.jettonMasterAddress || 'EQCPUA3Yofw-1Bbc_2vdON5fQE8P-IAJmPzEX8v-vYxwEiBw'
const ENCRYPTION_KEY = (() => {
    const secret = envConfig.backend?.jwtSecret || 'default-dev-key-change-in-production'
    return crypto.createHash('sha256').update(secret).digest()
})()

function decryptMnemonic(encryptedText) {
    if (!encryptedText) return null
    try {
        const [ivHex, authTagHex, encrypted] = encryptedText.split(':')
        const iv = Buffer.from(ivHex, 'hex')
        const authTag = Buffer.from(authTagHex, 'hex')
        const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv)
        decipher.setAuthTag(authTag)
        let decrypted = decipher.update(encrypted, 'hex', 'utf8')
        decrypted += decipher.final('utf8')
        return decrypted
    } catch (e) {
        console.error('Decryption error:', e.message)
        return null
    }
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

async function getDB() {
    return open({
        filename: path.join(__dirname, '..', 'server', 'headhunter.db'),
        driver: sqlite3.Database
    })
}

async function executeWithRetry(fn, desc, retries = 5) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (err) {
            if (i < retries - 1) {
                console.warn(`[SWEEP] RPC error (${err.message}) calling ${desc}. Retrying... (${i + 1}/${retries})`);
                await sleep(2000 * Math.pow(2, i));
                continue;
            }
            throw err;
        }
    }
}

async function main() {
    console.log(`[SWEEP] Starting sweep to Platform Wallet: ${PLATFORM_WALLET}`)
    const endpoint = await getHttpEndpoint({ network: NETWORK })
    const client = new TonClient({ endpoint })
    const db = await getDB()

    const wallets = await db.all('SELECT user_id, address, encrypted_mnemonic FROM custodial_wallets')
    console.log(`[SWEEP] Found ${wallets.length} custodial wallets to process.`)

    for (const w of wallets) {
        console.log(`\n--- Processing User ${w.user_id} (${w.address}) ---`)
        if (w.user_id === 0) {
            console.log(`[SWEEP] Skipping Platform Wallet itself.`)
            continue
        }

        const mnemonic = decryptMnemonic(w.encrypted_mnemonic)
        if (!mnemonic) {
            console.log(`[SWEEP] Failed to decrypt mnemonic for user ${w.user_id}, skipping.`)
            continue
        }

        const keyPair = await mnemonicToWalletKey(mnemonic.split(' '))
        const wallet = WalletContractV5R1.create({ publicKey: keyPair.publicKey, workchain: 0 })
        const contract = client.open(wallet)

        // 1. Get TON balance
        let tonBalance = 0n
        try {
            tonBalance = await executeWithRetry(() => client.getBalance(wallet.address), 'getBalance')
            console.log(`[SWEEP] TON Balance: ${Number(tonBalance) / 1e9} TON`)
        } catch (e) {
            console.log(`[SWEEP] Error fetching TON balance:`, e.message)
            continue
        }

        // 2. Get Jetton (HH) balance
        let jettonBalance = 0n
        let jettonWalletAddressStr = null
        try {
            const masterAddress = Address.parse(JETTON_MASTER)
            const resultList = await executeWithRetry(() => client.runMethod(
                masterAddress,
                'get_wallet_address',
                [{ type: 'slice', cell: beginCell().storeAddress(wallet.address).endCell() }]
            ), 'get_wallet_address')
            jettonWalletAddressStr = resultList.stack.readAddress().toString()

            const jwResult = await executeWithRetry(() => client.runMethod(Address.parse(jettonWalletAddressStr), 'get_wallet_data'), 'get_wallet_data')
            jettonBalance = jwResult.stack.readBigNumber()
            console.log(`[SWEEP] HH Balance: ${Number(jettonBalance) / 1e9} HH (Wallet: ${jettonWalletAddressStr})`)

            // Record their HH balance in the users table for the new Off-Chain architecture
            const hhNum = Number(jettonBalance) / 1e9
            if (hhNum > 0) {
                await db.run('UPDATE users SET hh_balance = hh_balance + ? WHERE id = ?', [hhNum, w.user_id])
                console.log(`[SWEEP] Recorded ${hhNum} HH to user ${w.user_id} internal balance.`)
            }

        } catch (e) {
            console.log(`[SWEEP] No Jetton balance found for user ${w.user_id} or error:`, e.message)
        }

        // 3. Transfer HH tokens if any
        if (jettonBalance > 0n && jettonWalletAddressStr && tonBalance > toNano('0.04')) {
            console.log(`[SWEEP] Sending ${Number(jettonBalance) / 1e9} HH from User ${w.user_id} to Platform...`)
            try {
                await executeWithRetry(async () => {
                    const seqno = await contract.getSeqno()
                    const coreCell = beginCell()
                        .storeUint(0xf8a7ea5, 32) // OP transfer
                        .storeUint(Math.floor(Date.now() / 1000), 64) // query_id
                        .storeCoins(jettonBalance) // amount
                        .storeAddress(Address.parse(PLATFORM_WALLET)) // destination
                        .storeAddress(wallet.address) // response_destination
                        .storeBit(false) // custom_payload
                        .storeCoins(toNano('0.01')) // forward_ton_amount
                        .storeBit(false) // forward_payload
                        .endCell()

                    await contract.sendTransfer({
                        seqno,
                        secretKey: keyPair.secretKey,
                        messages: [internal({
                            to: jettonWalletAddressStr,
                            value: toNano('0.05'),
                            body: coreCell,
                            bounce: true
                        })],
                        sendMode: 1
                    })
                }, 'sendTransfer HH')
                console.log(`[SWEEP] HH Transfer sent. Waiting 20s before TON sweep...`)
                await sleep(20000)
            } catch (e) {
                console.error(`[SWEEP] Error sending HH:`, e.message)
            }
        } else if (jettonBalance > 0n) {
            console.log(`[SWEEP] User ${w.user_id} has HH but not enough TON for gas to sweep it (${Number(tonBalance) / 1e9} TON). Skipping HH sweep.`)
        }

        // 4. Transfer remaining TON
        try {
            // Re-fetch balance in case it changed
            tonBalance = await executeWithRetry(() => client.getBalance(wallet.address), 'getBalance after HH')

            // We want to leave a tiny bit or just send all using sendMode 128
            if (tonBalance > toNano('0.01')) {
                console.log(`[SWEEP] Sweeping remaining TON (${Number(tonBalance) / 1e9}) from User ${w.user_id}...`)
                await executeWithRetry(async () => {
                    const seqno = await contract.getSeqno()
                    await contract.sendTransfer({
                        seqno,
                        secretKey: keyPair.secretKey,
                        messages: [internal({
                            to: PLATFORM_WALLET,
                            value: 0n, // sendMode 128 overrides this
                            bounce: false,
                            body: 'Platform Consolidation Sweep'
                        })],
                        sendMode: 128 // Send ALL remaining balance
                    })
                }, 'sendTransfer TON', 3)
                console.log(`[SWEEP] TON Sweep sent. Wait 15s.`)
                await sleep(15000)
            } else {
                console.log(`[SWEEP] Not enough TON to warrant sweeping.`)
            }
        } catch (e) {
            console.error(`[SWEEP] Error sweeping TON:`, e.message)
        }
    }

    console.log(`[SWEEP] Finished. All user funds migrated to Platform.`)
}

main().catch(console.error)
