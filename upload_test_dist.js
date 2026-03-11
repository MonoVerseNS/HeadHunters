import { Client } from 'ssh2';
import { readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const config = {
    host: '95.182.97.163',
    username: 'root',
    password: '7177gomelkO',
    remoteDir: '/var/www/headhunters-test'
};

const conn = new Client();

function getAllFiles(dir) {
    let results = [];
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
    console.log('SSH Connection ready to upload DIST to TEST server');

    conn.sftp((err, sftp) => {
        if (err) throw err;

        const uploadQueue = [];
        try {
            const distFiles = getAllFiles('dist');
            distFiles.forEach(localPath => {
                const relPath = relative(process.cwd(), localPath).replace(/\\/g, '/');
                uploadQueue.push({ local: localPath, remote: `${config.remoteDir}/${relPath}` });
            });
        } catch(e) { console.error(`Skipping dist dir: ${e.message}`); }

        console.log(`Starting upload of ${uploadQueue.length} dist files...`);

        const uploadNext = () => {
            if (uploadQueue.length === 0) {
                console.log('Dist upload complete.');
                conn.end();
                return;
            }

            const { local, remote } = uploadQueue.shift();
            const remoteDir = remote.substring(0, remote.lastIndexOf('/'));

            conn.exec(`mkdir -p "${remoteDir}"`, (err, stream) => {
                stream.on('close', () => {
                    sftp.fastPut(local, remote, (err) => {
                        if (err) console.error(`Failed to upload ${local}: ${err.message}`);
                        // else console.log(`Uploaded: ${remote}`);
                        uploadNext();
                    });
                }).on('data', () => {}).stderr.on('data', () => {});
            });
        };

        uploadNext();
    });
}).on('error', (err) => {
    console.error('SSH Error:', err);
}).connect(config);
