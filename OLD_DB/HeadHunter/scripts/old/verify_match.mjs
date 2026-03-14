import { mnemonicToWalletKey } from '@ton/crypto';
import { WalletContractV4, WalletContractV5R1 } from '@ton/ton';

async function main() {
    const mnemonic = 'relax judge depth surround steel sting spray domain benefit discover finish giggle add penalty sketch february neither transfer aunt nose raccoon unfold clerk goat';
    const target = '0QAmnJu2ZiCmDjIeT4_OMH-Rc-OiolGvhdUKtjMPG6-dmwoa';
    const keyPair = await mnemonicToWalletKey(mnemonic.split(' '));

    const v4 = WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0 });
    const v5 = WalletContractV5R1.create({ publicKey: keyPair.publicKey, workchain: 0 });

    const addr4 = v4.address.toString({ testOnly: true, bounceable: false });
    const addr5 = v5.address.toString({ testOnly: true, bounceable: false });

    console.log(`V4: ${addr4}`);
    console.log(`V5: ${addr5}`);
    console.log(`Target: ${target}`);

    if (addr4 === target || addr5 === target) {
        console.log('MATCH FOUND!');
    } else {
        console.log('NO MATCH');
    }
}
main();
