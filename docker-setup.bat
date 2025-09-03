@echo off
echo ===============================================
echo         SWAPLIFY DOCKER SETUP
echo ===============================================
echo.
echo 🔧 Docker requires elevated privileges on Windows.
echo.
echo 📋 To run Swaplify with Docker:
echo.
echo 1. Right-click on "Command Prompt" or "PowerShell"
echo 2. Select "Run as administrator"
echo 3. Navigate to this folder:
echo    cd "%cd%"
echo 4. Run the deployment:
echo    docker-compose up -d --build
echo.
echo Alternative: Right-click this file and "Run as administrator"
echo.
echo ===============================================
echo.
echo 📖 Manual Commands:
echo.
echo Start services:     docker-compose up -d
echo Stop services:      docker-compose down
echo View logs:          docker-compose logs -f nestjs
echo Rebuild:            docker-compose build
echo.
echo Services will be available at:
echo • NestJS API:       http://localhost:3000
echo • NSQ Admin:       http://localhost:4171
echo • MinIO Console:   http://localhost:9001
echo • PostgreSQL:      localhost:5432
echo.
pause
