// ── Wallet API ──
import api from './index'

export const walletAPI = {
    getBalance: (userId) => api.request('wallet/balance', { params: { userId } }),
    getPlatformBalance: () => api.request('wallet/platform'),
    deposit: (userId, amount) => api.request('wallet/deposit', { method: 'POST', body: { userId, amount } }),
    withdraw: (userId, amount, address) => api.request('wallet/withdraw', { method: 'POST', body: { userId, amount, address } }),
    transfer: (fromId, toId, amount) => api.request('wallet/transfer', { method: 'POST', body: { fromId, toId, amount } }),
}

export default walletAPI
