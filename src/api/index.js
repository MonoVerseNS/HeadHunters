// ── API Client ──
// Base configuration for all API calls.
// Format: api.domain/request
// Currently mock (localStorage), structured for easy backend swap.

import { apiKeyManager } from './apiKeys'
import { appManager } from './apps'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

class APIClient {
    constructor(baseURL) {
        this.baseURL = baseURL
        this.token = null
        this.listeners = []
    }

    setToken(token) {
        this.token = token
    }

    // Subscribe to request events (for admin console logs)
    onRequest(fn) {
        this.listeners.push(fn)
        return () => { this.listeners = this.listeners.filter(l => l !== fn) }
    }

    _emit(entry) {
        this.listeners.forEach(fn => fn(entry))
    }

    async request(endpoint, { method = 'GET', body, params, apiKey } = {}) {
        const url = `${this.baseURL}/${endpoint}`
        const start = Date.now()

        const logEntry = {
            id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            timestamp: new Date().toISOString(),
            method,
            endpoint,
            url,
            params,
            body: body ? '...' : undefined,
            status: 'pending',
            apiKey: apiKey ? apiKey.slice(0, 12) + '...' : undefined,
        }

        // API Key check (if key is provided)
        if (apiKey) {
            const keyObj = apiKeyManager.getByKey(apiKey)
            if (!keyObj) {
                logEntry.status = 'error'
                logEntry.statusCode = 401
                logEntry.error = 'Invalid API key'
                logEntry.duration = Date.now() - start
                this._emit(logEntry)
                return { ok: false, error: 'Invalid or inactive API key' }
            }
            if (!apiKeyManager.hasPermission(apiKey, endpoint)) {
                logEntry.status = 'error'
                logEntry.statusCode = 403
                logEntry.error = 'Permission denied'
                logEntry.duration = Date.now() - start
                this._emit(logEntry)
                return { ok: false, error: `No permission for endpoint: ${endpoint}` }
            }
            apiKeyManager.recordUsage(apiKey)
        }

        try {
            // Mock mode: resolve from localStorage
            const result = await this._mockResolve(endpoint, method, body, params)

            logEntry.status = 'ok'
            logEntry.statusCode = 200
            logEntry.duration = Date.now() - start
            logEntry.response = typeof result === 'object' ? '(object)' : result
            this._emit(logEntry)

            return { ok: true, data: result }
        } catch (err) {
            logEntry.status = 'error'
            logEntry.statusCode = 500
            logEntry.duration = Date.now() - start
            logEntry.error = err.message
            this._emit(logEntry)

            return { ok: false, error: err.message }
        }
    }

    // Mock resolver — simulates backend via localStorage
    async _mockResolve(endpoint, method, body, params) {
        // Small delay to simulate network
        await new Promise(r => setTimeout(r, 20 + Math.random() * 30))

        const handlers = {
            // Auth
            'auth/login': () => JSON.parse(localStorage.getItem('hh_current_user') || 'null'),
            'auth/users': () => JSON.parse(localStorage.getItem('hh_users') || '[]'),

            // Wallet
            'wallet/balance': () => {
                const state = JSON.parse(localStorage.getItem('hh_blockchain_state') || '{}')
                return state.internalLedger || state.balances || {}
            },
            'wallet/platform': () => {
                const state = JSON.parse(localStorage.getItem('hh_blockchain_state') || '{}')
                return { balance: state.platformBalance || 0 }
            },

            // NFT
            'nft/list': () => {
                const state = JSON.parse(localStorage.getItem('hh_blockchain_state') || '{}')
                return state.nfts || []
            },
            'nft/getByUser': () => {
                const telegramId = params?.telegramId || body?.telegramId
                if (!telegramId) throw new Error('telegramId is required')
                const state = JSON.parse(localStorage.getItem('hh_blockchain_state') || '{}')
                const nfts = state.nfts || []
                return nfts.filter(n => n.ownerId === String(telegramId))
            },

            // User
            'user/profile': () => {
                const telegramId = params?.telegramId || body?.telegramId
                if (!telegramId) throw new Error('telegramId is required')
                const users = JSON.parse(localStorage.getItem('hh_users') || '[]')
                const user = users.find(u => String(u.id) === String(telegramId))
                if (!user) throw new Error('User not found')
                const state = JSON.parse(localStorage.getItem('hh_blockchain_state') || '{}')
                const nfts = (state.nfts || []).filter(n => n.ownerId === String(telegramId))
                return {
                    ...user,
                    nftCount: nfts.length,
                    balance: (state.internalLedger || state.balances || {})[String(telegramId)] || 0,
                }
            },

            // Auctions
            'auction/list': () => JSON.parse(localStorage.getItem('hh_auctions') || '[]'),

            // Admin
            'admin/stats': () => {
                const users = JSON.parse(localStorage.getItem('hh_users') || '[]')
                const state = JSON.parse(localStorage.getItem('hh_blockchain_state') || '{}')
                const auctions = JSON.parse(localStorage.getItem('hh_auctions') || '[]')
                return {
                    totalUsers: users.length,
                    activeUsers: users.filter(u => u.status === 'active').length,
                    totalNFTs: (state.nfts || []).length,
                    activeAuctions: auctions.filter(a => a.endsAt > Date.now()).length,
                    platformBalance: state.platformBalance || 0,
                }
            },
            'admin/logs': () => {
                const logs = JSON.parse(localStorage.getItem('hh_activity_log') || '[]')
                return logs.slice(-100).reverse()
            },
            'admin/apikeys': () => apiKeyManager.getAll(),
            'admin/apps': () => appManager.getAll(),

            // Clicker
            'clicker/state': () => {
                const uid = body?.userId || 'anon'
                return {
                    balance: parseFloat(localStorage.getItem(`hh_clicker_bal_${uid}`) || '0'),
                    energy: JSON.parse(localStorage.getItem(`hh_clicker_energy_${uid}`) || '{}'),
                    earned: JSON.parse(localStorage.getItem(`hh_clicker_earned_${uid}`) || '{}'),
                }
            },
        }

        const handler = handlers[endpoint]
        if (handler) return handler()
        throw new Error(`Unknown endpoint: ${endpoint}`)
    }
}

export const api = new APIClient(API_BASE)
export default api
