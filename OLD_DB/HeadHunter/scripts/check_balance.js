import fs from 'fs'
import path from 'path'
import { TonClient, WalletContractV4, WalletContractV5R1 } from '@ton/ton'
import { mnemonicToPrivateKey } from '@ton/crypto'

async function checkBalances() {
    const env = JSON.parse(fs.readFileSync(path.resolve('env.json'), 'utf-8'));
    const mnemonic = env.ton.adminMnemonic;
    const client = new TonClient({
        endpoint: 'https://toncenter.com/api/v2/jsonRPC',
    });
    const keyPair = await mnemonicToPrivateKey(mnemonic.split(' '));

    const v4Config = { publicKey: keyPair.publicKey, workchain: 0 };
    const v5Config = { publicKey: keyPair.publicKey, workchain: 0, walletId: { networkGlobalId: -239 } };

    const w4 = WalletContractV4.create(v4Config);
    const w5 = WalletContractV5R1.create(v5Config);

    console.log("Checking V4R2:");
    const bal4 = await client.getBalance(w4.address);
    console.log(w4.address.toString(true, true, true), Number(bal4) / 1e9, "TON");

    console.log("Checking V5R1:");
    const bal5 = await client.getBalance(w5.address);
    console.log(w5.address.toString(true, true, true), Number(bal5) / 1e9, "TON");
}

checkBalances().catch(console.error);
