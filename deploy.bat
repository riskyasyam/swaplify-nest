@echo off
REM Swaplify Deployment Script for Windows

echo ========================================
echo    🚀 Swaplify Docker Deployment
echo ========================================

REM Stop existing containers
echo [1/6] 🛑 Stopping existing containers...
docker-compose down

REM Build images
echo [2/6] 🔨 Building Docker images...
docker-compose build

REM Start infrastructure services first
echo [3/6] 🗄️ Starting infrastructure services...
docker-compose up -d postgres minio

REM Start NSQ services
echo [4/6] 📨 Starting NSQ services...
docker-compose up -d nsqlookupd nsqd nsqadmin

REM Wait for infrastructure to be ready
echo [5/6] ⏳ Waiting for services to be ready...
timeout /t 15 /nobreak >nul

REM Start application services
echo [6/6] ▶️ Starting application services...
docker-compose up -d nestjs

REM Run database migrations
echo 🗄️ Running database migrations...
docker-compose exec nestjs npx prisma migrate deploy

REM Seed database if needed
echo 🌱 Seeding database...
docker-compose exec nestjs npx prisma db seed

REM Show status
echo 📊 Service status:
docker-compose ps

echo.
echo ✅ Swaplify deployed successfully!
echo.
echo 📱 Services available at:
echo    • NestJS API: http://localhost:3000
echo    • FastAPI Worker: http://localhost:8081
echo    • NSQ Admin: http://localhost:4171
echo    • MinIO Console: http://localhost:9001 (admin/minioadmin)
echo    • PostgreSQL: localhost:5432
echo.
echo 📋 Useful commands:
echo    • View logs: docker-compose logs -f [service_name]
echo    • Stop: docker-compose down
echo    • Restart: docker-compose restart [service_name]

pause
