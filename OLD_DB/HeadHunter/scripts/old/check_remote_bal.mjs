import { TonClient, Address } from '@ton/ton';
import { getHttpEndpoint } from '@orbs-network/ton-access';
import fs from 'fs';

async function main() {
    const envConfig = JSON.parse(fs.readFileSync('./env.json', 'utf-8'));
    const endpoint = await getHttpEndpoint({ network: envConfig.ton.network });
    const client = new TonClient({ endpoint });
    const address = Address.parse(envConfig.ton.platformWalletAddress);
    const balance = await client.getBalance(address);
    console.log(`Address: ${address.toString()}`);
    console.log(`Balance: ${Number(balance) / 1e9} TON`);
}
main().catch(console.error);
