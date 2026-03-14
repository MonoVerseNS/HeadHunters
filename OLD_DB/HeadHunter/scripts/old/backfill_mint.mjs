/**
 * Backfill existing off-chain NFTs: mint them on-chain via TonAPI.
 * Uses curl (via child_process) to avoid node-fetch hanging issues.
 * Run with: node backfill_mint.mjs
 */
import { mnemonicToWalletKey } from '@ton/crypto';
import { WalletContractV5R1, internal, toNano, beginCell, Address } from '@ton/ton';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { getDB } from './server/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envConfig = JSON.parse(readFileSync(join(__dirname, 'env.json'), 'utf-8'));

const NETWORK = envConfig.ton?.network || 'testnet';
const COLLECTION_ADDRESS = envConfig.ton?.nftCollectionAddress;
const ADMIN_MNEMONIC = envConfig.ton?.adminMnemonic;
const BASE_URL = 'https://hh.nerou.fun';

const sleep = ms => new Promise(r => setTimeout(r, ms));

function curlGet(url) {
    try {
        const result = execSync(`curl -s --connect-timeout 8 -m 10 "${url}"`, { encoding: 'utf-8' });
        return JSON.parse(result);
    } catch (e) {
        return null;
    }
}

function curlPost(url, data) {
    try {
        const jsonEscaped = JSON.stringify(data).replace(/'/g, "'\\''");
        const result = execSync(
            `curl -s --connect-timeout 8 -m 15 -X POST -H "Content-Type: application/json" -d '${jsonEscaped}' "${url}"`,
            { encoding: 'utf-8' }
        );
        return { ok: true, text: result };
    } catch (e) {
        return { ok: false, text: e.message };
    }
}

function getSeqno(walletAddress) {
    const data = curlPost('https://testnet.toncenter.com/api/v2/runGetMethod', {
        address: walletAddress, method: 'seqno', stack: []
    });
    if (data?.ok) {
        try {
            const parsed = JSON.parse(data.text);
            if (parsed.ok && parsed.result?.stack?.[0]?.[1]) {
                return parseInt(parsed.result.stack[0][1], 16);
            }
        } catch { }
    }
    return 0;
}

async function mintOnChain(wallet, keyPair, seqno, itemIndex, ownerAddress) {
    const ownerAddr = Address.parse(ownerAddress);
    const collAddr = Address.parse(COLLECTION_ADDRESS);
    const contentUri = `${BASE_URL}/api/nft-metadata/${itemIndex}`;

    const contentCell = beginCell().storeUint(1, 8).storeBuffer(Buffer.from(contentUri, 'utf-8')).endCell();
    const nftItemMsg = beginCell().storeAddress(ownerAddr).storeRef(contentCell).endCell();
    const body = beginCell()
        .storeUint(1, 32)
        .storeUint(Math.floor(Date.now() / 1000), 64)
        .storeUint(itemIndex, 64)
        .storeCoins(toNano('0.02'))
        .storeRef(nftItemMsg)
        .endCell();

    const msg = wallet.createTransfer({
        seqno,
        secretKey: keyPair.secretKey,
        messages: [internal({ to: collAddr, value: toNano('0.05'), bounce: true, body })],
        sendMode: 3
    });

    const boc = msg.toBoc({ idx: false }).toString('base64');

    // Use curl to send - avoids node-fetch hanging
    const result = curlPost('https://testnet.tonapi.io/v2/blockchain/message', { boc });
    return result;
}

async function main() {
    const db = await getDB();
    const unminted = await db.all(
        "SELECT n.*, cw.address as wallet_address FROM nfts n LEFT JOIN custodial_wallets cw ON cw.user_id = n.owner_id WHERE n.on_chain_index IS NULL AND n.status != 'deleted' ORDER BY n.created_at ASC LIMIT 50"
    );
    console.log(`Found ${unminted.length} unminted NFTs`);
    if (!unminted.length) { console.log('Nothing to do!'); process.exit(0); }

    const keyPair = await mnemonicToWalletKey(ADMIN_MNEMONIC.split(' '));
    const wallet = WalletContractV5R1.create({ workchain: 0, publicKey: keyPair.publicKey });
    const walletAddress = wallet.address.toString({ testOnly: NETWORK === 'testnet', bounceable: false });
    console.log('Admin wallet:', walletAddress);

    const maxRow = await db.get('SELECT MAX(on_chain_index) as maxIdx FROM nfts');
    let nextIndex = (maxRow?.maxIdx ?? -1) + 1;
    console.log('Starting from index:', nextIndex);

    for (const nft of unminted) {
        console.log(`\nMinting "${nft.name}" (${nft.id}) -> on_chain_index ${nextIndex}`);

        if (!nft.wallet_address) {
            console.log(`  ⚠️  Skipping: no custodial wallet for user ${nft.owner_id}`);
            continue;
        }

        const seqno = getSeqno(walletAddress);
        console.log(`  seqno=${seqno}`);

        const result = await mintOnChain(wallet, keyPair, seqno, nextIndex, nft.wallet_address);
        console.log(`  TonAPI response: ${result.text?.slice(0, 200)}`);

        // Check success (TonAPI returns 200 with empty body on success)
        let success = false;
        try {
            const parsed = JSON.parse(result.text || '{}');
            // TonAPI returns {} on success or an error object on failure
            success = result.ok && (!parsed.error) && (result.text === '{}' || result.text === '' || !result.text);
        } catch {
            // If result.text is empty or not JSON, might still be success
            success = result.ok && (!result.text || result.text.trim() === '{}' || result.text.trim() === '');
        }

        // Also treat 200-range responses as success
        if (!success && result.ok && result.text?.length < 5) success = true;

        if (success) {
            await db.run(
                'UPDATE nfts SET on_chain_index = ?, on_chain_collection = ? WHERE id = ?',
                nextIndex, COLLECTION_ADDRESS, nft.id
            );
            console.log(`  ✅ Minted! on_chain_index=${nextIndex}`);
            nextIndex++;
            console.log(`  Waiting 15s for confirmation...`);
            await sleep(15000);
        } else {
            console.error(`  ❌ Failed. Raw response: ${result.text}`);
        }
    }

    console.log('\nBackfill complete!');
    console.log('DB state:');
    const all = await db.all('SELECT id, name, on_chain_index FROM nfts');
    all.forEach(n => console.log(` - ${n.name}: on_chain_index=${n.on_chain_index}`));
    process.exit(0);
}
main();
