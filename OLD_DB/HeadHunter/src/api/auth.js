// ── Auth API ──
import api from './index'

export const authAPI = {
    login: (telegramId) => api.request('auth/login', { method: 'POST', body: { telegramId } }),
    getUsers: () => api.request('auth/users'),
    getUser: (id) => api.request('auth/user', { params: { id } }),
    blockUser: (id) => api.request('auth/block', { method: 'POST', body: { id } }),
    unblockUser: (id) => api.request('auth/unblock', { method: 'POST', body: { id } }),
}

export default authAPI
