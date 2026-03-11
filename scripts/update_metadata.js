import { TonClient, WalletContractV5R1, internal } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';
import TonWeb from 'tonweb';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Cell as CoreCell } from '@ton/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { Cell, utils } = TonWeb.boc;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function withRetry(fn, retries = 5) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (err) {
            if (i === retries - 1) throw err;
            console.log(`[Rate Limit / Network Error] Retrying in 5s... (${i + 1}/${retries})`);
            await sleep(5000);
        }
    }
}

async function main() {
    const env = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../env.json'), 'utf-8'));
    const adminMnemonic = env.ton.adminMnemonic;
    const isMainnet = env.ton.network === 'mainnet';
    const endpoint = env.ton.rpcEndpoint;

    const client = new TonClient({ endpoint: endpoint + '/jsonRPC', apiKey: env.ton.toncenterApiKey });
    const tonweb = new TonWeb(new TonWeb.HttpProvider(endpoint + '/jsonRPC'));

    console.log('Initializing Admin V5R1 Wallet...');
    const keyPair = await mnemonicToPrivateKey(adminMnemonic.split(' '));
    const wallet = WalletContractV5R1.create({ publicKey: keyPair.publicKey, workchain: 0, walletId: { networkGlobalId: -239 } });
    const walletContract = client.open(wallet);

    const walletAddress = wallet.address.toString({ bounceable: true, testOnly: !isMainnet });
    console.log(`Deployer Wallet Address: ${walletAddress}`);

    await sleep(2500);
    const balanceNano = await withRetry(() => walletContract.getBalance());
    console.log(`Deployer Balance: ${Number(balanceNano) / 1e9} TON`);

    const jettonMinterAddressStr = env.ton.jettonMasterAddress;
    const nftCollectionAddressStr = env.ton.nftCollectionAddress;

    console.log(`Jetton Minter: ${jettonMinterAddressStr}`);
    console.log(`NFT Collection: ${nftCollectionAddressStr}`);

    const jettonMinter = new TonWeb.token.ft.JettonMinter(tonweb.provider, {
        address: jettonMinterAddressStr
    });

    const nftCollection = new TonWeb.token.nft.NftCollection(tonweb.provider, {
        address: nftCollectionAddressStr
    });

    console.log('Constructing Update Metadata Messages...');

    // 1. Update Jetton Metadata
    const jettonUpdateBodyCell = jettonMinter.createEditContentBody({
        jettonContentUri: 'https://hh.nerou.fun/coin_metadata.json'
    });
    const jettonUpdateBoc = await jettonUpdateBodyCell.toBoc(false);
    const jettonUpdateCoreCell = CoreCell.fromBoc(Buffer.from(jettonUpdateBoc))[0];

    // 2. Update NFT Collection Metadata
    const nftUpdateBodyCell = nftCollection.createEditContentBody({
        collectionContentUri: 'https://hh.nerou.fun/collection_metadata.json',
        nftItemContentBaseUri: 'https://hh.nerou.fun/nft/',
        royalty: 0.05,
        royaltyAddress: new TonWeb.utils.Address(walletAddress)
    });
    const nftUpdateBoc = await nftUpdateBodyCell.toBoc(false);
    const nftUpdateCoreCell = CoreCell.fromBoc(Buffer.from(nftUpdateBoc))[0];

    await sleep(2500);
    const seqno = await withRetry(() => walletContract.getSeqno());

    console.log('Sending transaction to update Jetton Minter metadata...');
    await withRetry(() => walletContract.sendTransfer({
        seqno,
        secretKey: keyPair.secretKey,
        messages: [
            internal({
                to: jettonMinterAddressStr,
                value: '0.02', // 0.02 TON for gas
                body: jettonUpdateCoreCell,
                bounce: true
            })
        ]
    }));
    console.log('Jetton metadata update transaction sent. Wait 20 seconds...');
    await sleep(20000);

    await sleep(2500);
    const seqno2 = await withRetry(() => walletContract.getSeqno());

    console.log('Sending transaction to update NFT Collection metadata...');
    await withRetry(() => walletContract.sendTransfer({
        seqno: seqno2,
        secretKey: keyPair.secretKey,
        messages: [
            internal({
                to: nftCollectionAddressStr,
                value: '0.02', // 0.02 TON for gas
                body: nftUpdateCoreCell,
                bounce: true
            })
        ]
    }));
    console.log('NFT Collection metadata update transaction sent. Done!');
}

main().catch(console.error);
