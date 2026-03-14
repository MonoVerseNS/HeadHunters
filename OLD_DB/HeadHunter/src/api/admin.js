// ── Admin API ──
import api from './index'

export const adminAPI = {
    getStats: () => api.request('admin/stats'),
    getLogs: (params) => api.request('admin/logs', { params }),
    mint: (amount) => api.request('admin/mint', { method: 'POST', body: { amount } }),
    banUser: (userId) => api.request('admin/ban', { method: 'POST', body: { userId } }),
    getEndpoints: () => api.request('admin/endpoints'),
}

export default adminAPI
