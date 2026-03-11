import { Client } from 'ssh2';

const config = {
    host: '95.182.97.163',
    username: 'root',
    password: 'UxU9IeKQOyrpzL=NEu',
    readyTimeout: 20000
};

const conn = new Client();

conn.on('ready', () => {
    console.log('Auth SUCCESS!');
    conn.end();
}).on('error', (err) => {
    console.error('Auth FAILED:', err.message);
}).connect(config);
