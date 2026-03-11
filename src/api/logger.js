// ── Activity Logger ──
// Logs all platform activities. Persisted in localStorage.
// Used by admin console for monitoring.

const LOG_KEY = 'hh_activity_log'
const MAX_LOGS = 500

class ActivityLogger {
    constructor() {
        this.logs = this._load()
    }

    _load() {
        try {
            return JSON.parse(localStorage.getItem(LOG_KEY) || '[]')
        } catch {
            return []
        }
    }

    _save() {
        // Keep only last MAX_LOGS entries
        if (this.logs.length > MAX_LOGS) {
            this.logs = this.logs.slice(-MAX_LOGS)
        }
        localStorage.setItem(LOG_KEY, JSON.stringify(this.logs))
    }

    log(action, details = {}) {
        const entry = {
            id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            timestamp: new Date().toISOString(),
            action,
            ...details,
        }
        this.logs.push(entry)
        this._save()
        return entry
    }

    // Specific log methods
    userAction(userId, action, details) {
        return this.log(action, { userId, ...details })
    }

    nftAction(nftId, action, details) {
        return this.log(action, { nftId, ...details })
    }

    auctionAction(auctionId, action, details) {
        return this.log(action, { auctionId, ...details })
    }

    walletAction(userId, action, amount, details) {
        return this.log(action, { userId, amount, ...details })
    }

    // Query
    getAll() {
        return [...this.logs].reverse()
    }

    getByAction(action) {
        return this.logs.filter(l => l.action === action).reverse()
    }

    getByUser(userId) {
        return this.logs.filter(l => l.userId === userId).reverse()
    }

    getLast(n = 50) {
        return this.logs.slice(-n).reverse()
    }

    clear() {
        this.logs = []
        this._save()
    }
}

export const logger = new ActivityLogger()
export default logger
