import { TonClient, WalletContractV5R1, internal, toNano, Address, beginCell, TupleBuilder, BitString } from '@ton/ton';
import { mnemonicToWalletKey } from '@ton/crypto';
import { getHttpEndpoint } from '@orbs-network/ton-access';
import logger from './logger.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load config
let envConfig = {};
try {
    envConfig = JSON.parse(readFileSync(join(__dirname, 'data', 'env.json'), 'utf-8'));
} catch (e) {
    logger.warn('[NFT] env.json not found');
}

const NETWORK = envConfig.ton?.network || 'testnet';

// ── TonClient instance ──
let client = null;
let clientLastUsed = 0;
const CLIENT_TTL = 300_000;

async function getClient() {
    const now = Date.now();
    if (client && (now - clientLastUsed < CLIENT_TTL)) {
        clientLastUsed = now;
        return client;
    }
    const endpoint = await getHttpEndpoint({ network: NETWORK });
    client = new TonClient({ endpoint });
    clientLastUsed = now;
    return client;
}

// ═══════════════════════════════════════
// NFT OPERATIONS
// ═══════════════════════════════════════

export async function mintNft(params) {
    const { 
        collectionAddress, 
        ownerAddress, 
        itemIndex, 
        itemContentUri, 
        adminMnemonic,
        amount = '0.05'
    } = params;

    try {
        const cl = await getClient();
        const keyPair = await mnemonicToWalletKey(adminMnemonic.split(' '));
        const wallet = WalletContractV5R1.create({ publicKey: keyPair.publicKey, workchain: 0 });
        const contract = cl.open(wallet);

        // Item content stores the URI. We DO NOT use 0x01 prefix here
        // because the collection's off-chain marker already covers it.
        const contentCell = beginCell()
            .storeBuffer(Buffer.from(itemContentUri, 'utf-8'))
            .endCell();

        const mintMsg = beginCell()
            .storeUint(1, 32) // op::mint
            .storeUint(0, 64) // query_id
            .storeUint(itemIndex, 64)
            .storeCoins(toNano('0.02')) // amount for NFT
            .storeRef(beginCell()
                .storeAddress(Address.parse(ownerAddress))
                .storeRef(contentCell)
                .endCell())
            .endCell();

        const seqno = await contract.getSeqno();
        await contract.sendTransfer({
            seqno,
            secretKey: keyPair.secretKey,
            messages: [internal({
                to: collectionAddress,
                value: toNano(amount),
                body: mintMsg,
                bounce: true
            })],
            sendMode: 3
        });

        logger.info(`[NFT] Mint transaction sent for index ${itemIndex}`);
        return { success: true, seqno };
    } catch (e) {
        logger.error(`[NFT] Mint error: ${e.message}`);
        return { success: false, error: e.message };
    }
}

export async function getCollectionState(addressStr) {
    const addr = addressStr || envConfig.ton?.nftCollectionAddress;
    if (!addr) return [];

    try {
        const cl = await getClient();
        const collection = Address.parse(addr);
        const result = await cl.runMethod(collection, 'get_collection_data');
        
        const nextItemIndex = result.stack.readBigNumber();
        const collectionContent = result.stack.readCell();
        const ownerAddress = result.stack.readAddress();

        return {
            nextItemIndex: Number(nextItemIndex),
            ownerAddress: ownerAddress.toString(),
            address: addr
        };
    } catch (e) {
        logger.error(`[NFT] Get state error: ${e.message}`);
        return null;
    }
}

export async function changeCollectionContent(params) {
    const { collectionMetadataUrl, commonContentBaseUrl, adminMnemonic, gasAmount = '0.05' } = params;
    const addr = envConfig.ton?.nftCollectionAddress;

    try {
        const cl = await getClient();
        const keyPair = await mnemonicToWalletKey(adminMnemonic.split(' '));
        const wallet = WalletContractV5R1.create({ publicKey: keyPair.publicKey, workchain: 0 });
        const contract = cl.open(wallet);

        const commonContentCell = beginCell()
            .storeBuffer(Buffer.from(commonContentBaseUrl, 'utf-8'))
            .endCell();

        const collectionContentCell = beginCell()
            .storeUint(1, 8) // off-chain marker
            .storeStringTail(collectionMetadataUrl)
            .storeRef(commonContentCell)
            .endCell();

        const msg = beginCell()
            .storeUint(4, 32) // op::change_content
            .storeUint(0, 64) // query_id
            .storeRef(collectionContentCell)
            .endCell();

        const seqno = await contract.getSeqno();
        await contract.sendTransfer({
            seqno,
            secretKey: keyPair.secretKey,
            messages: [internal({
                to: Address.parse(addr),
                value: toNano(gasAmount),
                body: msg,
                bounce: true
            })],
            sendMode: 3
        });

        return { success: true, seqno };
    } catch (e) {
        logger.error(`[NFT] Change content error: ${e.message}`);
        return { success: false, error: e.message };
    }
}

export function normalizeAddress(address) {
    try {
        return Address.parse(address).toRawString();
    } catch {
        return null;
    }
}
