import { WalletContractV1R1, WalletContractV1R2, WalletContractV1R3, WalletContractV2R1, WalletContractV2R2, WalletContractV3R1, WalletContractV3R2, WalletContractV4, WalletContractV5R1, Address } from '@ton/ton';
import { mnemonicToWalletKey } from '@ton/crypto';

async function main() {
    const mnemonic = "tip accuse tornado comfort firm analyst burst sign nose net fun reveal roof bracket icon together category hand park sail fashion believe battle egg";
    const keyPair = await mnemonicToWalletKey(mnemonic.split(' '));
    const target = '0QAmnJu2ZiCmDjIeT4_OMH-Rc-OiolGvhdUKtjMPG6-dmwoa';

    const versions = [
        { name: 'V1R1', class: WalletContractV1R1 },
        { name: 'V1R2', class: WalletContractV1R2 },
        { name: 'V1R3', class: WalletContractV1R3 },
        { name: 'V2R1', class: WalletContractV2R1 },
        { name: 'V2R2', class: WalletContractV2R2 },
        { name: 'V3R1', class: WalletContractV3R1 },
        { name: 'V3R2', class: WalletContractV3R2 },
        { name: 'V4', class: WalletContractV4 },
        { name: 'V5R1', class: WalletContractV5R1 }
    ];

    console.log(`Checking mnemonic for target: ${target}`);

    for (const v of versions) {
        let wallet;
        if (v.name === 'V5R1') {
            wallet = v.class.create({ publicKey: keyPair.publicKey, workchain: 0 });
        } else {
            wallet = v.class.create({ publicKey: keyPair.publicKey, workchain: 0 });
        }
        const addr = wallet.address.toString({ testOnly: true, bounceable: false });
        console.log(`${v.name}: ${addr}`);
        if (addr === target) console.log(`!!! MATCH FOUND: ${v.name} !!!`);
    }

    // Check some common subwallet IDs for V4
    for (let i = 0; i < 5; i++) {
        const wallet = WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0, walletId: i });
        const addr = wallet.address.toString({ testOnly: true, bounceable: false });
        if (addr === target) console.log(`!!! MATCH FOUND: V4 Subwallet ${i} !!!`);
    }
}

main().catch(console.error);
