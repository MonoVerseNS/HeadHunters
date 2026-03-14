import { TonClient, WalletContractV4, WalletContractV5R1, Address } from '@ton/ton'
import { mnemonicToWalletKey } from '@ton/crypto'
import { getHttpEndpoint } from '@orbs-network/ton-access'
import fs from 'fs'

const envConfig = JSON.parse(fs.readFileSync('./env.json', 'utf-8'))

async function check(mnemonic, name) {
    if (!mnemonic) return;
    const endpoint = await getHttpEndpoint({ network: envConfig.ton.network || 'testnet' })
    const client = new TonClient({ endpoint })
    const keyPair = await mnemonicToWalletKey(mnemonic.split(' '))

    // Check V4
    const walletV4 = WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0 })
    const balV4 = await client.getBalance(walletV4.address)
    console.log(`${name} (V4): ${walletV4.address.toString()} -> ${Number(balV4) / 1e9} TON`)

    // Check V5R1
    const walletV5 = WalletContractV5R1.create({ publicKey: keyPair.publicKey, workchain: 0 })
    const balV5 = await client.getBalance(walletV5.address)
    console.log(`${name} (V5): ${walletV5.address.toString()} -> ${Number(balV5) / 1e9} TON`)
}

async function main() {
    await check(envConfig.ton?.adminMnemonic, 'Admin')
    await check(envConfig.ton?.platformMnemonic, 'Platform')
}
main().catch(console.error)
