import crypto from 'crypto';
import fs from 'fs';
import { mnemonicToWalletKey } from '@ton/crypto';
import { WalletContractV4, WalletContractV5R1, WalletContractV3R2 } from '@ton/ton';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const envConfig = JSON.parse(fs.readFileSync('./env.json', 'utf-8'));
const secret = envConfig.backend?.jwtSecret || 'default-dev-key-change-in-production';
const ENCRYPTION_KEY = crypto.createHash('sha256').update(secret).digest();

function decrypt(encryptedData) {
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
        filename: './server/headhunter.db',
        driver: sqlite3.Database
    });

    const rows = await db.all('SELECT user_id, address, encrypted_mnemonic FROM custodial_wallets');
    console.log(`Checking ${rows.length} wallets...`);

    for (const row of rows) {
        const mnemonic = decrypt(row.encrypted_mnemonic);
        if (!mnemonic) {
            console.log(`Failed to decrypt for user ${row.user_id}`);
            continue;
        }

        const kp = await mnemonicToWalletKey(mnemonic.split(' '));
        const versions = [
            { name: 'V3R2', c: WalletContractV3R2 },
            { name: 'V4', c: WalletContractV4 },
            { name: 'V5', c: WalletContractV5R1 }
        ];

        for (const v of versions) {
            const wallet = v.c.create({ publicKey: kp.publicKey, workchain: 0 });
            const addr = wallet.address.toString({ testOnly: true, bounceable: false });
            if (addr === target) {
                console.log(`MATCH FOUND! User ID: ${row.user_id}, Version: ${v.name}`);
                console.log(`Mnemonic: ${mnemonic}`);
                return;
            }
        }
    }
    console.log('No match found in custodial_wallets');
}
main();
