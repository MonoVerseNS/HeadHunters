#!/bin/bash

# ==========================================
# HeadHunters Setup & Deploy Script
# ==========================================

# 1. Update System
apt-get update && apt-get upgrade -y
apt-get install -y curl git nginx certbot python3-certbot-nginx

# 2. Install Node.js 20
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

# 3. Install PM2
npm install -g pm2

# 4. Setup Directory
mkdir -p /var/www/headhunters
cd /var/www/headhunters

# 5. Install Dependencies (assuming files are uploaded)
npm install --production

# 6. Start Services with PM2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup

# 7. Configure Nginx
cat > /etc/nginx/sites-available/headhunters << 'EOF'
server {
    server_name nerou.fun;

    root /var/www/headhunters/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:3310;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /socket.io {
        proxy_pass http://localhost:3310;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}

server {
    server_name hht.nerou.fun;

    root /var/www/headhunters/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:3311;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /socket.io {
        proxy_pass http://localhost:3311;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
EOF

# 8. Enable Site & SSL
ln -s /etc/nginx/sites-available/headhunters /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

# 9. SSL (Non-interactive if possible, but usually interactive)
echo "Run 'certbot --nginx' manually to secure domains."
