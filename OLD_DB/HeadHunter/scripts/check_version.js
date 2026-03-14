import { WalletContractV3R1, WalletContractV3R2, WalletContractV4, WalletContractV5R1 } from '@ton/ton'
import { mnemonicToWalletKey } from '@ton/crypto'
import fs from 'fs'

const envConfig = JSON.parse(fs.readFileSync('./env.json', 'utf-8'))
const PLATFORM_MNEMONIC = envConfig.ton?.platformMnemonic
const TARGET = envConfig.ton?.platformWalletAddress

async function main() {
    console.log(`Target Address: ${TARGET}`)
    const keyPair = await mnemonicToWalletKey(PLATFORM_MNEMONIC.split(' '))

    const v3r1 = WalletContractV3R1.create({ publicKey: keyPair.publicKey, workchain: 0 })
    console.log(`V3R1: ${v3r1.address.toString()}`)

    const v3r2 = WalletContractV3R2.create({ publicKey: keyPair.publicKey, workchain: 0 })
    console.log(`V3R2: ${v3r2.address.toString()}`)

    const v4 = WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0 })
    console.log(`V4R2: ${v4.address.toString()}`)

    const v5r1 = WalletContractV5R1.create({ publicKey: keyPair.publicKey, workchain: 0 })
    console.log(`V5R1: ${v5r1.address.toString()}`)
}
main().catch(console.error)
