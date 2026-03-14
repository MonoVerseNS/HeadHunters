/**
 * MASTER SYNC SCRIPT: Re-syncs DB, Recreates Stickers, Updates Plugin Map.
 * Run: cd /var/www/headhunter && node server/sync_all.cjs
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const FormData = require('form-data');
const sqlite3 = require('sqlite3');

const BOT_TOKEN = '8437729919:AAF-NRihptuYhFIhcberNiJ0kD746Cdlv3Y';
const ADMIN_USER_ID = '5178670546'; // ellyoone
const SET_NAME = 'hh_vid_nfts_by_HeadHuntersC_bot';
const PUBLIC_DIR = '/var/www/headhunter/public';
const TMP_DIR = '/var/www/headhunter/tmp_webm';
const DB_PATH = '/var/www/headhunter/server/data/headhunter.db';

if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

async function apiFetch(method, params = {}) {
    const nf = await import('node-fetch');
    const fetch = nf.default;
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params)
    });
    return res.json();
}

function convertToWebM(inputPath, outputPath, isAnimated) {
    const args = isAnimated
        ? ['-i', inputPath, '-t', '3', '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000', '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-an', '-b:v', '400k', '-crf', '30', '-auto-alt-ref', '0', outputPath, '-y']
        : ['-loop', '1', '-i', inputPath, '-t', '3', '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000', '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-an', '-b:v', '400k', '-crf', '40', '-auto-alt-ref', '0', outputPath, '-y'];
    execFileSync('ffmpeg', args, { timeout: 60000, stdio: 'pipe' });
}

async function main() {
    console.log('🚀 INITIALIZING MASTER SYNC...');
    const nf = await import('node-fetch');
    const fetch = nf.default;
    const db = new sqlite3.Database(DB_PATH);

    // 1. FIX OWNERS
    console.log('🔧 Fixing orphaned owners (0 -> 1)...');
    await new Promise((res, rej) => db.run('UPDATE nfts SET owner_id = 1 WHERE owner_id = 0 OR owner_id IS NULL', (e) => e ? rej(e) : res()));

    // 2. GET NFTS
    const nfts = await new Promise((res, rej) => {
        db.all('SELECT id, name, image, is_gif, emoji FROM nfts WHERE image IS NOT NULL ORDER BY id', (e, r) => e ? rej(e) : res(r));
    });
    console.log(`📦 Found ${nfts.length} NFTs to process.`);

    // 3. WIPE STICKER PACK (Optional but cleaner)
    console.log(`🗑️ Wiping existing sticker set: ${SET_NAME}...`);
    const setRes = await apiFetch('getStickerSet', { name: SET_NAME });
    if (setRes.ok) {
        for (const s of setRes.result.stickers) {
            await apiFetch('deleteStickerFromSet', { sticker: s.file_id });
        }
    }

    // 4. CONVERT & UPLOAD
    const converted = [];
    console.log(`\n⏳ Converting ${nfts.length} stickers...`);
    for (const nft of nfts) {
        let imgPath = nft.image.startsWith('data:')
            ? path.join(TMP_DIR, `temp_${nft.id}.png`)
            : path.join(PUBLIC_DIR, nft.image);
        if (nft.image.startsWith('data:')) fs.writeFileSync(imgPath, Buffer.from(nft.image.split(',')[1], 'base64'));

        const webmPath = path.join(TMP_DIR, `sticker_${nft.id}.webm`);
        try {
            convertToWebM(imgPath, webmPath, !!nft.is_gif);
            converted.push({ nft, webmPath });
        } catch (e) {
            console.error(`   ❌ Convert Failed: ${nft.name} - ${e.message}`);
        }
    }

    console.log(`\n⬆️ Uploading ${converted.length} stickers...`);
    let isSetCreated = (setRes.ok && setRes.result.stickers.length > 0);

    for (let i = 0; i < converted.length; i++) {
        const { nft, webmPath } = converted[i];
        console.log(`[${i + 1}/${converted.length}] ${nft.name}`);

        try {
            const upForm = new FormData();
            upForm.append('user_id', ADMIN_USER_ID);
            upForm.append('sticker', fs.createReadStream(webmPath), { filename: 'sticker.webm', contentType: 'video/webm' });
            upForm.append('sticker_format', 'video');
            const upRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/uploadStickerFile`, { method: 'POST', body: upForm });
            const upData = await upRes.json();
            if (!upData.ok) throw new Error('Upload: ' + upData.description);

            const stickerObj = { sticker: upData.result.file_id, emoji_list: [nft.emoji || '🎁'], format: 'video' };

            if (!isSetCreated) {
                // Try createNewStickerSet if set is empty or missing
                const cRes = await apiFetch('createNewStickerSet', {
                    user_id: ADMIN_USER_ID,
                    name: SET_NAME,
                    title: 'HeadHunter NFT Collection',
                    stickers: [stickerObj],
                    sticker_format: 'video'
                });
                if (cRes.ok) {
                    isSetCreated = true;
                    console.log('   ✅ Created new set with first sticker.');
                } else {
                    // Fallback to addSticker if it exists but empty
                    const aRes = await apiFetch('addStickerToSet', {
                        user_id: ADMIN_USER_ID,
                        name: SET_NAME,
                        sticker: stickerObj
                    });
                    if (aRes.ok) {
                        isSetCreated = true;
                        console.log('   ✅ Added first sticker to existing set.');
                    } else {
                        throw new Error('Create/Add: ' + aRes.description + ' / ' + cRes.description);
                    }
                }
            } else {
                const aRes = await apiFetch('addStickerToSet', {
                    user_id: ADMIN_USER_ID,
                    name: SET_NAME,
                    sticker: stickerObj
                });
                if (!aRes.ok) throw new Error('Add: ' + aRes.description);
                console.log('   ✅ Added to existing set.');
            }
        } catch (e) {
            console.error(`   ❌ Failed: ${nft.name} - ${e.message}`);
        }
        await new Promise(r => setTimeout(r, 1000));
    }

    // 5. UPDATE DB & GENERATE PLUGIN MAP
    console.log('\n🔄 FETCHING FINAL MAPPINGS...');
    await new Promise(r => setTimeout(r, 2000));
    const finalSet = await apiFetch('getStickerSet', { name: SET_NAME });
    if (finalSet.ok) {
        const stickers = finalSet.result.stickers;
        console.log('\n--- PYTHON BOT_TO_MTPROTO MAP ---');
        console.log('BOT_TO_MTPROTO = {');

        const base64js = require('base64-js');
        for (let i = 0; i < Math.min(stickers.length, nfts.length); i++) {
            const s = stickers[i];
            const nft = nfts[i];

            // Extract bot_doc_id
            let fid = s.file_id.replace(/-/g, '+').replace(/_/g, '/');
            while (fid.length % 4) fid += '=';
            const raw = base64js.toByteArray(fid);
            const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
            const bot_doc_id = view.getBigInt64(raw.length - 16, true);

            console.log(`    ${bot_doc_id.toString()}: 0, # ${nft.name} (NEED MTPROTO ID)`);

            // Update DB
            await new Promise((res) => db.run('UPDATE nfts SET sticker_file_id = ?, sticker_unique_id = ? WHERE id = ?',
                [s.file_id, s.file_unique_id, nft.id], () => res()));
        }
        console.log('}');
    }

    db.close();
    console.log('\n✨ MASTER SYNC COMPLETE!');
}

function aFormBody(uid, name, sObj) {
    const f = new FormData();
    f.append('user_id', uid); f.append('name', name); f.append('sticker', JSON.stringify(sObj));
    return f;
}
function aFormHeaders(uid, name, sObj) { return { headers: aFormBody(uid, name, sObj).getHeaders() }; }

main().catch(console.error);
