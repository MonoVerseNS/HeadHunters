import { mnemonicToWalletKey } from '@ton/crypto';
import { WalletContractV4, WalletContractV3R2, WalletContractV5R1 } from '@ton/ton';

async function check(mnemonic) {
    const target = '0QAmnJu2ZiCmDjIeT4_OMH-Rc-OiolGvhdUKtjMPG6-dmwoa';
    const keyPair = await mnemonicToWalletKey(mnemonic.split(' '));

    const v3 = WalletContractV3R2.create({ publicKey: keyPair.publicKey, workchain: 0 });
    const v4 = WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0 });
    const v5 = WalletContractV5R1.create({ publicKey: keyPair.publicKey, workchain: 0 });

    const addr3 = v3.address.toString({ testOnly: true, bounceable: false });
    const addr4 = v4.address.toString({ testOnly: true, bounceable: false });
    const addr5 = v5.address.toString({ testOnly: true, bounceable: false });

    console.log(`Mnemonic: ${mnemonic}`);
    console.log(`V3: ${addr3}`);
    console.log(`V4: ${addr4}`);
    console.log(`V5: ${addr5}`);

    if (addr3 === target || addr4 === target || addr5 === target) {
        console.log('MATCH FOUND!');
    } else {
        console.log('NO MATCH');
    }
}

async function main() {
    const m1 = 'tip accuse tornado comfort firm analyst burst sign nose net fun reveal roof bracket icon together category hand park sail fashion believe battle egg';
    await check(m1);
}
main();
