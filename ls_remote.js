import { Client } from 'ssh2';

const config = {
    host: '95.182.97.163',
    username: 'root',
    password: 'UxU9IeKQOyrpzL=NEu',
};

const conn = new Client();

conn.on('ready', () => {
    console.log('SSH Connection ready for LS');
    
    conn.exec('ls -la /var/www/headhunters', (err, stream) => {
        if (err) throw err;
        stream.on('close', (code, signal) => {
            console.log('LS finished with code: ' + code);
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
