// ── IndexedDB SQL-like Storage ──
// Tables: users, nfts, auctions, transactions, api_keys, apps, logs
// Provides db.query(), db.insert(), db.update(), db.delete(), db.getAll()
// Falls back to localStorage during migration

const DB_NAME = 'headhunter_db'
const DB_VERSION = 1
const TABLES = ['users', 'nfts', 'auctions', 'transactions', 'api_keys', 'apps', 'logs']

class HeadHuntersDB {
    constructor() {
        this.db = null
        this.ready = this._init()
    }

    async _init() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION)

            req.onupgradeneeded = (e) => {
                const db = e.target.result
                for (const table of TABLES) {
                    if (!db.objectStoreNames.contains(table)) {
                        const store = db.createObjectStore(table, { keyPath: 'id' })
                        // Common indexes
                        if (table === 'users') store.createIndex('telegramId', 'telegramId', { unique: false })
                        if (table === 'nfts') store.createIndex('ownerId', 'ownerId', { unique: false })
                        if (table === 'auctions') store.createIndex('creatorId', 'creatorId', { unique: false })
                        if (table === 'api_keys') store.createIndex('type', 'type', { unique: false })
                        if (table === 'apps') store.createIndex('apiKeyId', 'apiKeyId', { unique: false })
                        if (table === 'logs') store.createIndex('action', 'action', { unique: false })
                        if (table === 'logs') store.createIndex('userId', 'userId', { unique: false })
                    }
                }
            }

            req.onsuccess = (e) => {
                this.db = e.target.result
                this._migrateFromLocalStorage()
                resolve()
            }

            req.onerror = (e) => {
                console.error('IndexedDB error:', e)
                reject(e)
            }
        })
    }

    // Migrate data from localStorage on first run
    async _migrateFromLocalStorage() {
        const migrated = localStorage.getItem('hh_db_migrated')
        if (migrated) return

        try {
            // Migrate users
            const users = JSON.parse(localStorage.getItem('hh_users') || '[]')
            for (const u of users) {
                if (u.id) await this.insert('users', u).catch(() => { })
            }

            // Migrate blockchain state -> nfts, transactions
            const state = JSON.parse(localStorage.getItem('hh_blockchain_state') || '{}')
            if (state.nfts) {
                for (const n of state.nfts) {
                    if (n.id) await this.insert('nfts', n).catch(() => { })
                }
            }
            if (state.transactions) {
                for (const t of state.transactions) {
                    if (t.id) await this.insert('transactions', t).catch(() => { })
                }
            }

            // Migrate auctions
            const auctions = JSON.parse(localStorage.getItem('hh_auctions') || '[]')
            for (const a of auctions) {
                if (a.id) await this.insert('auctions', a).catch(() => { })
            }

            // Migrate logs
            const logs = JSON.parse(localStorage.getItem('hh_activity_log') || '[]')
            for (const l of logs) {
                if (l.id) await this.insert('logs', l).catch(() => { })
            }

            localStorage.setItem('hh_db_migrated', 'true')
            console.log('[DB] Migration from localStorage complete')
        } catch (e) {
            console.error('[DB] Migration error:', e)
        }
    }

    // ── CRUD Operations ──

    async getAll(table) {
        await this.ready
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(table, 'readonly')
            const store = tx.objectStore(table)
            const req = store.getAll()
            req.onsuccess = () => resolve(req.result || [])
            req.onerror = () => reject(req.error)
        })
    }

    async getById(table, id) {
        await this.ready
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(table, 'readonly')
            const store = tx.objectStore(table)
            const req = store.get(id)
            req.onsuccess = () => resolve(req.result || null)
            req.onerror = () => reject(req.error)
        })
    }

    async query(table, filter = {}) {
        const all = await this.getAll(table)
        return all.filter(row => {
            for (const [key, value] of Object.entries(filter)) {
                if (row[key] !== value) return false
            }
            return true
        })
    }

    async queryByIndex(table, indexName, value) {
        await this.ready
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(table, 'readonly')
            const store = tx.objectStore(table)
            const index = store.index(indexName)
            const req = index.getAll(value)
            req.onsuccess = () => resolve(req.result || [])
            req.onerror = () => reject(req.error)
        })
    }

    async insert(table, row) {
        await this.ready
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(table, 'readwrite')
            const store = tx.objectStore(table)
            const req = store.add(row)
            req.onsuccess = () => resolve(row)
            req.onerror = () => reject(req.error)
        })
    }

    async upsert(table, row) {
        await this.ready
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(table, 'readwrite')
            const store = tx.objectStore(table)
            const req = store.put(row)
            req.onsuccess = () => resolve(row)
            req.onerror = () => reject(req.error)
        })
    }

    async update(table, id, changes) {
        await this.ready
        const existing = await this.getById(table, id)
        if (!existing) return null
        const updated = { ...existing, ...changes }
        return this.upsert(table, updated)
    }

    async delete(table, id) {
        await this.ready
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(table, 'readwrite')
            const store = tx.objectStore(table)
            const req = store.delete(id)
            req.onsuccess = () => resolve(true)
            req.onerror = () => reject(req.error)
        })
    }

    async count(table) {
        await this.ready
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(table, 'readonly')
            const store = tx.objectStore(table)
            const req = store.count()
            req.onsuccess = () => resolve(req.result)
            req.onerror = () => reject(req.error)
        })
    }

    async clear(table) {
        await this.ready
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(table, 'readwrite')
            const store = tx.objectStore(table)
            const req = store.clear()
            req.onsuccess = () => resolve(true)
            req.onerror = () => reject(req.error)
        })
    }
}

export const db = new HeadHuntersDB()
export default db
