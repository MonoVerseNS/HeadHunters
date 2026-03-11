import { Client } from 'ssh2';
import { readFileSync, readdirSync, statSync } from 'fs';
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
    console.log('SSH Connection ready');

    conn.sftp((err, sftp) => {
        if (err) throw err;

        // 1. Create remote directory structure
        console.log(`Ensuring remote directory: ${config.remoteDir}`);
        conn.exec(`mkdir -p ${config.remoteDir}`, (err, stream) => {
            if (err) throw err;
            stream.on('close', () => {
                
                // 2. Upload files
                const uploadQueue = [];
                
                // Priority 1: Configs and Scripts
                const filesToUpload = ['package.json', 'package-lock.json', 'ecosystem.config.cjs', 'setup_server.sh'];
                filesToUpload.forEach(file => {
                    uploadQueue.push({ local: file, remote: `${config.remoteDir}/${file}` });
                });

                // Priority 2: Server Code
                try {
                    const serverFiles = getAllFiles('server');
                    serverFiles.forEach(localPath => {
                        const relPath = relative(process.cwd(), localPath).replace(/\\/g, '/');
                        uploadQueue.push({ local: localPath, remote: `${config.remoteDir}/${relPath}` });
                    });
                } catch(e) { console.error(`Skipping server dir: ${e.message}`); }

                // Priority 3: Setup Script (to be executed)
                uploadQueue.push({ local: 'setup_server.sh', remote: '/root/setup_server.sh' });
                
                // Priority 4: Static Assets (Heavy)
                try {
                    const distFiles = getAllFiles('dist');
                    distFiles.forEach(localPath => {
                         // Exclude ffmpeg folder to speed up upload
                        if (localPath.includes('ffmpeg-7.0.2-amd64-static')) return;

                        const relPath = relative(process.cwd(), localPath).replace(/\\/g, '/');
                        uploadQueue.push({ local: localPath, remote: `${config.remoteDir}/${relPath}` });
                    });
                } catch(e) { console.error(`Skipping dist dir: ${e.message}`); }

                console.log(`Starting upload of ${uploadQueue.length} files...`);

                const uploadNext = () => {
                    if (uploadQueue.length === 0) {
                        console.log('All files uploaded.');
                        executeSetup();
                        return;
                    }

                    const { local, remote } = uploadQueue.shift();
                    const remoteDir = remote.substring(0, remote.lastIndexOf('/'));

                    // Ensure remote dir exists (naive approach: exec mkdir -p for every file parent)
                    conn.exec(`mkdir -p "${remoteDir}"`, (err, stream) => {
                        stream.on('close', () => {
                            sftp.fastPut(local, remote, (err) => {
                                if (err) {
                                    console.error(`Failed to upload ${local}: ${err.message}`);
                                } else {
                                    console.log(`Uploaded: ${remote}`);
                                }
                                uploadNext();
                            });
                        });
                    });
                };

                uploadNext();

            }).resume();
        });
    });
}).on('error', (err) => {
    console.error('SSH Connection Error:', err);
}).connect(config);

function executeSetup() {
    console.log('Executing setup script...');
    // Force stop old process and start new ecosystem
    const cmd = `
        pm2 delete headhunter || true
        pm2 delete hh-prod || true
        pm2 delete hh-test || true
        cd /var/www/headhunters
        chmod +x setup_server.sh
        ./setup_server.sh
        pm2 start ecosystem.config.cjs
        pm2 save
    `;
    
    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        stream.on('close', (code, signal) => {
            console.log('Setup script finished with code: ' + code);
            conn.end();
        }).on('data', (data) => {
            console.log('STDOUT: ' + data);
        }).stderr.on('data', (data) => {
            console.log('STDERR: ' + data);
        });
    });
}
