import { Client } from 'ssh2';

const config = {
    host: '95.182.97.163',
    username: 'root',
    password: 'UxU9IeKQOyrpzL=NEu',
};

const conn = new Client();

conn.on('ready', () => {
    console.log('SSH Connection ready for FIX');
    
    // Command chain to fix PM2 and restart Nginx
    const cmd = `
        echo "Stopping old processes..."
        pm2 delete headhunter || true
        pm2 delete hh-prod || true
        pm2 delete hh-test || true
        
        echo "Installing dependencies..."
        cd /var/www/headhunters
        npm install --production
        
        echo "Starting new ecosystem..."
        pm2 start ecosystem.config.cjs
        pm2 save
        
        echo "Restarting Nginx..."
        systemctl restart nginx
        
        echo "Checking status..."
        pm2 status
        netstat -tuln | grep 331
    `;

    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        stream.on('close', (code, signal) => {
            console.log('Fix script finished with code: ' + code);
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
