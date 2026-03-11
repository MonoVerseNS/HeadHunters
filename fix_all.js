import { Client } from 'ssh2';

const config = {
    host: '95.182.97.163',
    username: 'root',
    password: '7177gomelkO',
};

const conn = new Client();

function runCmd(cmd) {
    return new Promise((resolve, reject) => {
        conn.exec(cmd, (err, stream) => {
            if (err) return reject(err);
            let out = '';
            stream.on('close', (code) => {
                if (code === 0) resolve(out);
                else reject(new Error(`Exit code ${code} for cmd: ${cmd}`));
            }).on('data', (data) => {
                out += data.toString();
                process.stdout.write(data);
            }).stderr.on('data', (data) => {
                process.stderr.write(data);
            });
        });
    });
}

conn.on('ready', async () => {
    console.log('SSH Ready. Cleaning up and starting fresh clone/build...');

    try {
        await runCmd('pm2 stop all || true');
        await runCmd('pm2 delete all || true');
        await runCmd('rm -rf /var/www/headhunters /var/www/headhunters-test');

        console.log('--- Cloning Main ---');
        await runCmd('mkdir -p /var/www/headhunters');
        await runCmd('git clone https://github.com/MonoVerseNS/HeadHunters.git /var/www/headhunters');
        await runCmd('cd /var/www/headhunters && npm install && npm run build');

        console.log('--- Cloning VibeTrae ---');
        await runCmd('mkdir -p /var/www/headhunters-test');
        await runCmd('git clone -b VibeTrae https://github.com/MonoVerseNS/HeadHunters.git /var/www/headhunters-test');
        await runCmd('cd /var/www/headhunters-test && npm install && npm run build');

        console.log('--- Starting Processes ---');
        // I need to ensure env.json exist before starting
        // hh-prod
        await runCmd('cp /var/www/headhunters/server/data/env.prod.json /var/www/headhunters/server/data/env.json || true');
        await runCmd('cd /var/www/headhunters && pm2 start server/server.js --name hh-prod -- --mode=prod');
        
        // hh-test
        await runCmd('cp /var/www/headhunters-test/server/data/env.test.json /var/www/headhunters-test/server/data/env.json || true');
        await runCmd('cd /var/www/headhunters-test && pm2 start server/server.js --name hh-test -- --mode=test');

        await runCmd('pm2 save');
        await runCmd('nginx -t && systemctl reload nginx');

        console.log('Deployment completed successfully!');
    } catch (e) {
        console.error('CRITICAL ERROR during deployment:', e);
    } finally {
        conn.end();
    }
}).on('error', (err) => {
    console.error('SSH Error:', err);
}).connect(config);
