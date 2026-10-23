@echo off
REM Windows: serverni kompyuteringizda ishga tushirish (Node.js 18+ kerak)
cd /d "%~dp0"
if not exist node_modules ( call npm install --omit=dev )
echo.
echo Server http://localhost:3000 da ochiladi. Do'stlar ulanishi uchun tunnel kerak (README.md ni ko'ring).
node server\server.js
pause
