import { Client } from 'ssh2';

const config = {
    host: '95.182.97.163',
    username: 'root',
    password: 'UxU9IeKQOyrpzL=NEu',
};

const conn = new Client();

conn.on('ready', () => {
    console.log('SSH Connection ready for CHECK');
    
    // Check if hh-prod is running
    const cmd = `
        pm2 list
        echo "---"
        pm2 logs hh-prod --lines 20 --nostream
    `;

    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        stream.on('close', (code, signal) => {
            console.log('Check finished with code: ' + code);
            conn.end();
        }).on('data', (data) => {
            console.log(data.toString());
        }).stderr.on('data', (data) => {
            console.log('STDERR: ' + data);
        });
    });
}).on('error', (err) => {
    console.error('SSH Connection Error:', err);
}).connect(config);
