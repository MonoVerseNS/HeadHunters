import { WalletContractV1R1, WalletContractV2R1, WalletContractV3R1, WalletContractV3R2, WalletContractV4, WalletContractV5R1 } from '@ton/ton';

async function main() {
    const pubKeyHex = 'dfba6673fd7d1ce62ff8c122d8bd04413994d926debc6b7688691fd8bbffef99';
    const target = '0QAmnJu2ZiCmDjIeT4_OMH-Rc-OiolGvhdUKtjMPG6-dmwoa';
    const publicKey = Buffer.from(pubKeyHex, 'hex');

    const contracts = [
        { name: 'V1R1', c: WalletContractV1R1 },
        { name: 'V2R1', c: WalletContractV2R1 },
        { name: 'V3R1', c: WalletContractV3R1 },
        { name: 'V3R2', c: WalletContractV3R2 },
        { name: 'V4', c: WalletContractV4 },
        { name: 'V5', c: WalletContractV5R1 },
    ];

    for (const item of contracts) {
        const wallet = item.c.create({ publicKey: publicKey, workchain: 0 });
        const addr = wallet.address.toString({ testOnly: true, bounceable: false });
        console.log(`${item.name}: ${addr}`);
        if (addr === target) console.log('MATCH!');
    }
}
main();
