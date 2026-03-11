import { mnemonicToWalletKey } from '@ton/crypto';
import { WalletContractV5R1, WalletContractV4 } from '@ton/ton';

async function main() {
    const m = 'relax judge depth surround steel sting spray domain benefit discover finish giggle add penalty sketch february neither transfer aunt nose raccoon unfold clerk goat';
    const kp = await mnemonicToWalletKey(m.split(' '));
    const v5 = WalletContractV5R1.create({ publicKey: kp.publicKey, workchain: 0 });
    const v4 = WalletContractV4.create({ publicKey: kp.publicKey, workchain: 0 });

    console.log('V5 (bounceable):', v5.address.toString({ bounceable: true, urlSafe: true, testOnly: true }));
    console.log('V4 (non-bounceable):', v4.address.toString({ bounceable: false, urlSafe: true, testOnly: true }));
}
main();
