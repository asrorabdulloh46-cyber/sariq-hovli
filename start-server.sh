#!/usr/bin/env bash
# Linux/Mac: serverni kompyuteringizda ishga tushirish (Node.js 18+ kerak)
cd "$(dirname "$0")"
[ -d node_modules ] || npm install --omit=dev
echo "Server http://localhost:3000 da ochiladi. Do'stlar ulanishi uchun tunnel kerak (README.md ni ko'ring)."
node server/server.js
