import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import logger from './logger.js'
import { emitToUser, emitToAuction, broadcast } from './realtimeService.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let DB_PATH = join(__dirname, 'data', 'headhunter.db')

export function setDBPath(path) {
    DB_PATH = path
    db = null
}

let db = null

export async function getDB() {
    if (db) return db
    
    db = await open({
        filename: DB_PATH,
        driver: sqlite3.Database
    })

    // Enable WAL mode for better concurrency
    await db.exec('PRAGMA journal_mode = WAL')
    await db.exec('PRAGMA synchronous = NORMAL')

    // Create tables if not exist
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            telegram_id TEXT UNIQUE,
            username TEXT,
            first_name TEXT,
            last_name TEXT,
            avatar TEXT,
            balance REAL DEFAULT 0,
            role TEXT DEFAULT 'user',
            is_blocked INTEGER DEFAULT 0,
            wallet_address TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS nfts (
            id TEXT PRIMARY KEY,
            name TEXT,
            image TEXT,
            emoji TEXT,
            is_gif INTEGER DEFAULT 0,
            collection_id TEXT,
            collection_name TEXT,
            owner_id INTEGER,
            creator_id INTEGER,
            upgrade TEXT,
            status TEXT,
            on_chain_index INTEGER,
            mint_tx_hash TEXT,
            on_chain_collection TEXT,
            first_name TEXT,
            last_name TEXT,
            color TEXT,
            sticker_file_id TEXT,
            sticker_unique_id TEXT,
            price_paid REAL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS auctions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nft_id TEXT,
            creator_id INTEGER,
            start_price REAL,
            buy_now_price REAL,
            current_bid REAL,
            current_bidder_id INTEGER,
            bid_step REAL,
            status TEXT DEFAULT 'active',
            ends_at INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            type TEXT,
            amount REAL,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS invite_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE,
            created_by INTEGER,
            is_used INTEGER DEFAULT 0,
            used_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            type TEXT,
            message TEXT,
            is_read INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `)

    logger.info(`[DB] SQLite initialized: ${DB_PATH}`)
    return db
}

/**
 * Helper for running code within a transaction.
 */
export async function withTransaction(fn) {
    const database = await getDB()
    await database.exec('BEGIN IMMEDIATE')
    try {
        const result = await fn(database)
        await database.exec('COMMIT')
        return result
    } catch (error) {
        await database.exec('ROLLBACK')
        throw error
    }
}

// ═══════════════════════════════════════
// USER OPERATIONS
// ═══════════════════════════════════════

export async function upsertUser(user) {
    const database = await getDB()
    await database.run(`
        INSERT INTO users (telegram_id, username, first_name, last_name, avatar)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(telegram_id) DO UPDATE SET
            username = excluded.username,
            first_name = excluded.first_name,
            last_name = excluded.last_name,
            avatar = excluded.avatar
    `, [user.telegram_id, user.username, user.first_name, user.last_name, user.avatar])
    return database.get('SELECT * FROM users WHERE telegram_id = ?', user.telegram_id)
}

export async function getUserById(id) {
    const database = await getDB()
    return database.get('SELECT * FROM users WHERE id = ?', id)
}

export async function getUserByTelegramId(tgId) {
    const database = await getDB()
    return database.get('SELECT * FROM users WHERE telegram_id = ?', tgId)
}

export async function getAllUsers() {
    const database = await getDB()
    return database.all('SELECT * FROM users ORDER BY created_at DESC')
}

export async function updateUserBalance(userId, amount, type, description) {
    return withTransaction(async (tx) => {
        const user = await tx.get('SELECT balance FROM users WHERE id = ?', userId)
        if (!user) throw new Error('User not found')
        
        const newBalance = user.balance + amount
        if (newBalance < 0) throw new Error('Insufficient balance')

        await tx.run('UPDATE users SET balance = ? WHERE id = ?', [newBalance, userId])
        await tx.run('INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)', 
            [userId, type, amount, description])
        
        const updatedUser = await tx.get('SELECT * FROM users WHERE id = ?', userId)
        
        // Emit balance update to the specific user's room
        emitToUser(userId, 'balance_updated', {
            balance: updatedUser.balance,
            change: amount,
            type,
            description
        })

        return updatedUser
    })
}

export async function getLeaderboard() {
    const database = await getDB()
    return database.all(`
        SELECT u.id, u.telegram_id, u.username, u.first_name, u.avatar, u.balance, u.role,
               (SELECT COUNT(*) FROM nfts WHERE owner_id = u.id AND status = 'active') as nft_count
        FROM users u
        ORDER BY balance DESC LIMIT 100
    `)
}

export async function updateWalletAddress(userId, address) {
    const database = await getDB()
    await database.run('UPDATE users SET wallet_address = ? WHERE id = ?', [address, userId])
    return database.get('SELECT * FROM users WHERE id = ?', userId)
}

// ═══════════════════════════════════════
// NFT OPERATIONS
// ═══════════════════════════════════════

export async function createNFT(nft) {
    const database = await getDB()
    await database.run(`
        INSERT INTO nfts (id, name, image, emoji, is_gif, collection_id, collection_name, owner_id, creator_id, upgrade, status, on_chain_index, mint_tx_hash, on_chain_collection, first_name, last_name, color)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [nft.id, nft.name, nft.image, nft.emoji, nft.isGif ? 1 : 0, nft.collectionId, nft.collectionName, nft.ownerId, nft.creatorId, nft.upgrade ? JSON.stringify(nft.upgrade) : null, 'active', nft.onChainIndex, nft.mintTxHash, nft.onChainCollection, nft.firstName, nft.lastName, nft.color])
    return database.get('SELECT * FROM nfts WHERE id = ?', nft.id)
}

export async function getNFTByOnChainIndex(index) {
    const database = await getDB()
    return database.get('SELECT * FROM nfts WHERE on_chain_index = ?', index)
}

export async function getAllNFTs() {
    const database = await getDB()
    return database.all('SELECT * FROM nfts ORDER BY on_chain_index ASC')
}

export async function getUserNFTs(userId) {
    const database = await getDB()
    // Join with auctions to exclude NFTs currently on sale if needed, 
    // or just mark them as "on sale"
    return database.all(`
        SELECT n.*, 
               (SELECT id FROM auctions WHERE nft_id = n.id AND status = 'active') as active_auction_id
        FROM nfts n 
        WHERE owner_id = ?
    `, userId)
}

export async function updateNFTOwner(nftId, ownerId, pricePaid = null) {
    const database = await getDB()
    await database.run('UPDATE nfts SET owner_id = ?, price_paid = COALESCE(?, price_paid) WHERE id = ?', [ownerId, pricePaid, nftId])
    return database.get('SELECT * FROM nfts WHERE id = ?', nftId)
}

export async function assignNFTToIndex(index, userId, collection, status = 'active') {
    const database = await getDB()
    const existing = await database.get('SELECT id FROM nfts WHERE on_chain_index = ?', index)
    if (existing) {
        await database.run('UPDATE nfts SET owner_id = ?, status = ? WHERE id = ?', [userId, status, existing.id])
    } else {
        const id = `nft_assigned_${Date.now()}_${index}`
        await database.run(`
            INSERT INTO nfts (id, name, owner_id, creator_id, status, on_chain_index, on_chain_collection)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [id, `HeadHunter NFT #${index}`, userId, userId, status, index, collection])
    }
}

// ═══════════════════════════════════════
// AUCTION OPERATIONS
// ═══════════════════════════════════════

export async function getActiveAuctions() {
    const database = await getDB()
    return database.all(`
        SELECT a.*, n.name, n.image, n.emoji, n.collection_name
        FROM auctions a JOIN nfts n ON a.nft_id = n.id
        WHERE a.status = 'active'
    `)
}

export async function getUserAuctions(userId) {
    const database = await getDB()
    return database.all(`
        SELECT a.*, n.name, n.image, n.emoji, n.collection_name, n.color
        FROM auctions a 
        JOIN nfts n ON a.nft_id = n.id
        WHERE a.creator_id = ? OR a.current_bidder_id = ?
        ORDER BY a.created_at DESC
    `, [userId, userId])
}

export async function processAuctionBid(auctionId, userId, amount, commissionRate) {
    return withTransaction(async (tx) => {
        const auction = await tx.get('SELECT * FROM auctions WHERE id = ? AND status = "active"', auctionId)
        if (!auction) throw new Error('Auction not found')
        
        if (auction.ends_at && Date.now() > auction.ends_at) throw new Error('Auction ended')

        if (amount <= auction.current_bid) throw new Error('Bid too low')
        
        // Prevent bidding on own auction
        if (String(auction.creator_id) === String(userId)) {
            throw new Error('You cannot bid on your own auction')
        }

        // Refund previous bidder
        if (auction.current_bidder_id) {
            await tx.run('UPDATE users SET balance = balance + ? WHERE id = ?', [auction.current_bid, auction.current_bidder_id])
            emitToUser(auction.current_bidder_id, 'outbid', {
                auctionId,
                newBid: amount,
                refund: auction.current_bid
            })
        }

        // Lock new bid
        await tx.run('UPDATE users SET balance = balance - ? WHERE id = ?', [amount, userId])
        await tx.run('UPDATE auctions SET current_bid = ?, current_bidder_id = ? WHERE id = ?', [amount, userId, auctionId])
        
        const nft = await tx.get('SELECT name FROM nfts WHERE id = ?', auction.nft_id)
        
        // Broadcast new bid to the auction room
        emitToAuction(auctionId, 'new_bid', {
            auctionId,
            currentBid: amount,
            currentBidderId: userId
        })

        return { success: true, previousBidderId: auction.current_bidder_id, previousAmount: auction.current_bid, nftName: nft.name }
    })
}

export async function processAuctionBuyNow(auctionId, userId, commissionRate) {
    return withTransaction(async (tx) => {
        const auction = await tx.get('SELECT * FROM auctions WHERE id = ? AND status = "active"', auctionId)
        if (!auction || !auction.buy_now_price) throw new Error('Buy now unavailable')

        if (auction.ends_at && Date.now() > auction.ends_at) throw new Error('Auction ended')

        // Prevent buying own auction
        if (String(auction.creator_id) === String(userId)) {
            throw new Error('You cannot buy your own auction')
        }

        // Refund current bidder if any
        if (auction.current_bidder_id) {
            await tx.run('UPDATE users SET balance = balance + ? WHERE id = ?', [auction.current_bid, auction.current_bidder_id])
            emitToUser(auction.current_bidder_id, 'auction_cancelled', {
                auctionId,
                refund: auction.current_bid,
                reason: 'buy_now'
            })
        }

        // Deduct price from buyer
        await tx.run('UPDATE users SET balance = balance - ? WHERE id = ?', [auction.buy_now_price, userId])
        
        // Payout creator
        const commission = auction.buy_now_price * commissionRate
        const payout = auction.buy_now_price - commission
        await tx.run('UPDATE users SET balance = balance + ? WHERE id = ?', [payout, auction.creator_id])

        // Transfer NFT and close auction
        await tx.run('UPDATE nfts SET owner_id = ? WHERE id = ?', [userId, auction.nft_id])
        await tx.run('UPDATE auctions SET status = "claimed" WHERE id = ?', auctionId)
        
        const nft = await tx.get('SELECT name FROM nfts WHERE id = ?', auction.nft_id)
        
        // Broadcast auction closed
        emitToAuction(auctionId, 'auction_closed', {
            auctionId,
            winnerId: userId,
            type: 'buy_now',
            price: auction.buy_now_price
        })

        return { success: true, nftName: nft.name }
    })
}

export async function processAuctionCancel(auctionId, userId) {
    return withTransaction(async (tx) => {
        const auction = await tx.get('SELECT * FROM auctions WHERE id = ? AND status = "active"', auctionId)
        if (!auction) throw new Error('Auction not found')
        
        if (String(auction.creator_id) !== String(userId)) {
            throw new Error('Only the creator can cancel this auction')
        }

        // If there are bids, we generally don't allow cancellation unless it's a special case.
        // For now, let's allow it but refund the bidder.
        if (auction.current_bidder_id) {
            await tx.run('UPDATE users SET balance = balance + ? WHERE id = ?', [auction.current_bid, auction.current_bidder_id])
            emitToUser(auction.current_bidder_id, 'auction_cancelled', {
                auctionId,
                refund: auction.current_bid,
                reason: 'creator_cancelled'
            })
        }

        await tx.run('UPDATE auctions SET status = "cancelled" WHERE id = ?', auctionId)
        
        // Return NFT to creator (it was already theirs, but status might change)
        await tx.run('UPDATE nfts SET status = "active" WHERE id = ?', auction.nft_id)

        emitToAuction(auctionId, 'auction_closed', {
            auctionId,
            type: 'cancelled'
        })

        return { success: true }
    })
}

export async function processAuctionClaim(auctionId, userId, commissionRate) {
    return withTransaction(async (tx) => {
        const auction = await tx.get('SELECT * FROM auctions WHERE id = ? AND status = "active"', auctionId)
        if (!auction) throw new Error('Auction not found')
        
        // Handle no bids
        if (!auction.current_bidder_id) {
            await tx.run('UPDATE auctions SET status = "ended_no_bids" WHERE id = ?', auctionId)
            await tx.run('UPDATE nfts SET status = "active" WHERE id = ?', auction.nft_id)
            emitToAuction(auctionId, 'auction_closed', {
                auctionId,
                type: 'no_bids'
            })
            return { success: true, message: 'Auction ended with no bids.' }
        }

        // Finalize settlement
        const commission = auction.current_bid * commissionRate
        const payout = auction.current_bid - commission
        await tx.run('UPDATE users SET balance = balance + ? WHERE id = ?', [payout, auction.creator_id])
        
        await tx.run('UPDATE nfts SET owner_id = ? WHERE id = ?', [auction.current_bidder_id, auction.nft_id])
        await tx.run('UPDATE auctions SET status = "claimed" WHERE id = ?', auctionId)
        
        const nft = await tx.get('SELECT name FROM nfts WHERE id = ?', auction.nft_id)
        
        // Broadcast auction closed
        emitToAuction(auctionId, 'auction_closed', {
            auctionId,
            winnerId: auction.current_bidder_id,
            type: 'claim',
            price: auction.current_bid
        })

        return { success: true, winnerId: auction.current_bidder_id, winAmount: auction.current_bid, nftName: nft.name, creatorId: auction.creator_id }
    })
}

// ═══════════════════════════════════════
// INVITE CODES & ADMIN
// ═══════════════════════════════════════

export async function useInviteCode(code, userId) {
    const database = await getDB()
    await database.run('UPDATE invite_codes SET is_used = 1, used_by = ? WHERE code = ?', [userId, code])
}

export async function getAllInviteCodes() {
    const database = await getDB()
    return database.all('SELECT * FROM invite_codes ORDER BY created_at DESC')
}

export async function addInviteCodeDB(code, createdBy) {
    const database = await getDB()
    await database.run('INSERT INTO invite_codes (code, created_by) VALUES (?, ?)', [code, createdBy])
    return database.get('SELECT * FROM invite_codes WHERE code = ?', code)
}

export async function removeInviteCodeDB(code) {
    const database = await getDB()
    await database.run('DELETE FROM invite_codes WHERE code = ?', code)
}

export async function toggleBlockUser(userId) {
    const database = await getDB()
    await database.run('UPDATE users SET is_blocked = (is_blocked = 0) WHERE id = ?', userId)
    return database.get('SELECT * FROM users WHERE id = ?', userId)
}

export async function deleteUserById(userId) {
    const database = await getDB()
    await database.run('DELETE FROM users WHERE id = ?', userId)
}

export async function updateUserRole(userId, role) {
    const database = await getDB()
    await database.run('UPDATE users SET role = ? WHERE id = ?', [role, userId])
    return database.get('SELECT * FROM users WHERE id = ?', userId)
}

export async function getAdminUsers() {
    const database = await getDB()
    return database.all('SELECT * FROM users WHERE role = "admin"')
}
