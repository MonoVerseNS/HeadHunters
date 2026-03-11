import { TonClient, WalletContractV5R1, internal, toNano, Address } from '@ton/ton'
import { mnemonicToWalletKey, mnemonicNew } from '@ton/crypto'
import { getHttpEndpoint } from '@orbs-network/ton-access'
import fs from 'fs'

const envConfig = JSON.parse(fs.readFileSync('./env.json', 'utf-8'))
const NETWORK = envConfig.ton?.network || 'testnet'
const PLATFORM_MNEMONIC = envConfig.ton?.platformMnemonic
const USER_1 = 'EQB3gaAA3pF1mMQSPDLRJt6_Qdtd7BQPmq-Wwyo2PBh31-up'

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
    const endpoint = await getHttpEndpoint({ network: NETWORK })
    const client = new TonClient({ endpoint })
    const keyPair = await mnemonicToWalletKey(PLATFORM_MNEMONIC.split(' '))

    // Platform wallet is V5R1
    const wallet = WalletContractV5R1.create({ publicKey: keyPair.publicKey, workchain: 0 })
    const contract = client.open(wallet)

    console.log(`Platform wallet: ${wallet.address.toString()}`)
    const balance = await contract.getBalance()
    console.log(`Balance: ${Number(balance) / 1e9} TON`)

    let seqno = 0
    try {
        seqno = await contract.getSeqno()
    } catch (e) {
        console.log(`Seqno error (assuming uninitialized: 0): ${e.message}`)
    }
    console.log(`Seqno: ${seqno}`)

    const startUserBal = await client.getBalance(Address.parse(USER_1))
    console.log(`User start balance: ${Number(startUserBal) / 1e9} TON`)

    await contract.sendTransfer({
        seqno,
        secretKey: keyPair.secretKey,
        messages: [internal({
            to: USER_1,
            value: toNano('0.05'),
            bounce: false,
            body: 'Gas for Sweep HH'
        })],
        sendMode: 1
    })
    console.log('Transfer sent. Waiting for confirmation...')

    let currentBal = startUserBal
    while (currentBal === startUserBal) {
        await sleep(5000)
        currentBal = await client.getBalance(Address.parse(USER_1))
        console.log(`Polling... Current User 1 Balance: ${Number(currentBal) / 1e9} TON`)
    }
    console.log('Confirmed!')
}
main().catch(console.error)
