import { TonClient, Address, beginCell } from '@ton/ton'
import { getHttpEndpoint } from '@orbs-network/ton-access'
import fs from 'fs'

const envConfig = JSON.parse(fs.readFileSync('./env.json', 'utf-8'))
const NETWORK = envConfig.ton?.network || 'testnet'
const JETTON_MASTER = envConfig.ton?.jettonMasterAddress || 'EQCPUA3Yofw-1Bbc_2vdON5fQE8P-IAJmPzEX8v-vYxwEiBw'
const PLATFORM = envConfig.ton?.platformWalletAddress || 'EQDCJRB46bxjMbpura7ejtxYgBTsKfnP1wvNf9a7kxnMbjkp'
const USER_1 = 'EQB3gaAA3pF1mMQSPDLRJt6_Qdtd7BQPmq-Wwyo2PBh31-up'

async function checkBalance(client, ownerAddr, name) {
    try {
        const masterAddress = Address.parse(JETTON_MASTER)
        const ownerAddress = Address.parse(ownerAddr)
        const tonBal = await client.getBalance(ownerAddress)
        const resultList = await client.runMethod(
            masterAddress,
            'get_wallet_address',
            [{ type: 'slice', cell: beginCell().storeAddress(ownerAddress).endCell() }]
        )
        const jettonWalletAddressStr = resultList.stack.readAddress().toString()
        const jwResult = await client.runMethod(Address.parse(jettonWalletAddressStr), 'get_wallet_data')
        const balance = jwResult.stack.readBigNumber()
        console.log(`[${name}] TON: ${Number(tonBal) / 1e9} | HH Balance: ${Number(balance) / 1e9} HH`)
    } catch (e) {
        console.log(`[${name}] HH Balance: 0 (Uninitialized or error: ${e.message})`)
    }
}

async function main() {
    const endpoint = await getHttpEndpoint({ network: NETWORK })
    const client = new TonClient({ endpoint })

    await checkBalance(client, PLATFORM, 'Platform Reserve')
    await checkBalance(client, USER_1, 'User 1')
}
main().catch(console.error)
