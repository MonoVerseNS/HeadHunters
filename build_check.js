import { Client } from 'ssh2';

const config = {
    host: '95.182.97.163',
    username: 'root',
    password: '7177gomelkO',
};

const conn = new Client();

conn.on('ready', () => {
    conn.exec('cd /var/www/headhunters && npm run build', (err, stream) => {
        if (err) throw err;
        stream.on('close', (code) => {
            console.log('Exited with', code);
            conn.end();
        }).on('data', d => process.stdout.write(d))
          .stderr.on('data', d => process.stderr.write(d));
    });
}).on('error', (err) => {
    console.error('SSH Error:', err);
}).connect(config);
