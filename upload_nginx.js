import { Client } from 'ssh2';

const config = {
    host: '95.182.97.163',
    username: 'root',
    password: '7177gomelkO',
};

const conn = new Client();

conn.on('ready', () => {
    console.log('SSH Connection ready to upload Nginx config');

    conn.sftp((err, sftp) => {
        if (err) throw err;

        sftp.fastPut('headhunters.nginx', '/etc/nginx/sites-available/headhunters', (err) => {
            if (err) {
                console.error(`Failed to upload nginx config: ${err.message}`);
                conn.end();
                return;
            }
            console.log('Nginx config uploaded.');

            const cmd = `
                ln -sf /etc/nginx/sites-available/headhunters /etc/nginx/sites-enabled/
                rm -f /etc/nginx/sites-enabled/default
                nginx -t && systemctl restart nginx
            `;
            
            conn.exec(cmd, (err, stream) => {
                if (err) throw err;
                stream.on('close', (code) => {
                    console.log('Nginx setup finished with code: ' + code);
                    conn.end();
                }).on('data', (data) => console.log(data.toString()))
                  .stderr.on('data', (data) => console.log('STDERR: ' + data));
            });
        });
    });
}).on('error', (err) => {
    console.error('SSH Connection Error:', err);
}).connect(config);
