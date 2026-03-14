import { TonClient, Address, TupleBuilder } from '@ton/ton';

async function main() {
    const apiKey = '95ef17253093bcb94aacfcbbbac9895e23e12a6bf17da5a5309ed2e3c3c76ad1';
    const endpoint = 'https://testnet.toncenter.com/api/v2/jsonRPC';
    const client = new TonClient({ endpoint, apiKey });

    const collectionAddress = Address.parse('kQAGUhHRNaoXLXKVJFbhWcX-c7-xJ37qhH5BAlXmvC4WcZay');

    for (let i = 0; i < 10; i++) {
        try {
            const tb = new TupleBuilder();
            tb.writeNumber(i);
            const res = await client.runMethod(collectionAddress, 'get_nft_address_by_index', tb.build());
            const nftAddress = res.stack.readAddress();

            const state = await client.getContractState(nftAddress);
            if (state.state !== 'active') {
                console.log(`NFT #${i} (${nftAddress.toString()}): State is ${state.state}`);
                continue;
            }

            const dataRes = await client.runMethod(nftAddress, 'get_nft_data');
            dataRes.stack.readBoolean(); // init
            dataRes.stack.readBigNumber(); // index
            dataRes.stack.readAddress(); // collection
            const owner = dataRes.stack.readAddress();

            console.log(`NFT #${i} (${nftAddress.toString()}) Owner: ${owner.toString()}`);
        } catch (e) {
            console.error(`Error checking NFT #${i}:`, e.message);
        }
    }
}

main().catch(console.error);
