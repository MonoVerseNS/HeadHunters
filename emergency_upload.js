import { Client } from 'ssh2';
import { readFileSync } from 'fs';

const config = {
    host: '95.182.97.163',
    username: 'root',
    password: 'UxU9IeKQOyrpzL=NEu',
};

const conn = new Client();

function uploadFileContent(remotePath, content) {
    return new Promise((resolve, reject) => {
        // Escape content for echo/cat
        // Using base64 to avoid escaping issues
        const b64 = Buffer.from(content).toString('base64');
        const cmd = `echo "${b64}" | base64 -d > "${remotePath}"`;
        
        conn.exec(cmd, (err, stream) => {
            if (err) return reject(err);
            stream.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`Upload failed with code ${code}`));
            });
        });
    });
}

conn.on('ready', async () => {
    console.log('SSH Connection ready for EMERGENCY UPLOAD');
    
    try {
        // 1. Upload package.json
        console.log('Uploading package.json...');
        const pkg = readFileSync('package.json');
        await uploadFileContent('/var/www/headhunters/package.json', pkg);
        
        // 2. Upload ecosystem.config.cjs
        console.log('Uploading ecosystem.config.cjs...');
        const eco = readFileSync('ecosystem.config.cjs');
        await uploadFileContent('/var/www/headhunters/ecosystem.config.cjs', eco);
        
        // 3. Upload server.js
        console.log('Uploading server.js...');
        const srv = readFileSync('server/server.js');
        // Ensure directory exists
        await new Promise((resolve, reject) => {
            conn.exec('mkdir -p /var/www/headhunters/server', (err, stream) => {
                if (err) reject(err);
                stream.on('close', resolve);
            });
        });
        await uploadFileContent('/var/www/headhunters/server/server.js', srv);

        // 4. Upload configs
        console.log('Uploading configs...');
        await new Promise((resolve, reject) => {
            conn.exec('mkdir -p /var/www/headhunters/server/data', (err, stream) => {
                if (err) reject(err);
                stream.on('close', resolve);
            });
        });
        
        const envProd = readFileSync('server/data/env.prod.json');
        await uploadFileContent('/var/www/headhunters/server/data/env.prod.json', envProd);
        
        const envTest = readFileSync('server/data/env.test.json');
        await uploadFileContent('/var/www/headhunters/server/data/env.test.json', envTest);
        
        // 5. Upload DB files? No, DB files are created/managed on server.
        // But schema is needed? `db.js` creates schema.
        
        console.log('Uploading db.js...');
        const dbJs = readFileSync('server/db.js');
        await uploadFileContent('/var/www/headhunters/server/db.js', dbJs);
        
        // Upload other critical server files
        const criticalFiles = [
            'server/logger.js', 'server/walletService.js', 'server/nftService.js', 
            'server/backupService.js', 'server/security.js', 'server/realtimeService.js'
        ];
        
        for (const file of criticalFiles) {
            console.log(`Uploading ${file}...`);
            const content = readFileSync(file);
            await uploadFileContent(`/var/www/headhunters/${file}`, content);
        }

        console.log('All critical files uploaded via base64.');
        
        // Now run install
        console.log('Running npm install...');
        conn.exec('cd /var/www/headhunters && npm install --production', (err, stream) => {
            if (err) throw err;
            stream.on('close', (code) => {
                console.log('Install finished: ' + code);
                
                // Start PM2
                console.log('Starting PM2...');
                conn.exec('pm2 delete all || true && pm2 start /var/www/headhunters/ecosystem.config.cjs && pm2 save', (err, stream) => {
                     stream.on('close', () => {
                         console.log('PM2 started.');
                         conn.end();
                     });
                });
            });
            stream.stdout.on('data', d => console.log(d.toString()));
            stream.stderr.on('data', d => console.log('STDERR: ' + d));
        });

    } catch (e) {
        console.error('Error:', e);
        conn.end();
    }
}).on('error', (err) => {
    console.error('SSH Connection Error:', err);
}).connect(config);
