FROM node:20-alpine

WORKDIR /app

# Install dependencies untuk build
COPY package*.json ./
COPY prisma ./prisma/

# Install semua dependencies (termasuk devDependencies untuk build)
RUN npm install

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY . .

# Build aplikasi (comment out for debugging)
# RUN npm run build

# Create entrypoint script
RUN echo '#!/bin/sh' > /app/entrypoint.sh && \
    echo 'echo "Running Prisma migrations..."' >> /app/entrypoint.sh && \
    echo 'npx prisma migrate deploy' >> /app/entrypoint.sh && \
    echo 'echo "Seeding database..."' >> /app/entrypoint.sh && \
    echo 'npx prisma db seed' >> /app/entrypoint.sh && \
    echo 'echo "Starting application..."' >> /app/entrypoint.sh && \
    echo 'exec "$@"' >> /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

# Expose port
EXPOSE 3000

# Health check (simplified for dev mode)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node --version || exit 1

# Use entrypoint script
ENTRYPOINT ["/app/entrypoint.sh"]

# Start application in development mode
CMD ["npm", "run", "start:dev"]