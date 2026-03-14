import { TonClient } from '@ton/ton';
import { Address } from '@ton/core';

async function main() {
    const addressStr = 'EQA-lwxSExSGVbVEO54DFns6qHSPclb2O4W3ntOkKZnhDYP7'; // EQ form
    const endpoint = 'https://testnet.toncenter.com/api/v2/jsonRPC';
    const client = new TonClient({ endpoint });

    const address = Address.parse(addressStr);
    const balance = await client.getBalance(address);
    const state = await client.getContractState(address);

    console.log(`Address: ${addressStr}`);
    console.log(`Balance: ${Number(balance) / 1e9} TON`);
    console.log(`State: ${state.state}`);
}

main().catch(console.error);
