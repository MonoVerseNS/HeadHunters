import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

let JWT_SECRET = null
let ADMIN_API_KEY = null
let TELEGRAM_BOT_TOKEN = null

export function setSecurityConfig({ jwtSecret, adminApiKey, telegramBotToken } = {}) {
    if (typeof jwtSecret === 'string' && jwtSecret.trim()) JWT_SECRET = jwtSecret.trim()
    if (typeof adminApiKey === 'string' && adminApiKey.trim()) ADMIN_API_KEY = adminApiKey.trim()
    if (typeof telegramBotToken === 'string' && telegramBotToken.trim()) TELEGRAM_BOT_TOKEN = telegramBotToken.trim()
}

export function validateSecurityConfig() {
    if (!JWT_SECRET) {
        throw new Error('Missing backend.jwtSecret in configuration')
    }
}

function ensureJwtSecret() {
    if (!JWT_SECRET) {
        throw new Error('JWT secret is not configured')
    }
}

/**
 * Генерация JWT токена для пользователя.
 */
export function generateToken(user) {
    ensureJwtSecret()

    return jwt.sign(
        { id: user.id, telegram_id: user.telegram_id, role: user.role },
        JWT_SECRET,
        { expiresIn: '12h' }
    )
}

export function authenticateToken(token) {
    if (!token) return null
    ensureJwtSecret()

    try {
        return jwt.verify(token, JWT_SECRET)
    } catch {
        return null
    }
}

export function verifyTelegramAuth(payload = {}) {
    if (!TELEGRAM_BOT_TOKEN) {
        throw new Error('Telegram bot token is not configured')
    }

    const authDate = Number(payload.auth_date)
    if (!Number.isFinite(authDate)) {
        throw new Error('Invalid Telegram auth_date')
    }

    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - authDate) > 300) {
        throw new Error('Telegram auth data expired')
    }

    const hash = typeof payload.hash === 'string' ? payload.hash : ''
    if (!hash) {
        throw new Error('Missing Telegram hash')
    }

    const checkString = Object.entries(payload)
        .filter(([key, value]) => key !== 'hash' && value !== undefined && value !== null && value !== '')
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${String(value)}`)
        .join('\n')

    const secret = crypto.createHash('sha256').update(TELEGRAM_BOT_TOKEN).digest()
    const expectedHash = crypto
        .createHmac('sha256', secret)
        .update(checkString)
        .digest('hex')

    if (expectedHash !== hash) {
        throw new Error('Invalid Telegram signature')
    }

    return {
        id: String(payload.id),
        username: payload.username || '',
        first_name: payload.first_name || '',
        last_name: payload.last_name || '',
        photo_url: payload.photo_url || '',
        auth_date: authDate,
    }
}

/**
 * Middleware для проверки прав администратора.
 */
export function isAdmin(req, res, next) {
    // Проверка через JWT (если уже пройдена аутентификация)
    if (req.user && req.user.role === 'admin') {
        return next()
    }

    // Проверка через статический API ключ (для скриптов/интеграций)
    if (ADMIN_API_KEY) {
        const apiKey = req.headers['x-api-key']
        if (apiKey === ADMIN_API_KEY) {
            return next()
        }
    }

    return res.status(403).json({ error: 'Admin privileges required' })
}

/**
 * Хеширование данных (например, паролей или секретов).
 */
export async function hashData(data) {
    return await bcrypt.hash(data, 10)
}

/**
 * Сравнение данных с хешем.
 */
export async function compareData(data, hash) {
    return await bcrypt.compare(data, hash)
}
