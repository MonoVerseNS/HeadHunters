/**
 * Recreate ALL stickers as video WebM format.
 * Run: cd /var/www/headhunter && node server/recreate_all_video.cjs
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const FormData = require('form-data');
const sqlite3 = require('sqlite3');

const BOT_TOKEN = '8437729919:AAF-NRihptuYhFIhcberNiJ0kD746Cdlv3Y';
const ADMIN_USER_ID = '5178670546';
const SET_NAME = 'hh_vid_nfts_by_HeadHuntersC_bot';
const SET_TITLE = 'HeadHunter NFT Collection';
const PUBLIC_DIR = '/var/www/headhunter/public';
const TMP_DIR = '/var/www/headhunter/tmp_webm';

async function apiFetch(method, params) {
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
    return fs.statSync(outputPath).size;
}

async function main() {
    console.log('RECREATE ALL STICKERS AS VIDEO WEBM');
    const nf = await import('node-fetch');
    const fetch = nf.default;
    const db = new sqlite3.Database('/var/www/headhunter/server/data/headhunter.db');

    // Get NFTs
    const nfts = await new Promise((res, rej) => {
        db.all('SELECT id, name, image, is_gif, emoji FROM nfts WHERE image IS NOT NULL ORDER BY created_at', (e, r) => e ? rej(e) : res(r));
    });
    console.log(nfts.length + ' NFTs');

    // Convert all to WebM
    const converted = [];
    for (const nft of nfts) {
        let imgPath;
        if (nft.image.startsWith('data:')) {
            imgPath = path.join(TMP_DIR, 'temp_' + nft.id + '.png');
            fs.writeFileSync(imgPath, Buffer.from(nft.image.split(',')[1], 'base64'));
        } else {
            imgPath = path.join(PUBLIC_DIR, nft.image);
        }
        if (!fs.existsSync(imgPath)) { console.log('SKIP', nft.name, '- no file'); continue; }

        const webmPath = path.join(TMP_DIR, 'sticker_' + nft.id + '.webm');
        try {
            const sz = convertToWebM(imgPath, webmPath, !!nft.is_gif);
            console.log(nft.name + ': ' + (sz / 1024).toFixed(1) + ' KB');
            converted.push({ nft, webmPath });
        } catch (e) { console.error('FFMPEG ERR', nft.name, e.message); }
    }

    // Upload all
    console.log('\nUploading ' + converted.length + ' stickers...');
    for (let i = 0; i < converted.length; i++) {
        const { nft, webmPath } = converted[i];
        console.log('[' + (i + 1) + '] ' + nft.name);

        // Upload file
        const upForm = new FormData();
        upForm.append('user_id', ADMIN_USER_ID);
        upForm.append('sticker', fs.createReadStream(webmPath), { filename: 'sticker.webm', contentType: 'video/webm' });
        upForm.append('sticker_format', 'video');
        const upRes = await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/uploadStickerFile', { method: 'POST', body: upForm });
        const upData = await upRes.json();
        if (!upData.ok) { console.log('  UPLOAD FAIL:', upData.description); continue; }

        // Add to set (set already exists with 0 stickers, name is reserved)
        const stickerObj = { sticker: upData.result.file_id, emoji_list: [nft.emoji || '\uD83C\uDF81'], format: 'video' };
        const aForm = new FormData();
        aForm.append('user_id', ADMIN_USER_ID);
        aForm.append('name', SET_NAME);
        aForm.append('sticker', JSON.stringify(stickerObj));
        const aRes = await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/addStickerToSet', { method: 'POST', body: aForm });
        const aData = await aRes.json();
        console.log('  ' + (aData.ok ? 'OK' : 'FAIL: ' + aData.description));
        await new Promise(r => setTimeout(r, 500));
    }

    // Fetch final set and update DB
    await new Promise(r => setTimeout(r, 1000));
    const finalData = await apiFetch('getStickerSet', { name: SET_NAME });
    if (finalData.ok) {
        const stickers = finalData.result.stickers;
        console.log('\nFinal: ' + stickers.length + ' stickers');
        let si = 0;
        for (const { nft } of converted) {
            if (si >= stickers.length) break;
            const s = stickers[si++];
            console.log(nft.name + ' -> ' + s.file_id.substring(0, 40) + '... video:' + s.is_video);
            await new Promise((res, rej) => {
                db.run('UPDATE nfts SET sticker_file_id = ?, sticker_unique_id = ? WHERE id = ?',
                    [s.file_id, s.file_unique_id, nft.id], function (err) { err ? rej(err) : res(); });
            });
        }
    }
    db.close();
    console.log('DONE');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
