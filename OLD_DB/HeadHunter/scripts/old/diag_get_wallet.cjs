const { TonClient, Address, TupleBuilder } = require('@ton/ton');
const { getHttpEndpoint } = require('@orbs-network/ton-access');
const fs = require('fs');

async function main() {
    const endpoint = await getHttpEndpoint();
    const client = new TonClient({ endpoint });
    const envConfig = JSON.parse(fs.readFileSync('./env.json', 'utf-8'));

    const jettonMasterStr = envConfig.ton?.jettonMasterAddress;
    const jettonMaster = Address.parse(jettonMasterStr);

    // Test owner - User 1
    const ownerAddress = Address.parse('EQB3gaAA3pF1mMQSPDLRJt6_Qdtd7BQPmq-Wwyo2PBh31-up');

    console.log(`Testing get_wallet_address for Master: ${jettonMasterStr}`);
    console.log(`Owner: ${ownerAddress.toString()}`);

    try {
        const tb = new TupleBuilder();
        tb.writeAddress(ownerAddress);

        const res = await client.runMethod(jettonMaster, 'get_wallet_address', tb.build());
        console.log("Full Result Object:", JSON.stringify(res, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2));
        console.log("Exit Code:", res.exitCode || res.exit_code);
        if (res.exit_code === 0) {
            const jWallet = res.stack.readAddress();
            console.log("Jetton Wallet Address:", jWallet.toString());
        } else {
            console.error("Method failed with exit code:", res.exit_code);
        }
    } catch (e) {
        console.error("Exception:", e.message);
    }
}
main().catch(console.error);
