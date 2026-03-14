import { TonClient, Address } from '@ton/ton';
import fs from 'fs';
import { join } from 'path';

async function main() {
    const env = JSON.parse(fs.readFileSync('./server/data/env.json', 'utf8'));
    const endpoint = env.ton.rpcEndpoint || 'https://testnet.toncenter.com/api/v2/jsonRPC';
    const apiKey = env.api.toncenterApiKey || '';

    const client = new TonClient({ endpoint, apiKey });
    const collectionAddress = Address.parse(env.ton.nftCollectionAddress);

    console.log('Checking collection:', collectionAddress.toString());

    try {
        const result = await client.runMethod(collectionAddress, 'get_collection_data', []);
        const nextItemIndex = result.stack.readBigInt();
        const contentCell = result.stack.readCell();
        const ownerAddress = result.stack.readAddress();

        console.log('Next Item Index:', nextItemIndex.toString());
        console.log('Owner Address:', ownerAddress.toString());

        // Parse content cell (TES-64)
        const contentSlice = contentCell.beginParse();
        const prefix = contentSlice.loadUint(8);
        if (prefix === 0x01) {
            const commonContent = contentSlice.loadBuffer(contentSlice.remainingBits / 8).toString();
            console.log('Common Content (Base URL):', commonContent);
        } else {
            console.log('Unknown content prefix:', prefix);
        }
    } catch (e) {
        console.error('Error fetching collection data:', e.message);
        console.error(e.stack);
    }
}

main();
