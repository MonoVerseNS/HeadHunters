const { TonClient, Address, TupleBuilder } = require('@ton/ton');
const { getHttpEndpoint } = require('@orbs-network/ton-access');
const fs = require('fs');

async function main() {
    const endpoint = await getHttpEndpoint();
    const client = new TonClient({ endpoint });

    // User wallet address from DB/logs
    const userWallet = Address.parse('EQB3gaAA3pF1mMQSPDLRJt6_Qdtd7BQPmq-Wwyo2PBh31-up');
    const jettonWallet = Address.parse('EQAedILDZDGFdcVjAvQyQiAxvsuhT8p3p3Sh9RAk6vfM2qN4');

    console.log("Checking User Wallet:", userWallet.toString());
    console.log("Checking User Jetton Wallet:", jettonWallet.toString());

    const state = await client.getContractState(jettonWallet);
    console.log("Jetton Wallet State:", state.state);

    if (state.state === 'active') {
        const res = await client.runMethod(jettonWallet, 'get_wallet_data');
        const bal = res.stack.readBigNumber();
        const owner = res.stack.readAddress();
        console.log("Actual HH Balance from contract:", Number(bal) / 1e9, "HH");
        console.log("Owner reported by contract:", owner.toString());
    } else {
        console.log("Jetton wallet is NOT active (no balance or not deployed)");
    }
}
main().catch(console.error);
