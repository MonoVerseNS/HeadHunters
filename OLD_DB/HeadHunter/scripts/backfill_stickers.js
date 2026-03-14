import stickerService from './server/stickerService.js'
import { getAllNFTs, getDB } from './server/db.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

async function backfill() {
    const envPath = path.join(__dirname, '..', 'server', 'data', 'env.json')
    const env = JSON.parse(fs.readFileSync(envPath, 'utf8'))

    const botToken = env.telegram.botToken
    const botUsername = env.telegram.botId || 'bot'
    const adminId = env.telegram.adminChatId

    stickerService.init(botToken, botUsername)

    const nfts = await getAllNFTs()
    console.log(`[Backfill] Found ${nfts.length} NFTs`)

    await stickerService.backfillStickers(nfts, adminId)
    console.log('[Backfill] Done')
}

backfill().catch(console.error)
