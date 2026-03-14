import { mnemonicToWalletKey } from '@ton/crypto';
import { WalletContractV1R1, WalletContractV2R1, WalletContractV3R1, WalletContractV3R2, WalletContractV4, WalletContractV5R1 } from '@ton/ton';

async function main() {
    const m = 'relax judge depth surround steel sting spray domain benefit discover finish giggle add penalty sketch february neither transfer aunt nose raccoon unfold clerk goat';
    const target = '0QAmnJu2ZiCmDjIeT4_OMH-Rc-OiolGvhdUKtjMPG6-dmwoa';
    const keyPair = await mnemonicToWalletKey(m.split(' '));

    const contracts = [
        { name: 'V1R1', c: WalletContractV1R1 },
        { name: 'V2R1', c: WalletContractV2R1 },
        { name: 'V3R1', c: WalletContractV3R1 },
        { name: 'V3R2', c: WalletContractV3R2 },
        { name: 'V4', c: WalletContractV4 },
        { name: 'V5', c: WalletContractV5R1 },
    ];

    for (const item of contracts) {
        const wallet = item.c.create({ publicKey: keyPair.publicKey, workchain: 0 });
        const addr = wallet.address.toString({ testOnly: true, bounceable: false });
        console.log(`${item.name}: ${addr}`);
        if (addr === target) console.log('MATCH!');
    }
}
main();
