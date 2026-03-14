// ── Auction API ──
import api from './index'

export const auctionAPI = {
    list: (params) => api.request('auction/list', { params }),
    get: (id) => api.request('auction/get', { params: { id } }),
    create: (data) => api.request('auction/create', { method: 'POST', body: data }),
    placeBid: (auctionId, amount) => api.request('auction/bid', { method: 'POST', body: { auctionId, amount } }),
    buyNow: (auctionId) => api.request('auction/buyNow', { method: 'POST', body: { auctionId } }),
    cancel: (auctionId) => api.request('auction/cancel', { method: 'POST', body: { auctionId } }),
    claim: (auctionId) => api.request('auction/claim', { method: 'POST', body: { auctionId } }),
}

export default auctionAPI
