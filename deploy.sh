#!/bin/bash
# Swaplify Deployment Script

echo "🚀 Starting Swaplify deployment..."

# Stop existing containers
echo "🛑 Stopping existing containers..."
docker-compose down

# Build images
echo "🔨 Building Docker images..."
docker-compose build

# Start services
echo "▶️ Starting services..."
docker-compose up -d

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
sleep 15

# Run database migrations
echo "🗄️ Running database migrations..."
docker-compose exec nestjs npx prisma migrate deploy

# Seed database if needed
echo "🌱 Seeding database..."
docker-compose exec nestjs npx prisma db seed || echo "⚠️ Seeding skipped (might already exist)"

# Show status
echo "📊 Service status:"
docker-compose ps

echo ""
echo "✅ Swaplify deployed successfully!"
echo ""
echo "📱 Services available at:"
echo "   • NestJS API: http://localhost:3000"
echo "   • FastAPI Worker: http://localhost:8081"
echo "   • NSQ Admin: http://localhost:4171"
echo "   • MinIO Console: http://localhost:9001 (admin/minioadmin)"
echo "   • PostgreSQL: localhost:5432"
echo ""
echo "📋 Useful commands:"
echo "   • View logs: docker-compose logs -f [service_name]"
echo "   • Stop: docker-compose down"
echo "   • Restart: docker-compose restart [service_name]"
