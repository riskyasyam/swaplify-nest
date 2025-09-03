# Swaplify Docker Setup

## 🐳 Docker Configuration

Swaplify dapat dijalankan dengan Docker untuk memudahkan deployment dan development.

### 📋 Prerequisites

1. **Docker Desktop** terinstall dan berjalan
2. **Elevated privileges** (Run as Administrator) di Windows
3. **Minimum 4GB RAM** untuk semua services

### 🚀 Quick Start

#### Windows (Run as Administrator):
```cmd
# Navigate to project folder
cd swaplify-nest

# Start all services
docker-compose up -d --build

# View status
docker-compose ps

# View logs
docker-compose logs -f nestjs
```

#### Alternative dengan script:
```cmd
# Jalankan sebagai administrator
deploy.bat
```

### 📦 Services yang Dijalankan

| Service | Port | Description |
|---------|------|-------------|
| NestJS API | 3000 | Main backend application |
| PostgreSQL | 5432 | Database |
| MinIO | 9000, 9001 | S3-compatible storage |
| NSQ | 4150, 4151, 4171 | Message queue |

**Note:** Queue Worker dan FastAPI Worker untuk sementara dijalankan manual karena memerlukan setup tambahan.

### 🔧 Development Commands

```cmd
# Start services
docker-compose up -d

# Stop services
docker-compose down

# Rebuild specific service
docker-compose build nestjs
docker-compose up -d nestjs

# View logs
docker-compose logs -f nestjs
docker-compose logs -f postgres

# Run database migrations
docker-compose exec nestjs npx prisma migrate deploy

# Seed database
docker-compose exec nestjs npx prisma db seed

# Clean up everything
docker-compose down -v
docker system prune -f
```

### 📁 Project Structure untuk Docker

```
├── swaplify-nest/          (Main project)
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── ...
├── swaplify-queue-worker/  (Queue worker - manual untuk sementara)
└── facefusion/            (FastAPI worker - manual untuk sementara)
```

### 🐛 Troubleshooting

#### Error: "Access is denied"
- Jalankan terminal sebagai Administrator
- Pastikan Docker Desktop berjalan

#### Error: "version is obsolete"
- Warning ini bisa diabaikan, tidak mempengaruhi functionality

#### Build gagal karena "nest: not found"
- Sudah diperbaiki dengan multi-stage build di Dockerfile

#### Container tidak bisa connect
- Pastikan semua services sudah running: `docker-compose ps`
- Check logs: `docker-compose logs -f [service_name]`

### 🔄 Manual Workers (Sementara)

Untuk sekarang, Queue Worker dan FastAPI Worker masih perlu dijalankan manual:

```cmd
# Terminal 1: Queue Worker
cd swaplify-queue-worker
npm start

# Terminal 2: FastAPI Worker  
cd facefusion
python api_server.py
```

### 🌐 Access URLs

- **NestJS API**: http://localhost:3000
- **NSQ Admin**: http://localhost:4171
- **MinIO Console**: http://localhost:9001 (admin/minioadmin)
- **PostgreSQL**: localhost:5432 (postgres/asyam123)

### 📝 Environment Variables

Environment variables dikonfigurasi di `docker-compose.yml`. Untuk production, gunakan file `.env.docker` atau Docker secrets.

### 🔄 Updates & Migrations

```cmd
# Pull latest changes
git pull

# Rebuild containers
docker-compose build

# Restart with new changes
docker-compose up -d

# Run any new migrations
docker-compose exec nestjs npx prisma migrate deploy
```
