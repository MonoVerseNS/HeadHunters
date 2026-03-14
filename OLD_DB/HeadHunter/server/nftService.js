import { TonClient, WalletContractV4, WalletContractV5R1, internal, beginCell, toNano, Address, TupleBuilder } from '@ton/ton';
import { mnemonicToWalletKey, mnemonicToPrivateKey } from '@ton/crypto';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load config
let envConfig = {};
try {
    envConfig = JSON.parse(readFileSync(join(__dirname, 'data', 'env.json'), 'utf-8'));
} catch (e) {
    console.warn('[NFT Service] env.json not found');
}
const NETWORK = envConfig.ton?.network || 'testnet';

// Global client initialized via Toncenter directly
let client = null
async function getClient() {
    if (client) return client

    let endpoint = envConfig.ton?.rpcEndpoint
    if (!endpoint) endpoint = NETWORK === 'mainnet' ? 'https://toncenter.com/api/v2/jsonRPC' : 'https://testnet.toncenter.com/api/v2/jsonRPC'

    // Ensure jsonRPC is appended for ton library
    if (!endpoint.endsWith('jsonRPC') && endpoint.includes('toncenter')) {
        endpoint = endpoint + '/jsonRPC'
    }

    // On testnet, mainnet API keys cause 403 — only use the key on mainnet
    const apiKey = NETWORK === 'mainnet' ? (envConfig.api?.toncenterApiKey || envConfig.ton?.tonapiKey || '') : ''

    client = new TonClient({ endpoint, apiKey })
    return client
}

async function refreshClient() {
    console.log('[NFT Service] Refreshing Toncenter client...')
    client = null
    return await getClient()
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function executeWithRetry(fn, desc, retries = 5) {
    for (let i = 0; i < retries; i++) {
        try {
            const cl = await getClient()
            return await fn(cl);
        } catch (err) {
            if (i < retries - 1) {
                const backoff = 1500 * Math.pow(2, i);
                console.warn(`[NFT Service] RPC error (${err.message}) calling ${desc}. Retrying... (${i + 1}/${retries})`);
                if (err.message?.includes('502') || err.message?.includes('status code 502')) {
                    await refreshClient()
                }
                if (err.message?.includes('Too old seqno') || err.message?.includes('exit_code: -13')) {
                    // Seqno mismatch or transient method error
                    await refreshClient()
                    await sleep(2000)
                }
                await sleep(backoff);
                continue;
            }
            throw err;
        }
    }
}

/**
 * Fetches the next available item index from the NFT Collection contract.
 */
export async function getNextItemIndex() {
    const collectionAddressStr = envConfig.ton?.nftCollectionAddress;
    if (!collectionAddressStr) throw new Error('NFT Collection Address is not configured');

    const toncenterApi = envConfig.ton?.rpcEndpoint || (NETWORK === 'mainnet' ? 'https://toncenter.com/api/v2' : 'https://testnet.toncenter.com/api/v2');
    // On testnet, mainnet API keys cause 403 — skip key on testnet
    const toncenterKey = NETWORK === 'mainnet' ? (envConfig.api?.toncenterApiKey || '') : '';

    let retries = 5;
    let delay = 1000;

    for (let i = 0; i < retries; i++) {
        try {
            const url = toncenterKey ? `${toncenterApi}/runGetMethod?api_key=${toncenterKey}` : `${toncenterApi}/runGetMethod`;
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(toncenterKey && { 'X-API-Key': toncenterKey })
                },
                body: JSON.stringify({
                    address: collectionAddressStr,
                    method: "get_collection_data",
                    stack: []
                })
            });
            const data = await res.json();

            if (res.status === 429 || !data.ok) {
                if (data.code === 429 || res.status === 429) {
                    console.warn(`[NFT Service] Toncenter 429 Ratelimit on getNextItemIndex. Retrying in ${delay}ms... (${i + 1}/${retries})`);
                    await sleep(delay);
                    delay *= 2;
                    continue;
                }
                console.error('[NFT Service] Toncenter get_collection_data failed:', data);
                throw new Error(data.error || 'Toncenter returned invalid data');
            }

            if (data.ok && data.result && data.result.stack && data.result.stack.length > 0) {
                return parseInt(data.result.stack[0][1], 16);
            } else {
                console.error('[NFT Service] Toncenter get_collection_data invalid format:', data);
                throw new Error('Toncenter returned invalid data format');
            }
        } catch (e) {
            if (i === retries - 1) {
                console.error('[NFT Service] Failed to fetch next item index from Toncenter after retries:', e);
                throw e;
            }
            console.warn(`[NFT Service] Network error on getNextItemIndex. Retrying in ${delay}ms... (${i + 1}/${retries})`);
            await sleep(delay);
            delay *= 2;
        }
    }
}

/**
 * Mints a new NFT to the collection.
 * itemContentUri should be just the suffix (e.g. the index as string "0", "1", etc.)
 * The collection's common_content prefix provides the base URL.
 */
export async function mintNft({ itemOwnerAddress, itemIndex, itemContentUri, amount = '0.05', customSeqno = null }) {
    try {
        const collectionAddressStr = envConfig.ton?.nftCollectionAddress;
        if (!collectionAddressStr) throw new Error('NFT Collection Address is not configured');
        const collectionAddress = Address.parse(collectionAddressStr);

        const mnemonicStr = envConfig.ton?.adminMnemonic;
        if (!mnemonicStr) throw new Error('Admin mnemonic is not configured');

        const keyPair = await mnemonicToWalletKey(mnemonicStr.split(' '));

        // Use V4 for admin operations because the collection is owned by the V4 address
        const wallet = WalletContractV4.create({
            publicKey: keyPair.publicKey,
            workchain: 0
        });

        const ownerAddr = Address.parse(itemOwnerAddress);

        // Item content stores the URI. We use 0x01 prefix (TEP-64 off-chain)
        // to ensure indexers recognize it as a link.
        const contentCell = beginCell()
            .storeUint(1, 8) // 0x01 marker for off-chain metadata
            .storeBuffer(Buffer.from(itemContentUri, 'utf-8'))
            .endCell();

        const nftItemMsg = beginCell()
            .storeAddress(ownerAddr) // new owner
            .storeRef(contentCell)   // item content
            .endCell();

        const body = beginCell()
            .storeUint(1, 32) // OP: mint
            .storeUint(Math.floor(Date.now() / 1000), 64) // query_id
            .storeUint(itemIndex, 64)
            .storeCoins(toNano('0.02')) // amount for NFT storage
            .storeRef(nftItemMsg)
            .endCell();

        // Use execSync curl to avoid node-fetch hanging on HTTPS in some environments
        const { execSync: _execSync } = await import('child_process');
        const toncenterBase = NETWORK === 'mainnet' ? 'https://toncenter.com' : 'https://testnet.toncenter.com';
        const tonapiBase = NETWORK === 'mainnet' ? 'https://tonapi.io' : 'https://testnet.tonapi.io';

        const walletAddress = wallet.address.toString({ testOnly: NETWORK !== 'mainnet', bounceable: false });
        let freshSeqno = customSeqno;
        if (freshSeqno === null) {
            try {
                // Sleep before calling seqno via curl to avoid immediate 429 after getNextItemIndex
                await sleep(1500);
                const seqnoPayload = JSON.stringify({ address: walletAddress, method: 'seqno', stack: [] }).replace(/'/g, "'\\'' ");
                const seqnoOut = _execSync(
                    `curl -s --connect-timeout 8 -m 10 -X POST '${toncenterBase}/api/v2/runGetMethod' -H 'Content-Type: application/json' -d '${seqnoPayload}'`,
                    { encoding: 'utf-8', timeout: 15000 }
                );
                const seqnoData = JSON.parse(seqnoOut);
                if (seqnoData.ok && seqnoData.result?.stack?.[0]?.[1]) {
                    freshSeqno = parseInt(seqnoData.result.stack[0][1], 16);
                } else {
                    freshSeqno = 0;
                }
            } catch (e) {
                console.warn('[NFT Service] Seqno fetch failed, defaulting to 0:', e.message);
                freshSeqno = 0;
            }
        }
        console.log(`[NFT Service] Using seqno: ${freshSeqno} on ${NETWORK}`);

        // Ensure 1.5s passes before sending the transfer (which triggers another Toncenter API call)
        await sleep(1500);

        // Send via high-level transfer
        await executeWithRetry(async (cl) => {
            const contract = cl.open(wallet);
            return await contract.sendTransfer({
                seqno: freshSeqno,
                secretKey: keyPair.secretKey,
                sendMode: 3,
                init: freshSeqno === 0 ? wallet.init : undefined,
                messages: [
                    internal({
                        to: collectionAddress,
                        value: toNano(amount.toString()),
                        bounce: true,
                        body: body
                    })
                ]
            });
        }, 'sendMintTransferNFT', 3);


        console.log(`[NFT Service] Mint TX sent. Collection: ${collectionAddressStr}, Index: ${itemIndex}, Target: ${itemOwnerAddress}`);
        return { success: true, itemIndex, collectionAddress: collectionAddressStr };
    } catch (error) {
        console.error('[NFT Service] Mint Error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Resolves the individual NFT Item address by its index in the collection.
 */
export async function getNftAddressByIndex(itemIndex) {
    const collectionAddressStr = envConfig.ton?.nftCollectionAddress;
    if (!collectionAddressStr) throw new Error('NFT Collection Address is not configured');
    const collectionAddress = Address.parse(collectionAddressStr);

    try {
        const tb = new TupleBuilder();
        tb.writeNumber(itemIndex);
        const result = await executeWithRetry((cl) => cl.runMethod(collectionAddress, 'get_nft_address_by_index', tb.build()), 'get_nft_address_by_index');
        return result.stack.readAddress().toString();
    } catch (e) {
        console.error(`[NFT Service] Failed to get NFT address for index ${itemIndex}:`, e);
        throw e;
    }
}

/**
 * Transfers an NFT from the Platform Wallet to a new owner.
 */
export async function transferNft({ itemAddressStr, newOwnerAddressStr, amount = '0.05' }) {
    try {
        const itemAddress = Address.parse(itemAddressStr);
        const newOwnerAddress = Address.parse(newOwnerAddressStr);

        // Uses Platform Wallet because Platform owns the activated NFTs
        const mnemonicStr = envConfig.ton?.platformMnemonic;
        if (!mnemonicStr) throw new Error('Platform mnemonic is not configured');

        const keyPair = await mnemonicToWalletKey(mnemonicStr.split(' '));
        const wallet = WalletContractV5R1.create({
            publicKey: keyPair.publicKey,
            workchain: 0
        });

        const body = beginCell()
            .storeUint(0x5fcc3d14, 32) // OP: transfer
            .storeUint(Math.floor(Date.now() / 1000), 64) // query_id
            .storeAddress(newOwnerAddress) // new_owner
            .storeAddress(wallet.address) // response_destination (refunds to platform)
            .storeBit(false) // custom_payload
            .storeCoins(toNano('0.01')) // forward_amount
            .storeBit(false) // forward_payload in this slice as 0
            .endCell();

        await executeWithRetry(async (cl_inner) => {
            const innerContract = cl_inner.open(wallet);
            const freshSeqno = await innerContract.getSeqno();
            console.log(`[NFT Service] Transfer using fresh seqno: ${freshSeqno}`);

            return await innerContract.sendTransfer({
                seqno: freshSeqno,
                secretKey: keyPair.secretKey,
                sendMode: 1,
                messages: [
                    internal({
                        to: itemAddress,
                        value: toNano(amount.toString()),
                        body: body,
                        bounce: true,
                    })
                ]
            });
        }, 'sendTransferNFT', 3);

        console.log(`[NFT Service] NFT Transfer TX sent to ${itemAddressStr} for new owner ${newOwnerAddressStr}`);
        return { success: true };
    } catch (error) {
        console.error('[NFT Service] Transfer Error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Updates the collection's on-chain content cell.
 * Adds a common_content ref with the base URL for individual NFT metadata.
 */
export async function changeCollectionContent({ collectionMetadataUrl, commonContentBaseUrl }) {
    try {
        const collectionAddressStr = envConfig.ton?.nftCollectionAddress;
        if (!collectionAddressStr) throw new Error('NFT Collection Address is not configured');
        const collectionAddress = Address.parse(collectionAddressStr);

        const mnemonicStr = envConfig.ton?.adminMnemonic;
        if (!mnemonicStr) throw new Error('Admin mnemonic is not configured');

        const keyPair = await mnemonicToWalletKey(mnemonicStr.split(' '));
        const wallet = WalletContractV4.create({
            publicKey: keyPair.publicKey,
            workchain: 0
        });

        // Build common_content cell (base URL for individual items)
        const commonContentCell = beginCell()
            .storeBuffer(Buffer.from(commonContentBaseUrl, 'utf-8'))
            .endCell();

        // Build collection content cell: 0x01 + metadata URL, ref[0] = common_content
        const collectionContentCell = beginCell()
            .storeUint(1, 8) // off-chain marker
            .storeStringTail(collectionMetadataUrl)
            .storeRef(commonContentCell)
            .endCell();

        console.log('[NFT Service] Collection Content Cell bits:', collectionContentCell.bits.toString());
        console.log('[NFT Service] Collection Content Cell refs count:', collectionContentCell.refs.length);
        if (collectionContentCell.refs.length > 0) {
            console.log('[NFT Service] Collection Content Ref 0 bits:', collectionContentCell.refs[0].bits.toString());
        }

        // OP code 4 = change_content in standard NFT collection
        const body = beginCell()
            .storeUint(4, 32) // OP: change_content
            .storeUint(Math.floor(Date.now() / 1000), 64) // query_id
            .storeRef(collectionContentCell) // new content
            .endCell();

        const { execSync: _execSync } = await import('child_process');
        const toncenterBase = NETWORK === 'mainnet' ? 'https://toncenter.com' : 'https://testnet.toncenter.com';
        const tonapiBase = NETWORK === 'mainnet' ? 'https://tonapi.io' : 'https://testnet.tonapi.io';

        const walletAddress = wallet.address.toString({ testOnly: NETWORK !== 'mainnet', bounceable: false });
        let freshSeqno = 0;
        try {
            const seqnoPayload = JSON.stringify({ address: walletAddress, method: 'seqno', stack: [] }).replace(/'/g, "'\\'' ");
            const seqnoOut = _execSync(
                `curl -s --connect-timeout 8 -m 10 -X POST '${toncenterBase}/api/v2/runGetMethod' -H 'Content-Type: application/json' -d '${seqnoPayload}'`,
                { encoding: 'utf-8', timeout: 15000 }
            );
            const seqnoData = JSON.parse(seqnoOut);
            if (seqnoData.ok && seqnoData.result?.stack?.[0]?.[1]) {
                freshSeqno = parseInt(seqnoData.result.stack[0][1], 16);
            }
        } catch (e) {
            console.warn('[NFT Service] Seqno fetch failed:', e.message);
        }

        // Send via high-level transfer
        await executeWithRetry(async (cl) => {
            const contract = cl.open(wallet);
            return await contract.sendTransfer({
                seqno: freshSeqno,
                secretKey: keyPair.secretKey,
                sendMode: 3,
                init: freshSeqno === 0 ? wallet.init : undefined,
                messages: [
                    internal({
                        to: collectionAddress,
                        value: toNano('0.1'),
                        bounce: true,
                        body: body
                    })
                ]
            });
        }, 'sendChangeContentTransfer', 3);

        console.log(`[NFT Service] Collection content updated. Metadata: ${collectionMetadataUrl}, Base: ${commonContentBaseUrl}`);
        return { success: true };
    } catch (error) {
        console.error('[NFT Service] Change content Error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Fetches the owner of a specific NFT item address.
 */
export async function getNftData(itemAddressStr) {
    return await executeWithRetry(async (cl) => {
        const res = await cl.runMethod(Address.parse(itemAddressStr), 'get_nft_data');
        const stack = res.stack;
        stack.readBoolean(); // init
        stack.readNumber(); // index
        stack.readAddress(); // collection_address
        const ownerAddress = stack.readAddress();
        stack.readCell(); // content
        const normalizedOwner = ownerAddress.toString({
            urlSafe: true,
            bounceable: false,
            testOnly: NETWORK !== 'mainnet'
        });
        return { owner: normalizedOwner };
    }, `getNftData(${itemAddressStr})`, 3);
}

/**
 * Fetches the state of all items in the collection.
 */
export async function getCollectionState() {
    const nextIndex = await getNextItemIndex();
    const indices = Array.from({ length: nextIndex }, (_, i) => i);

    // Fetch sequentially to avoid rate limiting
    const results = [];
    for (const i of indices) {
        try {
            const itemAddress = await getNftAddressByIndex(i);

            // Add a proper delay between the two consecutive API calls!
            await new Promise(r => setTimeout(r, 1200));

            const { owner } = await getNftData(itemAddress);
            results.push({
                index: i,
                address: itemAddress,
                owner: owner
            });
            // Delay to respect 1 req/sec Toncenter limit
            await new Promise(r => setTimeout(r, 1200));
        } catch (e) {
            console.warn(`[NFT Service] Failed to fetch item ${i}:`, e.message);
        }
    }

    return results;
}

/**
 * Normalizes a TON address to URL-safe, non-bounceable format for comparisons.
 */
export function normalizeAddress(addressInput) {
    if (!addressInput) return null;
    try {
        const addr = typeof addressInput === 'string' ? Address.parse(addressInput) : addressInput;
        return addr.toString({
            urlSafe: true,
            bounceable: false,
            testOnly: NETWORK !== 'mainnet'
        });
    } catch (e) {
        return null;
    }
}

export default {
    getNextItemIndex,
    mintNft,
    getNftAddressByIndex,
    getNftData,
    getCollectionState,
    transferNft,
    changeCollectionContent,
    normalizeAddress
};
