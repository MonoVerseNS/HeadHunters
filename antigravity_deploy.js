import { Client } from 'ssh2';
import { readdirSync, statSync, readFileSync } from 'fs';
import { join, relative } from 'path';

const config = {
    host: '95.182.97.163',
    username: 'root',
    password: '7177gomelkO', // Updated password from user
    remoteDir: '/var/www/headhunters'
};

const conn = new Client();

function getAllFiles(dir) {
    let results = [];
    if (!statSync(dir).isDirectory()) return [dir];
    
    const list = readdirSync(dir);
    list.forEach(file => {
        const fullPath = join(dir, file);
        const stat = statSync(fullPath);
        if (stat && stat.isDirectory()) {
            results = results.concat(getAllFiles(fullPath));
        } else {
            results.push(fullPath);
        }
    });
    return results;
}

conn.on('ready', () => {
    console.log('SSH Connection ready. Starting deployment to server...');

    conn.sftp((err, sftp) => {
        if (err) throw err;

        const uploadQueue = [];
        
        // Root files
        const rootFiles = ['package.json', 'package-lock.json', 'ecosystem.config.cjs', 'setup_server.sh', 'index.html'];
        rootFiles.forEach(file => {
            uploadQueue.push({ local: file, remote: `${config.remoteDir}/${file}` });
        });

        // Server directory
        try {
            const serverFiles = getAllFiles('server');
            serverFiles.forEach(localPath => {
                const relPath = relative(process.cwd(), localPath).replace(/\\/g, '/');
                uploadQueue.push({ local: localPath, remote: `${config.remoteDir}/${relPath}` });
            });
        } catch(e) { console.warn(`Skipping server dir: ${e.message}`); }

        // Dist directory (Frontend)
        try {
            const distFiles = getAllFiles('dist');
            distFiles.forEach(localPath => {
                const relPath = relative(process.cwd(), localPath).replace(/\\/g, '/');
                uploadQueue.push({ local: localPath, remote: `${config.remoteDir}/${relPath}` });
            });
        } catch(e) { console.warn(`Skipping dist dir: ${e.message}`); }
        
        // Setup script to /root for easy execution
        uploadQueue.push({ local: 'setup_server.sh', remote: '/root/setup_server.sh' });

        console.log(`Starting upload of ${uploadQueue.length} files to server...`);

        const uploadNext = () => {
            if (uploadQueue.length === 0) {
                console.log('All files uploaded to server. Executing setup on server...');
                executeSetup();
                return;
            }

            const { local, remote } = uploadQueue.shift();
            const remoteDir = remote.substring(0, remote.lastIndexOf('/'));

            conn.exec(`mkdir -p "${remoteDir}"`, (err, stream) => {
                if (err) {
                    console.error(`Failed to mkdir ${remoteDir}: ${err.message}`);
                    uploadNext();
                    return;
                }
                stream.on('close', () => {
                    sftp.fastPut(local, remote, (err) => {
                        if (err) console.error(`Failed to upload ${local}: ${err.message}`);
                        else console.log(`Uploaded: ${remote}`);
                        uploadNext();
                    });
                }).on('data', () => {}).stderr.on('data', () => {});
            });
        };

        uploadNext();

    });
}).on('error', (err) => {
    console.error('SSH Connection Error:', err);
}).connect(config);

function executeSetup() {
    const cmd = `
        echo "Running setup on server..."
        chmod +x /root/setup_server.sh
        
        # Initial system setup via the shell script
        bash /root/setup_server.sh
        
        cd /var/www/headhunters
        
        echo "Ensuring test mode (hht.nerou.fun) is running..."
        pm2 stop hh-test || true
        pm2 delete hh-test || true
        pm2 start ecosystem.config.cjs --only hh-test --args "--mode=test"
        pm2 save
        
        echo "Reloading Nginx..."
        nginx -t && systemctl reload nginx
        
        echo "Status of hh-test on server:"
        pm2 status hh-test
    `;
    
    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        stream.on('close', (code) => {
            console.log('Server setup finished with code: ' + code);
            console.log('Project should be live at https://hht.nerou.fun');
            conn.end();
        }).on('data', (data) => process.stdout.write(data))
          .stderr.on('data', (data) => process.stderr.write('SERVER STDERR: ' + data));
    });
}
