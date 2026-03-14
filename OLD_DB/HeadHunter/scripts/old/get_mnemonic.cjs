const crypto = require('crypto');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const envConfig = JSON.parse(fs.readFileSync('./env.json', 'utf-8'));
const secret = envConfig.backend?.jwtSecret || 'default-dev-key-change-in-production';
const ENCRYPTION_KEY = crypto.createHash('sha256').update(secret).digest();

function decryptMnemonic(encryptedText) {
    const [ivHex, authTagHex, encryptedHex] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

const db = new sqlite3.Database('./server/headhunter.db');

db.get('SELECT encrypted_mnemonic FROM custodial_wallets WHERE user_id = 1', (err, row) => {
    if (err) {
        console.error(err);
        return;
    }
    if (row && row.encrypted_mnemonic) {
        const mnemonic = decryptMnemonic(row.encrypted_mnemonic);
        console.log('Mnemonic for User 1:', mnemonic);
    } else {
        console.log('No mnemonic found for User 1');
    }
    db.close();
});
