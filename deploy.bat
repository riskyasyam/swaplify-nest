@echo off
REM Swaplify Deployment Script for Windows

echo 🚀 Starting Swaplify deployment...

REM Stop existing containers
echo 🛑 Stopping existing containers...
docker-compose down

REM Build images
echo 🔨 Building Docker images...
docker-compose build

REM Start services
echo ▶️ Starting services...
docker-compose up -d

REM Wait for database to be ready
echo ⏳ Waiting for database to be ready...
timeout /t 15 /nobreak >nul

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
