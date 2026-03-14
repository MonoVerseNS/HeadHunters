const { TonClient, Address, WalletContractV5R1, internal, beginCell, toNano } = require('@ton/ton');
const { getHttpEndpoint } = require('@orbs-network/ton-access');
const { mnemonicToWalletKey } = require('@ton/crypto');
const fs = require('fs');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
    const endpoint = await getHttpEndpoint();
    console.log('Using Orbs RPC:', endpoint);

    const client = new TonClient({ endpoint });
    const envConfig = JSON.parse(fs.readFileSync('./env.json', 'utf-8'));

    const mnemonic = envConfig.ton.adminMnemonic.split(' ');
    const keyPair = await mnemonicToWalletKey(mnemonic);
    const wallet = WalletContractV5R1.create({ publicKey: keyPair.publicKey, workchain: 0 });
    const contract = client.open(wallet);

    const targetAddress = Address.parse('EQB3gaAA3pF1mMQSPDLRJt6_Qdtd7BQPmq-Wwyo2PBh31-up');
    const jettonMaster = Address.parse(envConfig.ton.jettonMasterAddress);

    const { TupleBuilder } = require('@ton/core');
    const tb = new TupleBuilder();
    tb.writeAddress(wallet.address);

    const { stack } = await client.runMethod(jettonMaster, 'get_wallet_address', tb.build());
    const adminJettonWallet = stack.readAddress();

    const amountNano = toNano('10000'); // 10000 HH
    const coreCell = beginCell()
        .storeUint(0xf8a7ea5, 32)
        .storeUint(Math.floor(Date.now() / 1000), 64)
        .storeCoins(amountNano)
        .storeAddress(targetAddress)
        .storeAddress(wallet.address)
        .storeBit(false)
        .storeCoins(toNano('0.01'))
        .storeBit(false)
        .endCell();

    const seqno = await contract.getSeqno();
    console.log(`Sending 10,000 HH... Current seqno: ${seqno}`);

    await contract.sendTransfer({
        seqno,
        secretKey: keyPair.secretKey,
        messages: [internal({
            to: adminJettonWallet,
            value: toNano('0.05'),
            body: coreCell,
            bounce: true
        })],
        sendMode: 3
    });

    let currentSeqno = seqno;
    while (currentSeqno === seqno) {
        await sleep(2000);
        currentSeqno = await contract.getSeqno();
    }
    console.log('Refund confirmed! New seqno:', currentSeqno);
}
main().catch(console.error);
