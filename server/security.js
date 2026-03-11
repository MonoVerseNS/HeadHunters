import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Загрузка конфигурации
let envConfig = {}
try {
    envConfig = JSON.parse(readFileSync(join(__dirname, 'data', 'env.json'), 'utf-8'))
} catch (e) {
    console.warn('[Security] env.json not found, using default secrets')
}

const JWT_SECRET = envConfig.backend?.jwtSecret || 'hh-super-secret-key-change-it'
const ADMIN_API_KEY = envConfig.backend?.adminApiKey || 'admin-api-key'

/**
 * Генерация JWT токена для пользователя.
 */
export function generateToken(user) {
    return jwt.sign(
        { id: user.id, telegram_id: user.telegram_id, role: user.role },
        JWT_SECRET,
        { expiresIn: '7d' }
    )
}

/**
 * Middleware для проверки JWT токена.
 */
export function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]

    if (!token) return res.status(401).json({ error: 'Access token missing' })

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid or expired token' })
        req.user = user
        next()
    })
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
    const apiKey = req.headers['x-api-key']
    if (apiKey === ADMIN_API_KEY) {
        return next()
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
