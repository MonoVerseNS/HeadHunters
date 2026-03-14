const { TonClient, Address, TupleBuilder } = require('@ton/ton');
const fs = require('fs');

async function main() {
    const envConfig = JSON.parse(fs.readFileSync('./env.json', 'utf-8'));
    const client = new TonClient({
        endpoint: envConfig.ton.rpcEndpoint
    });

    // Check ton balance too
    const userAddr = Address.parse('EQB3gaAA3pF1mMQSPDLRJt6_Qdtd7BQPmq-Wwyo2PBh31-up');
    const b = await client.getBalance(userAddr);
    console.log('User TON Balance:', Number(b) / 1e9);

    const jMaster = Address.parse(envConfig.ton.jettonMasterAddress);

    try {
        const tb = new TupleBuilder();
        tb.writeAddress(userAddr);
        const { stack } = await client.runMethod(jMaster, 'get_wallet_address', tb.build());
        const jWallet = stack.readAddress();
        console.log('Jetton Wallet:', jWallet.toString());

        const { stack: balStack } = await client.runMethod(jWallet, 'get_wallet_data');
        const balNano = balStack.readBigNumber();
        console.log('Balance Nano:', balNano.toString());
        console.log('Balance HH (9 dec):', Number(balNano) / 1e9);
        console.log('Balance HH (6 dec):', Number(balNano) / 1e6);
    } catch (e) {
        console.error('Error fetching jetton:', e.message);
    }
}
main();
