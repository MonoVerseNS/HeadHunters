import { changeCollectionContent } from '../server/nftService.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envConfig = JSON.parse(readFileSync(join(__dirname, '..', 'server', 'data', 'env.json'), 'utf-8'));

async function run() {
    console.log('--- Updating Collection Metadata on Testnet ---');
    console.log('Collection Address:', envConfig.ton.nftCollectionAddress);

    // We add \x01 (0x01) marker for TEP-64 off-chain metadata
    // Prefix: \x01https://hh.nerou.fun/api/nft-metadata/
    // The items will just append their index (e.g. 4)
    const res = await changeCollectionContent({
        collectionMetadataUrl: 'https://hh.nerou.fun/collection_metadata.json',
        commonContentBaseUrl: '\x01https://hh.nerou.fun/api/nft-metadata/'
    });

    if (res.success) {
        console.log('Successfully sent update transaction!');
    } else {
        console.error('Failed to update:', res.error);
    }
}

run();
