const { TonClient } = require('@ton/ton');
const { getHttpEndpoint } = require('@orbs-network/ton-access');
const { mnemonicToWalletKey } = require('@ton/crypto');
const { WalletContractV5R1, WalletContractV4 } = require('@ton/ton');
const fs = require('fs');

async function main() {
    const endpoint = await getHttpEndpoint();
    const client = new TonClient({ endpoint });
    const envConfig = JSON.parse(fs.readFileSync('./env.json', 'utf-8'));

    const keyPair = await mnemonicToWalletKey(envConfig.ton.platformMnemonic.split(' '));
    const v5 = WalletContractV5R1.create({ publicKey: keyPair.publicKey, workchain: 0 });
    const v4 = WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0 });

    console.log("V5 Address:", v5.address.toString());
    console.log("V4 Address:", v4.address.toString());

    try {
        const c_v5 = client.open(v5);
        const s_v5 = await c_v5.getSeqno();
        console.log("V5 getSeqno SUCCESS:", s_v5);
    } catch (e) {
        console.log("V5 getSeqno FAILED:", e.message);
    }

    try {
        const c_v4 = client.open(v4);
        const s_v4 = await c_v4.getSeqno();
        console.log("V4 getSeqno SUCCESS:", s_v4);
    } catch (e) {
        console.log("V4 getSeqno FAILED:", e.message);
    }
}
main().catch(console.error);
