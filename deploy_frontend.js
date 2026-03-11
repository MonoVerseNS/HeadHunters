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
    console.log('SSH Connection ready for FRONTEND DEPLOY');

    conn.sftp((err, sftp) => {
        if (err) throw err;

        const uploadQueue = [];
        
        try {
            const distFiles = getAllFiles('dist');
            distFiles.forEach(localPath => {
                // Exclude ffmpeg folder to speed up upload
                if (localPath.includes('ffmpeg-7.0.2-amd64-static')) return;

                const relPath = relative(process.cwd(), localPath).replace(/\\/g, '/');
                uploadQueue.push({ local: localPath, remote: `${config.remoteDir}/${relPath}` });
            });
        } catch(e) { console.error(`Skipping dist dir: ${e.message}`); }

        console.log(`Starting upload of ${uploadQueue.length} frontend files...`);

        const uploadNext = () => {
            if (uploadQueue.length === 0) {
                console.log('Frontend upload complete.');
                conn.end();
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
