import { mnemonicToWalletKey } from '@ton/crypto';
import { WalletContractV4 } from '@ton/ton';

async function main() {
    const mnemonic = 'tip accuse tornado comfort firm analyst burst sign nose net fun reveal roof bracket icon together category hand park sail fashion believe battle egg';
    const keyPair = await mnemonicToWalletKey(mnemonic.split(' '));
    const wallet1 = WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0 }); // default subwalletId is 698983191
    console.log('v4 (default):', wallet1.address.toString({ testOnly: true, bounceable: false }));
}
main();
