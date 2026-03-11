// ============================================
// HeadHunters — Central Configuration
// ============================================

// ── Data imports (colors, patterns stored in JSON for easy editing) ──
import colorsData from './data/colors.json'
import patternsData from './data/patterns.json'
import envConfig from '../server/data/env.json'

// ── Unique ID Generator ──
// Produces IDs like: nft_3f8a1b2c_1707912345678
export function generateId(prefix = 'id') {
    const hex = Array.from(crypto.getRandomValues(new Uint8Array(4)))
        .map(b => b.toString(16).padStart(2, '0')).join('')
    return `${prefix}_${hex}_${Date.now()}`
}

// ============================================
// Runtime Settings — saved in localStorage by admin panel
// Priority: localStorage > env.json > defaults
// ============================================

const SETTINGS_KEY = 'hh_admin_settings'

export function getSettings() {
    try {
        const saved = localStorage.getItem(SETTINGS_KEY)
        return saved ? JSON.parse(saved) : {}
    } catch {
        return {}
    }
}

export function saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    // Update CONFIG in-place so all imports reflect changes
    Object.assign(CONFIG.telegram, {
        botId: settings.botUsername || envConfig.telegram?.botUsername || 'HeadHuntersBot',
        botToken: settings.botToken || envConfig.telegram?.botToken || '',
        webhookUrl: settings.webhookUrl || envConfig.telegram?.webhookUrl || '',
        adminChatId: settings.adminChatId || envConfig.telegram?.adminChatId || '',
    })
    Object.assign(CONFIG.auth, {
        jwtSecret: settings.jwtSecret || envConfig.backend?.jwtSecret || '',
        adminApiKey: settings.adminApiKey || envConfig.backend?.adminApiKey || '',
    })
    Object.assign(CONFIG.domain, {
        url: settings.domain || envConfig.app?.domain || '',
        appUrl: settings.appUrl || envConfig.app?.url || 'http://localhost:3310',
        corsOrigins: settings.corsOrigins || envConfig.backend?.corsOrigins || [],
    })
}

// Helper: get value from runtime settings, then env.json, then default
function rv(settingsKey, envValue, fallback = '') {
    const s = getSettings()
    return s[settingsKey] || envValue || fallback
}

// ============================================
// All admin, financial, and integration settings in one place.
// Edit values here instead of hunting through components.

export const CONFIG = {
    // ── Telegram Auth ──
    telegram: {
        botId: rv('botUsername', envConfig.telegram?.botUsername, 'HeadHuntersBot'),
        botToken: rv('botToken', envConfig.telegram?.botToken),
        apiId: envConfig.telegram?.apiId || '',
        apiHash: envConfig.telegram?.apiHash || '',
        webhookUrl: rv('webhookUrl', envConfig.telegram?.webhookUrl),
        adminChatId: rv('adminChatId', envConfig.telegram?.adminChatId),
        authCallbackName: 'onTelegramAuth',
    },

    // ── Auth / Security ──
    auth: {
        jwtSecret: rv('jwtSecret', envConfig.backend?.jwtSecret),
        adminApiKey: rv('adminApiKey', envConfig.backend?.adminApiKey),
    },

    // ── Domain / Network ──
    domain: {
        url: rv('domain', envConfig.app?.domain),
        appUrl: rv('appUrl', envConfig.app?.url, 'http://localhost:3310'),
        corsOrigins: getSettings().corsOrigins || envConfig.backend?.corsOrigins || ['http://localhost:3310'],
    },

    // ── Platform Fees & Rates ──
    fees: {
        commissionRate: 0.30,
        creatorRoyalty: 0.05,
        tonNetworkFee: 0.05,
    },

    // ── NFT Creation ──
    nft: {
        mintCost: 25,
        minBid: 10,
        bidStep: 1,          // Minimum bid increment (configurable)
        minTransfer: 50,     // Minimum HH per transfer
    },

    // ── Platform ──
    platform: {
        name: envConfig.app?.name || 'HeadHunters',
        currency: envConfig.app?.currency || 'HH',
    },

    // ── Clicker Game ──
    clicker: {
        rewardPerTap: 0.1,      // HH per tap
        dailyLimitHH: 45,       // max HH earned per day
        maxEnergy: 60,          // energy pool
        energyRegenMin: 60,     // regen interval min (seconds)
        energyRegenMax: 180,    // regen interval max (seconds)
        minWithdraw: 10,        // minimum HH to withdraw
    },

    // ── Platform TON Wallet ──
    wallet: {
        address: envConfig.ton?.platformWalletAddress || '',
        currency: 'TON',
    },

    // ── TON Blockchain ──
    ton: {
        network: envConfig.ton?.network || 'testnet',
        platformAddress: envConfig.ton?.platformWalletAddress || '',
        nftContractAddress: envConfig.ton?.nftCollectionAddress || null,
        jettonMasterAddress: envConfig.ton?.jettonMasterAddress || null,
        marketplaceAddress: null,
        explorerUrl: envConfig.ton?.explorerUrl || 'https://testnet.tonscan.org',
        tonToHHRate: envConfig.app?.tonToHHRate || 100,
    },

    // ── Intervals (ms) — Increase to reduce CPU load ──
    intervals: {
        auctionPoll: 5000,      // How often to reload auctions list
        profilePoll: 5000,      // How often to reload profile auctions
        tradingOrders: 6000,    // How often to generate fake orders
        tradingCandles: 5000,   // How often to add candle data
        tradingTicker: 4000,    // How often to update price ticker
        auctionTimer: 1000,     // Countdown timer tick (keep at 1s)
    },
}

// ══════════════════════════════════════════
// COLOR_NAMES — flat map from JSON categories
// ══════════════════════════════════════════
// Flatten all color categories into one { hex: name } map
export const COLOR_NAMES = Object.values(colorsData.colors)
    .reduce((acc, category) => ({ ...acc, ...category }), {})

// Try match a hex color or gradient to a name
export function getColorName(hex) {
    if (!hex || typeof hex !== 'string') return null

    // Normalize input
    const colorStr = hex.toLowerCase()

    // 1. Direct HEX match
    const h = colorStr.slice(0, 7)
    for (const [k, v] of Object.entries(COLOR_NAMES)) {
        if (k.toLowerCase() === h) return v
    }

    // 2. Extract all hex codes (for gradients)
    const matches = colorStr.match(/#[0-9a-fA-F]{6}/g)
    if (matches && matches.length > 0) {
        const names = []
        for (const m of matches) {
            const hexMatch = m.toLowerCase()
            for (const [k, v] of Object.entries(COLOR_NAMES)) {
                if (k.toLowerCase() === hexMatch) {
                    if (!names.includes(v)) names.push(v)
                    break
                }
            }
        }

        if (names.length > 0) {
            if (names.length === 1) return names[0]
            if (names.length === 2) return `${names[0]}-${names[1]}`
            return `${names[0]} и др.`
        }
    }

    // 3. Known named colors (manual fallback)
    if (colorStr.includes('gold')) return 'Золотой'
    if (colorStr.includes('silver')) return 'Серебряный'

    return null
}

// Try match a name to a hex color
export function getColorHex(name) {
    if (!name || typeof name !== 'string') return null
    const n = name.toLowerCase()

    // 1. Search in COLOR_NAMES
    for (const [hex, colorName] of Object.entries(COLOR_NAMES)) {
        if (colorName.toLowerCase() === n) return hex
    }

    // 2. Fallbacks
    if (n.includes('cyber blue')) return '#00a3ff'
    if (n.includes('gold') || n.includes('золотой')) return '#ffd700'
    if (n.includes('silver') || n.includes('серебряный')) return '#c0c0c0'

    return null
}

// ══════════════════════════════════════════
// UPGRADE_PATTERNS — from JSON
// ══════════════════════════════════════════
export const UPGRADE_PATTERNS = patternsData.patterns
