import express from 'express'
import fetch from 'node-fetch'
import cors from 'cors'
import { readFileSync, appendFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { execFile } from 'child_process'
import {
    getDB,
    upsertUser,
    getUserById,
    getUserByTelegramId,
    getAllUsers,
    updateUserBalance,
    getUserTransactions,
    getLeaderboard,
    updateWalletAddress,
    toggleBlockUser,
    deleteUserById,
    updateUserRole,
    getAdminUsers,
    addInviteCodeDB,
    removeInviteCodeDB,
    getAllInviteCodes,
    addNotificationForAll,
    getNotificationsForUser,
    markNotificationReadDB,
    markAllNotificationsReadDB,
    getUnreadCountForUser,
    getCustodialWallet,
    createCustodialWallet,
    getCustodialWalletByAddress,
    getAllCustodialWallets,
    useInviteCode,
    // NFT & Auction
    createNFT, getNFTById, getUserNFTs, getAllNFTs, assignNFTToIndex, updateNFTOwner, updateNFTStatus, updateNFTUpgrade, checkCharacterExists, updateNFTOnChainData, getNFTByOnChainIndex,
    createAuctionDB, getActiveAuctions, getAuctionById, updateAuctionBid, updateAuctionStatus,
    getUserAuctions, createBid, getAuctionBids
} from './db.js'
import walletService from './walletService.js'
import * as nftService from './nftService.js'
import { startBackupService } from './backupService.js'
import stickerService from './stickerService.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const cachedOnChainBalances = new Map() // Cache on-chain balances for rate-limit fallback
const PORT = 3000

// Initialize Backups
startBackupService()

app.use(cors())
app.set('trust proxy', true)
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ limit: '50mb', extended: true }))

// Debug endpoint to dump plugin source
import fs from 'fs'
app.post('/api/v1/dump', (req, res) => {
    try {
        fs.writeFileSync('/tmp/plugin_dump.py', req.body.content || '')
        console.log('[DEBUG] Dump received and saved to /tmp/plugin_dump.py')
        res.json({ ok: true })
    } catch (e) {
        console.error('Dump error:', e)
        res.status(500).json({ error: e.message })
    }
})

// Dev Plugin Logging & Hot Reload
app.post('/api/v1/dev/log', (req, res) => {
    const logLine = new Date().toISOString() + ' | [ANDROID PLUGIN] ' + req.body.msg + '\n';
    console.log('\x1b[36m' + logLine.trim() + '\x1b[0m');
    appendFileSync(join(__dirname, '..', 'plugin_dev.log'), logLine);
    res.json({ ok: true });
});

app.get('/api/v1/dev/plugin', (req, res) => {
    try {
        const pluginPath = join(__dirname, '..', 'extera_plugin', 'hh_gifts_plugin.plugin');
        if (fs.existsSync(pluginPath)) {
            res.type('text/plain').send(fs.readFileSync(pluginPath, 'utf8'));
        } else {
            res.status(404).send('# Plugin not found');
        }
    } catch (e) {
        res.status(500).send('# Error: ' + e.message);
    }
});

// Sticker refs cache: fresh file_references fetched via MTProto (6h TTL)
let _stickerRefsCache = null;
let _stickerRefsCacheTime = 0;
const STICKER_REFS_TTL = 6 * 60 * 60 * 1000; // 6 hours

async function fetchFreshStickerRefs() {
    return new Promise((resolve, reject) => {
        const projectRoot = join(__dirname, '..');
        const scriptPath = join(projectRoot, 'tmp_webm', 'test.cjs');
        // Use a dedicated session for the server to avoid clashes
        console.log('[sticker_refs] Running test.cjs via server_session...');
        const env = { ...process.env, GRAMJS_SESSION: 'server_session' };
        execFile('node', [scriptPath], { timeout: 60000, cwd: projectRoot, env }, (err, stdout, stderr) => {
            if (err) {
                console.error('[sticker_refs] execFile error:', err.message);
                if (stderr) console.error('[sticker_refs] stderr:', stderr.substring(0, 500));
                reject(err);
                return;
            }
            try {
                const match = stdout.match(/(\{[\s\S]+\})/);
                if (!match) { reject(new Error('No JSON in output: ' + stdout.substring(0, 300))); return; }
                const raw = JSON.parse(match[1]);
                const result = {};
                for (const [key, v] of Object.entries(raw)) {
                    result[key] = { id: v.id, access_hash: v.access_hash, file_reference: v.file_reference, size: v.size, dc_id: 2 };
                }
                resolve(result);
            } catch (e) { reject(e); }
        });
    });
}

const STICKER_REFS_FILE = join(__dirname, 'data', 'sticker_refs.cache.json');

app.get('/api/v1/sticker_refs', async (req, res) => {
    try {
        const now = Date.now();
        if (_stickerRefsCache && (now - _stickerRefsCacheTime) < STICKER_REFS_TTL) {
            return res.json({ ok: true, cached: true, refs: _stickerRefsCache });
        }

        // Try reading from file first for speed/stability
        if (!_stickerRefsCache && fs.existsSync(STICKER_REFS_FILE)) {
            try {
                const data = JSON.parse(fs.readFileSync(STICKER_REFS_FILE, 'utf8'));
                if ((now - data.time) < STICKER_REFS_TTL) {
                    _stickerRefsCache = data.refs;
                    _stickerRefsCacheTime = data.time;
                    return res.json({ ok: true, cached: true, from_file: true, refs: _stickerRefsCache });
                }
            } catch (e) { }
        }

        const refs = await fetchFreshStickerRefs();
        _stickerRefsCache = refs;
        _stickerRefsCacheTime = now;
        fs.writeFileSync(STICKER_REFS_FILE, JSON.stringify({ time: now, refs }));
        res.json({ ok: true, cached: false, refs });
    } catch (e) {
        if (_stickerRefsCache) return res.json({ ok: true, cached: true, stale: true, refs: _stickerRefsCache });
        res.status(500).json({ ok: false, error: e.message });
    }
});

// Serve static files (production build and public assets)
const publicPath = join(__dirname, '..', 'public')
const distPath = join(__dirname, '..', 'dist')
app.get('/collection_metadata.json', (req, res) => {
    try {
        const metadataPath = join(__dirname, '..', 'public', 'collection_metadata.json')
        const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'))

        // browser: accepts html, but not specifically json
        const isHtmlRequest = req.accepts('html') && !req.accepts('json');

        if (isHtmlRequest) {
            const html = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${metadata.name} - Колекция</title>
    <style>
        body { font-family: 'Inter', system-ui, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 2rem; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
        .card { background: #1e293b; border-radius: 16px; overflow: hidden; max-width: 600px; width: 100%; box-shadow: 0 10px 30px rgba(0,0,0,0.5); text-align: center; }
        .image { width: 100%; height: 300px; object-fit: cover; }
        .content { padding: 3rem; }
        .title { margin: 0 0 1.5rem; font-size: 2.5rem; font-weight: 800; background: linear-gradient(135deg, #a855f7, #3b82f6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .desc { color: #94a3b8; font-size: 1.1rem; line-height: 1.6; margin-bottom: 2rem; }
        .stats { display: flex; justify-content: space-around; background: #0f172a; padding: 1.5rem; border-radius: 12px; border: 1px solid #334155; }
        .stat-item { flex: 1; }
        .stat-label { font-size: 0.75rem; color: #64748b; text-transform: uppercase; margin-bottom: 0.5rem; }
        .stat-val { font-size: 1.2rem; font-weight: 700; color: #e2e8f0; }
    </style>
</head>
<body>
    <div class="card">
        <img src="${metadata.image}" alt="${metadata.name}" class="image">
        <div class="content">
            <h1 class="title">${metadata.name}</h1>
            <div class="stats">
                <div class="stat-item">
                    <div class="stat-label">Network</div>
                    <div class="stat-val">TON Testnet</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Type</div>
                    <div class="stat-val">NFT Collection</div>
                </div>
            </div>
        </div>
    </div>
</body>
</html>`;
            return res.send(html)
        }
        res.json(metadata)
    } catch (e) {
        res.status(500).json({ error: 'Metadata error' })
    }
})


// ── GET /item-:index.json ── Alias for older collection pointer
app.get('/item-:index.json', async (req, res) => {
    return next_get_metadata(req, res);
});

async function next_get_metadata(req, res) {
    try {
        const index = req.params.index
        const nft = await getNFTByOnChainIndex(index)
        if (!nft) return res.status(404).json({ error: 'NFT not found' })

        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Access-Control-Allow-Origin', '*')

        let imageUri = nft.image || 'https://hh.nerou.fun/192.png'
        if (imageUri.startsWith('/')) {
            imageUri = `https://hh.nerou.fun${imageUri}`
        }

        const metadata = {
            name: nft.name || `HeadHunter NFT #${index}`,
            description: nft.description || "HeadHunter - приватная коллекция NFT",
            image: imageUri,
            content_url: imageUri,
            external_url: `https://hh.nerou.fun/nft/${index}`,
            attributes: [
                { trait_type: 'Serial Number', value: String(index) },
                { trait_type: 'First Name', value: nft.first_name || nft.firstName || 'Incognito' },
                { trait_type: 'Last Name', value: nft.last_name || nft.lastName || 'Incognito' },
                { trait_type: 'Collection', value: 'HeadHunters' }
            ]
        }

        if (nft.color) {
            metadata.attributes.push({ trait_type: 'Background', value: nft.color });
        }

        // Return HTML only if format=html is passed
        if (req.query.format === 'html') {
            const attrsHtml = metadata.attributes.map(a => `
                <div style="background:#0f172a; padding:0.5rem; border-radius:8px; border:1px solid #334155;">
                    <div style="font-size:0.7rem; color:#64748b; text-transform:uppercase;">${a.trait_type}</div>
                    <div style="font-size:0.9rem; font-weight:600; color:#e2e8f0;">${a.value}</div>
                </div>
            `).join('')

            const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>${metadata.name}</title></head>
<body style="background:#0f172a; color:#f8fafc; font-family:sans-serif; display:flex; justify-content:center; align-items:center; min-height:100vh; margin:0;">
    <div style="background:#1e293b; border-radius:16px; width:100%; max-width:400px; text-align:center; overflow:hidden;">
        <img src="${metadata.image}" style="width:100%; aspect-ratio:1; object-fit:cover;">
        <div style="padding:2rem;">
            <h1 style="margin:0 0 1rem;">${metadata.name}</h1>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; text-align:left;">
                ${attrsHtml}
            </div>
        </div>
    </div>
</body>
</html>`;
            return res.send(html);
        }

        res.json(metadata)
    } catch (e) {
        console.error('[NFT Metadata] Error:', e)
        res.status(500).json({ error: 'Server error' })
    }
}

// ── GET /api/nft-metadata/:index ── Generate off-chain metadata JSON for TON
app.get('/api/nft-metadata/:index', next_get_metadata);

app.use(express.static(distPath))
app.use(express.static(publicPath))



// Load bot token from env.json
let envConfig = {}
try {
    envConfig = JSON.parse(readFileSync(join(__dirname, 'data', 'env.json'), 'utf-8'))
} catch (e) {
    console.warn('[SERVER] env.json not found')
}

// ── Random Color Helper ──
const COLORS_DATA = JSON.parse(readFileSync(join(__dirname, '..', 'src', 'data', 'colors.json'), 'utf-8'))
const FLAT_COLORS = Object.values(COLORS_DATA.colors).reduce((acc, cat) => ({ ...acc, ...cat }), {})
const COLOR_NAMES_LIST = Object.values(FLAT_COLORS)

function getRandomColorName() {
    return COLOR_NAMES_LIST[Math.floor(Math.random() * COLOR_NAMES_LIST.length)]
}
const BOT_TOKEN = envConfig.telegram?.botToken || ''
if (BOT_TOKEN) console.log('[SERVER] Bot token loaded')
else console.warn('[SERVER] No bot token in env.json — avatar fetch disabled')

// Initialize DB on start
getDB().then(() => console.log('[SERVER] DB ready')).catch(console.error)

// Initialize Sticker Service (auto-detect bot username via getMe)
if (BOT_TOKEN) {
    fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`)
        .then(r => r.json())
        .then(async data => {
            if (data.ok) {
                const botUsername = data.result.username
                // Look up the admin's real Telegram ID from the database
                const db = await getDB()
                const admin = await db.get("SELECT telegram_id FROM users WHERE role = 'admin' LIMIT 1")
                const adminTgId = admin ? parseInt(admin.telegram_id) : null
                if (adminTgId) {
                    stickerService.init(BOT_TOKEN, botUsername, adminTgId)
                    console.log(`[StickerService] Initialized: @${botUsername}, admin TG ID: ${adminTgId}`)
                } else {
                    console.warn('[StickerService] No admin user found in DB — sticker creation disabled')
                }
            }
        })
        .catch(e => console.error('[StickerService] Init failed:', e))
}

// ═══════════════════════════════════════
// TELEGRAM BOT API: fetch real avatar
// ═══════════════════════════════════════

async function fetchTelegramAvatar(telegramUserId) {
    if (!BOT_TOKEN) return null
    try {
        // Step 1: Get user profile photos
        const photosRes = await fetch(
            `https://api.telegram.org/bot${BOT_TOKEN}/getUserProfilePhotos?user_id=${telegramUserId}&limit=1`
        )
        const photosData = await photosRes.json()
        if (!photosData.ok || !photosData.result?.total_count) return null

        // Get the largest version of the first photo
        const sizes = photosData.result.photos[0]
        const biggest = sizes[sizes.length - 1] // last = biggest
        const fileId = biggest.file_id

        // Step 2: Get file path
        const fileRes = await fetch(
            `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`
        )
        const fileData = await fileRes.json()
        if (!fileData.ok || !fileData.result?.file_path) return null

        // Step 3: Construct download URL
        const avatarUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`
        console.log(`[AVATAR] Fetched for tg:${telegramUserId}`)
        return avatarUrl
    } catch (e) {
        console.error(`[AVATAR] Error fetching for tg:${telegramUserId}:`, e.message)
        return null
    }
}

// ── GET /:index ── Fallback for wallets that ignore common_content ref
app.get('/:index', async (req, res, next) => {
    const indexStr = req.params.index;
    if (/^\d+$/.test(indexStr)) {
        // It's a numeric index, redirect or serve metadata
        return res.redirect(`/api/nft-metadata/${indexStr}`);
    }
    // Fallback to static files or next()
    next();
});

// ═══════════════════════════════════════
// AUTH
// ═══════════════════════════════════════

app.post('/api/auth/telegram', async (req, res) => {
    try {
        const tg = req.body
        if (!tg || !tg.id) {
            return res.status(400).json({ error: 'Invalid Telegram data' })
        }

        // Check if this is an existing user
        const existingUser = await getUserByTelegramId(String(tg.id))

        // NEW users require invite code
        if (!existingUser) {
            const inviteCode = tg.inviteCode || tg.invite_code
            if (!inviteCode) {
                return res.status(403).json({ error: 'INVITE_REQUIRED', message: 'Требуется код приглашения' })
            }
            const isValid = await validateInviteCode(inviteCode.toUpperCase())
            if (!isValid) {
                return res.status(403).json({ error: 'INVALID_INVITE', message: 'Неверный или использованный код' })
            }
        }

        // Try Bot API first, fall back to widget photo_url
        const botAvatar = await fetchTelegramAvatar(String(tg.id))
        const widgetAvatar = tg.photo_url || tg.photoUrl || ''
        const avatar = botAvatar || widgetAvatar

        const mapped = {
            telegram_id: String(tg.id),
            username: tg.username || `user_${tg.id}`,
            first_name: tg.first_name || tg.firstName || 'User',
            last_name: tg.last_name || tg.lastName || '',
            avatar: avatar
        }

        const user = await upsertUser(mapped)
        console.log(`[AUTH] Login: @${mapped.username} (tg:${mapped.telegram_id}) avatar:${botAvatar ? 'bot-api' : widgetAvatar ? 'widget' : 'none'}`)

        // Mark invite code as used for new users
        if (!existingUser) {
            const inviteCode = (tg.inviteCode || tg.invite_code || '').toUpperCase()
            if (inviteCode) {
                await useInviteCode(inviteCode, user.id)
                console.log(`[AUTH] Invite code ${inviteCode} used by @${mapped.username}`)
            }
        }

        // Auto-create custodial wallet logic removed (Off-chain ownership model)
        /*
        try {
            let wallet = await getCustodialWallet(user.id)
            if (!wallet) {
                const newWallet = await walletService.generateWallet()
                wallet = await createCustodialWallet(user.id, newWallet.address, newWallet.encryptedMnemonic, newWallet.publicKey)
                console.log(`[WALLET] Auto-created for @${mapped.username}: ${newWallet.address}`)
            }
            user.custodialWallet = wallet.address
        } catch (walletErr) {
            console.error('[WALLET] Wallet creation error during auth:', walletErr.message)
        }
        */

        res.json(user)
    } catch (error) {
        console.error('[AUTH] Error:', error)
        res.status(500).json({ error: 'Auth failed' })
    }
})

// Check if user exists (before asking for invite code)
app.post('/api/auth/check-user', async (req, res) => {
    try {
        const { telegram_id } = req.body
        if (!telegram_id) return res.status(400).json({ error: 'Missing telegram_id' })
        const user = await getUserByTelegramId(String(telegram_id))
        res.json({ exists: !!user })
    } catch (e) {
        res.status(500).json({ error: 'Check failed' })
    }
})

// Validate invite code
app.post('/api/auth/validate-invite', async (req, res) => {
    try {
        const { code } = req.body
        if (!code) return res.status(400).json({ valid: false })
        const valid = await validateInviteCode(code.toUpperCase())
        res.json({ valid })
    } catch (e) {
        res.status(500).json({ valid: false })
    }
})

// ═══════════════════════════════════════
// AVATAR PROXY (bypass browser CORS)
// ═══════════════════════════════════════

// Proxy: fetch avatar image server-side and stream it to client
app.get('/api/avatar/proxy', async (req, res) => {
    const url = req.query.url
    if (!url || !url.startsWith('http')) {
        return res.status(400).send('Missing url param')
    }
    try {
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        })
        if (!response.ok || response.headers.get('content-length') === '42') {
            // 42 bytes = 1x1 GIF placeholder from Telegram
            return res.status(404).send('No avatar')
        }
        res.set('Content-Type', response.headers.get('content-type') || 'image/jpeg')
        res.set('Cache-Control', 'public, max-age=3600')
        const buffer = Buffer.from(await response.arrayBuffer())
        res.send(buffer)
    } catch (e) {
        res.status(502).send('Fetch failed')
    }
})

// Refresh a single user's avatar via Bot API
app.post('/api/avatar/refresh/:telegramId', async (req, res) => {
    try {
        const tgId = req.params.telegramId
        const avatar = await fetchTelegramAvatar(tgId)
        if (avatar) {
            const db = await getDB()
            await db.run('UPDATE users SET avatar = ? WHERE telegram_id = ?', avatar, tgId)
            res.json({ success: true, avatar })
        } else {
            res.json({ success: false, message: 'No photos available (user may need to /start the bot)' })
        }
    } catch (e) {
        res.status(500).json({ error: e.message })
    }
})

// ═══════════════════════════════════════
// USER
// ═══════════════════════════════════════

// All users (for admin panel & leaderboard)
app.get('/api/users', async (req, res) => {
    try {
        const users = await getAllUsers()

        let envConfig = {}
        res.json(users)
    } catch (error) {
        console.error('[API] /api/users error:', error)
        res.status(500).json({ error: 'DB Error' })
    }
})

app.get('/api/user/:id', async (req, res) => {
    try {
        const user = await getUserById(req.params.id)
        if (!user) return res.status(404).json({ error: 'User not found' })

        res.json(user)
    } catch (error) {
        res.status(500).json({ error: 'DB Error' })
    }
})

app.get('/api/user/by-telegram/:telegramId', async (req, res) => {
    try {
        const user = await getUserByTelegramId(req.params.telegramId)
        if (!user) return res.status(404).json({ error: 'User not found' })
        res.json(user)
    } catch (error) {
        res.status(500).json({ error: 'DB Error' })
    }
})

// Save wallet address to user account
app.post('/api/user/:id/wallet', async (req, res) => {
    try {
        const { address } = req.body
        if (!address) return res.status(400).json({ error: 'Missing address' })
        const user = await updateWalletAddress(req.params.id, address)
        if (!user) return res.status(404).json({ error: 'User not found' })
        res.json(user)
    } catch (error) {
        console.error('[WALLET] Error:', error)
        res.status(500).json({ error: 'DB Error' })
    }
})

// Refresh avatar for a specific user or all users
app.post('/api/admin/refresh-avatars', async (req, res) => {
    try {
        const users = await getAllUsers()
        let updated = 0
        for (const u of users) {
            const avatar = await fetchTelegramAvatar(u.telegram_id)
            if (avatar) {
                const db = await getDB()
                await db.run('UPDATE users SET avatar = ? WHERE id = ?', avatar, u.id)
                updated++
            }
        }
        console.log(`[ADMIN] Refreshed avatars: ${updated}/${users.length}`)
        res.json({ success: true, updated, total: users.length })
    } catch (error) {
        console.error('[ADMIN] Avatar refresh error:', error)
        res.status(500).json({ error: error.message })
    }
})

// ═══════════════════════════════════════
// ADMIN: USER MANAGEMENT
// ═══════════════════════════════════════

// Block / unblock user
app.post('/api/admin/user/:id/toggle-block', async (req, res) => {
    try {
        const user = await toggleBlockUser(req.params.id)
        console.log(`[ADMIN] User ${user.username} block toggled: is_blocked=${user.is_blocked}`)
        res.json(user)
    } catch (error) {
        console.error('[ADMIN] Block error:', error)
        res.status(500).json({ error: error.message })
    }
})

// Delete user
app.delete('/api/admin/user/:id', async (req, res) => {
    try {
        const result = await deleteUserById(req.params.id)
        console.log(`[ADMIN] User ${req.params.id} deleted`)
        res.json(result)
    } catch (error) {
        console.error('[ADMIN] Delete error:', error)
        res.status(500).json({ error: error.message })
    }
})

// Change user role
app.post('/api/admin/user/:id/role', async (req, res) => {
    try {
        const { role } = req.body
        if (!role) return res.status(400).json({ error: 'Missing role' })
        const user = await updateUserRole(req.params.id, role)
        console.log(`[ADMIN] User ${req.params.id} role changed to ${role}`)
        res.json(user)
    } catch (error) {
        console.error('[ADMIN] Role error:', error)
        res.status(500).json({ error: error.message })
    }
})

// Get all admins
app.get('/api/admin/admins', async (req, res) => {
    try {
        const admins = await getAdminUsers()
        res.json(admins)
    } catch (error) {
        res.status(500).json({ error: 'DB Error' })
    }
})

// ═══════════════════════════════════════
// INVITE CODES
// ═══════════════════════════════════════

app.get('/api/admin/invite-codes', async (req, res) => {
    try {
        const codes = await getAllInviteCodes()
        res.json(codes)
    } catch (error) {
        res.status(500).json({ error: 'DB Error' })
    }
})

app.post('/api/admin/invite-codes', async (req, res) => {
    try {
        const { code, createdBy } = req.body
        if (!code) return res.status(400).json({ error: 'Missing code' })
        const result = await addInviteCodeDB(code, createdBy)
        console.log(`[ADMIN] Invite code created: ${code}`)
        res.json(result)
    } catch (error) {
        if (error.message?.includes('UNIQUE')) {
            return res.status(409).json({ error: 'Код уже существует' })
        }
        console.error('[ADMIN] Invite code error:', error)
        res.status(500).json({ error: 'DB Error' })
    }
})

app.delete('/api/admin/invite-codes/:code', async (req, res) => {
    try {
        const result = await removeInviteCodeDB(req.params.code)
        console.log(`[ADMIN] Invite code removed: ${req.params.code}`)
        res.json(result)
    } catch (error) {
        res.status(500).json({ error: 'DB Error' })
    }
})

// ═══════════════════════════════════════
// TRANSACTIONS
// ═══════════════════════════════════════

app.post('/api/wallet/transaction', async (req, res) => {
    try {
        const { userId, amount, type, description } = req.body
        if (!userId || amount === undefined || !type) {
            return res.status(400).json({ error: 'Missing params' })
        }
        const updatedUser = await updateUserBalance(userId, amount, type, description || '')
        res.json(updatedUser)
    } catch (error) {
        console.error('[TX] Error:', error)
        res.status(500).json({ error: 'Transaction Error' })
    }
})

app.get('/api/user/:id/transactions', async (req, res) => {
    try {
        const txs = await getUserTransactions(req.params.id)
        res.json(txs)
    } catch (error) {
        res.status(500).json({ error: 'DB Error' })
    }
})

app.post('/api/wallet/topup', async (req, res) => {
    try {
        const { userId, amount } = req.body
        const updated = await updateUserBalance(userId, amount, 'topup', 'Deposit')
        res.json(updated)
    } catch (error) {
        res.status(500).json({ error: 'Transaction Error' })
    }
})

// ═══════════════════════════════════════
// NFT MINTING
// ═══════════════════════════════════════

app.post('/api/admin/mint-nft', async (req, res) => {
    try {
        const { itemOwnerAddress, itemIndex, itemContentUri, amount } = req.body
        if (itemOwnerAddress === undefined || itemIndex === undefined || !itemContentUri) {
            return res.status(400).json({ error: 'Missing required parameters' })
        }

        const result = await nftService.mintNft({
            itemOwnerAddress,
            itemIndex: parseInt(itemIndex, 10),
            itemContentUri,
            amount: amount || '0.05'
        })

        if (result.success) {
            res.json({ success: true, itemIndex: result.itemIndex })
        } else {
            res.status(500).json({ error: result.error })
        }
    } catch (error) {
        console.error('[NFT] Error:', error)
        res.status(500).json({ error: 'Minting Error', details: error.message })
    }
})

// ── GET /api/admin/nfts ── List all NFTs with on-chain verification
app.get('/api/admin/nfts', async (req, res) => {
    try {
        const dbNFTs = await getAllNFTs()
        const onChainNFTs = await nftService.getCollectionState()
        const platformWalletStr = envConfig.ton?.platformWalletAddress
        const platformWallet = platformWalletStr ? nftService.normalizeAddress(platformWalletStr) : null;

        const users = await getAllUsers()
        const usersById = {}
        const usersByWallet = {}
        users.forEach(u => {
            usersById[u.id] = u
            if (u.wallet_address) {
                const normWallet = nftService.normalizeAddress(u.wallet_address);
                if (normWallet) usersByWallet[normWallet] = u
            }
        })

        // 1. Create lookup for on-chain NFTs
        const onChainMap = {}
        onChainNFTs.forEach(oc => { onChainMap[oc.index] = oc })

        // 2. Process DB NFTs
        const processedIndices = new Set()
        const merged = dbNFTs.map(dbMatch => {
            const onChain = onChainMap[dbMatch.on_chain_index]
            processedIndices.add(dbMatch.on_chain_index)

            const normalizedOnChainOwner = onChain ? nftService.normalizeAddress(onChain.owner) : null;
            const isPlatformOwned = normalizedOnChainOwner && platformWallet ? normalizedOnChainOwner === platformWallet : false
            const actualOwnerUser = normalizedOnChainOwner ? usersByWallet[normalizedOnChainOwner] : null

            return {
                on_chain_index: dbMatch.on_chain_index,
                address: onChain?.address || null,
                onChainOwner: onChain?.owner || null,
                onChainOwnerUser: actualOwnerUser ? {
                    id: actualOwnerUser.id,
                    username: actualOwnerUser.username,
                    firstName: actualOwnerUser.first_name
                } : null,
                isPlatformOwned,
                dbNFT: {
                    id: dbMatch.id,
                    name: dbMatch.name,
                    image: dbMatch.image,
                    ownerId: dbMatch.owner_id,
                    ownerUsername: usersById[dbMatch.owner_id]?.username || 'unknown',
                    status: dbMatch.status,
                    first_name: dbMatch.first_name,
                    last_name: dbMatch.last_name,
                    color: dbMatch.color,
                    collectionName: dbMatch.collection_name
                },
                // Flatten for UI components like GiftDetailModal
                id: dbMatch.id,
                name: dbMatch.name,
                image: dbMatch.image,
                ownerId: dbMatch.owner_id,
                status: onChain ? (isPlatformOwned ? 'verified' : 'externally_owned') : 'db_only',
                first_name: dbMatch.first_name,
                last_name: dbMatch.last_name,
                color: dbMatch.color,
                collectionName: dbMatch.collection_name
            }
        })

        // 3. Add remaining on-chain NFTs (minted but not in DB)
        onChainNFTs.forEach(onChain => {
            if (processedIndices.has(onChain.index)) return

            const normalizedOnChainOwner = normalizeAddress(onChain.owner);
            const isPlatformOwned = normalizedOnChainOwner && platformWallet ? normalizedOnChainOwner === platformWallet : false
            const actualOwnerUser = normalizedOnChainOwner ? usersByWallet[normalizedOnChainOwner] : null

            merged.push({
                on_chain_index: onChain.index,
                address: onChain.address,
                onChainOwner: onChain.owner,
                onChainOwnerUser: actualOwnerUser ? {
                    id: actualOwnerUser.id,
                    username: actualOwnerUser.username,
                    firstName: actualOwnerUser.first_name
                } : null,
                isPlatformOwned,
                dbNFT: null,
                status: isPlatformOwned ? 'unassigned' : 'externally_owned'
            })
        })

        // Sort by index descending (newest first)
        merged.sort((a, b) => (b.on_chain_index || 0) - (a.on_chain_index || 0))

        res.json(merged)
    } catch (error) {
        console.error('[Admin] Fetch NFTs Error:', error)
        res.status(500).json({ error: 'Failed to fetch NFTs' })
    }
})

// ── POST /api/admin/nfts/:index/assign ── Assign on-chain NFT to user
app.post('/api/admin/nfts/:index/assign', async (req, res) => {
    try {
        const { index } = req.params
        const { userId, status } = req.body
        const collectionAddress = envConfig.ton?.nftCollectionAddress

        await assignNFTToIndex(parseInt(index, 10), userId, collectionAddress, status)
        res.json({ success: true })
    } catch (error) {
        console.error('[Admin] Assign NFT Error:', error)
        res.status(500).json({ error: 'Failed to assign NFT' })
    }
})

// ── POST /api/admin/update-collection-content ── Update collection metadata + common_content prefix
app.post('/api/admin/update-collection-content', async (req, res) => {
    try {
        const {
            collectionMetadataUrl = 'https://hh.nerou.fun/collection_metadata.json',
            commonContentBaseUrl = 'https://hh.nerou.fun/api/nft-metadata/'
        } = req.body || {}

        console.log(`[NFT] Updating collection content. Metadata: ${collectionMetadataUrl}, Base: ${commonContentBaseUrl}`)

        const result = await nftService.changeCollectionContent({
            collectionMetadataUrl,
            commonContentBaseUrl,
            gasAmount: '0.05' // Increased gas for collection content updates
        })

        if (result.success) {
            res.json({ success: true, message: 'Collection content update transaction sent' })
        } else {
            res.status(500).json({ error: result.error })
        }
    } catch (error) {
        console.error('[NFT] Update collection content error:', error)
        res.status(500).json({ error: error.message })
    }
})

// ═══════════════════════════════════════
// PUBLIC API (v1)
// ═══════════════════════════════════════

app.get('/api/v1/user/:id', async (req, res) => {
    try {
        const id = req.params.id
        let targetUser = await getUserById(id)
        if (!targetUser) targetUser = await getUserByTelegramId(id)

        if (!targetUser) {
            return res.status(404).json({ ok: false, error: 'User not found' })
        }

        // В идеале здесь нужно доставать список NFT из БД, 
        // но пока они хранятся в localStorage на клиенте (Phase 1).
        // Возвращаем пустой массив для совместимости с форматом.

        // Fetch user's NFTs from DB
        const userNfts = await getUserNFTs(targetUser.id)
        const gifts = userNfts.map(nft => {
            const mtprotoDoc = (nft.sticker_unique_id && _stickerRefsCache) ? _stickerRefsCache[nft.sticker_unique_id] : null;
            return {
                id: nft.id,
                name: nft.name,
                firstName: nft.first_name,
                lastName: nft.last_name,
                image: nft.image,
                emoji: nft.emoji || '🎁',
                color: nft.color || null,
                isGif: !!nft.is_gif,
                stickerFileId: nft.sticker_file_id || null,
                stickerUniqueId: nft.sticker_unique_id || null,
                stickerMtprotoId: mtprotoDoc ? mtprotoDoc.id : null,
                stickerAccessHash: mtprotoDoc ? mtprotoDoc.access_hash : null,
                stickerFileReference: mtprotoDoc ? mtprotoDoc.file_reference : null,
                onChainIndex: nft.on_chain_index,
                collectionName: nft.collection_name,
                availabilityTotal: 1,
                availabilityIssued: 1,
                createdAt: nft.created_at
            }
        })

        res.json({
            ok: true,
            user: {
                id: targetUser.id,
                username: targetUser.username,
                firstName: targetUser.first_name,
                avatar: targetUser.avatar,
                status: targetUser.is_blocked ? 'blocked' : 'active',
                role: targetUser.role,
                registeredAt: targetUser.created_at,
            },
            gifts,
            giftsCount: gifts.length,
            isBanned: !!targetUser.is_blocked
        })
    } catch (error) {
        console.error('[API] Public User Fetch error:', error)
        res.status(500).json({ ok: false, error: 'Server error' })
    }
})

// ═══════════════════════════════════════
// STICKER MANAGEMENT
// ═══════════════════════════════════════

// Admin: Backfill stickers for all NFTs missing them
app.post('/api/admin/stickers/backfill', async (req, res) => {
    try {
        const allNfts = await getAllNFTs()
        const result = await stickerService.backfillStickers(allNfts)
        res.json({ ok: true, ...result })
    } catch (e) {
        console.error('[Sticker] Backfill error:', e)
        res.status(500).json({ error: e.message })
    }
})

// Create sticker for a single NFT by ID
app.post('/api/admin/stickers/:nftId', async (req, res) => {
    try {
        const nft = await getNFTById(req.params.nftId)
        if (!nft) return res.status(404).json({ error: 'NFT not found' })
        const result = await stickerService.createStickerForNFT(nft)
        if (result) {
            res.json({ ok: true, fileId: result.fileId, uniqueId: result.uniqueId })
        } else {
            res.status(500).json({ error: 'Sticker creation failed' })
        }
    } catch (e) {
        console.error('[Sticker] Create error:', e)
        res.status(500).json({ error: e.message })
    }
})

// ═══════════════════════════════════════
// USERS DASHBOARD
// ═══════════════════════════════════════

app.get('/api/leaderboard', async (req, res) => {
    try {
        const users = await getLeaderboard()
        res.json(users)
    } catch (error) {
        res.status(500).json({ error: 'DB Error' })
    }
})

// ═══════════════════════════════════════
// BROADCAST / NOTIFICATIONS
// ═══════════════════════════════════════

// Send Telegram message to a single user
async function sendTelegramMessage(chatId, text) {
    if (!BOT_TOKEN) return { ok: false, error: 'No bot token' }
    try {
        const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: text,
                parse_mode: 'HTML'
            })
        })
        return await res.json()
    } catch (e) {
        return { ok: false, error: e.message }
    }
}

// Broadcast to all users (Telegram + in-app notifications)
app.post('/api/admin/broadcast', async (req, res) => {
    try {
        const { message } = req.body
        if (!message?.trim()) return res.status(400).json({ error: 'Пустое сообщение' })

        // Store in-app notification for all active users
        const notifCount = await addNotificationForAll(message.trim(), 'broadcast')
        console.log(`[BROADCAST] In-app notifications created: ${notifCount}`)

        // Send via Telegram Bot
        const users = await getAllUsers()
        const activeUsers = users.filter(u => !u.is_blocked)

        let sent = 0
        let failed = 0
        const errors = []

        for (const u of activeUsers) {
            const result = await sendTelegramMessage(u.telegram_id, message.trim())
            if (result.ok) {
                sent++
            } else {
                failed++
                if (errors.length < 5) errors.push(`${u.username}: ${result.description || result.error || 'unknown'}`)
            }
        }

        console.log(`[BROADCAST] Telegram sent: ${sent}, Failed: ${failed}`)
        res.json({ success: true, sent, failed, total: activeUsers.length, inApp: notifCount, errors })
    } catch (error) {
        console.error('[BROADCAST] Error:', error)
        res.status(500).json({ error: error.message })
    }
})

// Send notification to a single user (Telegram)
app.post('/api/admin/notify/:telegramId', async (req, res) => {
    try {
        const { message } = req.body
        if (!message?.trim()) return res.status(400).json({ error: 'Пустое сообщение' })
        const result = await sendTelegramMessage(req.params.telegramId, message.trim())
        res.json(result)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

// ═══════════════════════════════════════
// USER NOTIFICATIONS (in-app)
// ═══════════════════════════════════════

// Get notifications for a user
app.get('/api/notifications/:userId', async (req, res) => {
    try {
        const notifs = await getNotificationsForUser(req.params.userId)
        res.json(notifs)
    } catch (error) {
        res.status(500).json({ error: 'DB Error' })
    }
})

// Get unread count
app.get('/api/notifications/:userId/unread-count', async (req, res) => {
    try {
        const count = await getUnreadCountForUser(req.params.userId)
        res.json({ count })
    } catch (error) {
        res.status(500).json({ error: 'DB Error' })
    }
})

// Mark one notification as read
app.post('/api/notifications/:id/read', async (req, res) => {
    try {
        await markNotificationReadDB(req.params.id)
        res.json({ success: true })
    } catch (error) {
        res.status(500).json({ error: 'DB Error' })
    }
})

// Mark all as read for a user
app.post('/api/notifications/:userId/read-all', async (req, res) => {
    try {
        await markAllNotificationsReadDB(req.params.userId)
        res.json({ success: true })
    } catch (error) {
        res.status(500).json({ error: 'DB Error' })
    }
})

// ═══════════════════════════════════════
// START + AVATAR CRON
// ═══════════════════════════════════════

// Auto-refresh avatars via Bot API every 12 hours
const AVATAR_REFRESH_MS = 12 * 60 * 60 * 1000 // 12 hours

async function refreshAllAvatars() {
    if (!BOT_TOKEN) return
    try {
        const users = await getAllUsers()
        let updated = 0
        for (const u of users) {
            const avatar = await fetchTelegramAvatar(u.telegram_id)
            if (avatar) {
                const db = await getDB()
                await db.run('UPDATE users SET avatar = ? WHERE id = ?', avatar, u.id)
                updated++
            }
        }
        if (updated > 0) console.log(`[AVATAR CRON] Updated ${updated}/${users.length} avatars`)
    } catch (e) {
        console.error('[AVATAR CRON] Error:', e.message)
    }
}

// ═══════════════════════════════════════
// CUSTODIAL WALLETS
// ═══════════════════════════════════════

// Get or create custodial wallet for user
// Custodial wallet endpoints disabled (Off-chain hub model)
app.get('/api/user/:id/custodial-wallet', async (req, res) => {
    res.status(404).json({ error: 'Custodial wallets are disabled in this version.' })
})

// Withdraw from custodial wallet
// User withdrawal from custodial disabled
app.post('/api/user/:id/withdraw', async (req, res) => {
    res.status(501).json({ error: 'Withdrawals are currently disabled for manual transition.' })
})

// Platform Withdrawal Endpoint
app.post('/api/platform-wallet/withdraw', async (req, res) => {
    try {
        const { type, amount, toAddress, comment } = req.body

        if (!type || !amount || !toAddress) return res.status(400).json({ error: 'Missing parameters' })

        if (type === 'ton') {
            let envConfig = {}
            try {
                envConfig = JSON.parse(readFileSync(join(__dirname, 'data', 'env.json'), 'utf-8'))
            } catch (e) { }

            const mnemonic = envConfig.ton?.platformMnemonic
            if (!mnemonic) return res.status(500).json({ error: 'Platform mnemonic not configured' })

            const result = await walletService.sendTonFromMnemonic(
                mnemonic,
                toAddress,
                amount,
                comment || 'Platform Withdraw'
            )

            if (result.success) {
                console.log(`[PLATFORM] Withdrew ${amount} TON to ${toAddress}`)
                res.json({ success: true, txHash: result.hash })
            } else {
                res.status(500).json({ error: result.error })
            }
        }
        else if (type === 'hh') {
            let envConfig = {}
            try {
                envConfig = JSON.parse(readFileSync(join(__dirname, 'data', 'env.json'), 'utf-8'))
            } catch (e) { }

            const mnemonic = envConfig.ton?.platformMnemonic
            const jMaster = envConfig.ton?.jettonMasterAddress
            if (!mnemonic || !jMaster) return res.status(500).json({ error: 'Platform mnemonic or jetton master not configured' })

            const result = await walletService.sendJettonFromMnemonic(
                mnemonic,
                toAddress,
                amount,
                jMaster,
                comment || 'Platform Withdraw HH'
            )

            if (result.success) {
                console.log(`[PLATFORM] Withdrew ${amount} HH ON-CHAIN to ${toAddress}`)
                res.json({ success: true, txHash: result.hash, message: 'Platform HH withdrawal successful' })
            } else {
                res.status(500).json({ error: result.error })
            }
        }
        else {
            res.status(400).json({ error: 'Invalid type' })
        }

    } catch (error) {
        console.error('[PLATFORM] Withdraw error:', error)
        res.status(500).json({ error: 'Platform withdrawal failed' })
    }
})

// Platform Transfer to User Endpoint
app.post('/api/platform-wallet/transfer', async (req, res) => {
    try {
        const { userId, type, amount, comment } = req.body

        if (!userId || !type || !amount) return res.status(400).json({ error: 'Missing parameters' })
        if (type === 'hh' && amount < 50) return res.status(400).json({ error: 'Минимальная сумма перевода: 50 HH' })

        const userCode = await getUserById(userId) // Verify user exists
        if (!userCode) return res.status(404).json({ error: 'User not found' })

        if (type === 'ton') {
            // Send TON to User's Custodial Wallet
            const custodial = await getCustodialWallet(userId)
            if (!custodial) return res.status(404).json({ error: 'User custodial wallet not found' })

            let envConfig = {}
            try {
                envConfig = JSON.parse(readFileSync(join(__dirname, 'data', 'env.json'), 'utf-8'))
            } catch (e) { }

            const mnemonic = envConfig.ton?.platformMnemonic
            if (!mnemonic) return res.status(500).json({ error: 'Platform mnemonic not configured' })

            const result = await walletService.sendTonFromMnemonic(
                mnemonic,
                custodial.address,
                amount,
                comment || 'Admin Transfer'
            )

            if (result.success) {
                console.log(`[PLATFORM] Transferred ${amount} TON to User ${userId}`)
                // Optionally record transaction for user to see?
                const db = await getDB()
                await db.run(
                    'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
                    userId, 'deposit_ton', amount, `Received from Platform: ${comment || 'Admin Transfer'}`
                )
                res.json({ success: true, txHash: result.hash })
            } else {
                res.status(500).json({ error: result.error })
            }
        }
        else if (type === 'hh') {
            const custodial = await getCustodialWallet(userId)
            if (!custodial) return res.status(404).json({ error: 'User custodial wallet not found' })

            let envConfig = {}
            try {
                envConfig = JSON.parse(readFileSync(join(__dirname, 'data', 'env.json'), 'utf-8'))
            } catch (e) { }

            const mnemonic = envConfig.ton?.platformMnemonic
            const jMaster = envConfig.ton?.jettonMasterAddress
            if (!mnemonic || !jMaster) return res.status(500).json({ error: 'Platform mnemonic or jetton master not configured' })

            // Send ON-CHAIN HH to User's Custodial Wallet
            const result = await walletService.sendJettonFromMnemonic(
                mnemonic,
                custodial.address,
                amount,
                jMaster,
                comment || 'Admin Bonus HH'
            )

            if (result.success) {
                // Sent successfully, credit user internal balance
                await updateUserBalance(userId, amount)
                const db = await getDB()
                await db.run(
                    'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
                    userId, 'deposit_hh', amount, `Received from Platform: ${comment || 'Admin Bonus'}`
                )
                console.log(`[PLATFORM] Transferred ${amount} HH ON-CHAIN to User ${userId}`)
                res.json({ success: true, txHash: result.hash })
            } else {
                res.status(500).json({ error: result.error })
            }
        }
        else {
            res.status(400).json({ error: 'Invalid type' })
        }
    } catch (error) {
        console.error('[PLATFORM] Transfer error:', error)
        res.status(500).json({ error: 'Transfer failed' })
    }
})

// Deposit from Custodial Wallet to HH Balance (Internal)
// Deposit from custodial disabled
app.post('/api/user/:id/custodial-deposit-hh', (req, res) => res.status(501).json({ error: 'Disabled' }))

// Admin: list all custodial wallets
app.get('/api/admin/wallets', async (req, res) => {
    try {
        const wallets = await getAllCustodialWallets()
        // Fetch balances in parallel
        const results = await Promise.all(wallets.map(async w => {
            const balance = await walletService.getWalletBalance(w.address)
            return {
                userId: w.user_id,
                telegramId: w.telegram_id,
                username: w.username,
                address: w.address,
                balance,
                createdAt: w.created_at,
            }
        }))
        res.json(results)
    } catch (error) {
        console.error('[WALLET] Admin list error:', error)
        res.status(500).json({ error: 'Failed to list wallets' })
    }
})

// SPA fallback: serve index.html for all non-API routes
app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/')) {
        res.sendFile(join(distPath, 'index.html'))
    } else {
        next()
    }
})

// ═══════════════════════════════════════
// PLATFORM WALLET & DONATION PARSER
// ═══════════════════════════════════════

const PLATFORM_USER_ID = 0 // Special ID for platform wallet
let isParsingDonations = false

async function startDonationParser() {
    setInterval(async () => {
        if (isParsingDonations) return
        isParsingDonations = true
        try {
            const platformWallet = await getCustodialWallet(PLATFORM_USER_ID)
            if (!platformWallet) return

            // Check transactions from the blockchain
            const txs = await walletService.getIncomingTransactions(platformWallet.address)

            // Process unhandled ones
            const db = await getDB()

            for (const tx of txs) {
                const { hash, sender, amount, timestamp } = tx

                // If not processed yet
                const existing = await db.get('SELECT * FROM transactions WHERE tx_hash = ? AND type = ?', hash, 'donation_processed')
                if (!existing) {
                    console.log(`[DONATION] Found new donation: ${amount} TON from ${sender} (Hash: ${hash})`)

                    // Award HH
                    const rewardHH = (amount / 0.25) * 500

                    // See if sender matches any user explicitly declared intent
                    // TonAPI returns raw addresses (0:hex), intent descriptions have user-friendly (EQ...) format.
                    // Try matching with both formats.
                    let senderFriendly = sender
                    try {
                        const { Address: Addr } = await import('@ton/core')
                        senderFriendly = Addr.parse(sender).toString({ bounceable: true, urlSafe: true })
                    } catch { }
                    const intent = await db.get(
                        'SELECT user_id FROM transactions WHERE type = ? AND (description LIKE ? OR description LIKE ?) ORDER BY created_at DESC LIMIT 1',
                        'donation_intent', `%${sender}%`, `%${senderFriendly}%`
                    )

                    let userId = 'anonymous'
                    let targetPayoutAddress = sender // fallback to sending directly

                    if (intent) {
                        userId = intent.user_id
                        const userWallet = await getCustodialWallet(userId)
                        if (userWallet) {
                            targetPayoutAddress = userWallet.address // Send to their platform wallet
                        }
                    }

                    // Log the processed transaction FIRST to prevent double payouts if anything fails
                    await db.run(
                        'INSERT INTO transactions (user_id, type, amount, description, tx_hash) VALUES (?, ?, ?, ?, ?)',
                        userId, 'donation_processed', amount, `Donation from ${sender}`, hash
                    )

                    // Attempt to payout
                    let envConfig = {}
                    try { envConfig = JSON.parse(readFileSync(join(__dirname, 'data', 'env.json'), 'utf-8')) } catch (e) { }
                    const mnemonic = envConfig.ton?.platformMnemonic
                    const jMaster = envConfig.ton?.jettonMasterAddress

                    if (mnemonic && jMaster && rewardHH > 0) {
                        const result = await walletService.sendJettonFromMnemonic(
                            mnemonic,
                            targetPayoutAddress,
                            rewardHH,
                            jMaster,
                            'Donation Reward HH'
                        )
                        if (result.success) {
                            console.log(`[DONATION] Awarded ${rewardHH} HH to ${targetPayoutAddress} (User: ${userId})`)
                        } else {
                            console.error(`[DONATION] Failed to award HH:`, result.error)
                        }
                    }
                }
            }
        } catch (e) {
            console.error('[DONATION] Parser Error:', e.message)
        } finally {
            isParsingDonations = false
        }
    }, 30 * 1000) // Every 30 seconds
}

// Register user intent for donation tracking
app.post('/api/donate', async (req, res) => {
    try {
        const { userId, senderWallet } = req.body
        if (!userId || !senderWallet) return res.status(400).json({ error: 'Missing parameters' })

        const db = await getDB()
        await db.run(
            'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
            userId, 'donation_intent', 0, `Ожидание пожертвования с кошелька: ${senderWallet}`
        )
        res.json({ success: true, message: 'Intent logged.' })
    } catch (e) {
        console.error('[API] Donate request error:', e)
        res.status(500).json({ error: 'Failed to submit donation request' })
    }
})

async function ensurePlatformWallet() {
    try {
        let wallet = await getCustodialWallet(PLATFORM_USER_ID)
        if (!wallet) {
            const newWallet = await walletService.generateWallet()
            // Use user_id=0 for platform wallet (no FK constraint since it's 0)
            const db = await getDB()
            await db.run(
                'INSERT OR IGNORE INTO custodial_wallets (user_id, address, encrypted_mnemonic, public_key) VALUES (?, ?, ?, ?)',
                PLATFORM_USER_ID, newWallet.address, newWallet.encryptedMnemonic, newWallet.publicKey
            )
            console.log(`[WALLET] Platform wallet created: ${newWallet.address}`)
            return newWallet.address
        }
        console.log(`[WALLET] Platform wallet: ${wallet.address}`)
        return wallet.address
    } catch (e) {
        console.error('[WALLET] Platform wallet error:', e.message)
    }
}

// Create wallets for all existing users who don't have one
/*
async function ensureAllUserWallets() {
   // Disabled
}
*/

app.get('/api/platform-wallet', async (req, res) => {
    try {
        const envConfig = JSON.parse(readFileSync(join(__dirname, 'data', 'env.json'), 'utf-8'))
        const pAddr = envConfig.ton?.platformWalletAddress
        const jMaster = envConfig.ton?.jettonMasterAddress

        if (!pAddr) return res.status(404).json({ error: 'Platform wallet not configured in env.json' })

        const balance = await walletService.getWalletBalance(pAddr)
        let hhBalance = 0
        if (jMaster) {
            hhBalance = await walletService.getJettonBalance(pAddr, jMaster)
        }
        res.json({ address: pAddr, balance, hhBalance })
    } catch (e) {
        console.error('[API] Platform wallet fetch error:', e)
        res.status(500).json({ error: 'Failed to get platform wallet' })
    }
})

// ═══════════════════════════════════════════════════════════════
// ██ AUCTION & NFT API ██
// ═══════════════════════════════════════════════════════════════

const COMMISSION_RATE = 0.00 // 0% platform commission (disabled)

// Helper: get user's effective balance (purely OFF-CHAIN from SQLite now)
async function getUserEffectiveBalance(userId) {
    try {
        const db = await getDB()
        const user = await db.get('SELECT balance FROM users WHERE id = ?', userId)
        return user ? (user.balance || 0) : 0
    } catch (e) {
        console.error(`[BALANCE] Failed to fetch internal balance for user ${userId}:`, e.message)
        return 0
    }
}

// ── Off-Chain Financial Engine ──
async function chargeUserHH(userId, amountHH, comment) {
    if (amountHH <= 0) return true
    const db = await getDB()
    const user = await db.get('SELECT balance FROM users WHERE id = ?', userId)
    if (!user || user.balance < amountHH) throw new Error('Недостаточно HH на внутреннем балансе')

    await db.run('UPDATE users SET balance = balance - ? WHERE id = ?', amountHH, userId)
    await db.run('INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
        userId, 'payment', -amountHH, comment)
    console.log(`[OFF-CHAIN] Списано ${amountHH} HH у пользователя ${userId} (${comment})`)
    return true
}

async function creditUserHH(userId, amountHH, comment) {
    if (amountHH <= 0) return true
    const db = await getDB()
    const user = await db.get('SELECT id FROM users WHERE id = ?', userId)
    if (!user) throw new Error("Пользователь не найден")

    await db.run('UPDATE users SET balance = IFNULL(balance, 0) + ? WHERE id = ?', amountHH, userId)
    await db.run('INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
        userId, 'deposit', amountHH, comment)
    console.log(`[OFF-CHAIN] Начислено ${amountHH} HH пользователю ${userId} (${comment})`)
    return true
}

async function payoutUserHH(userId, amountHH, comment) {
    if (amountHH <= 0) return true
    const db = await getDB()
    const user = await db.get('SELECT id FROM users WHERE id = ?', userId)
    if (!user) throw new Error("Пользователь не найден")

    await db.run('UPDATE users SET balance = IFNULL(balance, 0) + ? WHERE id = ?', amountHH, userId)
    console.log(`[OFF-CHAIN] Начислено ${amountHH} HH пользователю ${userId} (${comment})`)
    return true
}

// ── GET /api/auctions ── List all active auctions
app.get('/api/auctions', async (req, res) => {
    try {
        const auctions = await getActiveAuctions()
        // Also fetch bids for each auction
        const result = await Promise.all(auctions.map(async a => {
            const bids = await getAuctionBids(a.id)
            return { ...a, bids }
        }))
        res.json(result)
    } catch (e) {
        console.error('[AUCTION] List error:', e)
        res.status(500).json({ error: 'DB error' })
    }
})



// ── POST /api/nfts/check-character ──
app.post('/api/nfts/check-character', async (req, res) => {
    try {
        const { firstName, lastName } = req.body
        if (!firstName || !lastName) return res.status(400).json({ error: 'firstName and lastName required' })

        const latinOnly = /^[a-zA-Z]+$/
        if (!latinOnly.test(firstName) || !latinOnly.test(lastName)) {
            return res.status(400).json({ error: 'Имя и Фамилия должны состоять только из латинских букв' })
        }

        const exists = await checkCharacterExists(firstName, lastName)
        res.json({ unique: !exists })
    } catch (e) {
        res.status(500).json({ error: 'Server error' })
    }
})

// ── POST /api/auctions ── Create auction (+ NFT + deduct creation fee)
app.post('/api/auctions', async (req, res) => {
    try {
        const { userId, nftId, name, image, emoji, isGif, collectionId, collectionName,
            startPrice, bidStep, buyNowPrice, auctionDuration, mintCost, firstName, lastName, color } = req.body

        if (!userId) return res.status(400).json({ error: 'userId required' })

        let finalNftId = nftId
        let finalNft = null
        let creationFee = 0

        if (nftId) {
            // Selling existing NFT
            finalNft = await getNFTById(nftId)
            if (!finalNft) return res.status(404).json({ error: 'NFT не найден' })
            if (String(finalNft.owner_id) !== String(userId)) {
                return res.status(403).json({ error: 'Этот NFT вам не принадлежит' })
            }
            if (finalNft.status === 'auction') {
                return res.status(400).json({ error: 'NFT уже выставлен на продажу' })
            }
            creationFee = 0
            console.log(`[AUCTION] User ${userId} is selling existing NFT ${nftId} (#${finalNft.on_chain_index})`)
        } else {
            // Creating NEW and posting to auction
            if (!name || !firstName || !lastName) {
                return res.status(400).json({ error: 'Необходимы name, firstName, lastName для создания персонажа' })
            }

            // 1. Validate character format (Latin only as requested)
            const latinOnly = /^[a-zA-Z\s]+$/
            if (!latinOnly.test(firstName) || !latinOnly.test(lastName)) {
                return res.status(400).json({ error: 'Имя и Фамилия должны состоять только из латинских букв' })
            }

            // 2. Uniqueness check (name)
            const exists = await checkCharacterExists(firstName, lastName)
            if (exists) {
                return res.status(400).json({ error: 'Персонаж с такими Именем и Фамилией уже существует' })
            }

            // 3. Uniqueness check (image)
            if (image && image.length > 20) {
                const db = await getDB()
                const imageExists = await db.get('SELECT id FROM nfts WHERE image = ? LIMIT 1', image)
                if (imageExists) {
                    return res.status(400).json({ error: 'Изображение уже используется. Выберите другое.' })
                }
            }
            creationFee = mintCost || 100
        }

        const startBid = startPrice || 10
        const duration = auctionDuration || 3600000
        const totalCost = creationFee + startBid

        // Check balance
        const balance = await getUserEffectiveBalance(userId)
        if (balance < totalCost) {
            return res.status(400).json({ error: `Недостаточно средств. Нужно ${totalCost} HH (${creationFee} создание + ${startBid} ставка)` })
        }

        // Charge user
        const logMsg = nftId ? `Продажа NFT #${finalNft.on_chain_index}` : `Создание NFT "${name}"`
        await chargeUserHH(userId, totalCost, logMsg)

        if (!nftId) {
            const newId = 'nft_' + Date.now()
            finalNft = await createNFT({
                id: newId, name, image, emoji, isGif,
                collectionId, collectionName,
                ownerId: userId, creatorId: userId,
                upgrade: null,
                onChainIndex: null,
                mintTxHash: null,
                onChainCollection: null,
                firstName, lastName,
                color: color || null
            })
            finalNftId = newId

            // Auto-create Telegram sticker for the new NFT
            if (finalNft && finalNft.image) {
                stickerService.createStickerForNFT({ ...finalNft, id: newId }).catch(e =>
                    console.error(`[StickerService] Auto-sticker failed for ${newId}:`, e)
                )
            }
        }

        // Mark NFT as on auction
        await updateNFTStatus(finalNftId, 'auction')

        // Create auction
        const auctionId = 'a_' + Date.now()
        const now = Date.now()
        const auction = await createAuctionDB({
            id: auctionId,
            nftId: finalNftId,
            creatorId: userId,
            startPrice: startBid,
            currentBid: startBid,
            currentBidderId: userId,
            bidStep: bidStep || 1,
            buyNowPrice: buyNowPrice || null,
            isDirectSale: buyNowPrice && (!bidStep || bidStep === 0),
            endsAt: now + duration
        })

        // create initial bid record
        await createBid(auctionId, userId, startBid)

        console.log(`[AUCTION] Created: ${auctionId} by user ${userId}, NFT: ${finalNft.name}, index: ${finalNft.on_chain_index}`)
        res.json({ success: true, auction, nft: finalNft })
    } catch (e) {
        console.error('[AUCTION] Create error:', e)
        res.status(500).json({ error: e.message || 'Ошибка сервера при создании аукциона' })
    }
})

// ── POST /api/auctions/:id/bid ── Place a bid
app.post('/api/auctions/:id/bid', async (req, res) => {
    try {
        const auction = await getAuctionById(req.params.id)
        if (!auction) return res.status(404).json({ error: 'Аукцион не найден' })
        if (auction.status !== 'active') return res.status(400).json({ error: 'Аукцион завершён' })
        if (Date.now() > auction.ends_at) return res.status(400).json({ error: 'Аукцион истёк' })

        const { userId, amount } = req.body
        if (!userId || !amount) return res.status(400).json({ error: 'userId and amount required' })

        const minBid = auction.current_bid + (auction.bid_step || 1)
        if (amount < minBid) {
            return res.status(400).json({ error: `Минимальная ставка: ${minBid} HH` })
        }

        if (userId === auction.current_bidder_id) {
            return res.status(400).json({ error: 'Вы уже лидируете' })
        }

        // Check on-chain balance
        const balance = await getUserEffectiveBalance(userId)
        if (balance < amount) {
            return res.status(400).json({ error: 'Недостаточно средств на on-chain балансе' })
        }

        // 1. Deduct from new bidder (OFF-CHAIN)
        await chargeUserHH(userId, amount, `Ставка на "${auction.name}"`)

        // 2. Refund previous bidder (OFF-CHAIN)
        if (auction.current_bidder_id) {
            try {
                await payoutUserHH(
                    auction.current_bidder_id, auction.current_bid,
                    `Возврат ставки "${auction.name}"`
                )
                console.log(`[OFF-CHAIN] Refunded ${auction.current_bid} HH to user ${auction.current_bidder_id}`)

                // Notify outbid user
                const outbidUser = await getUserById(auction.current_bidder_id)
                if (outbidUser && outbidUser.telegram_id && outbidUser.id !== userId) {
                    const message = `⚠️ Вашу ставку на лоте NFT "${auction.name}" перебили!\nСумма ${auction.current_bid} HH возвращена на ваш баланс.\n\n[Перейти к лотам](https://t.me/head_hunters_robot/app)`
                    await sendTelegramMessage(outbidUser.telegram_id, message).catch(console.error)
                }
            } catch (refundError) {
                console.error(`[OFF-CHAIN] CRITICAL: Failed to refund previous bidder ${auction.current_bidder_id}:`, refundError)
                // Note: The new bid is already locked, so we proceed, but we should log the failed refund.
                // In a perfect system, we'd queue failed refunds for retry.
            }
        }

        // Update auction in DB
        await updateAuctionBid(auction.id, userId, amount)
        await createBid(auction.id, userId, amount)

        console.log(`[AUCTION] Bid: ${amount} HH on ${auction.id} by user ${userId}`)
        res.json({ success: true })
    } catch (e) {
        console.error('[AUCTION] Bid error:', e)
        res.status(500).json({ error: e.message || 'Ошибка блокчейн-транзакции (проверьте TON баланс)' })
    }
})

// ── POST /api/auctions/:id/buy ── Buy now
app.post('/api/auctions/:id/buy', async (req, res) => {
    try {
        const auction = await getAuctionById(req.params.id)
        if (!auction) return res.status(404).json({ error: 'Аукцион не найден' })
        if (auction.status !== 'active') return res.status(400).json({ error: 'Аукцион завершён' })
        if (!auction.buy_now_price) return res.status(400).json({ error: 'Нет цены "Купить сейчас"' })

        const { userId } = req.body
        if (!userId) return res.status(400).json({ error: 'userId required' })

        const price = auction.buy_now_price

        // Check on-chain balance
        const balance = await getUserEffectiveBalance(userId)
        if (balance < price) return res.status(400).json({ error: 'Недостаточно средств на on-chain балансе' })

        // 1. Deduct full price from buyer (OFF-CHAIN)
        await chargeUserHH(userId, price, `Покупка "${auction.name}"`)

        // 2. Refund current bidder (if not the buyer)
        if (auction.current_bidder_id && auction.current_bidder_id !== userId) {
            try {
                await payoutUserHH(
                    auction.current_bidder_id, auction.current_bid,
                    `Возврат ставки "${auction.name}" (аукцион выкуплен)`
                )
                const outbidUser = await getUserById(auction.current_bidder_id)
                if (outbidUser && outbidUser.telegram_id) {
                    const message = `⚠️ Лот NFT "${auction.name}" был выкуплен по фиксированной цене!\nСумма вашей последней ставки ${auction.current_bid} HH возвращена на баланс.`
                    await sendTelegramMessage(outbidUser.telegram_id, message).catch(console.error)
                }
            } catch (refundError) {
                console.error(`[OFF-CHAIN] CRITICAL: Failed to refund previous bidder:`, refundError)
            }
        }
        // If buyer was the current bidder, they already locked `current_bid` on Escrow. Credit it back
        if (auction.current_bidder_id === userId) {
            try {
                await payoutUserHH(userId, auction.current_bid, `Возврат ставки (выкуп себе)`)
            } catch (refundError) {
                console.error(`[OFF-CHAIN] CRITICAL: Failed to refund self:`, refundError)
            }
        }

        // 3. Pay creator (minus commission) (OFF-CHAIN)
        const commission = price * COMMISSION_RATE
        const creatorPayout = price - commission
        try {
            if (creatorPayout > 0 && auction.creator_id !== userId) {
                await payoutUserHH(auction.creator_id, creatorPayout, `Продажа "${auction.name}"`)

                // Notify creator
                const creatorUser = await getUserById(auction.creator_id)
                if (creatorUser && creatorUser.telegram_id) {
                    const message = `🎉 Ваш NFT "${auction.name}" был успешно продан за ${price} HH!\nВам начислено ${creatorPayout} HH (с учетом комиссии магазина 30%).`
                    await sendTelegramMessage(creatorUser.telegram_id, message).catch(console.error)
                }
            }
        } catch (payoutError) {
            console.error(`[OFF-CHAIN] CRITICAL: Failed to payout creator:`, payoutError)
        }

        // Transfer NFT
        await updateNFTOwner(auction.nft_id, userId, price)
        await updateAuctionStatus(auction.id, 'claimed')

        console.log(`[AUCTION] Buy Now: ${auction.id} by user ${userId} for ${price} HH, creator gets ${creatorPayout}`)
        res.json({ success: true })
    } catch (e) {
        console.error('[AUCTION] Buy error:', e)
        res.status(500).json({ error: e.message || 'Ошибка блокчейн-транзакции (проверьте TON баланс)' })
    }
})

// ── POST /api/auctions/:id/claim ── Claim ended auction (settlement)
app.post('/api/auctions/:id/claim', async (req, res) => {
    try {
        const auction = await getAuctionById(req.params.id)
        if (!auction) return res.status(404).json({ error: 'Аукцион не найден' })
        if (auction.status !== 'active') return res.status(400).json({ error: 'Уже обработан' })
        if (Date.now() < auction.ends_at) return res.status(400).json({ error: 'Аукцион ещё идёт' })

        // ── ATOMIC LOCK ──
        // Set to 'claiming' immediately so parallel requests fail correctly
        await updateAuctionStatus(auction.id, 'claiming')

        const { userId } = req.body

        // Settlement: pay creator, transfer NFT to winner
        const winnerId = auction.current_bidder_id
        const winAmount = auction.current_bid

        if (winnerId === auction.creator_id) {
            // Creator's own bid won — refund the bid from Escrow, return NFT
            try {
                await payoutUserHH(auction.creator_id, winAmount, `Возврат ставки (свой аукцион "${auction.name}")`)
            } catch (e) { console.error('[OFF-CHAIN] Refund creator error:', e) }
            await updateNFTOwner(auction.nft_id, auction.creator_id, winAmount)
        } else {
            // Real winner: bid was already locked on Escrow. Pay creator.
            const commission = winAmount * COMMISSION_RATE
            const creatorPayout = winAmount - commission
            try {
                if (creatorPayout > 0) {
                    await payoutUserHH(auction.creator_id, creatorPayout, `Продажа "${auction.name}"`)

                    const creatorUser = await getUserById(auction.creator_id)
                    if (creatorUser && creatorUser.telegram_id) {
                        const message = `🎉 Аукцион вашего NFT "${auction.name}" успешно завершён!\nПобедила ставка ${winAmount} HH. Вам начислено ${creatorPayout} HH (с учетом комиссии магазина 30%).`
                        await sendTelegramMessage(creatorUser.telegram_id, message).catch(console.error)
                    }
                }
            } catch (e) { console.error('[OFF-CHAIN] Payout creator error:', e) }

            // Transfer NFT to winner
            await updateNFTOwner(auction.nft_id, winnerId)

            const winnerUser = await getUserById(winnerId)
            if (winnerUser && winnerUser.telegram_id) {
                const message = `🏆 Вы выиграли аукцион NFT "${auction.name}" за ${winAmount} HH!\nNFT зачислен в ваш кошелёк.`
                await sendTelegramMessage(winnerUser.telegram_id, message).catch(console.error)
            }
        }

        await updateAuctionStatus(auction.id, 'claimed')

        console.log(`[AUCTION] Claimed: ${auction.id}, winner: ${winnerId}, amount: ${winAmount} HH`)
        res.json({ success: true, winnerId, amount: winAmount })
    } catch (e) {
        console.error('[AUCTION] Claim error:', e)
        res.status(500).json({ error: e.message || 'Ошибка завершения (on-chain)' })
    }
})

// ── POST /api/auctions/:id/cancel ── Cancel auction (only if creator, no external bids)
app.post('/api/auctions/:id/cancel', async (req, res) => {
    try {
        const auction = await getAuctionById(req.params.id)
        if (!auction) return res.status(404).json({ error: 'Аукцион не найден' })
        if (auction.status !== 'active') return res.status(400).json({ error: 'Аукцион уже завершён' })

        const { userId } = req.body
        if (userId !== auction.creator_id) return res.status(403).json({ error: 'Только создатель может отменить' })

        // Check if there are bids from other users
        const bids = await getAuctionBids(auction.id)
        const externalBids = bids.filter(b => b.user_id !== auction.creator_id)
        if (externalBids.length > 0) {
            return res.status(400).json({ error: 'Нельзя отменить аукцион с чужими ставками' })
        }

        // Refund creator's initial bid via Escrow payout
        try {
            await payoutUserHH(auction.creator_id, auction.current_bid, `Отмена аукциона "${auction.name}"`)
        } catch (e) { console.error('[OFF-CHAIN] Cancel refund error:', e) }

        // Return NFT to creator
        await updateNFTOwner(auction.nft_id, auction.creator_id)
        await updateAuctionStatus(auction.id, 'cancelled')

        console.log(`[AUCTION] Cancelled: ${auction.id} by user ${userId}`)
        res.json({ success: true })
    } catch (e) {
        console.error('[AUCTION] Cancel error:', e)
        res.status(500).json({ error: e.message || 'Ошибка отмены блока (off-chain)' })
    }
})

// ── GET /api/user/:id/nfts ── User's NFTs
app.get('/api/user/:id/nfts', async (req, res) => {
    try {
        const userId = parseInt(req.params.id)
        const nfts = await getUserNFTs(userId)
        // Parse the upgrade JSON string stored in SQLite before returning
        const parsed = nfts.map(n => ({
            ...n,
            upgrade: n.upgrade ? (typeof n.upgrade === 'string' ? JSON.parse(n.upgrade) : n.upgrade) : null
        }))
        res.json(parsed)
    } catch (e) {
        console.error('[NFT] User NFTs error:', e)
        res.status(500).json({ error: 'DB error' })
    }
})

// ── POST /api/nfts/:id/activate ── Activate virtual NFT on-chain
app.post('/api/nfts/:id/activate', async (req, res) => {
    try {
        const nftId = req.params.id
        const { userId, color } = req.body
        if (!userId) return res.status(400).json({ error: 'userId required' })

        const nft = await getNFTById(nftId)
        if (!nft) return res.status(404).json({ error: 'NFT не найден' })

        let canActivate = (nft.owner_id === userId)
        if (!canActivate) {
            // Allow winner of ended auction to activate even before claiming
            const auctions = await getActiveAuctions()
            const auction = auctions.find(a => a.nft_id === nftId && a.status === 'active')
            if (auction) {
                const isWinner = (auction.ends_at < Date.now() && auction.current_bidder_id === userId)
                if (isWinner) canActivate = true
            }
        }
        if (!canActivate) return res.status(403).json({ error: 'Вы не владелец этого NFT и не победитель аукциона' })
        if (nft.on_chain_index !== null && nft.on_chain_index !== undefined) {
            return res.status(400).json({ error: 'NFT уже активирован в блокчейне' })
        }

        const ACTIVATE_PRICE = 100

        // 1. Deduct 100 HH off-chain
        await chargeUserHH(userId, ACTIVATE_PRICE, `Активация NFT "${nft.name}" в блокчейне`)

        // 2. Mint to Platform Wallet
        console.log(`[NFT] Активация: получение индекса коллекции...`)
        const onChainIndex = await nftService.getNextItemIndex()
        // Item content is just the index suffix. The collection's common_content
        // provides the base URL (https://hh.nerou.fun/api/nft-metadata/).
        const contentUri = String(onChainIndex)

        const envConfig = JSON.parse(readFileSync(join(__dirname, 'data', 'env.json'), 'utf-8'))
        const platformAddress = envConfig.ton?.platformWalletAddress

        console.log(`[NFT] Минтинг on-chain предмета ${onChainIndex} на ${platformAddress}...`)

        // Assign random color name on initial activation
        const randomColor = getRandomColorName()

        // Delay 1.5s to avoid hitting the 1 req/s public Toncenter rate limit 
        // after the `getNextItemIndex` call.
        await new Promise(r => setTimeout(r, 1500))

        const mintRes = await nftService.mintNft({
            itemOwnerAddress: platformAddress, // Platform owns the physical NFT
            itemIndex: onChainIndex,
            itemContentUri: contentUri,
            amount: '0.05'
        })

        if (!mintRes.success) {
            console.error(`[NFT] Minting failed: ${mintRes.error}`)
            await payoutUserHH(userId, ACTIVATE_PRICE, `Возврат: Ошибка активации NFT "${nft.name}"`)
            return res.status(500).json({ error: `Blockchain mint failure: ${mintRes.error}. Money refunded.` })
        }

        const onChainCollection = envConfig.ton?.nftCollectionAddress

        // 3. Update DB
        await updateNFTOnChainData(nftId, onChainIndex, 'activated', onChainCollection, randomColor)

        // Auto-create Telegram sticker after activation
        try {
            const updatedNft = await getNFTById(nftId)
            if (updatedNft && updatedNft.image && !updatedNft.sticker_file_id) {
                await stickerService.createStickerForNFT(updatedNft)
                console.log(`[NFT] Sticker auto-created for ${nftId}`)
            }
        } catch (stickerErr) {
            console.error(`[NFT] Auto-sticker failed (non-fatal):`, stickerErr.message)
        }

        console.log(`[NFT] NFT ${nftId} успешно активирован пользователем ${userId} с цветом ${randomColor}`)
        res.json({ success: true, onChainIndex, color: randomColor })
    } catch (e) {
        console.error('[NFT] Activation error:', e)
        res.status(500).json({ error: e.message || 'Ошибка активации (проверьте настройки)' })
    }
})

// ── POST /api/nfts/:id/withdraw ── Withdraw activated NFT to external wallet
app.post('/api/nfts/:id/withdraw', async (req, res) => {
    try {
        const nftId = req.params.id
        const { userId, toAddress } = req.body
        if (!userId || !toAddress) return res.status(400).json({ error: 'userId and toAddress required' })

        if (!walletService.isValidTonAddress(toAddress)) {
            return res.status(400).json({ error: 'Неверный адрес TON' })
        }

        const nft = await getNFTById(nftId)
        if (!nft) return res.status(404).json({ error: 'NFT не найден' })
        if (nft.owner_id !== userId) return res.status(403).json({ error: 'Вы не владелец этого NFT' })

        if (nft.on_chain_index === null || nft.on_chain_index === undefined) {
            return res.status(400).json({ error: 'Сначала нужно активировать NFT в блокчейне' })
        }
        if (nft.status === 'withdrawn') {
            return res.status(400).json({ error: 'NFT уже выведен' })
        }

        console.log(`[NFT] Withdrawing NFT index ${nft.on_chain_index} to ${toAddress}`)

        // Get NFT item address
        const itemAddressStr = await nftService.getNftAddressByIndex(nft.on_chain_index)

        // Transfer it
        const transferRes = await nftService.transferNft({
            itemAddressStr,
            newOwnerAddressStr: toAddress,
            amount: 0.05 // Platform covers the gas
        })

        if (!transferRes.success) {
            return res.status(500).json({ error: `Withdrawal failed: ${transferRes.error}` })
        }

        // Mark as withdrawn in DB
        await updateNFTStatus(nftId, 'withdrawn')

        res.json({ success: true, itemAddress: itemAddressStr })
    } catch (e) {
        console.error('[NFT] Withdraw error:', e)
        res.status(500).json({ error: e.message || 'Ошибка вывода' })
    }
})




// ── POST /api/wallet/withdraw ── Withdraw HH tokens to external wallet
app.post('/api/wallet/withdraw', async (req, res) => {
    try {
        const { userId, toAddress, amount } = req.body
        if (!userId || !toAddress || !amount) return res.status(400).json({ error: 'Отсутствуют параметры' })

        if (!walletService.isValidTonAddress(toAddress)) {
            return res.status(400).json({ error: 'Неверный адрес TON' })
        }

        const withdrawAmount = Number(amount)
        if (withdrawAmount <= 0) return res.status(400).json({ error: 'Неверная сумма' })

        // 1. Deduct off-chain to lock the funds
        await chargeUserHH(userId, withdrawAmount, `Вывод ${withdrawAmount} HH на ${toAddress} `)

        // 2. Transfer from Platform Wallet to external wallet
        const envConfig = JSON.parse(readFileSync(join(__dirname, 'data', 'env.json'), 'utf-8'))
        const platformMnemonic = envConfig.ton?.platformMnemonic
        const jMaster = envConfig.ton?.jettonMasterAddress

        console.log(`[WALLET] Withdrawing ${withdrawAmount} HH to ${toAddress}...`)
        const transferRes = await walletService.sendJettonFromMnemonic(
            platformMnemonic,
            toAddress,
            withdrawAmount,
            jMaster,
            'HeadHunter Withdrawal'
        )

        if (!transferRes.success) {
            console.error(`[WALLET] Withdrawal failed: ${transferRes.error} `)
            // Refund the user if transfer failed
            await payoutUserHH(userId, withdrawAmount, `Возврат: Ошибка вывода на ${toAddress} `)
            return res.status(500).json({ error: `Withdrawal failed: ${transferRes.error} ` })
        }

        console.log(`[WALLET] Withdrawal successful for user ${userId} to ${toAddress} `)
        res.json({ success: true })
    } catch (e) {
        console.error('[WALLET] Withdraw error:', e)
        res.status(500).json({ error: e.message || 'Ошибка вывода' })
    }
})

// Serve index.html for all other routes (SPA)
app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/assets')) {
        return res.sendFile(join(distPath, 'index.html'))
    }
    next()
})

app.listen(PORT, async () => {
    console.log(`[SERVER] Running on http://localhost:${PORT}`)

    // Create platform wallet + all user wallets on startup
    await ensurePlatformWallet()
    // await ensureAllUserWallets() // Disabled

    // Initialize Sticker MTProto mappings right on startup
    fetchFreshStickerRefs().then(refs => {
        _stickerRefsCache = refs
        _stickerRefsCacheTime = Date.now()
        console.log(`[SERVER] Pre-warmed sticker refs cache with ${Object.keys(refs).length} items`)
    }).catch(e => console.error('[SERVER] Failed to pre-warm sticker refs:', e.message))

    // Refresh sticker refs every 30 minutes to keep file_references fresh
    setInterval(() => {
        fetchFreshStickerRefs().then(refs => {
            _stickerRefsCache = refs
            _stickerRefsCacheTime = Date.now()
            console.log(`[SERVER] Refreshed sticker refs cache with ${Object.keys(refs).length} items`)
        }).catch(e => console.error('[SERVER] Sticker refs refresh failed:', e.message))
    }, 30 * 60 * 1000)

    // Start automated bot to parse incoming donations
    startDonationParser()

    // Run avatar refresh on startup + every 12h
    setTimeout(refreshAllAvatars, 5000) // 5s after start
    setInterval(refreshAllAvatars, AVATAR_REFRESH_MS)
    console.log(`[SERVER] Avatar auto-refresh scheduled every 12h`)
})
