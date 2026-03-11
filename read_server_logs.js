import { Client } from 'ssh2';

const config = {
    host: '95.182.97.163',
    username: 'root',
    password: '7177gomelkO',
};

const conn = new Client();

conn.on('ready', () => {
    conn.exec('tail -n 100 /root/.pm2/logs/hh-test-error.log', (err, stream) => {
        if (err) throw err;
        stream.on('close', () => {
            conn.exec('tail -n 100 /root/.pm2/logs/hh-test-out.log', (err2, stream2) => {
                stream2.on('close', () => conn.end())
                       .on('data', d => console.log("OUT:", d.toString()));
            });
        }).on('data', d => console.log("ERR:", d.toString()));
    });
}).on('error', (err) => {
    console.error('SSH Error:', err);
}).connect(config);
