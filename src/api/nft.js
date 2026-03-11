// ── NFT API ──
import api from './index'

export const nftAPI = {
    list: (params) => api.request('nft/list', { params }),
    get: (id) => api.request('nft/get', { params: { id } }),
    create: (data) => api.request('nft/create', { method: 'POST', body: data }),
    upgrade: (id, upgradeData) => api.request('nft/upgrade', { method: 'POST', body: { id, ...upgradeData } }),
    transfer: (id, targetUserId) => api.request('nft/transfer', { method: 'POST', body: { id, targetUserId } }),
    withdraw: (id, walletAddress) => api.request('nft/withdraw', { method: 'POST', body: { id, walletAddress } }),
}

export default nftAPI
