import { mnemonicToWalletKey } from '@ton/crypto';
import { WalletContractV4, WalletContractV3R2 } from '@ton/ton';

async function main() {
    const mnemonic = 'tip accuse tornado comfort firm analyst burst sign nose net fun reveal roof bracket icon together category hand park sail fashion believe battle egg';
    const target = '0QAmnJu2ZiCmDjIeT4_OMH-Rc-OiolGvhdUKtjMPG6-dmwoa';
    const keyPair = await mnemonicToWalletKey(mnemonic.split(' '));

    console.log(`Target: ${target}`);

    // V4R2
    const v4 = WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0 });
    console.log(`V4R2 default: ${v4.address.toString({ testOnly: true, bounceable: false })}`);

    // V3R2
    const v3 = WalletContractV3R2.create({ publicKey: keyPair.publicKey, workchain: 0 });
    console.log(`V3R2 default: ${v3.address.toString({ testOnly: true, bounceable: false })}`);

    // Check if it's maybe non-testnet string (but target is a testnet string starting with 0Q...)
}
main();
