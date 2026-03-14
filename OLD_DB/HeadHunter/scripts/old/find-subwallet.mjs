import { mnemonicToWalletKey } from '@ton/crypto';
import { WalletContractV4 } from '@ton/ton';

async function main() {
    const mnemonic = 'tip accuse tornado comfort firm analyst burst sign nose net fun reveal roof bracket icon together category hand park sail fashion believe battle egg';
    const target = '0QAmnJu2ZiCmDjIeT4_OMH-Rc-OiolGvhdUKtjMPG6-dmwoa';
    const keyPair = await mnemonicToWalletKey(mnemonic.split(' '));

    // Common subwallet IDs: default (698983191), 0, 1, etc.
    const candidates = [698983191, 0, 1, 2, 3, 10, 100];
    for (const sub of candidates) {
        const wallet = WalletContractV4.create({
            publicKey: keyPair.publicKey,
            workchain: 0,
            subwalletId: sub
        });
        const addr = wallet.address.toString({ testOnly: true, bounceable: false });
        console.log(`Subwallet ${sub}: ${addr}`);
        if (addr === target) {
            console.log('MATCH FOUND!');
            break;
        }
    }
}
main();
