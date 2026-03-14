#!/bin/bash

# Deployment Configuration
REMOTE_HOST="95.182.97.163"
REMOTE_USER="root"
REMOTE_PATH="/var/www/headhunter"

echo "=== HeadHunters Remote Deployment ==="

# 1. Sync Frontend Build (optional if done locally)
# echo "Building frontend..."
# npm run build

# 2. Sync Server Code
echo "Syncing server code to ${REMOTE_HOST}..."
sshpass -p "${SSH_PWD}" scp -o StrictHostKeyChecking=no server/server.js server/db.js server/nftService.js ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}/server/

# 3. Sync Database (Optional: Backup remote first)
# echo "Syncing database..."
# sshpass -p "${SSH_PWD}" ssh -o StrictHostKeyChecking=no ${REMOTE_USER}@${REMOTE_HOST} "cp ${REMOTE_PATH}/server/headhunter.db ${REMOTE_PATH}/server/headhunter.db.bak"
# sshpass -p "${SSH_PWD}" scp -o StrictHostKeyChecking=no server/headhunter.db ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_PATH}/server/

# 4. Restart Service
echo "Restarting service on remote..."
sshpass -p "${SSH_PWD}" ssh -o StrictHostKeyChecking=no ${REMOTE_USER}@${REMOTE_HOST} "cd ${REMOTE_PATH}/server && pm2 restart server.js || pm2 start server.js"

echo "=== Deployment Complete ==="
