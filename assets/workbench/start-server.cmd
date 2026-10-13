@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在启动看板服务（最小化的 python 窗口就是服务，关掉它即停止）...
start "" /min python -m http.server 8799 --directory .
timeout /t 2 >nul
start "" http://127.0.0.1:8799/index/dashboard.html
echo.
echo 看板地址: http://127.0.0.1:8799/index/dashboard.html
echo 同一局域网内的同事也能访问（把 127.0.0.1 换成你的内网 IP）。
pause
