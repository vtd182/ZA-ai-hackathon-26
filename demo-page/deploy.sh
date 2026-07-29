#!/bin/bash
# Script để deploy nhanh trang landing page lên server

HOST="118.102.2.103"
USER="zah19-team3"
REMOTE_DIR="/var/www/zah-3.123c.vn/html"

echo "==========================================="
echo " Đang deploy lên $HOST..."
echo "==========================================="
echo "Khi được hỏi password, hãy nhập: qIhuUtskzXqZ"
echo "-------------------------------------------"

# 1. Tạo thư mục đích (nếu chưa có) và cấp quyền cho user hiện tại
ssh $USER@$HOST "sudo mkdir -p $REMOTE_DIR && sudo chown -R \$USER:\$USER /var/www/zah-3.123c.vn"

# 2. Đẩy file từ local lên remote server
scp -r ./index.html ./css ./js $USER@$HOST:$REMOTE_DIR/

echo "==========================================="
echo " Triển khai thành công! "
echo " Hãy truy cập: http://zah-3.123c.vn"
echo "==========================================="
