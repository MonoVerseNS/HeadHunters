import { mnemonicToWalletKey } from '@ton/crypto';
import { WalletContractV3R2, WalletContractV4, WalletContractV5R1 } from '@ton/ton';

async function check(mnemonic, target) {
    const keyPair = await mnemonicToWalletKey(mnemonic.split(' '));
    const subs = [0, 698983191];

    const contracts = [
        { name: 'V3R2', c: WalletContractV3R2 },
        { name: 'V4', c: WalletContractV4 },
        { name: 'V5', c: WalletContractV5R1 },
    ];

    for (const sub of subs) {
        for (const item of contracts) {
            let wallet;
            if (item.name === 'V5') {
                wallet = item.c.create({ publicKey: keyPair.publicKey, workchain: 0, subwalletId: sub });
            } else {
                wallet = item.c.create({ publicKey: keyPair.publicKey, workchain: 0, subwalletId: sub });
            }
            const addr = wallet.address.toString({ testOnly: true, bounceable: false });
            console.log(`${item.name} sub ${sub}: ${addr}`);
            if (addr === target) console.log('MATCH FOUND!');
        }
    }
}

async function main() {
    const m = 'tip accuse tornado comfort firm analyst burst sign nose net fun reveal roof bracket icon together category hand park sail fashion believe battle egg';
    const target = '0QAmnJu2ZiCmDjIeT4_OMH-Rc-OiolGvhdUKtjMPG6-dmwoa';
    await check(m, target);
}
main();
