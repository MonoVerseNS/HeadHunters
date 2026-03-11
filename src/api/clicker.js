// ── Clicker API ──
import api from './index'

export const clickerAPI = {
    getState: (userId) => api.request('clicker/state', { body: { userId } }),
    tap: (userId) => api.request('clicker/tap', { method: 'POST', body: { userId } }),
    withdraw: (userId, amount) => api.request('clicker/withdraw', { method: 'POST', body: { userId, amount } }),
}

export default clickerAPI
