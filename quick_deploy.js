import { Client } from 'ssh2';
import { readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const config = {
    host: '95.182.97.163',
    username: 'root',
    password: 'UxU9IeKQOyrpzL=NEu',
    remoteDir: '/var/www/headhunters'
};

const conn = new Client();

function getAllFiles(dir) {
    let results = [];
    const list = readdirSync(dir);
    list.forEach(file => {
        file = join(dir, file);
        const stat = statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(getAllFiles(file));
        } else {
            results.push(file);
        }
    });
    return results;
}

conn.on('ready', () => {
    console.log('SSH Connection ready for QUICK DEPLOY');

    conn.sftp((err, sftp) => {
        if (err) throw err;

        const uploadQueue = [];
        
        // Only upload critical backend files
        const filesToUpload = ['package.json', 'package-lock.json', 'ecosystem.config.cjs', 'setup_server.sh'];
        filesToUpload.forEach(file => {
            uploadQueue.push({ local: file, remote: `${config.remoteDir}/${file}` });
        });

        try {
            const serverFiles = getAllFiles('server');
            serverFiles.forEach(localPath => {
                const relPath = relative(process.cwd(), localPath).replace(/\\/g, '/');
                uploadQueue.push({ local: localPath, remote: `${config.remoteDir}/${relPath}` });
            });
        } catch(e) { console.error(`Skipping server dir: ${e.message}`); }
        
        // Also setup script to root
        uploadQueue.push({ local: 'setup_server.sh', remote: '/root/setup_server.sh' });

        console.log(`Starting upload of ${uploadQueue.length} files...`);

        const uploadNext = () => {
            if (uploadQueue.length === 0) {
                console.log('All files uploaded. Executing setup...');
                executeSetup();
                return;
            }

            const { local, remote } = uploadQueue.shift();
            const remoteDir = remote.substring(0, remote.lastIndexOf('/'));

            conn.exec(`mkdir -p "${remoteDir}"`, (err, stream) => {
                stream.on('close', () => {
                    sftp.fastPut(local, remote, (err) => {
                        if (err) console.error(`Failed to upload ${local}: ${err.message}`);
                        else console.log(`Uploaded: ${remote}`);
                        uploadNext();
                    });
                });
            });
        };

        uploadNext();

    });
}).on('error', (err) => {
    console.error('SSH Connection Error:', err);
}).connect(config);

function executeSetup() {
    const cmd = `
        echo "Fixing permissions..."
        chmod +x /root/setup_server.sh
        
        echo "Running setup..."
        cd /var/www/headhunters
        npm install --production
        
        echo "Starting PM2..."
        pm2 delete all || true
        pm2 start ecosystem.config.cjs
        pm2 save
        
        echo "Restarting Nginx..."
        systemctl restart nginx
        
        echo "Status:"
        pm2 status
    `;
    
    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        stream.on('close', (code) => {
            console.log('Setup finished with code: ' + code);
            conn.end();
        }).on('data', (data) => console.log(data.toString()))
          .stderr.on('data', (data) => console.log('STDERR: ' + data));
    });
}
