import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
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
    getUserAuctions,
    getUserTransactions,
    getUserNFTs,
    updateWalletAddress,
    toggleBlockUser,
    deleteUserById,
    updateUserRole,
    getAdminUsers,
    addInviteCodeDB,
    removeInviteCodeDB,
    getAllInviteCodes,
    useInviteCode,
    validateInviteCode,
    // NFT & Auction
    getAllNFTs, assignNFTToIndex, getNFTByOnChainIndex,
    getActiveAuctions, getAuctionById, createAuctionDB,
    processAuctionBid, processAuctionBuyNow, processAuctionClaim, processAuctionCancel
} from './db.js'
import walletService from './walletService.js'
import * as nftService from './nftService.js'
import { startBackupService } from './backupService.js'
import { generateToken, authenticateToken, setSecurityConfig } from './security.js'
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

setSecurityConfig({
    jwtSecret: envConfig.backend?.jwtSecret,
    adminApiKey: envConfig.backend?.adminApiKey,
})

// Plugins
await fastify.register(cors, {
    origin: envConfig.backend?.corsOrigins || ['http://localhost:3310', 'http://localhost:3311'],
    credentials: true
})
await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute'
})
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

fastify.get('/api/avatar/proxy', async (request, reply) => {
    const raw = request.query?.url
    if (typeof raw !== 'string' || raw.length > 2048) {
        return reply.code(400).send({ error: 'Invalid url' })
    }

    let u
    try {
        u = new URL(raw)
    } catch {
        return reply.code(400).send({ error: 'Invalid url' })
    }

    if (u.protocol !== 'https:') {
        return reply.code(400).send({ error: 'Invalid url' })
    }

    const host = u.hostname.toLowerCase()
    const allowed = host === 't.me' || host.endsWith('.t.me') || host === 'telegram.org' || host.endsWith('.telegram.org')
    if (!allowed) {
        return reply.code(403).send({ error: 'Forbidden' })
    }

    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 8000)

    try {
        const res = await fetch(u.toString(), {
            signal: controller.signal,
            redirect: 'follow',
            headers: {
                'User-Agent': 'HeadHunters Avatar Proxy',
                'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
            }
        })

        if (!res.ok) {
            return reply.code(502).send({ error: 'Upstream error' })
        }

        const ct = res.headers.get('content-type') || 'application/octet-stream'
        const cl = res.headers.get('content-length')
        if (cl && Number(cl) > 2_000_000) {
            return reply.code(413).send({ error: 'Too large' })
        }

        reply.header('Content-Type', ct)
        reply.header('Cache-Control', 'public, max-age=86400')
        return reply.send(Buffer.from(await res.arrayBuffer()))
    } catch {
        return reply.code(502).send({ error: 'Upstream error' })
    } finally {
        clearTimeout(t)
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
    
    // Handle invite code for new users
    if (!existingUser) {
        const inviteCode = (tg.inviteCode || tg.invite_code || '').toUpperCase()
        if (inviteCode) {
            try {
                const isValid = await validateInviteCode(inviteCode)
                if (!isValid) {
                    return { ...user, token: generateToken(user), error: 'INVALID_INVITE', message: 'Неверный или использованный код' }
                }
                await useInviteCode(inviteCode, user.id)
            } catch (e) {
                return { ...user, token: generateToken(user), error: 'INVALID_INVITE', message: e.message }
            }
        } else {
            // No invite code provided - check if there are any codes in the system
            const allCodes = await getAllInviteCodes()
            if (allCodes && allCodes.length > 0) {
                // System requires invite codes but none was provided
                return { ...user, token: generateToken(user), error: 'INVITE_REQUIRED', message: 'Invite code required' }
            }
        }
    }

    const token = generateToken(user)
    return { ...user, token }
})

// ═══════════════════════════════════════
// PROTECTED ROUTES
// ═══════════════════════════════════════

fastify.register(async (instance) => {
    instance.addHook('preHandler', instance.authenticate)

    // User endpoints
    instance.get('/api/users', async () => await getAllUsers())
    instance.get('/api/user/:id', async (request, reply) => {
        if (String(request.user.id) !== String(request.params.id) && request.user.role !== 'admin') {
            return reply.code(403).send({ error: 'Access denied' })
        }
        return await getUserById(request.params.id)
    })
    instance.get('/api/user/by-telegram/:telegramId', async (request, reply) => {
        if (request.user.role !== 'admin') {
            return reply.code(403).send({ error: 'Access denied' })
        }
        return await getUserByTelegramId(request.params.telegramId)
    })
    instance.get('/api/leaderboard', async () => await getLeaderboard())
    instance.get('/api/admin/admins', { onRequest: instance.adminOnly }, async () => await getAdminUsers())
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
        if (String(request.user.id) !== String(request.params.id) && request.user.role !== 'admin') {
            return reply.code(403).send({ error: 'Access denied' })
        }
        return await getUserTransactions(request.params.id)
    })

    instance.post('/api/user/:id/wallet', async (request, reply) => {
        if (String(request.user.id) !== String(request.params.id)) return reply.code(403).send({ error: 'Access denied' })
        return await updateWalletAddress(request.params.id, request.body.address)
    })

    // Admin endpoints
    instance.post('/api/admin/user/:id/toggle-block', { onRequest: instance.adminOnly }, async (request, reply) => {
        return await toggleBlockUser(request.params.id)
    })
    instance.delete('/api/admin/user/:id', { onRequest: instance.adminOnly }, async (request, reply) => {
        await deleteUserById(request.params.id)
        return { success: true }
    })
    instance.post('/api/admin/user/:id/role', { onRequest: instance.adminOnly }, async (request, reply) => {
        const { role } = request.body
        return await updateUserRole(request.params.id, role)
    })
    instance.get('/api/admin/invite-codes', { onRequest: instance.adminOnly }, async () => {
        return await getAllInviteCodes()
    })
    instance.post('/api/admin/invite-codes', { onRequest: instance.adminOnly }, async (request) => {
        const { code, createdBy } = request.body
        return await addInviteCodeDB(code, createdBy)
    })
    instance.delete('/api/admin/invite-codes/:code', { onRequest: instance.adminOnly }, async (request, reply) => {
        await removeInviteCodeDB(request.params.code)
        return { success: true }
    })

    // Create auction endpoint
    instance.post('/api/auctions', async (request, reply) => {
        const { userId, nftId, startPrice, bidStep, buyNowPrice, auctionDuration } = request.body
        if (String(request.user.id) !== String(userId)) return reply.code(403).send({ error: 'Access denied' })

        const auctionId = `auction_${Date.now()}_${nftId}`
        const endsAt = Date.now() + auctionDuration

        // Update NFT status to "on_sale"
        const db = await getDB()
        await db.run('UPDATE nfts SET status = ? WHERE id = ?', ['on_sale', nftId])

        const auction = await createAuctionDB({
            id: auctionId,
            nftId,
            creatorId: userId,
            startPrice,
            currentBid: startPrice,
            currentBidderId: null,
            bidStep,
            buyNowPrice,
            endsAt
        })

        return auction
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

    // Wallet transaction endpoint (deposit/withdraw/internal)
    instance.post('/api/wallet/transaction', async (request, reply) => {
        const { userId, amount, type, description } = request.body
        if (String(request.user.id) !== String(userId)) return reply.code(403).send({ error: 'Access denied' })
        try {
            const updatedUser = await updateUserBalance(userId, amount, type, description)
            return { success: true, balance: updatedUser.balance }
        } catch (e) {
            return reply.code(400).send({ error: e.message })
        }
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
        await fastify.listen({ port: PORT, host: '0.0.0.0' })
        logger.info(`[FASTIFY] Server running at http://localhost:${PORT}`)
    } catch (err) {
        logger.error(err)
        process.exit(1)
    }
}

start()
