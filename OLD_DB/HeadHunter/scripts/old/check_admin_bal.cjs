const { TonClient, Address } = require('@ton/ton');
const { getHttpEndpoint } = require('@orbs-network/ton-access');
const fs = require('fs');

async function main() {
    const endpoint = await getHttpEndpoint();
    const client = new TonClient({ endpoint });
    const envConfig = JSON.parse(fs.readFileSync('./env.json', 'utf-8'));

    // Admin is the minter
    const admin = Address.parse('EQDCJRB46bxjMbpura7ejtxYgBTsKfnP1wvNf9a7kxnMbjkp'); // Platform/Admin is same usually in env.json

    const bal = await client.getBalance(admin);
    console.log(`Admin/Platform TON Balance: ${Number(bal) / 1e9} TON`);
}
main().catch(console.error);
