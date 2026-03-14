import { WalletContractV1R1, WalletContractV1R2, WalletContractV1R3, WalletContractV2R1, WalletContractV2R2, WalletContractV3R1, WalletContractV3R2, WalletContractV4, WalletContractV5R1, Address } from '@ton/ton';
import { mnemonicToWalletKey } from '@ton/crypto';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import crypto from 'crypto';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const env = JSON.parse(readFileSync(join(__dirname, 'env.json'), 'utf-8'));
const secret = env.backend?.jwtSecret || 'default-dev-key-change-in-production';
const ENCRYPTION_KEY = crypto.createHash('sha256').update(secret).digest();

function decryptMnemonic(encryptedData) {
    try {
        const [ivHex, authTagHex, encrypted] = encryptedData.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        return null;
    }
}

async function main() {
    const target = '0QAmnJu2ZiCmDjIeT4_OMH-Rc-OiolGvhdUKtjMPG6-dmwoa';
    const db = await open({
        filename: join(__dirname, 'server', 'headhunter.db'),
        driver: sqlite3.Database
    });

    const wallets = await db.all("SELECT user_id, encrypted_mnemonic FROM custodial_wallets");

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

    for (const w of wallets) {
        const mnemonic = decryptMnemonic(w.encrypted_mnemonic);
        if (!mnemonic) {
            console.log(`Failed to decrypt for user ${w.user_id}`);
            continue;
        }

        const keyPair = await mnemonicToWalletKey(mnemonic.split(' '));

        for (const v of versions) {
            const wallet = v.class.create({ publicKey: keyPair.publicKey, workchain: 0 });
            const addr = wallet.address.toString({ testOnly: true, bounceable: false });
            if (addr === target) {
                console.log(`!!! MATCH FOUND !!! User ID: ${w.user_id}, Version: ${v.name}`);
                console.log(`Mnemonic: ${mnemonic}`);
                process.exit(0);
            }
        }
    }

    console.log("No match found in all decrypted custodial wallets.");
}

main().catch(console.error);
