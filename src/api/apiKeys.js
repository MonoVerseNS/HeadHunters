// ── API Keys Management ──
// Admin keys: full access. App keys: configurable permissions.
// Keys stored in IndexedDB 'api_keys' table + localStorage fallback.

import { generateId } from '../config'

const STORAGE_KEY = 'hh_api_keys'

// All available API endpoints (permissions)
export const API_PERMISSIONS = [
    { id: 'nft/list', label: 'Список NFT', group: 'NFT' },
    { id: 'nft/getByUser', label: 'NFT пользователя (по TG ID)', group: 'NFT' },
    { id: 'nft/create', label: 'Создание NFT', group: 'NFT' },
    { id: 'nft/upgrade', label: 'Апгрейд NFT', group: 'NFT' },
    { id: 'nft/transfer', label: 'Передача NFT', group: 'NFT' },
    { id: 'auction/list', label: 'Список аукционов', group: 'Auction' },
    { id: 'auction/create', label: 'Создание аукциона', group: 'Auction' },
    { id: 'auction/bid', label: 'Ставка', group: 'Auction' },
    { id: 'auction/cancel', label: 'Отмена аукциона', group: 'Auction' },
    { id: 'user/profile', label: 'Профиль пользователя', group: 'User' },
    { id: 'user/list', label: 'Список пользователей', group: 'User' },
    { id: 'wallet/balance', label: 'Баланс', group: 'Wallet' },
    { id: 'wallet/transfer', label: 'Перевод', group: 'Wallet' },
    { id: 'admin/stats', label: 'Статистика', group: 'Admin' },
    { id: 'admin/logs', label: 'Логи', group: 'Admin' },
    { id: 'admin/mint', label: 'Минт HH', group: 'Admin' },
]

function generateApiKey(type) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let key = ''
    for (let i = 0; i < 32; i++) key += chars[Math.floor(Math.random() * chars.length)]
    return `hh_${type}_${key}`
}

class ApiKeyManager {
    constructor() {
        this.keys = this._load()
    }

    _load() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
        } catch { return [] }
    }

    _save() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.keys))
    }

    // Create a new API key
    create({ name, type = 'app', permissions = [] }) {
        const entry = {
            id: generateId('apikey'),
            key: generateApiKey(type),
            name,
            type, // 'admin' | 'app'
            permissions: type === 'admin' ? API_PERMISSIONS.map(p => p.id) : permissions,
            createdAt: new Date().toISOString(),
            lastUsedAt: null,
            isActive: true,
            requestCount: 0,
        }
        this.keys.push(entry)
        this._save()
        return entry
    }

    // Get all keys
    getAll() {
        return [...this.keys]
    }

    // Get key by raw key string
    getByKey(keyString) {
        return this.keys.find(k => k.key === keyString && k.isActive) || null
    }

    // Get key by ID
    getById(id) {
        return this.keys.find(k => k.id === id) || null
    }

    // Update permissions
    updatePermissions(id, permissions) {
        const key = this.keys.find(k => k.id === id)
        if (!key) return null
        key.permissions = permissions
        this._save()
        return key
    }

    // Toggle active
    toggleActive(id) {
        const key = this.keys.find(k => k.id === id)
        if (!key) return null
        key.isActive = !key.isActive
        this._save()
        return key
    }

    // Delete key
    delete(id) {
        this.keys = this.keys.filter(k => k.id !== id)
        this._save()
    }

    // Check if a key has permission
    hasPermission(keyString, endpoint) {
        const key = this.getByKey(keyString)
        if (!key) return false
        if (key.type === 'admin') return true
        return key.permissions.includes(endpoint)
    }

    // Record usage
    recordUsage(keyString) {
        const key = this.keys.find(k => k.key === keyString)
        if (key) {
            key.lastUsedAt = new Date().toISOString()
            key.requestCount++
            this._save()
        }
    }
}

export const apiKeyManager = new ApiKeyManager()
export default apiKeyManager
