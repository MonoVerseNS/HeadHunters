import { TonClient, Address, WalletContractV3R1, WalletContractV3R2, WalletContractV4, WalletContractV5R1 } from '@ton/ton';
import { mnemonicToWalletKey } from '@ton/crypto';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envConfig = JSON.parse(readFileSync(join(__dirname, 'env.json'), 'utf-8'));

const TARGET_OWNER = 'EQCiMHP4NFCgcJe2HQoPjsEK0eZ2YRF2FO3FD-QCpZNS89-P';

async function checkVersions(mnemonic) {
    console.log(`Checking mnemonic: ${mnemonic.slice(0, 10)}...`);
    const keyPair = await mnemonicToWalletKey(mnemonic.split(' '));

    const versions = [
        { name: 'V3R1', contract: WalletContractV3R1 },
        { name: 'V3R2', contract: WalletContractV3R2 },
        { name: 'V4', contract: WalletContractV4 },
        { name: 'V5R1 (Default)', contract: WalletContractV5R1 }
    ];

    for (const v of versions) {
        let wallet;
        if (v.name === 'V5R1 (Default)') {
            wallet = v.contract.create({ publicKey: keyPair.publicKey, workchain: 0 });
        } else {
            wallet = v.contract.create({ publicKey: keyPair.publicKey, workchain: 0 });
        }

        const addr = wallet.address.toString({ testOnly: true });
        const addrProd = wallet.address.toString({ testOnly: false });

        console.log(`${v.name}: ${addr} / ${addrProd}`);
        if (addr === TARGET_OWNER || addrProd === TARGET_OWNER) {
            console.log(`>>> MATCH FOUND: ${v.name}`);
        }
    }
}

async function run() {
    await checkVersions(envConfig.ton.adminMnemonic);
    console.log('\n--- Done ---');
}

run();
