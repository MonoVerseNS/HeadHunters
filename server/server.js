import Fastify from 'fastify'
import cors from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import fastifySocketIO from 'fastify-socket.io'
import { promises as fs, existsSync, mkdirSync, readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import logger from './logger.js'
import {
    getDB,
    upsertUser,
    getUserById,
    getUserByTelegramId,
    getAllUsers,
    updateUserBalance,
    getLeaderboard,
    updateWalletAddress,
    toggleBlockUser,
    deleteUserById,
    updateUserRole,
    getAdminUsers,
    addInviteCodeDB,
    removeInviteCodeDB,
    getAllInviteCodes,
    useInviteCode,
    // NFT & Auction
    getAllNFTs, assignNFTToIndex, getNFTByOnChainIndex,
    processAuctionBid, processAuctionBuyNow, processAuctionClaim, processAuctionCancel,
    getActiveAuctions
} from './db.js'
import walletService from './walletService.js'
import * as nftService from './nftService.js'
import { startBackupService } from './backupService.js'
import { generateToken, authenticateToken } from './security.js'
import { initRealtime } from './realtimeService.js'

import { setDBPath } from './db.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const fastify = Fastify({
    logger: false,
    ajv: {
        customOptions: {
            removeAdditional: true,
            useDefaults: true,
            coerceTypes: true,
        }
    }
})

// Initialize directories
const tmpWebmPath = join(__dirname, '..', 'tmp_webm')
if (!existsSync(tmpWebmPath)) {
    mkdirSync(tmpWebmPath, { recursive: true })
    logger.info(`Created temporary directory: ${tmpWebmPath}`)
}

// ── Environment Setup ──
const args = process.argv.slice(2)
const modeArg = args.find(arg => arg.startsWith('--mode='))
const MODE = modeArg ? modeArg.split('=')[1] : (process.env.MODE || 'prod')

logger.info(`Starting server in ${MODE.toUpperCase()} mode`)

const CONFIG_FILE = MODE === 'test' ? 'env.test.json' : 'env.prod.json'
const DB_FILE = MODE === 'test' ? 'headhunter_test.db' : 'headhunter.db'

// Set DB path
setDBPath(join(__dirname, 'data', DB_FILE))

// Load config
let envConfig = {}
try {
    envConfig = JSON.parse(readFileSync(join(__dirname, 'data', CONFIG_FILE), 'utf-8'))
    logger.info(`Loaded config: ${CONFIG_FILE}`)
} catch (e) {
    logger.warn(`${CONFIG_FILE} not found. Attempting fallback to env.json`)
    try {
        envConfig = JSON.parse(readFileSync(join(__dirname, 'data', 'env.json'), 'utf-8'))
    } catch (e2) {
        logger.warn('env.json not found')
    }
}

const PORT = envConfig.backend?.port || 3000

const APP_URL = envConfig.app?.url || 'https://hh.nerou.fun'
const COMMISSION_RATE = 0.3

// Plugins
await fastify.register(cors)
await fastify.register(fastifySocketIO, {
    cors: { origin: '*' }
})
await fastify.register(fastifyStatic, {
    root: join(__dirname, '..', 'dist'),
    prefix: '/',
    wildcard: false // Handle index.html via get('*')
})

// Initialize Realtime
initRealtime(fastify.io)

// ── Dynamic TonConnect Manifest ──
fastify.get('/tonconnect-manifest.json', async (request, reply) => {
    const host = request.headers.host || 'nerou.fun'
    const protocol = request.protocol || 'https'
    const baseUrl = `${protocol}://${host}`
    
    const isTestnet = host.includes('hht') || envConfig.ton?.network === 'testnet'
    
    return {
        url: baseUrl,
        name: isTestnet ? "HeadHunters Test" : "HeadHunters",
        iconUrl: `${baseUrl}/logo.png`,
        termsOfUseUrl: `${baseUrl}/terms`,
        privacyPolicyUrl: `${baseUrl}/privacy`
    }
})

// ── Auth Decorator ──
fastify.decorate('authenticate', async (request, reply) => {
    try {
        const authHeader = request.headers.authorization
        if (!authHeader) throw new Error('No token')
        const token = authHeader.split(' ')[1]
        const user = authenticateToken(token)
        if (!user) throw new Error('Invalid token')
        request.user = user
    } catch (err) {
        reply.code(401).send({ error: 'Unauthorized' })
    }
})

fastify.decorate('adminOnly', async (request, reply) => {
    if (request.user?.role !== 'admin') {
        reply.code(403).send({ error: 'Forbidden' })
    }
})

// ═══════════════════════════════════════
// SCHEMAS
// ═══════════════════════════════════════

const configSchema = {
    response: {
        200: {
            type: 'object',
            properties: {
                telegram: { type: 'object', properties: { botUsername: { type: 'string' } } },
                ton: { type: 'object', properties: { 
                    network: { type: 'string' },
                    nftCollectionAddress: { type: 'string', nullable: true },
                    jettonMasterAddress: { type: 'string', nullable: true },
                    platformWalletAddress: { type: 'string' }
                } },
                app: { type: 'object', properties: { 
                    name: { type: 'string' },
                    currency: { type: 'string' },
                    url: { type: 'string' }
                } }
            }
        }
    }
}

const bidSchema = {
    body: {
        type: 'object',
        required: ['userId', 'amount'],
        properties: {
            userId: { type: 'integer' },
            amount: { type: 'number', minimum: 0.01 }
        }
    }
}

// ═══════════════════════════════════════
// PUBLIC ROUTES
// ═══════════════════════════════════════

fastify.get('/api/config', { schema: configSchema }, async () => {
    // Reload config from memory or file if needed, but for now use loaded envConfig
    return {
        telegram: { botUsername: envConfig.telegram?.botUsername },
        ton: {
            network: envConfig.ton?.network,
            nftCollectionAddress: envConfig.ton?.nftCollectionAddress,
            jettonMasterAddress: envConfig.ton?.jettonMasterAddress,
            platformWalletAddress: envConfig.ton?.platformWalletAddress,
        },
        app: {
            name: envConfig.app?.name,
            currency: envConfig.app?.currency,
            url: APP_URL
        }
    }
})

fastify.get('/api/nft-metadata/:index', async (request, reply) => {
    const { index } = request.params
    const nft = await getNFTByOnChainIndex(index)
    if (!nft) return reply.code(404).send({ error: 'NFT not found' })

    let imageUri = nft.image || `${APP_URL}/assets/nft-placeholder.png`
    if (imageUri.startsWith('/')) imageUri = `${APP_URL}${imageUri}`

    const metadata = {
        name: nft.name || `HeadHunter #${index}`,
        description: nft.description || "HeadHunter - приватная коллекция NFT",
        image: imageUri,
        content_url: imageUri,
        attributes: [
            { trait_type: 'Serial Number', value: String(index) },
            { trait_type: 'First Name', value: nft.first_name || 'Incognito' },
            { trait_type: 'Collection', value: 'HeadHunters' }
        ]
    }
    return metadata
})

fastify.post('/api/auth/telegram', async (request, reply) => {
    const tg = request.body
    if (!tg.id) return reply.code(400).send({ error: 'Invalid data' })

    const existingUser = await getUserByTelegramId(tg.id)
    const mapped = {
        telegram_id: String(tg.id),
        username: tg.username || '',
        first_name: tg.first_name || '',
        last_name: tg.last_name || '',
        avatar: tg.photo_url || ''
    }

    const user = await upsertUser(mapped)
    if (!existingUser) {
        const inviteCode = (tg.inviteCode || tg.invite_code || '').toUpperCase()
        if (inviteCode) await useInviteCode(inviteCode, user.id)
    }

    const token = generateToken(user)
    return { ...user, token }
})

// ═══════════════════════════════════════
// PROTECTED ROUTES
// ═══════════════════════════════════════

fastify.register(async (instance) => {
    instance.addHook('preHandler', instance.authenticate)

    instance.get('/api/users', async () => await getAllUsers())
    instance.get('/api/leaderboard', async () => await getLeaderboard())
    instance.get('/api/auctions', async () => await getActiveAuctions())

    instance.get('/api/user/:id/nfts', async (request, reply) => {
        if (String(request.user.id) !== String(request.params.id) && request.user.role !== 'admin') {
            return reply.code(403).send({ error: 'Access denied' })
        }
        return await getUserNFTs(request.params.id)
    })

    instance.get('/api/user/:id/auctions', async (request, reply) => {
        if (String(request.user.id) !== String(request.params.id) && request.user.role !== 'admin') {
            return reply.code(403).send({ error: 'Access denied' })
        }
        return await getUserAuctions(request.params.id)
    })

    instance.get('/api/user/:id/transactions', async (request, reply) => {

    instance.post('/api/user/:id/wallet', async (request, reply) => {
        if (String(request.user.id) !== String(request.params.id)) return reply.code(403).send({ error: 'Access denied' })
        return await updateWalletAddress(request.params.id, request.body.address)
    })

    instance.post('/api/auctions/:id/bid', { schema: bidSchema }, async (request, reply) => {
        const { userId, amount } = request.body
        if (String(request.user.id) !== String(userId)) return reply.code(403).send({ error: 'Access denied' })
        return await processAuctionBid(request.params.id, userId, amount, COMMISSION_RATE)
    })

    instance.post('/api/auctions/:id/buy', async (request, reply) => {
        const { userId } = request.body
        if (String(request.user.id) !== String(userId)) return reply.code(403).send({ error: 'Access denied' })
        return await processAuctionBuyNow(request.params.id, userId, COMMISSION_RATE)
    })

    instance.post('/api/auctions/:id/cancel', async (request, reply) => {
        const { userId } = request.body
        if (String(request.user.id) !== String(userId)) return reply.code(403).send({ error: 'Access denied' })
        return await processAuctionCancel(request.params.id, userId)
    })

    instance.post('/api/wallet/withdraw', async (request, reply) => {
        const { userId, toAddress, amount } = request.body
        if (String(request.user.id) !== String(userId)) return reply.code(403).send({ error: 'Access denied' })
        const withdrawAmount = Number(amount)
        await updateUserBalance(userId, -withdrawAmount, 'withdraw_lock', `Вывод ${withdrawAmount} HH`)
        const transferRes = await walletService.sendJettonFromMnemonic(envConfig.ton?.platformMnemonic, toAddress, withdrawAmount, envConfig.ton?.jettonMasterAddress, 'HH Withdrawal')
        if (!transferRes.success) {
            await updateUserBalance(userId, withdrawAmount, 'withdraw_refund', 'Ошибка вывода')
            return reply.code(500).send({ error: transferRes.error })
        }
        return { success: true }
    })
})

// Serve index.html for all non-api routes
fastify.get('*', async (request, reply) => {
    if (request.url.startsWith('/api')) return reply.code(404).send({ error: 'API route not found' })
    return reply.sendFile('index.html')
})

// ═══════════════════════════════════════
// STARTUP
// ═══════════════════════════════════════

const start = async () => {
    try {
        await getDB()
        startBackupService()
        if (envConfig.ton?.platformMnemonic) {
            const wallet = await walletService.getWalletFromMnemonic(envConfig.ton.platformMnemonic)
            logger.info(`Platform wallet ready: ${wallet.address}`)
        }
        await fastify.listen({ port: PORT, host: '0.0.0.0' })
        logger.info(`[FASTIFY] Server running at http://localhost:${PORT}`)
    } catch (err) {
        logger.error(err)
        process.exit(1)
    }
}

start()
