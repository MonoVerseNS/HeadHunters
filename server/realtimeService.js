import logger from './logger.js'

let io = null

export function initRealtime(socketIoInstance) {
    io = socketIoInstance
    
    io.on('connection', (socket) => {
        logger.info(`[WS] Client connected: ${socket.id}`)
        
        socket.on('join_user', (userId) => {
            socket.join(`user_${userId}`)
            logger.debug(`[WS] User ${userId} joined room user_${userId}`)
        })

        socket.on('join_auction', (auctionId) => {
            socket.join(`auction_${auctionId}`)
            logger.debug(`[WS] Client joined room auction_${auctionId}`)
        })

        socket.on('disconnect', () => {
            logger.info(`[WS] Client disconnected: ${socket.id}`)
        })
    })
}

/**
 * Emit event to a specific user
 */
export function emitToUser(userId, event, data) {
    if (!io) return
    io.to(`user_${userId}`).emit(event, data)
    logger.debug(`[WS] Emitted ${event} to user ${userId}`)
}

/**
 * Emit event to an auction room (e.g., new bid)
 */
export function emitToAuction(auctionId, event, data) {
    if (!io) return
    io.to(`auction_${auctionId}`).emit(event, data)
    logger.debug(`[WS] Emitted ${event} to auction ${auctionId}`)
}

/**
 * Broadcast event to all clients
 */
export function broadcast(event, data) {
    if (!io) return
    io.emit(event, data)
}
