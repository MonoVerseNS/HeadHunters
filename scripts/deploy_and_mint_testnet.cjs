/**
 * Deploy NFT collection to testnet and mint pending NFTs.
 */
const TonWeb = require('tonweb');
const { mnemonicToKeyPair } = require('tonweb-mnemonic');
const { readFileSync, writeFileSync } = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const env = JSON.parse(readFileSync(path.resolve(__dirname, '../env.json'), 'utf-8'));
const isMainnet = env.ton.network === 'mainnet';
const toncenterBase = isMainnet ? 'https://toncenter.com' : 'https://testnet.toncenter.com';
const tonapiBase = isMainnet ? 'https://tonapi.io' : 'https://testnet.tonapi.io';

function curlGet(url) {
    try {
        const res = execSync("curl -s --connect-timeout 10 -m 15 '" + url + "'", { encoding: 'utf-8', timeout: 20000 }).trim();
        return JSON.parse(res || '{}');
    } catch (e) { return { ok: false, error: e.message }; }
}

function curlPost(url, body) {
    const b = JSON.stringify(body).replace(/'/g, "'\\''");
    for (let attempt = 1; attempt <= 5; attempt++) {
        try {
            const res = execSync("curl -s --connect-timeout 10 -m 15 -X POST '" + url + "' -H 'Content-Type: application/json' -d '" + b + "'", { encoding: 'utf-8', timeout: 20000 }).trim();
            const parsed = JSON.parse(res || '{}');
            if (parsed.code === 429 || (parsed.result && parsed.result === 'Ratelimit exceed')) {
                console.log("  Rate limit hit (#" + attempt + "), waiting 2s...");
                execSync('sleep 2');
                continue;
            }
            return parsed;
        } catch (e) {
            if (attempt === 5) return { ok: false, error: e.message };
            execSync('sleep 1');
        }
    }
    return { ok: false, error: 'Max retries' };
}

function sendBocViaTonapi(bocBase64) {
    for (let i = 0; i < 3; i++) {
        const r = curlPost(toncenterBase + '/api/v2/sendBoc', { boc: bocBase64 });
        if (r.ok) { console.log('  sendBoc via Toncenter: OK'); return r; }
        console.log("  Toncenter attempt #" + (i + 1) + ":", JSON.stringify(r).slice(0, 120));
        execSync("sleep 2");
    }
    const d = curlPost(tonapiBase + '/v2/blockchain/message', { boc: bocBase64 });
    if (!d.error) { console.log('  sendBoc via TonAPI: OK'); return d; }
    console.log('  TonAPI fallback err:', JSON.stringify(d).slice(0, 150));
    throw new Error('All sendBoc attempts failed');
}

const NFT_ITEM_CODE_HEX = 'B5EE9C7241020D010001D0000114FF00F4A413F4BCF2C80B0102016202030202CE04050009A11F9FE00502012006070201200B0C02D70C8871C02497C0F83434C0C05C6C2497C0F83E903E900C7E800C5C75C87E800C7E800C3C00812CE3850C1B088D148CB1C17CB865407E90350C0408FC00F801B4C7F4CFE08417F30F45148C2EA3A1CC840DD78C9004F80C0D0D0D4D60840BF2C9A884AEB8C097C12103FCBC20080900113E910C1C2EBCB8536001F65135C705F2E191FA4021F001FA40D20031FA00820AFAF0801BA121945315A0A1DE22D70B01C300209206A19136E220C2FFF2E192218E3E821005138D91C85009CF16500BCF16712449145446A0708010C8CB055007CF165005FA0215CB6A12CB1FCB3F226EB39458CF17019132E201C901FB00104794102A375BE20A00727082108B77173505C8CBFF5004CF1610248040708010C8CB055007CF165005FA0215CB6A12CB1FCB3F226EB39458CF17019132E201C901FB000082028E3526F0018210D53276DB103744006D71708010C8CB055007CF165005FA0215CB6A12CB1FCB3F226EB39458CF17019132E201C901FB0093303234E25502F003003B3B513434CFFE900835D27080269FC07E90350C04090408F80C1C165B5B60001D00F232CFD633C58073C5B3327B5520BF75041B';

async function main() {
    console.log('=== HeadHunters Testnet Deploy & Mint (V4R2) ===');
    const kp = await mnemonicToKeyPair(env.ton.adminMnemonic.split(' '));
    const tonweb = new TonWeb(new TonWeb.HttpProvider(toncenterBase + '/api/v2/jsonRPC'));
    const WalletClass = tonweb.wallet.all.v4R2;
    const wallet = new WalletClass(tonweb.provider, { publicKey: kp.publicKey });
    const walletAddress = await wallet.getAddress();
    const walletNb = walletAddress.toString(true, true, false, !isMainnet);
    console.log('Admin wallet: ' + walletNb);

    async function getWalletSeqno() {
        try {
            const r = curlPost(toncenterBase + '/api/v2/runGetMethod', {
                address: walletNb, method: 'seqno', stack: []
            });
            if (r && r.ok && r.result && r.result.stack && r.result.stack.length > 0) {
                return parseInt(r.result.stack[0][1], 16);
            }
        } catch (e) { }
        return 0;
    }

    let collectionAddrStr = env.ton.nftCollectionAddress;
    if (!collectionAddrStr) {
        console.log('\n── Deploying NFT Collection ──');
        const coll = new TonWeb.token.nft.NftCollection(tonweb.provider, {
            ownerAddress: walletAddress,
            royalty: 0.05,
            royaltyAddress: walletAddress,
            collectionContentUri: 'https://hh.nerou.fun/collection_metadata.json',
            nftItemContentBaseUri: 'https://hh.nerou.fun/api/nft-metadata/',
            nftItemCodeHex: NFT_ITEM_CODE_HEX
        });
        const collAddr = await coll.getAddress();
        collectionAddrStr = collAddr.toString(true, true, true, !isMainnet);
        const stateInfo = curlGet(toncenterBase + '/api/v2/getAddressInformation?address=' + collectionAddrStr);
        if (stateInfo?.result?.state !== 'active') {
            let seqno = await getWalletSeqno();
            if (seqno === 0) {
                const deploy = wallet.deploy(kp.secretKey);
                const query = await deploy.getQuery();
                const boc = TonWeb.utils.bytesToBase64(await query.toBoc(false));
                sendBocViaTonapi(boc);
                console.log('Wallet init sent! Waiting 30s...');
                await sleep(30000);
                seqno = await getWalletSeqno();
            }
            const { stateInit } = await coll.createStateInit();
            const transfer = wallet.methods.transfer({
                secretKey: kp.secretKey,
                toAddress: collAddr,
                amount: TonWeb.utils.toNano('0.05'),
                seqno: seqno,
                stateInit: stateInit,
                sendMode: 3,
            });
            const queryCell = await transfer.getQuery();
            const bocBase64 = TonWeb.utils.bytesToBase64(await queryCell.toBoc(false));
            sendBocViaTonapi(bocBase64);
            console.log('Deploy sent! Waiting 30s...');
            await sleep(30000);
        }
        env.ton.nftCollectionAddress = collectionAddrStr;
        writeFileSync(path.resolve(__dirname, '../env.json'), JSON.stringify(env, null, 4));
        console.log('✅ Collection deployed: ' + collectionAddrStr);
    }

    const coll = new TonWeb.token.nft.NftCollection(tonweb.provider, {
        ownerAddress: walletAddress,
        royalty: 0.05,
        royaltyAddress: walletAddress,
        collectionContentUri: 'https://hh.nerou.fun/collection_metadata.json',
        nftItemContentBaseUri: 'https://hh.nerou.fun/api/nft-metadata/',
        nftItemCodeHex: NFT_ITEM_CODE_HEX
    });

    console.log('\n── Minting ──');
    const sqlite3 = require('sqlite3').verbose();
    const db = new sqlite3.Database(path.resolve(__dirname, '../server/headhunter.db'));
    const nfts = await new Promise((res, rej) => {
        db.all("SELECT id, name FROM nfts WHERE (on_chain_index IS NULL OR on_chain_index = '') AND status != 'withdrawn'", (err, rows) => {
            if (err) rej(err); else res(rows);
        });
    });
    if (nfts.length === 0) { db.close(); return; }

    const cdRes = curlPost(toncenterBase + '/api/v2/runGetMethod', {
        address: collectionAddrStr, method: 'get_collection_data', stack: []
    });
    let nextIndex = 0;
    if (cdRes && cdRes.ok && cdRes.result && cdRes.result.stack) {
        nextIndex = parseInt(cdRes.result.stack[0][1], 16);
    }
    console.log('Next index on-chain: ' + nextIndex);

    let seqno = await getWalletSeqno();
    const platformAddr = env.ton.platformWalletAddress || walletNb;

    for (const nft of nfts) {
        console.log('Minting: ' + nft.name + ' at index ' + nextIndex + ' with seqno ' + seqno);
        try {
            const mintBody = await coll.createMintBody({
                amount: TonWeb.utils.toNano('0.02'),
                itemIndex: nextIndex,
                itemOwnerAddress: new TonWeb.utils.Address(platformAddr),
                itemContentUri: nextIndex.toString(),
            });
            const transfer = wallet.methods.transfer({
                secretKey: kp.secretKey,
                toAddress: new TonWeb.utils.Address(collectionAddrStr),
                amount: TonWeb.utils.toNano('0.05'),
                seqno: seqno,
                payload: mintBody,
                sendMode: 3,
            });
            const queryCell = await transfer.getQuery();
            const bocBase64 = TonWeb.utils.bytesToBase64(await queryCell.toBoc(false));
            sendBocViaTonapi(bocBase64);
            await new Promise((resolve, reject) => {
                db.run("UPDATE nfts SET on_chain_index = ?, status = 'activated', on_chain_collection = ? WHERE id = ?", [nextIndex, collectionAddrStr, nft.id], (err) => {
                    if (err) reject(err); else resolve();
                });
            });
            nextIndex++; seqno++;
            await sleep(5000);
        } catch (e) { console.error('  ❌ Error:', e.message); }
    }
    db.close();
}
main().catch(console.error);
