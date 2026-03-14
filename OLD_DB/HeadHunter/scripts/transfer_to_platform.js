import { TonClient, WalletContractV5R1, internal } from '@ton/ton';
import { mnemonicToPrivateKey, mnemonicNew } from '@ton/crypto';
import TonWeb from 'tonweb';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Cell as CoreCell } from '@ton/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { Cell } = TonWeb.boc;

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
    const envPath = path.resolve(__dirname, '../env.json');
    const env = JSON.parse(fs.readFileSync(envPath, 'utf-8'));
    const endpoint = env.ton.rpcEndpoint + '/jsonRPC';
    const isMainnet = env.ton.network === 'mainnet';

    // 1. Ensure platform wallet exists
    let platformAddressStr = env.ton.platformWalletAddress;
    if (!platformAddressStr) {
        console.log("Generating a new Platform Wallet...");
        const newMnemonic = await mnemonicNew();
        const newKeyPair = await mnemonicToPrivateKey(newMnemonic);
        const newWallet = WalletContractV5R1.create({ publicKey: newKeyPair.publicKey, workchain: 0, walletId: { networkGlobalId: -239 } });

        platformAddressStr = newWallet.address.toString({ bounceable: true, testOnly: !isMainnet });

        env.ton.platformWalletAddress = platformAddressStr;
        env.ton.platformMnemonic = newMnemonic.join(' ');
        fs.writeFileSync(envPath, JSON.stringify(env, null, 4));
        console.log(`Platform wallet generated and saved: ${platformAddressStr}`);
    } else {
        console.log(`Platform wallet exists: ${platformAddressStr}`);
    }

    const client = new TonClient({ endpoint, apiKey: env.ton.toncenterApiKey });
    const tonweb = new TonWeb(new TonWeb.HttpProvider(endpoint));

    const keyPair = await mnemonicToPrivateKey(env.ton.adminMnemonic.split(' '));
    const wallet = WalletContractV5R1.create({ publicKey: keyPair.publicKey, workchain: 0, walletId: { networkGlobalId: -239 } });
    const walletContract = client.open(wallet);

    const jettonMinterAddressStr = env.ton.jettonMasterAddress;

    // 2. Fetch Admin's Jetton Wallet Address
    const jettonMinter = new TonWeb.token.ft.JettonMinter(tonweb.provider, { address: jettonMinterAddressStr });
    const adminJettonWalletAddress = await ObjectRetry(() => jettonMinter.getJettonWalletAddress(new TonWeb.utils.Address(wallet.address.toString())));

    console.log(`Admin Jetton Wallet Address: ${adminJettonWalletAddress.toString(true, true, true)}`);

    // 3. Prepare Transfer OP
    // OP for Jetton transfer is 0xf8a7ea5
    const amountToTransfer = TonWeb.utils.toNano('100000000'); // 100 Million
    const body = new Cell();
    body.bits.writeUint(0xf8a7ea5, 32); // OP id
    body.bits.writeUint(Math.floor(Date.now() / 1000), 64); // query_id
    body.bits.writeCoins(amountToTransfer); // amount of jettons
    body.bits.writeAddress(new TonWeb.utils.Address(platformAddressStr)); // destination address
    body.bits.writeAddress(new TonWeb.utils.Address(wallet.address.toString())); // response_destination (excess ton sent back to admin)
    body.bits.writeBit(false); // custom_payload null
    body.bits.writeCoins(TonWeb.utils.toNano('0.01')); // forward_ton_amount (sent to destination with notification)
    body.bits.writeBit(false); // forward_payload empty

    const coreCell = CoreCell.fromBoc(Buffer.from(await body.toBoc(false)))[0];
    const seqno = await ObjectRetry(() => walletContract.getSeqno());

    console.log('Sending transaction to transfer 100,000,000 HHCOINs to platform wallet...');
    await ObjectRetry(() => walletContract.sendTransfer({
        seqno,
        secretKey: keyPair.secretKey,
        messages: [
            internal({
                to: adminJettonWalletAddress.toString(true, true, true),
                value: '0.05', // TONS for gas (forward_ton_amount + processing fee)
                body: coreCell,
                bounce: true
            })
        ]
    }));

    console.log('Transfer sent! Wait 20 seconds for confirmation...');
}

main().catch(console.error);
