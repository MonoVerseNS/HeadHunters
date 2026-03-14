import fetch from 'node-fetch'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import sharp from 'sharp'
import FormData from 'form-data'
import { updateNFTStickerFileId } from './db.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * StickerService handles creating Telegram stickers for minted NFTs.
 * It uses the bot token from settings to interact with the Telegram Bot API.
 * Each NFT gets a 512×512 WebP sticker uploaded to a collection sticker set.
 */
class StickerService {
    constructor() {
        this.botToken = null
        this.botUsername = null
        this.adminUserId = null
    }

    init(botToken, botUsername, adminUserId) {
        this.botToken = botToken
        this.botUsername = botUsername
        this.adminUserId = adminUserId
    }

    /**
     * Convert an image (path or URL) to a 512×512 WebP buffer suitable for Telegram stickers.
     */
    async imageToStickerWebp(imageSource) {
        let inputBuffer

        if (imageSource.startsWith('data:')) {
            // Base64 data URI (e.g. data:image/png;base64,iVBORw0...)
            const base64Data = imageSource.split(',')[1]
            if (!base64Data) throw new Error('Invalid data URI')
            inputBuffer = Buffer.from(base64Data, 'base64')
        } else if (imageSource.startsWith('http://') || imageSource.startsWith('https://')) {
            const res = await fetch(imageSource)
            inputBuffer = Buffer.from(await res.arrayBuffer())
        } else {
            // Local path — resolve relative to project root
            const absPath = imageSource.startsWith('/')
                ? path.join(__dirname, '..', 'public', imageSource)
                : path.resolve(imageSource)
            inputBuffer = fs.readFileSync(absPath)
        }

        // Convert to 512×512 WebP (Telegram sticker requirement)
        const webpBuffer = await sharp(inputBuffer, { animated: false })
            .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .webp({ quality: 90 })
            .toBuffer()

        return webpBuffer
    }

    /**
     * Creates a sticker for an NFT and adds it to the collection sticker set.
     * Returns the sticker's file_id and file_unique_id.
     * @param {Object} nft The NFT object from the database.
     * @returns {{ fileId: string, uniqueId: string } | null}
     */
    async createStickerForNFT(nft) {
        if (!this.botToken) {
            console.error('[StickerService] Bot token not initialized')
            return null
        }

        if (!this.adminUserId) {
            console.error('[StickerService] Admin user ID not set')
            return null
        }

        if (nft.sticker_file_id) {
            console.log(`[StickerService] NFT ${nft.id} already has sticker: ${nft.sticker_file_id}`)
            return { fileId: nft.sticker_file_id, uniqueId: nft.sticker_unique_id }
        }

        // Telegram requires separate sticker sets for static vs video/animated
        const isGif = nft.isGif || nft.image?.endsWith('.gif') || nft.image?.endsWith('.webm')
        const setName = isGif ? `hh_vid_nfts_by_${this.botUsername}` : `hh_nfts_by_${this.botUsername}`
        const setTitle = isGif ? 'HeadHunter Animated NFTs' : 'HeadHunter NFT Collection'
        const format = isGif ? 'video' : 'static'

        try {
            const imageUrl = nft.image?.startsWith('http') ? nft.image : nft.image
            console.log(`[StickerService] Processing NFT ${nft.id}: ${nft.name} (image: ${imageUrl}, isGif: ${isGif})`)

            let uploadBuffer;
            let filename;
            let contentType;

            if (isGif) {
                // For GIFs/animations, convert to VP9 WebM using ffmpeg
                // Telegram video stickers: WebM, VP9, 512x512, max 3s, max 256KB
                const { execFileSync } = await import('child_process')
                let inputPath
                let tempInput = false

                if (imageUrl.startsWith('data:')) {
                    const base64Data = imageUrl.split(',')[1]
                    inputPath = path.join(__dirname, '..', 'tmp_webm', `temp_${nft.id}.gif`)
                    fs.writeFileSync(inputPath, Buffer.from(base64Data, 'base64'))
                    tempInput = true
                } else if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
                    const res = await fetch(imageUrl)
                    const buf = Buffer.from(await res.arrayBuffer())
                    inputPath = path.join(__dirname, '..', 'tmp_webm', `temp_${nft.id}.gif`)
                    fs.writeFileSync(inputPath, buf)
                    tempInput = true
                } else {
                    inputPath = imageUrl.startsWith('/') ? path.join(__dirname, '..', 'public', imageUrl) : path.resolve(imageUrl)
                }

                const outputPath = inputPath.replace(/\.(gif|mp4)$/i, '.webm')
                try {
                    execFileSync('ffmpeg', [
                        '-i', inputPath,
                        '-t', '3',
                        '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
                        '-c:v', 'libvpx-vp9',
                        '-pix_fmt', 'yuva420p',
                        '-an',
                        '-b:v', '400k',
                        '-minrate', '100k',
                        '-maxrate', '500k',
                        '-crf', '30',
                        '-auto-alt-ref', '0',
                        outputPath,
                        '-y'
                    ], { timeout: 60000 })
                    uploadBuffer = fs.readFileSync(outputPath)
                    console.log(`[StickerService] ffmpeg converted: ${uploadBuffer.length} bytes WebM`)
                    // Clean up temp files
                    if (tempInput) fs.unlinkSync(inputPath)
                    try { fs.unlinkSync(outputPath) } catch { }
                } catch (ffmpegErr) {
                    console.error(`[StickerService] ffmpeg conversion failed:`, ffmpegErr.message)
                    if (tempInput) try { fs.unlinkSync(inputPath) } catch { }
                    return null
                }
                filename = 'sticker.webm'
                contentType = 'video/webm'
            } else {
                // 1. Convert static NFT image to 512×512 WebP
                uploadBuffer = await this.imageToStickerWebp(imageUrl)
                filename = 'sticker.webp'
                contentType = 'image/webp'
                console.log(`[StickerService] WebP buffer ready: ${uploadBuffer.length} bytes`)
            }

            // 2. Upload as sticker file
            const uploadForm = new FormData()
            uploadForm.append('user_id', this.adminUserId.toString())
            uploadForm.append('sticker', uploadBuffer, { filename, contentType })
            uploadForm.append('sticker_format', format)

            const uploadRes = await fetch(`https://api.telegram.org/bot${this.botToken}/uploadStickerFile`, {
                method: 'POST',
                body: uploadForm,
            })
            const uploadData = await uploadRes.json()

            if (!uploadData.ok) {
                console.error(`[StickerService] Upload failed:`, uploadData)
                return null
            }

            const uploadedFileId = uploadData.result.file_id
            console.log(`[StickerService] Uploaded sticker file: ${uploadedFileId}`)

            // 3. Check if sticker set exists
            const getSetRes = await fetch(`https://api.telegram.org/bot${this.botToken}/getStickerSet?name=${setName}`)
            const setData = await getSetRes.json()

            const stickerData = JSON.stringify({
                sticker: uploadedFileId,
                emoji_list: [nft.emoji || '🎁'],
                format: format
            })

            if (!setData.ok) {
                // Create new sticker set
                console.log(`[StickerService] Creating new sticker set: ${setName}`)
                const createForm = new FormData()
                createForm.append('user_id', this.adminUserId.toString())
                createForm.append('name', setName)
                createForm.append('title', setTitle)
                createForm.append('stickers', `[${stickerData}]`)
                createForm.append('sticker_type', 'regular')

                const createRes = await fetch(`https://api.telegram.org/bot${this.botToken}/createNewStickerSet`, {
                    method: 'POST',
                    body: createForm,
                })
                const createResult = await createRes.json()
                if (!createResult.ok) {
                    console.error(`[StickerService] createNewStickerSet failed:`, createResult)
                    return null
                }
                console.log(`[StickerService] Sticker set created: ${setName}`)
            } else {
                // Add to existing set
                console.log(`[StickerService] Adding sticker to existing set: ${setName}`)
                const addForm = new FormData()
                addForm.append('user_id', this.adminUserId.toString())
                addForm.append('name', setName)
                addForm.append('sticker', stickerData)

                const addRes = await fetch(`https://api.telegram.org/bot${this.botToken}/addStickerToSet`, {
                    method: 'POST',
                    body: addForm,
                })
                const addResult = await addRes.json()
                if (!addResult.ok) {
                    console.error(`[StickerService] addStickerToSet failed:`, addResult)
                    return null
                }
            }

            // 4. Fetch the set to get the real file_id of the last added sticker
            const finalSetRes = await fetch(`https://api.telegram.org/bot${this.botToken}/getStickerSet?name=${setName}`)
            const finalSetData = await finalSetRes.json()

            if (!finalSetData.ok || !finalSetData.result.stickers.length) {
                console.error(`[StickerService] Could not fetch final sticker set`)
                return null
            }

            // The last sticker in the set is the one we just added
            const lastSticker = finalSetData.result.stickers[finalSetData.result.stickers.length - 1]
            const fileId = lastSticker.file_id
            const uniqueId = lastSticker.file_unique_id

            // 5. Save to DB
            await updateNFTStickerFileId(nft.id, fileId, uniqueId)
            console.log(`[StickerService] ✅ Sticker created for NFT ${nft.id}: ${fileId}`)

            return { fileId, uniqueId }
        } catch (e) {
            console.error(`[StickerService] Error creating sticker for ${nft.id}:`, e)
            return null
        }
    }

    /**
     * Backfill stickers for all existing minted NFTs that don't have one yet.
     * @param {Object[]} nfts Array of NFT objects from the database.
     */
    async backfillStickers(nfts) {
        const missing = nfts.filter(n => !n.sticker_file_id && n.image)
        console.log(`[StickerService] Starting backfill: ${missing.length} NFTs without stickers out of ${nfts.length} total`)

        let success = 0, failed = 0
        for (const nft of missing) {
            const result = await this.createStickerForNFT(nft)
            if (result) success++
            else failed++
            // Small delay to avoid rate limiting
            await new Promise(r => setTimeout(r, 500))
        }

        console.log(`[StickerService] Backfill complete: ${success} created, ${failed} failed`)
        return { success, failed }
    }
}

export default new StickerService()
