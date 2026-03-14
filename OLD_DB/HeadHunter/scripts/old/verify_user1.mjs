import { mnemonicToWalletKey } from '@ton/crypto';
import { WalletContractV4, WalletContractV5R1, WalletContractV3R2 } from '@ton/ton';

async function main() {
    const m = 'business wall gallery ten suit become change second vivid hurry song black obvious skill park crumble blood extend kangaroo box slender jelly become symptom';
    const target = '0QAmnJu2ZiCmDjIeT4_OMH-Rc-OiolGvhdUKtjMPG6-dmwoa';
    const keyPair = await mnemonicToWalletKey(m.split(' '));

    const v3 = WalletContractV3R2.create({ publicKey: keyPair.publicKey, workchain: 0 });
    const v4 = WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0 });
    const v5 = WalletContractV5R1.create({ publicKey: keyPair.publicKey, workchain: 0 });

    const addr3 = v3.address.toString({ testOnly: true, bounceable: false });
    const addr4 = v4.address.toString({ testOnly: true, bounceable: false });
    const addr5 = v5.address.toString({ testOnly: true, bounceable: false });

    console.log(`V3: ${addr3}`);
    console.log(`V4: ${addr4}`);
    console.log(`V5: ${addr5}`);
    console.log(`Target: ${target}`);

    if (addr3 === target || addr4 === target || addr5 === target) {
        console.log('MATCH FOUND!');
    } else {
        console.log('NO MATCH');
    }
}
main();
