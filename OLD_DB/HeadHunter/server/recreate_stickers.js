/**
 * Recreate sticker pack from scratch.
 * 1. Delete all stickers from existing set(s)
 * 2. Clear sticker fields in DB
 * 3. Re-upload each NFT as a sticker
 * 4. Restart test.cjs cache
 * 
 * Run: cd /var/www/headhunter && node server/recreate_stickers.js
 */
import fetch from 'node-fetch'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const BOT_TOKEN = '8437729919:AAF-NRihptuYhFIhcberNiJ0kD746Cdlv3Y'
const ADMIN_USER_ID = 5178670546
const BOT_USERNAME = 'HeadHuntersC_bot'

const STATIC_SET = `hh_nfts_by_${BOT_USERNAME}`
const VIDEO_SET = `hh_vid_nfts_by_${BOT_USERNAME}`

const api = (method, params = {}) =>
    fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
    }).then(r => r.json())

async function deleteAllStickersFromSet(setName) {
    console.log(`\n🗑️  Deleting all stickers from: ${setName}`)
    try {
        const setData = await api('getStickerSet', { name: setName })
        if (!setData.ok) {
            console.log(`   Set doesn't exist, skipping.`)
            return
        }
        const stickers = setData.result.stickers
        console.log(`   Found ${stickers.length} stickers to delete`)

        // Delete all except the first one (Telegram requires at least 1),
        // then delete the last one which also deletes the set
        for (let i = stickers.length - 1; i >= 0; i--) {
            const s = stickers[i]
            console.log(`   Deleting sticker ${i}: ${s.file_unique_id}`)
            const result = await api('deleteStickerFromSet', { sticker: s.file_id })
            if (!result.ok) {
                console.error(`   ❌ Failed to delete: ${result.description}`)
            } else {
                console.log(`   ✅ Deleted`)
            }
            await new Promise(r => setTimeout(r, 300))
        }
    } catch (e) {
        console.error(`   Error: ${e.message}`)
    }
}

async function clearDBStickerFields() {
    console.log(`\n🧹 Clearing sticker fields in database...`)
    const { getDB } = await import('./db.js')
    const db = getDB()
    return new Promise((resolve, reject) => {
        db.run('UPDATE nfts SET sticker_file_id = NULL, sticker_unique_id = NULL', (err) => {
            if (err) reject(err)
            else {
                console.log('   ✅ Cleared all sticker_file_id and sticker_unique_id')
                resolve()
            }
        })
    })
}

async function getNFTs() {
    const { getDB } = await import('./db.js')
    const db = getDB()
    return new Promise((resolve, reject) => {
        db.all('SELECT id, name, image, is_gif as isGif, emoji FROM nfts WHERE image IS NOT NULL', (err, rows) => {
            if (err) reject(err)
            else resolve(rows)
        })
    })
}

async function main() {
    console.log('🔄 STICKER PACK RECREATION SCRIPT')
    console.log('==================================\n')

    // 1. Delete existing sets
    await deleteAllStickersFromSet(STATIC_SET)
    await deleteAllStickersFromSet(VIDEO_SET)

    // 2. Clear DB
    await clearDBStickerFields()

    // 3. Get all NFTs
    const nfts = await getNFTs()
    console.log(`\n📦 Found ${nfts.length} NFTs with images:`)
    nfts.forEach(n => console.log(`   - ${n.name} (isGif: ${n.isGif}, image: ${n.image?.substring(0, 50)}...)`))

    // 4. Re-upload via backfill API
    console.log(`\n🎨 Triggering backfill via local API...`)
    const backfillRes = await fetch('http://localhost:3000/api/v1/backfillStickers', { method: 'POST' })
    const backfillData = await backfillRes.json()
    console.log(`   Backfill result:`, JSON.stringify(backfillData))

    // 5. Wait and verify
    await new Promise(r => setTimeout(r, 2000))

    // Check the pack
    const checkStatic = await api('getStickerSet', { name: STATIC_SET })
    if (checkStatic.ok) {
        console.log(`\n✅ Static pack "${STATIC_SET}" has ${checkStatic.result.stickers.length} stickers:`)
        checkStatic.result.stickers.forEach(s => {
            console.log(`   ${s.file_unique_id} | ${s.type} | ${s.file_id.substring(0, 40)}...`)
        })
    } else {
        console.log(`\n❌ Static pack not found after backfill`)
    }

    const checkVideo = await api('getStickerSet', { name: VIDEO_SET })
    if (checkVideo.ok) {
        console.log(`\n✅ Video pack "${VIDEO_SET}" has ${checkVideo.result.stickers.length} stickers:`)
        checkVideo.result.stickers.forEach(s => {
            console.log(`   ${s.file_unique_id} | ${s.type} | ${s.file_id.substring(0, 40)}...`)
        })
    }

    console.log('\n🏁 Done! Now restart PM2 to refresh sticker refs cache:')
    console.log('   pm2 restart headhunter')
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
