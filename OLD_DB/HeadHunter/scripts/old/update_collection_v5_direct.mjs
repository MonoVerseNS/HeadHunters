import { TonClient, WalletContractV5R1, internal, beginCell, toNano, Address } from '@ton/ton';
import { mnemonicToWalletKey } from '@ton/crypto';
import { getHttpEndpoint } from '@orbs-network/ton-access';

async function main() {
    const mnemonic = "tip accuse tornado comfort firm analyst burst sign nose net fun reveal roof bracket icon together category hand park sail fashion believe battle egg";
    const keyPair = await mnemonicToWalletKey(mnemonic.split(' '));

    const apiKey = '95ef17253093bcb94aacfcbbbac9895e23e12a6bf17da5a5309ed2e3c3c76ad1';
    const endpoint = 'https://testnet.toncenter.com/api/v2/jsonRPC';
    const client = new TonClient({ endpoint, apiKey });

    const wallet = WalletContractV5R1.create({
        publicKey: keyPair.publicKey,
        workchain: 0
    });

    const collectionAddress = Address.parse('kQAGUhHRNaoXLXKVJFbhWcX-c7-xJ37qhH5BAlXmvC4WcZay');
    const contract = client.open(wallet);
    const seqno = await contract.getSeqno();

    console.log(`Using Wallet: ${wallet.address.toString()} (V5R1)`);
    console.log(`Balance: ${Number(await client.getBalance(wallet.address)) / 1e9} TON`);
    console.log(`Seqno: ${seqno}`);

    const collectionMetadataUrl = 'https://hh.nerou.fun/collection_metadata.json';
    const commonContentBaseUrl = 'https://hh.nerou.fun/api/nft-metadata/';

    // Build common_content cell
    const commonContentCell = beginCell()
        .storeBuffer(Buffer.from(commonContentBaseUrl, 'utf-8'))
        .endCell();

    // Build collection content cell
    const collectionContentCell = beginCell()
        .storeUint(1, 8)
        .storeStringTail(collectionMetadataUrl)
        .storeRef(commonContentCell)
        .endCell();

    // Body for change_content (OP 4)
    const body = beginCell()
        .storeUint(4, 32)
        .storeUint(Math.floor(Date.now() / 1000), 64)
        .storeRef(collectionContentCell)
        .endCell();

    console.log("Sending Transfer...");
    try {
        await contract.sendTransfer({
            seqno,
            secretKey: keyPair.secretKey,
            sendMode: 3,
            messages: [
                internal({
                    to: collectionAddress,
                    value: toNano('0.05'),
                    bounce: true,
                    body: body
                })
            ]
        });
        console.log("Update sent! Waiting a bit for indexers...");
    } catch (e) {
        console.error("Transfer failed:", e);
    }
}

main().catch(console.error);
