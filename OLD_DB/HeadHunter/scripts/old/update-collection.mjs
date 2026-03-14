import nftService from './server/nftService.js';

async function main() {
    console.log("Updating collection content...");
    const res = await nftService.changeCollectionContent({
        collectionMetadataUrl: 'https://hh.nerou.fun/collection_metadata.json',
        commonContentBaseUrl: 'https://hh.nerou.fun/api/nft-metadata/'
    });
    console.log("Result:", res);
}

main().catch(console.error);
