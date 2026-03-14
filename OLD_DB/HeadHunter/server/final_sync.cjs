/**
 * FINAL SYNC SCRIPT: Robustly populates the sticker set and updates DB.
 * Run: cd /var/www/headhunter && node server/final_sync.cjs
 */
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const sqlite3 = require('sqlite3');

const BOT_TOKEN = '8437729919:AAF-NRihptuYhFIhcberNiJ0kD746Cdlv3Y';
const ADMIN_USER_ID = '5178670546';
const SET_NAME = 'hh_vid_nfts_by_HeadHuntersC_bot';
const TMP_DIR = '/var/www/headhunter/tmp_webm';
const DB_PATH = '/var/www/headhunter/server/data/headhunter.db';

async function apiFetch(method, params = {}) {
    const nf = await import('node-fetch');
    const fetch = nf.default;
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params)
    });
    return res.json();
}

async function main() {
    console.log('🏁 STARTING FINAL SYNC...');
    const nf = await import('node-fetch');
    const fetch = nf.default;
    const db = new sqlite3.Database(DB_PATH);

    const nfts = await new Promise((res, rej) => {
        db.all('SELECT id, name, emoji FROM nfts ORDER BY id', (e, r) => e ? rej(e) : res(r));
    });

    console.log(`📦 Task: Re-upload ${nfts.length} stickers from disk...`);

    // Wipe if exists
    await apiFetch('getStickerSet', { name: SET_NAME }).then(async (r) => {
        if (r.ok) {
            console.log(`🗑️ Wiping existing ${r.result.stickers.length} stickers...`);
            for (const s of r.result.stickers) await apiFetch('deleteStickerFromSet', { sticker: s.file_id });
        }
    });

    let isCreated = false;
    for (let i = 0; i < nfts.length; i++) {
        const nft = nfts[i];
        const webmPath = path.join(TMP_DIR, `sticker_${nft.id}.webm`);
        if (!fs.existsSync(webmPath)) {
            console.log(`⚠️ Skip ${nft.name}: file missing at ${webmPath}`);
            continue;
        }

        console.log(`[${i + 1}/${nfts.length}] Uploading ${nft.name}...`);
        const form = new FormData();
        form.append('user_id', ADMIN_USER_ID);
        form.append('sticker', fs.createReadStream(webmPath), { filename: 'sticker.webm', contentType: 'video/webm' });
        form.append('sticker_format', 'video');
        const upRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/uploadStickerFile`, { method: 'POST', body: form });
        const upData = await upRes.json();
        if (!upData.ok) { console.log(`  ❌ Upload error: ${upData.description}`); continue; }

        const stickerObj = { sticker: upData.result.file_id, emoji_list: [nft.emoji || '🎁'], format: 'video' };

        let subRes;
        if (!isCreated) {
            subRes = await apiFetch('createNewStickerSet', {
                user_id: ADMIN_USER_ID, name: SET_NAME, title: 'HeadHunter NFTs',
                stickers: [stickerObj], sticker_format: 'video'
            });
            if (!subRes.ok) {
                // Try addStickerToSet if create failed (name already exists)
                subRes = await apiFetch('addStickerToSet', { user_id: ADMIN_USER_ID, name: SET_NAME, sticker: stickerObj });
            }
        } else {
            subRes = await apiFetch('addStickerToSet', { user_id: ADMIN_USER_ID, name: SET_NAME, sticker: stickerObj });
        }

        if (subRes.ok) {
            isCreated = true;
            console.log(`  ✅ Done!`);
        } else {
            console.log(`  ❌ Add/Create error: ${subRes.description}`);
        }
    }

    console.log('\n✅ UPLOAD COMPLETE. Database updating via final set fetch...');
    const finalSet = await apiFetch('getStickerSet', { name: SET_NAME });
    if (finalSet.ok) {
        const stickers = finalSet.result.stickers;
        for (let i = 0; i < Math.min(stickers.length, nfts.length); i++) {
            const s = stickers[i];
            const nft = nfts[i];
            await new Promise((res) => db.run('UPDATE nfts SET sticker_file_id = ?, sticker_unique_id = ? WHERE id = ?',
                [s.file_id, s.file_unique_id, nft.id], () => res()));
            console.log(`  Updated ${nft.name}`);
        }
    }

    db.close();
    console.log('✨ ALL SYNCED!');
}

main().catch(console.error);
