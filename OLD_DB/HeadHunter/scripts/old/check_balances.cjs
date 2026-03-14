const { TonClient, Address, TupleBuilder } = require('@ton/ton');
const { getHttpEndpoint } = require('@orbs-network/ton-access');
const fs = require('fs');

async function main() {
    const endpoint = await getHttpEndpoint();
    const client = new TonClient({ endpoint });
    const envConfig = JSON.parse(fs.readFileSync('./env.json', 'utf-8'));

    const platform = Address.parse(envConfig.ton.platformWalletAddress);
    const user = Address.parse('EQB3gaAA3pF1mMQSPDLRJt6_Qdtd7BQPmq-Wwyo2PBh31-up'); // user 1
    const jettonMaster = Address.parse(envConfig.ton.jettonMasterAddress);

    const pBalance = await client.getBalance(platform);
    const uBalance = await client.getBalance(user);

    console.log(`Platform TON Balance: ${Number(pBalance) / 1e9} TON`);
    console.log(`User TON Balance: ${Number(uBalance) / 1e9} TON`);

    // Check Jetton Balances
    for (const [name, addr] of [['Platform', platform], ['User', user]]) {
        const tb = new TupleBuilder();
        tb.writeAddress(addr);
        const res1 = await client.runMethod(jettonMaster, 'get_wallet_address', tb.build());
        const jWallet = res1.stack.readAddress();

        try {
            const res2 = await client.runMethod(jWallet, 'get_wallet_data');
            const bal = res2.stack.readBigNumber();
            console.log(`${name} HH Balance: ${Number(bal) / 1e9} HH`);
        } catch (e) {
            console.log(`${name} HH Balance: 0 HH (uninitialized or error: ${e.message})`);
        }
    }
}
main().catch(console.error);
