const { TonClient, Address } = require('@ton/ton');
const { TupleBuilder } = require('@ton/core');
const { mnemonicToWalletKey } = require('@ton/crypto');
const { WalletContractV5R1, WalletContractV4 } = require('@ton/ton');
const fs = require('fs');
const { getHttpEndpoint } = require('@orbs-network/ton-access');

async function main() {
    const endpoint = await getHttpEndpoint();
    const client = new TonClient({ endpoint });

    const envConfig = JSON.parse(fs.readFileSync('./env.json', 'utf-8'));
    const platformMnem = envConfig.ton.platformMnemonic;
    const keyPair = await mnemonicToWalletKey(platformMnem.split(' '));

    // Check V5R1
    const walletV5 = WalletContractV5R1.create({ publicKey: keyPair.publicKey, workchain: 0 });
    console.log("Derived Platform Address (V5R1):", walletV5.address.toString());

    // Check V4 (maybe the platform wallet was generated as V4)
    const walletV4 = WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0 });
    console.log("Derived Platform Address (V4):", walletV4.address.toString());

    console.log("Expected Platform Address from env.json:", envConfig.ton.platformWalletAddress);

    const jettonMaster = Address.parse(envConfig.ton.jettonMasterAddress);

    for (const w of [walletV5, walletV4]) {
        console.log(`\nTesting get_wallet_address for ${w.address.toString()}`);
        const tb = new TupleBuilder();
        tb.writeAddress(w.address);
        try {
            const result = await client.runMethod(jettonMaster, 'get_wallet_address', tb.build());
            console.log("SUCCESS:", result.stack.readAddress().toString());
        } catch (e) {
            console.error("FAILED with:", e.message);
        }
    }
}
main().catch(console.error);
