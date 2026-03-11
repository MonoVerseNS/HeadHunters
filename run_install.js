import { Client } from 'ssh2';

const config = {
    host: '95.182.97.163',
    username: 'root',
    password: 'UxU9IeKQOyrpzL=NEu',
};

const conn = new Client();

conn.on('ready', () => {
    console.log('SSH Connection ready for INSTALL & START');
    
    // Commands to run
    const cmd = `
        cd /var/www/headhunters
        
        echo "Installing dependencies (this may take a while)..."
        npm install --production
        
        echo "Starting PM2..."
        pm2 delete all || true
        pm2 start ecosystem.config.cjs
        pm2 save
        
        echo "Restarting Nginx..."
        systemctl restart nginx
        
        echo "DONE!"
    `;

    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        stream.on('close', (code, signal) => {
            console.log('Install script finished with code: ' + code);
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
