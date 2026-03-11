/**
 * Deploy NFT collection to testnet and mint pending NFTs.
 * Uses TonWeb + curl for all blockchain interactions (avoids @ton/crypto hanging).
 */
import TonWeb from 'tonweb';
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import nacl from 'tweetnacl';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const env = JSON.parse(readFileSync(resolve(__dirname, '../env.json'), 'utf-8'));
const isMainnet = env.ton.network === 'mainnet';
const toncenterBase = isMainnet ? 'https://toncenter.com' : 'https://testnet.toncenter.com';

// ── Helpers ──
function curlGet(url) {
    try {
        const out = execSync(`curl -s --connect-timeout 10 -m 15 '${url}'`, { encoding: 'utf-8', timeout: 20000 });
        return JSON.parse(out.trim() || '{}');
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

function curlPost(url, body) {
    const bodyStr = JSON.stringify(body).replace(/'/g, "'\\''");
    const cmd = `curl -s --connect-timeout 10 -m 15 -X POST '${url}' -H 'Content-Type: application/json' -d '${bodyStr}'`;
    try {
        const out = execSync(cmd, { encoding: 'utf-8', timeout: 20000 });
        return JSON.parse(out.trim() || '{}');
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

// ── Main ──
async function main() {
    console.log(`=== HeadHunters Testnet Deploy & Mint ===`);
    console.log(`Network: ${env.ton.network}`);

    // 1. Init wallet via TonWeb (pure JS, no @ton/crypto WASM)
    const mnemonic = env.ton.adminMnemonic.split(' ');
    const keyPair = await TonWeb.mnemonic.mnemonicToKeyPair(mnemonic);
    console.log(`Admin pubkey: ${TonWeb.utils.bytesToHex(keyPair.publicKey)}`);

    const tonweb = new TonWeb(new TonWeb.HttpProvider(toncenterBase + '/api/v2/jsonRPC'));

    // Use WalletV4 for broad compatibility
    const WalletClass = tonweb.wallet.all.v4R2;
    const wallet = new WalletClass(tonweb.provider, { publicKey: keyPair.publicKey });
    const walletAddress = await wallet.getAddress();
    const walletAddressStr = walletAddress.toString(true, true, !isMainnet);
    console.log(`Admin wallet: ${walletAddressStr}`);

    // Check balance
    const balData = curlGet(`${toncenterBase}/api/v2/getAddressBalance?address=${walletAddressStr}`);
    const balTon = balData.ok ? Number(balData.result) / 1e9 : 0;
    console.log(`Balance: ${balTon} TON`);

    if (balTon < 0.15) {
        console.error('❌ Need at least 0.15 TON');
        process.exit(1);
    }

    // 2. Deploy NFT Collection if needed
    let collectionAddr = env.ton.nftCollectionAddress;
    if (!collectionAddr) {
        console.log('\n── Deploying NFT Collection ──');

        const NFT_ITEM_CODE_HEX = 'B5EE9C7241020D010001D0000114FF00F4A413F4BCF2C80B0102016202030202CE04050009A11F9FE00502012006070201200B0C02D70C8871C02497C0F83434C0C05C6C2497C0F83E903E900C7E800C5C75C87E800C7E800C3C00812CE3850C1B088D148CB1C17CB865407E90350C0408FC00F801B4C7F4CFE08417F30F45148C2EA3A1CC840DD78C9004F80C0D0D0D4D60840BF2C9A884AEB8C097C12103FCBC20080900113E910C1C2EBCB8536001F65135C705F2E191FA4021F001FA40D20031FA00820AFAF0801BA121945315A0A1DE22D70B01C300209206A19136E220C2FFF2E192218E3E821005138D91C85009CF16500BCF16712449145446A0708010C8CB055007CF165005FA0215CB6A12CB1FCB3F226EB39458CF17019132E201C901FB00104794102A375BE20A00727082108B77173505C8CBFF5004CF1610248040708010C8CB055007CF165005FA0215CB6A12CB1FCB3F226EB39458CF17019132E201C901FB000082028E3526F0018210D53276DB103744006D71708010C8CB055007CF165005FA0215CB6A12CB1FCB3F226EB39458CF17019132E201C901FB0093303234E25502F003003B3B513434CFFE900835D27080269FC07E90350C04090408F80C1C165B5B60001D00F232CFD633C58073C5B3327B5520BF75041B';

        const NftCollection = TonWeb.token.nft.NftCollection;
        const nftCollection = new NftCollection(tonweb.provider, {
            ownerAddress: walletAddress,
            royalty: 0.05,
            royaltyAddress: walletAddress,
            collectionContentUri: 'https://hh.nerou.fun/collection_metadata.json',
            nftItemContentBaseUri: 'https://hh.nerou.fun/api/nft-metadata/',
            nftItemCodeHex: NFT_ITEM_CODE_HEX
        });

        const collAddr = await nftCollection.getAddress();
        collectionAddr = collAddr.toString(true, true, !isMainnet);
        console.log(`Expected collection address: ${collectionAddr}`);

        // Check if already deployed
        const stateData = curlGet(`${toncenterBase}/api/v2/getAddressInformation?address=${collectionAddr}`);
        const state = stateData?.result?.state;
        console.log(`Collection state: ${state}`);

        if (state === 'active') {
            console.log('✅ Collection already deployed!');
        } else {
            console.log('Deploying...');

            // Get seqno
            let seqno;
            try {
                seqno = await wallet.methods.seqno().call();
                if (seqno === null || seqno === undefined) seqno = 0;
            } catch { seqno = 0; }
            console.log(`Seqno: ${seqno}`);

            const deployResult = await nftCollection.deploy(wallet, { amount: TonWeb.utils.toNano('0.05'), seqno, secretKey: keyPair.secretKey });
            // deploy() returns a Cell or sends directly. Let's use createStateInit + wallet.methods.transfer
            const { stateInit, address: collDeployAddr } = await nftCollection.createStateInit();
            const stateInitBoc = await stateInit.toBoc(false);

            const transfer = wallet.methods.transfer({
                secretKey: keyPair.secretKey,
                toAddress: collAddr,
                amount: TonWeb.utils.toNano('0.05'),
                seqno: seqno,
                payload: undefined,
                sendMode: 3,
                stateInit: stateInitBoc,
            });

            const sendResult = await transfer.send();
            console.log('Deploy TX sent!', JSON.stringify(sendResult).slice(0, 200));
            console.log('Waiting 25s for confirmation...');
            await sleep(25000);

            // Verify
            const stateData2 = curlGet(`${toncenterBase}/api/v2/getAddressInformation?address=${collectionAddr}`);
            console.log(`Collection state after deploy: ${stateData2?.result?.state}`);
            if (stateData2?.result?.state !== 'active') {
                console.log('⚠️  Collection may not be deployed yet. Waiting 15s more...');
                await sleep(15000);
                const stateData3 = curlGet(`${toncenterBase}/api/v2/getAddressInformation?address=${collectionAddr}`);
                console.log(`Collection state now: ${stateData3?.result?.state}`);
            }
        }

        // Save to env.json
        env.ton.nftCollectionAddress = collectionAddr;
        writeFileSync(resolve(__dirname, '../env.json'), JSON.stringify(env, null, 4));
        console.log(`✅ Saved nftCollectionAddress to env.json: ${collectionAddr}`);
    } else {
        console.log(`\n✅ NFT collection already configured: ${collectionAddr}`);
    }

    // 3. Mint pending NFTs
    console.log('\n── Minting pending NFTs ──');

    const Database = (await import('better-sqlite3')).default;
    const db = new Database(resolve(__dirname, '../server/headhunter.db'));

    const nfts = db.prepare("SELECT id, name, image, owner_id, on_chain_index FROM nfts WHERE (on_chain_index IS NULL OR on_chain_index = '') AND status != 'withdrawn'").all();
    console.log(`Found ${nfts.length} NFTs to mint`);

    if (nfts.length === 0) {
        console.log('Nothing to mint!');
        db.close();
        process.exit(0);
    }

    const NftCollection = TonWeb.token.nft.NftCollection;
    const nftCollection = new NftCollection(tonweb.provider, {
        ownerAddress: walletAddress,
        royalty: 0.05,
        royaltyAddress: walletAddress,
        collectionContentUri: 'https://hh.nerou.fun/collection_metadata.json',
        nftItemContentBaseUri: 'https://hh.nerou.fun/api/nft-metadata/',
        nftItemCodeHex: 'B5EE9C7241020D010001D0000114FF00F4A413F4BCF2C80B0102016202030202CE04050009A11F9FE00502012006070201200B0C02D70C8871C02497C0F83434C0C05C6C2497C0F83E903E900C7E800C5C75C87E800C7E800C3C00812CE3850C1B088D148CB1C17CB865407E90350C0408FC00F801B4C7F4CFE08417F30F45148C2EA3A1CC840DD78C9004F80C0D0D0D4D60840BF2C9A884AEB8C097C12103FCBC20080900113E910C1C2EBCB8536001F65135C705F2E191FA4021F001FA40D20031FA00820AFAF0801BA121945315A0A1DE22D70B01C300209206A19136E220C2FFF2E192218E3E821005138D91C85009CF16500BCF16712449145446A0708010C8CB055007CF165005FA0215CB6A12CB1FCB3F226EB39458CF17019132E201C901FB00104794102A375BE20A00727082108B77173505C8CBFF5004CF1610248040708010C8CB055007CF165005FA0215CB6A12CB1FCB3F226EB39458CF17019132E201C901FB000082028E3526F0018210D53276DB103744006D71708010C8CB055007CF165005FA0215CB6A12CB1FCB3F226EB39458CF17019132E201C901FB0093303234E25502F003003B3B513434CFFE900835D27080269FC07E90350C04090408F80C1C165B5B60001D00F232CFD633C58073C5B3327B5520BF75041B'
    });

    const platformAddr = env.ton.platformWalletAddress;
    if (!platformAddr) {
        throw new Error('❌ platformWalletAddress must be set in env.json');
    }

    for (const nft of nfts) {
        console.log(`\n--- Minting: "${nft.name}" (${nft.id}) ---`);

        try {
            // Get next index from collection
            await sleep(2000);
            const collData = curlPost(`${toncenterBase}/api/v2/runGetMethod`, {
                address: collectionAddr, method: 'get_collection_data', stack: []
            });
            if (!collData.ok || !collData.result?.stack?.[0]?.[1]) {
                throw new Error('Failed to get collection data: ' + JSON.stringify(collData));
            }
            const nextIndex = parseInt(collData.result.stack[0][1], 16);
            console.log(`  Next index: ${nextIndex}`);

            // Get seqno
            await sleep(1500);
            let seqno;
            try {
                seqno = await wallet.methods.seqno().call();
                if (seqno === null || seqno === undefined) seqno = 0;
            } catch { seqno = 0; }
            console.log(`  Seqno: ${seqno}`);

            // Use nftCollection.createMintBody 
            const mintBody = nftCollection.createMintBody({
                amount: TonWeb.utils.toNano('0.02'),
                itemIndex: nextIndex,
                itemOwnerAddress: new TonWeb.utils.Address(platformAddr),
                itemContentUri: nextIndex.toString(),
            });

            const collAddr = await nftCollection.getAddress();

            const transfer = wallet.methods.transfer({
                secretKey: keyPair.secretKey,
                toAddress: collAddr,
                amount: TonWeb.utils.toNano('0.05'),
                seqno: seqno,
                payload: await mintBody,
                sendMode: 3,
            });

            const sendResult = await transfer.send();
            console.log(`  ✅ Mint TX sent!`, JSON.stringify(sendResult).slice(0, 200));

            // Update DB
            db.prepare("UPDATE nfts SET on_chain_index = ?, status = 'activated', on_chain_collection = ? WHERE id = ?")
                .run(nextIndex, collectionAddr, nft.id);
            console.log(`  DB updated: on_chain_index=${nextIndex}`);

            // Wait between mints
            console.log('  Waiting 20s for confirmation...');
            await sleep(20000);

        } catch (e) {
            console.error(`  ❌ Error minting "${nft.name}":`, e.message);
        }
    }

    db.close();
    console.log('\n=== Done! ===');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
