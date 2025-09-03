@echo off
REM Development Helper Scripts for Swaplify

if "%1"=="start" goto start
if "%1"=="stop" goto stop
if "%1"=="logs" goto logs
if "%1"=="build" goto build
if "%1"=="migrate" goto migrate
if "%1"=="seed" goto seed
if "%1"=="clean" goto clean
goto help

:start
echo ▶️ Starting Swaplify services...
docker-compose up -d
goto end

:stop
echo 🛑 Stopping Swaplify services...
docker-compose down
goto end

:logs
if "%2"=="" (
    echo 📋 Showing all logs...
    docker-compose logs -f
) else (
    echo 📋 Showing logs for %2...
    docker-compose logs -f %2
)
goto end

:build
if "%2"=="" (
    echo 🔨 Building all services...
    docker-compose build
) else (
    echo 🔨 Building %2...
    docker-compose build %2
)
goto end

:migrate
echo 🗄️ Running database migrations...
docker-compose exec nestjs npx prisma migrate deploy
goto end

:seed
echo 🌱 Seeding database...
docker-compose exec nestjs npx prisma db seed
goto end

:clean
echo 🧹 Cleaning up Docker resources...
docker-compose down -v
docker system prune -f
echo ✅ Cleanup completed
goto end

:help
echo Swaplify Development Helper
echo.
echo Usage: dev.bat [command] [service]
echo.
echo Commands:
echo   start          Start all services
echo   stop           Stop all services
echo   logs [service] Show logs (all or specific service)
echo   build [service] Build images (all or specific service)
echo   migrate        Run database migrations
echo   seed           Seed database
echo   clean          Clean up Docker resources
echo.
echo Services: nestjs, queue-worker, facefusion-worker, postgres, minio, nsqd
echo.
echo Examples:
echo   dev.bat start
echo   dev.bat logs nestjs
echo   dev.bat build queue-worker
goto end

:end
