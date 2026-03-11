import crypto from 'crypto';
import fs from 'fs';

const encryptedData = '11ba592a560b64e85c283529cba24954:06b511efedeadb762ff828ffdd00adf6:cebc189aa8392f9f79ee2d41dbeafc9547e93d1f31691955d49db1001a047b78d352bc098236f384dc1d3fdcf26073761012898e4ff58add5a44422d9eb05761a408c04e9238d651649b161182924079471e65cca828d3c49605c085dda4f98549b42ef9bdfe436cbb8dd5822654afc42fc9283af65f4cd703c6f05dc4261b785f19a492af4973a8fe4c6a4716a00b35f2da8f598a2dd58c1006f6f0';

const envConfig = JSON.parse(fs.readFileSync('./env.json', 'utf-8'));
const secret = envConfig.backend?.jwtSecret || 'default-dev-key-change-in-production';
const ENCRYPTION_KEY = crypto.createHash('sha256').update(secret).digest();

function decryptMnemonic(encryptedData) {
    const [ivHex, authTagHex, encrypted] = encryptedData.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

try {
    const mnemonic = decryptMnemonic(encryptedData);
    console.log('Decrypted Mnemonic:', mnemonic);
} catch (e) {
    console.error('Decryption failed:', e.message);
}
