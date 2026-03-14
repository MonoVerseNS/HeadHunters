import { TonClient, WalletContractV5R1, internal } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';
import TonWeb from 'tonweb';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Cell as CoreCell } from '@ton/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { Cell } = TonWeb.boc;

function createOffchainUriCell(uri) {
    const cell = new Cell();
    cell.bits.writeUint(1, 8); // 0x01 prefix indicating off-chain JSON
    cell.bits.writeString(uri);
    return cell;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function ObjectRetry(fn, retries = 5) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (err) {
            if (i === retries - 1) throw err;
            console.log(`[Rate Limit] Retrying... (${i + 1})`);
            await sleep(5000);
        }
    }
}

async function main() {
    const env = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../env.json'), 'utf-8'));
    const endpoint = env.ton.rpcEndpoint + '/jsonRPC';

    const client = new TonClient({ endpoint, apiKey: env.ton.toncenterApiKey });
    const keyPair = await mnemonicToPrivateKey(env.ton.adminMnemonic.split(' '));
    const wallet = WalletContractV5R1.create({ publicKey: keyPair.publicKey, workchain: 0, walletId: { networkGlobalId: -239 } });
    const walletContract = client.open(wallet);

    // Explicitly create 4 (change_content) operation
    const body = new Cell();
    body.bits.writeUint(4, 32); // OP change_content
    body.bits.writeUint(Math.floor(Date.now() / 1000), 64); // random query_id
    body.refs[0] = createOffchainUriCell('https://hh.nerou.fun/coin_metadata.json');

    const coreCell = CoreCell.fromBoc(Buffer.from(await body.toBoc(false)))[0];
    const seqno = await ObjectRetry(() => walletContract.getSeqno());

    console.log('Sending forced metadata Jetton update transaction...');
    await ObjectRetry(() => walletContract.sendTransfer({
        seqno,
        secretKey: keyPair.secretKey,
        messages: [
            internal({
                to: env.ton.jettonMasterAddress,
                value: '0.05', // tons for gas
                body: coreCell,
                bounce: true
            })
        ]
    }));
    console.log('Jetton Transaction sent! Wait 15s...');
    await sleep(15000);

    // NFT Collection Content changing:
    // NftCollection body layout for OP=4:
    // body.refs[0] = collection_content: ^Cell (starts with 0x01)
    // body.refs[1] = royalty_params: ^Cell
    const bodyNft = new Cell();
    bodyNft.bits.writeUint(4, 32);
    bodyNft.bits.writeUint(Math.floor(Date.now() / 1000), 64);

    // collection content subcell
    const collContent = new Cell();
    // 0x01 meaning offchain url
    collContent.bits.writeUint(1, 8);
    collContent.bits.writeString('https://hh.nerou.fun/collection_metadata.json');
    const commonContent = new Cell();
    commonContent.bits.writeString('https://hh.nerou.fun/nft/');

    const parentContent = new Cell();
    parentContent.refs[0] = collContent;
    parentContent.refs[1] = commonContent;

    // royalty
    const royaltyCell = new Cell();
    const factor = Math.floor(0.05 * 1000);
    royaltyCell.bits.writeUint(factor, 16);
    royaltyCell.bits.writeUint(1000, 16);
    royaltyCell.bits.writeAddress(new TonWeb.utils.Address(wallet.address.toString()));

    bodyNft.refs[0] = parentContent;
    bodyNft.refs[1] = royaltyCell;

    const coreCellNft = CoreCell.fromBoc(Buffer.from(await bodyNft.toBoc(false)))[0];
    const seqno2 = await ObjectRetry(() => walletContract.getSeqno());

    console.log('Sending forced metadata NFT update transaction...');
    await ObjectRetry(() => walletContract.sendTransfer({
        seqno: seqno2,
        secretKey: keyPair.secretKey,
        messages: [
            internal({
                to: env.ton.nftCollectionAddress,
                value: '0.05',
                body: coreCellNft,
                bounce: true
            })
        ]
    }));
    console.log('NFT Transaction sent!');

}
main().catch(console.error);
