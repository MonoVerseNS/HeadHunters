import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const DB_PATH = join(__dirname, 'data', 'headhunter.db')

let db = null

export async function getDB() {
    if (db) return db

    db = await open({
        filename: DB_PATH,
        driver: sqlite3.Database
    })

    // Create tables
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            telegram_id TEXT UNIQUE NOT NULL,
            username TEXT,
            first_name TEXT,
            last_name TEXT,
            avatar TEXT,
            role TEXT DEFAULT 'user',
            balance REAL DEFAULT 0,
            wallet_address TEXT,
            is_blocked INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login DATETIME
        );

        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL,
            amount REAL NOT NULL,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS custodial_wallets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER UNIQUE NOT NULL,
            address TEXT NOT NULL,
            encrypted_mnemonic TEXT NOT NULL,
            public_key TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS gift_sync (
            telegram_id TEXT PRIMARY KEY,
            pinned_gifts TEXT,
            folders TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS nfts (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            image TEXT,
            emoji TEXT,
            is_gif INTEGER DEFAULT 0,
            collection_id TEXT,
            collection_name TEXT,
            owner_id INTEGER NOT NULL,
            creator_id INTEGER NOT NULL,
            upgrade TEXT,
            status TEXT DEFAULT 'active',
            on_chain_index INTEGER,
            mint_tx_hash TEXT,
            on_chain_collection TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(owner_id) REFERENCES users(id),
            FOREIGN KEY(creator_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS auctions (
            id TEXT PRIMARY KEY,
            nft_id TEXT NOT NULL,
            creator_id INTEGER NOT NULL,
            start_price REAL NOT NULL,
            current_bid REAL NOT NULL,
            current_bidder_id INTEGER,
            bid_step REAL DEFAULT 1,
            buy_now_price REAL,
            is_direct_sale INTEGER DEFAULT 0,
            ends_at INTEGER NOT NULL,
            status TEXT DEFAULT 'active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(nft_id) REFERENCES nfts(id),
            FOREIGN KEY(creator_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS bids (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            auction_id TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(auction_id) REFERENCES auctions(id),
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
    `)

    // Migration: add wallet_address if missing
    try {
        await db.exec(`ALTER TABLE users ADD COLUMN wallet_address TEXT`)
    } catch (e) {
        // Column already exists
    }

    // Migration: add tx_hash to transactions for donation dedup
    try {
        await db.exec(`ALTER TABLE transactions ADD COLUMN tx_hash TEXT`)
    } catch (e) {
        // Column already exists
    }

    // Migration: add color to nfts if missing
    try {
        await db.exec(`ALTER TABLE nfts ADD COLUMN color TEXT`)
    } catch (e) {
        // Column already exists
    }

    // Migration: add price_paid to nfts if missing
    try {
        await db.exec(`ALTER TABLE nfts ADD COLUMN price_paid REAL DEFAULT 0`)
    } catch (e) {
        // Column already exists
    }

    // Migration: add sticker_file_id for Telegram sticker linking
    try {
        await db.exec(`ALTER TABLE nfts ADD COLUMN sticker_file_id TEXT`)
    } catch (e) {
        // Column already exists
    }
    try {
        await db.exec(`ALTER TABLE nfts ADD COLUMN sticker_unique_id TEXT`)
    } catch (e) {
        // Column already exists
    }

    console.log('[DB] SQLite initialized:', DB_PATH)
    return db
}

// ═══════════════════════════════════════
// QUERIES
// ═══════════════════════════════════════

export async function upsertUser({ telegram_id, username, first_name, last_name, avatar }) {
    const db = await getDB()
    const existing = await db.get('SELECT * FROM users WHERE telegram_id = ?', telegram_id)

    if (existing) {
        await db.run(
            `UPDATE users SET username = ?, first_name = ?, last_name = ?, avatar = ?, last_login = CURRENT_TIMESTAMP WHERE telegram_id = ?`,
            username || existing.username,
            first_name || existing.first_name,
            last_name ?? existing.last_name,
            avatar || existing.avatar,
            telegram_id
        )
        return db.get('SELECT * FROM users WHERE telegram_id = ?', telegram_id)
    }

    // New user
    const DEFAULT_ADMIN_TG_ID = '5178670546'
    const role = telegram_id === DEFAULT_ADMIN_TG_ID ? 'admin' : 'user'
    const result = await db.run(
        `INSERT INTO users (telegram_id, username, first_name, last_name, avatar, role, last_login) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        telegram_id, username, first_name, last_name, avatar, role
    )
    return db.get('SELECT * FROM users WHERE id = ?', result.lastID)
}

export async function getUserById(id) {
    const db = await getDB()
    return db.get('SELECT * FROM users WHERE id = ?', id)
}

export async function getUserByTelegramId(telegramId) {
    const db = await getDB()
    return db.get('SELECT * FROM users WHERE telegram_id = ?', telegramId)
}

export async function updateUserBalance(userId, amount, type, description) {
    const db = await getDB()
    const user = await db.get('SELECT * FROM users WHERE id = ?', userId)
    if (!user) throw new Error('User not found')

    // Update internal DB balance (delta from on-chain)
    await db.run('UPDATE users SET balance = balance + ? WHERE id = ?', amount, userId)

    // Log the transaction
    await db.run(
        'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
        userId, type, amount, description
    )
    return db.get('SELECT * FROM users WHERE id = ?', userId)
}

export async function getUserTransactions(userId) {
    const db = await getDB()
    return db.all('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', userId)
}

export async function getAllUsers() {
    const db = await getDB()
    return db.all('SELECT * FROM users ORDER BY created_at DESC')
}

export async function getLeaderboard() {
    const db = await getDB()
    return db.all(`
        SELECT u.id, u.telegram_id, u.username, u.first_name, u.avatar, u.balance, u.role,
               (SELECT COUNT(*) FROM nfts WHERE owner_id = u.id AND status = 'active') as nft_count
        FROM users u
        ORDER BY balance DESC LIMIT 100
    `)
}

export async function updateWalletAddress(userId, address) {
    const db = await getDB()
    await db.run('UPDATE users SET wallet_address = ? WHERE id = ?', address, userId)
    return db.get('SELECT * FROM users WHERE id = ?', userId)
}

// ═══════════════════════════════════════
// ADMIN OPERATIONS
// ═══════════════════════════════════════

export async function toggleBlockUser(userId) {
    const db = await getDB()
    const user = await db.get('SELECT * FROM users WHERE id = ?', userId)
    if (!user) throw new Error('User not found')
    const newBlocked = user.is_blocked ? 0 : 1
    await db.run('UPDATE users SET is_blocked = ? WHERE id = ?', newBlocked, userId)
    return db.get('SELECT * FROM users WHERE id = ?', userId)
}

export async function deleteUserById(userId) {
    const db = await getDB()
    await db.run('DELETE FROM transactions WHERE user_id = ?', userId)
    await db.run('DELETE FROM users WHERE id = ?', userId)
    return { success: true }
}

export async function updateUserRole(userId, role) {
    const db = await getDB()
    await db.run('UPDATE users SET role = ? WHERE id = ?', role, userId)
    return db.get('SELECT * FROM users WHERE id = ?', userId)
}

export async function getAdminUsers() {
    const db = await getDB()
    return db.all("SELECT id, telegram_id, username, first_name, role FROM users WHERE role = 'admin'")
}

// ═══════════════════════════════════════
// INVITE CODES
// ═══════════════════════════════════════

export async function initInviteCodesTable() {
    const db = await getDB()
    await db.exec(`
        CREATE TABLE IF NOT EXISTS invite_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            created_by INTEGER,
            used_by INTEGER,
            is_used INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `)
}

export async function addInviteCodeDB(code, createdBy) {
    const db = await getDB()
    await initInviteCodesTable()
    await db.run('INSERT INTO invite_codes (code, created_by) VALUES (?, ?)', code, createdBy)
    return db.get('SELECT * FROM invite_codes WHERE code = ?', code)
}

export async function removeInviteCodeDB(code) {
    const db = await getDB()
    await db.run('DELETE FROM invite_codes WHERE code = ?', code)
    return { success: true }
}

export async function validateInviteCode(code) {
    const db = await getDB()
    await initInviteCodesTable()
    const row = await db.get('SELECT * FROM invite_codes WHERE code = ? AND is_used = 0', code)
    return !!row
}

export async function useInviteCode(code, userId) {
    const db = await getDB()
    await db.run('UPDATE invite_codes SET is_used = 1, used_by = ? WHERE code = ?', userId, code)
}

export async function getAllInviteCodes() {
    const db = await getDB()
    await initInviteCodesTable()
    return db.all('SELECT * FROM invite_codes ORDER BY created_at DESC')
}

// ═══════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════

export async function initNotificationsTable() {
    const db = await getDB()
    await db.exec(`
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT DEFAULT 'admin',
            message TEXT NOT NULL,
            is_read INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    `)
}

export async function addNotificationForUser(userId, message, type = 'admin') {
    const db = await getDB()
    await initNotificationsTable()
    await db.run('INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)', userId, type, message)
}

export async function addNotificationForAll(message, type = 'admin') {
    const db = await getDB()
    await initNotificationsTable()
    const users = await db.all('SELECT id FROM users WHERE is_blocked = 0')
    for (const u of users) {
        await db.run('INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)', u.id, type, message)
    }
    return users.length
}

export async function getNotificationsForUser(userId, limit = 20) {
    const db = await getDB()
    await initNotificationsTable()
    return db.all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?', userId, limit)
}

export async function markNotificationReadDB(notifId) {
    const db = await getDB()
    await db.run('UPDATE notifications SET is_read = 1 WHERE id = ?', notifId)
}

export async function markAllNotificationsReadDB(userId) {
    const db = await getDB()
    await db.run('UPDATE notifications SET is_read = 1 WHERE user_id = ?', userId)
}

export async function getUnreadCountForUser(userId) {
    const db = await getDB()
    await initNotificationsTable()
    const row = await db.get('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0', userId)
    return row?.count || 0
}

// ═══════════════════════════════════════
// CUSTODIAL WALLETS
// ═══════════════════════════════════════

export async function getCustodialWallet(userId) {
    const db = await getDB()
    return db.get('SELECT * FROM custodial_wallets WHERE user_id = ?', userId)
}

export async function getCustodialWalletByAddress(address) {
    const db = await getDB()
    return db.get('SELECT * FROM custodial_wallets WHERE address = ?', address)
}

export async function createCustodialWallet(userId, address, encryptedMnemonic, publicKey) {
    const db = await getDB()
    await db.run(
        `INSERT INTO custodial_wallets (user_id, address, encrypted_mnemonic, public_key) VALUES (?, ?, ?, ?)`,
        userId, address, encryptedMnemonic, publicKey
    )
    return db.get('SELECT * FROM custodial_wallets WHERE user_id = ?', userId)
}

export async function getAllCustodialWallets() {
    const db = await getDB()
    return db.all('SELECT cw.*, u.telegram_id, u.username FROM custodial_wallets cw JOIN users u ON cw.user_id = u.id')
}

// ═══════════════════════════════════════
// NFTs
// ═══════════════════════════════════════

export async function createNFT({ id, name, image, emoji, isGif, collectionId, collectionName, ownerId, creatorId, upgrade, onChainIndex, mintTxHash, onChainCollection, firstName, lastName, color }) {
    const db = await getDB()
    await db.run(
        `INSERT INTO nfts (id, name, image, emoji, is_gif, collection_id, collection_name, owner_id, creator_id, upgrade, status, on_chain_index, mint_tx_hash, on_chain_collection, first_name, last_name, color)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)`,
        id, name, image, emoji, isGif ? 1 : 0, collectionId, collectionName, ownerId, creatorId, upgrade ? JSON.stringify(upgrade) : null, onChainIndex, mintTxHash, onChainCollection, firstName, lastName, color
    )
    return db.get('SELECT * FROM nfts WHERE id = ?', id)
}

export async function checkCharacterExists(firstName, lastName) {
    const db = await getDB()
    const fullName = `${firstName.trim()} ${lastName.trim()}`
    const existing = await db.get(
        'SELECT id FROM nfts WHERE (LOWER(first_name) = LOWER(?) AND LOWER(last_name) = LOWER(?)) OR LOWER(name) = LOWER(?) LIMIT 1',
        [firstName, lastName, fullName]
    )
    return !!existing
}

export async function updateNFTOnChainData(id, onChainIndex, status, onChainCollection, color) {
    const db = await getDB()
    if (color) {
        await db.run(
            'UPDATE nfts SET on_chain_index = ?, status = ?, on_chain_collection = ?, color = ? WHERE id = ?',
            onChainIndex, status, onChainCollection, color, id
        )
    } else {
        await db.run(
            'UPDATE nfts SET on_chain_index = ?, status = ?, on_chain_collection = ? WHERE id = ?',
            onChainIndex, status, onChainCollection, id
        )
    }
    return db.get('SELECT * FROM nfts WHERE id = ?', id)
}

export async function updateNFTUpgrade(id, upgrade) {
    const db = await getDB()
    await db.run(
        'UPDATE nfts SET upgrade = ? WHERE id = ?',
        upgrade ? JSON.stringify(upgrade) : null, id
    )
    return db.get('SELECT * FROM nfts WHERE id = ?', id)
}

export async function getNFTById(id) {
    const db = await getDB()
    return db.get('SELECT * FROM nfts WHERE id = ?', id)
}

export async function getNFTByOnChainIndex(index) {
    const db = await getDB()
    return db.get(`
        SELECT n.*, u.first_name as owner_first_name, u.last_name as owner_last_name 
        FROM nfts n 
        LEFT JOIN users u ON n.owner_id = u.id 
        WHERE n.on_chain_index = ?
    `, index)
}

export async function getUserNFTs(userId) {
    const db = await getDB()
    return db.all('SELECT * FROM nfts WHERE owner_id = ? AND status = ? ORDER BY created_at DESC', userId, 'active')
}

export async function updateNFTStickerFileId(nftId, stickerFileId, stickerUniqueId) {
    const db = await getDB()
    await db.run(
        'UPDATE nfts SET sticker_file_id = ?, sticker_unique_id = ? WHERE id = ?',
        stickerFileId, stickerUniqueId, nftId
    )
}

export async function getAllNFTs() {
    const db = await getDB()
    return db.all(`
        SELECT n.*, u.username as owner_username, u.first_name as owner_first_name
        FROM nfts n
        LEFT JOIN users u ON n.owner_id = u.id
        ORDER BY n.on_chain_index ASC
    `)
}

export async function updateNFTOwner(nftId, newOwnerId, pricePaid = null) {
    const db = await getDB()
    if (pricePaid !== null) {
        await db.run('UPDATE nfts SET owner_id = ?, status = ?, price_paid = ? WHERE id = ?', newOwnerId, 'active', pricePaid, nftId)
    } else {
        await db.run('UPDATE nfts SET owner_id = ?, status = ? WHERE id = ?', newOwnerId, 'active', nftId)
    }
    return db.get('SELECT * FROM nfts WHERE id = ?', nftId)
}

export async function assignNFTToIndex(index, userId, collectionAddress, status = 'active') {
    const db = await getDB()
    const existing = await db.get('SELECT * FROM nfts WHERE on_chain_index = ?', index)
    if (existing) {
        const updates = []
        const params = []
        if (userId) { updates.push('owner_id = ?'); params.push(userId) }
        if (status) { updates.push('status = ?'); params.push(status) }
        if (updates.length > 0) {
            params.push(existing.id)
            await db.run(`UPDATE nfts SET ${updates.join(', ')} WHERE id = ?`, params)
        }
    } else {
        const id = `nft_assigned_${Date.now()}_${index}`
        await db.run(
            `INSERT INTO nfts (id, name, owner_id, creator_id, status, on_chain_index, on_chain_collection)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            id, `HeadHunter NFT #${index}`, userId || 'unknown', userId || 'unknown', status || 'active', index, collectionAddress
        )
    }
}

export async function updateNFTColor(id, color) {
    const db = await getDB()
    await db.run(
        'UPDATE nfts SET color = ? WHERE id = ?',
        color, id
    )
    return db.get('SELECT * FROM nfts WHERE id = ?', id)
}

export async function updateNFTStatus(nftId, status) {
    const db = await getDB()
    await db.run('UPDATE nfts SET status = ? WHERE id = ?', status, nftId)
}

// ═══════════════════════════════════════
// AUCTIONS
// ═══════════════════════════════════════

export async function createAuctionDB({ id, nftId, creatorId, startPrice, currentBid, currentBidderId, bidStep, buyNowPrice, isDirectSale, endsAt }) {
    const db = await getDB()
    await db.run(
        `INSERT INTO auctions (id, nft_id, creator_id, start_price, current_bid, current_bidder_id, bid_step, buy_now_price, is_direct_sale, ends_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
        id, nftId, creatorId, startPrice, currentBid, currentBidderId, bidStep || 1, buyNowPrice, isDirectSale ? 1 : 0, endsAt
    )
    return db.get('SELECT * FROM auctions WHERE id = ?', id)
}

export async function getActiveAuctions() {
    const db = await getDB()
    return db.all(`
        SELECT a.*, n.name, n.image, n.emoji, n.is_gif, n.collection_name, n.color, n.creator_id as nft_creator_id, n.on_chain_index, n.upgrade,
               u.username as creator_username, u.first_name as creator_first_name,
               b.username as bidder_username, b.first_name as bidder_first_name
        FROM auctions a
        JOIN nfts n ON a.nft_id = n.id
        LEFT JOIN users u ON a.creator_id = u.id
        LEFT JOIN users b ON a.current_bidder_id = b.id
        WHERE a.status = 'active'
        ORDER BY a.created_at DESC
    `)
}

export async function getAuctionById(id) {
    const db = await getDB()
    return db.get(`
        SELECT a.*, n.name, n.image, n.emoji, n.is_gif, n.collection_name, n.color, n.creator_id as nft_creator_id, n.on_chain_index, n.upgrade,
               u.username as creator_username, u.first_name as creator_first_name,
               b.username as bidder_username, b.first_name as bidder_first_name
        FROM auctions a
        JOIN nfts n ON a.nft_id = n.id
        LEFT JOIN users u ON a.creator_id = u.id
        LEFT JOIN users b ON a.current_bidder_id = b.id
        WHERE a.id = ?
    `, id)
}

export async function updateAuctionBid(auctionId, bidderId, amount) {
    const db = await getDB()
    await db.run('UPDATE auctions SET current_bid = ?, current_bidder_id = ? WHERE id = ?', amount, bidderId, auctionId)
}

export async function updateAuctionStatus(auctionId, status) {
    const db = await getDB()
    await db.run('UPDATE auctions SET status = ? WHERE id = ?', status, auctionId)
}

export async function getUserAuctions(userId) {
    const db = await getDB()
    return db.all(`
        SELECT a.*, n.name, n.image, n.emoji, n.is_gif, n.collection_name
        FROM auctions a JOIN nfts n ON a.nft_id = n.id
        WHERE a.creator_id = ? ORDER BY a.created_at DESC
    `, userId)
}

// ── Bids ──

export async function createBid(auctionId, userId, amount) {
    const db = await getDB()
    await db.run('INSERT INTO bids (auction_id, user_id, amount) VALUES (?, ?, ?)', auctionId, userId, amount)
}

export async function getAuctionBids(auctionId) {
    const db = await getDB()
    return db.all(`
        SELECT b.*, u.username, u.first_name
        FROM bids b LEFT JOIN users u ON b.user_id = u.id
        WHERE b.auction_id = ? ORDER BY b.created_at DESC
    `, auctionId)
}
