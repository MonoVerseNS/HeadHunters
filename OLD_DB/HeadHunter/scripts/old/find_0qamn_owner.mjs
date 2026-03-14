import { WalletContractV4, WalletContractV5R1, Address } from '@ton/ton';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
    const env = JSON.parse(readFileSync(join(__dirname, 'env.json'), 'utf-8'));
    const targetAddress = Address.parse('0QAmnJu2ZiCmDjIeT4_OMH-Rc-OiolGvhdUKtjMPG6-dmwoa').toString({ testOnly: true });

    console.log(`Searching for owner of: ${targetAddress}`);

    const db = await open({
        filename: join(__dirname, 'server', 'headhunter.db'),
        driver: sqlite3.Database
    });

    const wallets = await db.all("SELECT user_id, public_key, address FROM custodial_wallets");

    for (const w of wallets) {
        if (!w.public_key) continue;
        const pubKey = Buffer.from(w.public_key, 'hex');

        // Check V4R2
        const v4 = WalletContractV4.create({ publicKey: pubKey, workchain: 0 });
        const v4Addr = v4.address.toString({ testOnly: true });

        // Check V5R1
        const v5 = WalletContractV5R1.create({ publicKey: pubKey, workchain: 0 });
        const v5Addr = v5.address.toString({ testOnly: true });

        console.log(`User ${w.user_id}: V4=${v4Addr}, V5=${v5Addr}`);

        if (v4Addr === targetAddress || v5Addr === targetAddress) {
            console.log(`!!! MATCH FOUND !!! User ID: ${w.user_id}`);
            const mnemonicEnc = await db.get("SELECT mnemonic FROM custodial_wallets WHERE user_id = ?", [w.user_id]);
            console.log(`Encrypted Mnemonic: ${mnemonicEnc.mnemonic}`);
            process.exit(0);
        }
    }

    console.log("No match found in custodial_wallets.");
}

main().catch(console.error);
