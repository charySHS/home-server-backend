@echo off
cd /d "C:\dev\home-server"
set BASE_DIR=D:\server-storage
set JWT_EXPIRATION=7d
set ADMIN_DEBUG_LOGS=false
node "C:\dev\home-server\dist\index.js" >> "C:\dev\home-server\server.log" 2>&1
