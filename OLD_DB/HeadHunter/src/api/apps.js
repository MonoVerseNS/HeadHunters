// ── API Apps Management ──
// Applications with API key bindings and endpoint access control.

import { generateId } from '../config'

const STORAGE_KEY = 'hh_apps'

class AppManager {
    constructor() {
        this.apps = this._load()
    }

    _load() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
        } catch { return [] }
    }

    _save() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.apps))
    }

    // Create a new app
    create({ name, description = '', apiKeyId = null, allowedEndpoints = [] }) {
        const app = {
            id: generateId('app'),
            name,
            description,
            apiKeyId,
            allowedEndpoints,
            createdAt: new Date().toISOString(),
            isActive: true,
            requestCount: 0,
        }
        this.apps.push(app)
        this._save()
        return app
    }

    getAll() {
        return [...this.apps]
    }

    getById(id) {
        return this.apps.find(a => a.id === id) || null
    }

    update(id, changes) {
        const app = this.apps.find(a => a.id === id)
        if (!app) return null
        Object.assign(app, changes)
        this._save()
        return app
    }

    delete(id) {
        this.apps = this.apps.filter(a => a.id !== id)
        this._save()
    }

    toggleActive(id) {
        const app = this.apps.find(a => a.id === id)
        if (!app) return null
        app.isActive = !app.isActive
        this._save()
        return app
    }

    recordRequest(id) {
        const app = this.apps.find(a => a.id === id)
        if (app) {
            app.requestCount++
            this._save()
        }
    }
}

export const appManager = new AppManager()
export default appManager
