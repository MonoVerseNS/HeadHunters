
import fs from 'fs';
import path from 'path';
import cron from 'node-cron';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const ENV_PATH = path.join(DATA_DIR, 'env.json');
const DB_PATH = path.join(DATA_DIR, 'headhunter.db');

export function startBackupService() {
    console.log('[BACKUP] Initializing backup service...');

    // Load config
    let config;
    try {
        config = JSON.parse(fs.readFileSync(ENV_PATH, 'utf-8'));
    } catch (e) {
        console.error('[BACKUP] Failed to load env.json:', e);
        return;
    }

    const botToken = config.telegram?.botToken;
    const backupChatId = config.telegram?.backupChatId;

    if (!botToken || !backupChatId) {
        console.warn('[BACKUP] Missing botToken or backupChatId in env.json. Backups disabled.');
        return;
    }

    // Schedule: Every hour at minute 0
    cron.schedule('0 * * * *', async () => {
        console.log('[BACKUP] Starting scheduled backup...');
        await performBackup(botToken, backupChatId);
    });

    console.log('[BACKUP] Service started. Schedule: Hourly.');
}

export async function performBackup(token, chatId) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const zipFilename = `headhunter_full_backup_${timestamp}.zip`;
    const zipPath = path.join(__dirname, zipFilename);

    try {
        // 1. Create a ZIP of the data folder and public assets
        console.log('[BACKUP] Zipping data and public folders...');

        const projectRoot = path.join(__dirname, '..');

        // Use zip command to include both server/data and public
        // cd to root first so paths in zip are clean
        await execPromise(`cd "${projectRoot}" && zip -r "${zipPath}" server/data public`);

        // 2. Send via curl
        console.log(`[BACKUP] Sending ZIP backup to ${chatId}...`);
        const caption = `📦 Full Project Backup (Data + Assets): ${new Date().toISOString()}`;

        const safeCaption = caption.replace(/"/g, '\\"');
        const cmd = `curl -s -F chat_id="${chatId}" -F document=@"${zipPath}" -F caption="${safeCaption}" https://api.telegram.org/bot${token}/sendDocument`;

        const { stdout } = await execPromise(cmd);

        try {
            const result = JSON.parse(stdout);
            if (result.ok) {
                console.log(`[BACKUP] Success! Sent to chat ${chatId}`);
            } else {
                console.error('[BACKUP] Telegram API Error:', result);
                if (result.description) console.error(`[BACKUP] Error details: ${result.description}`);
            }
        } catch (e) {
            console.error('[BACKUP] Failed to parse response or CURL failed to reach API:', stdout || 'Empty response');
            console.error('[BACKUP] Command used:', cmd.replace(token, 'REDACTED'));
        }

    } catch (e) {
        console.error('[BACKUP] Execution error:', e);
    } finally {
        // 3. Cleanup
        if (fs.existsSync(zipPath)) {
            try {
                fs.unlinkSync(zipPath);
            } catch (e) {
                console.error('[BACKUP] Cleanup error:', e);
            }
        }
    }
}
