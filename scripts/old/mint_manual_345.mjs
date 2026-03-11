import { createNFT, getDB } from './server/db.js';
import * as nftService from './server/nftService.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envConfig = JSON.parse(readFileSync(join(__dirname, 'env.json'), 'utf-8'));

async function mintAndRegister(index, ownerId, name, customSeqno) {
    console.log(`\n--- Minting NFT #${index} for User ${ownerId} (Seqno: ${customSeqno}) ---`);
    const platformAddress = envConfig.ton.platformWalletAddress;
    const contentUri = String(index);

    const mintRes = await nftService.mintNft({
        itemOwnerAddress: platformAddress,
        itemIndex: index,
        itemContentUri: contentUri,
        amount: '0.05',
        customSeqno: customSeqno
    });

    if (!mintRes.success) {
        throw new Error(`Failed to mint NFT #${index}: ${mintRes.error}`);
    }

    console.log(`Successfully minted NFT #${index} on-chain.`);

    // Check if entry already exists in DB to avoid duplicates
    const db = await getDB();
    const existing = await db.get('SELECT id FROM nfts WHERE on_chain_index = ?', index);
    if (existing) {
        console.log(`Record for NFT #${index} already exists in database. Skipping DB insert.`);
    } else {
        const nftId = `nft_manual_${Date.now()}_${index}`;
        await createNFT({
            id: nftId,
            name: name,
            image: '/192.png',
            emoji: '💎',
            isGif: false,
            collectionId: envConfig.ton.nftCollectionAddress,
            collectionName: 'HeadHunter - приватная коллекция NFT',
            ownerId: ownerId,
            creatorId: 1,
            onChainIndex: index,
            onChainCollection: envConfig.ton.nftCollectionAddress,
            firstName: 'Manual',
            lastName: `Mint #${index}`,
            color: 'Cyber Blue'
        });
        console.log(`Registered NFT #${index} in database for Owner ID ${ownerId}.`);
    }
}

async function run() {
    try {
        const adminMnemonic = envConfig.ton.adminMnemonic;
        // V4 admin wallet address for the mnemonic
        const adminAddress = 'EQCiMHP4NFCgcJe2HQoPjsEK0eZ2YRF2FO3FD-QCpZNS89-P';
        const toncenterBase = 'https://testnet.toncenter.com';

        console.log(`Targeting Admin V4 wallet: ${adminAddress}`);

        // Fetch current on-chain seqno for V4
        const seqnoPayload = JSON.stringify({ address: adminAddress, method: 'seqno', stack: [] });
        const seqnoOut = execSync(
            `curl -s -X POST '${toncenterBase}/api/v2/runGetMethod' -H 'Content-Type: application/json' -d '${seqnoPayload}'`,
            { encoding: 'utf-8' }
        );
        const seqnoData = JSON.parse(seqnoOut);
        let currentSeqno = 0;
        if (seqnoData.ok && seqnoData.result?.stack?.[0]?.[1]) {
            currentSeqno = parseInt(seqnoData.result.stack[0][1], 16);
        }
        console.log('Current Admin V4 Seqno:', currentSeqno);

        // Re-mint #3, #4, #5
        // Item 3 for User 1 (ellyoone)
        await mintAndRegister(3, 1, 'HeadHunter #3 - Soul of the Hub', currentSeqno);
        currentSeqno++;
        await new Promise(r => setTimeout(r, 4000));

        // Item 4 for User 1 (ellyoone)
        await mintAndRegister(4, 1, 'HeadHunter #4 - Heart of the Network', currentSeqno);
        currentSeqno++;
        await new Promise(r => setTimeout(r, 4000));

        // Item 5 for User 5 (user_7242830649)
        await mintAndRegister(5, 5, 'HeadHunter #5 - Synthetic Echo', currentSeqno);

        console.log('\nAll 3 NFTs minted and registered successfully!');
        process.exit(0);
    } catch (e) {
        console.error('\nERROR:', e.message);
        process.exit(1);
    }
}

run();
