#!/bin/bash
# Script này được chạy trên server SSH để cài đặt Nginx và cấu hình Domain
# Cách dùng: ssh zah19-team3@118.102.2.103 'bash -s' < setup_server.sh

DOMAIN="zah-3.123c.vn"
WEB_ROOT="/var/www/$DOMAIN/html"

echo "Cập nhật package..."
sudo apt update

echo "Cài đặt Nginx..."
sudo apt install -y nginx

echo "Tạo thư mục cho Website..."
sudo mkdir -p $WEB_ROOT
sudo chown -R $USER:$USER /var/www/$DOMAIN
sudo chmod -R 755 /var/www/$DOMAIN

echo "Cấu hình Nginx..."
cat <<EOF | sudo tee /etc/nginx/sites-available/$DOMAIN
server {
    listen 80;
    listen [::]:80;

    root $WEB_ROOT;
    index index.html index.htm;

    server_name $DOMAIN www.$DOMAIN;

    location / {
        try_files \$uri \$uri/ =404;
    }
}
EOF

echo "Kích hoạt trang web và khởi động lại Nginx..."
sudo ln -s /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/ 2>/dev/null
sudo rm /etc/nginx/sites-enabled/default 2>/dev/null
sudo nginx -t && sudo systemctl restart nginx

echo "Thiết lập server thành công!"
