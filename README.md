<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

# Swaplify Backend API

Backend API untuk aplikasi Swaplify - AI Face Swapper dengan NestJS, Prisma, dan PrimeAuth integration.

## Features

- **Authentication**: PrimeAuth OIDC integration dengan manual login support
- **Face Swapping**: Job management untuk AI face swapping dengan FaceFusion worker API
- **Plans & Subscriptions**: Plan management dengan entitlements
- **Media Assets**: File upload/download dengan MinIO integration
- **Features Management**: Dynamic feature configuration dengan dropdown support
- **Docker Support**: Full Docker Compose deployment

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 
- Docker & Docker Compose (optional)
- PrimeAuth server

### Environment Setup
```bash
# Copy environment template
cp .env.example .env

# Edit environment variables
# Required: DATABASE_URL, PRIMEAUTH_*, CLIENT_ID, etc.
```

**Required Environment Variables**:
```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/swaplify"

# PrimeAuth Configuration
PRIMEAUTH_AUTH_SERVICE_URL=https://your-primeauth-server.com
CLIENT_ID=your-client-id
CLIENT_SECRET=your-client-secret  # Optional for public clients
REALM_ID=your-realm-id
REDIRECT_URI=http://localhost:3000/auth/callback

# MinIO Storage
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=swaplify

# NSQ Message Queue
NSQ_ENDPOINT=localhost:4150

# Worker API
WORKER_API_URL=http://localhost:8000

# Optional
DEBUG_AUTH=1  # Enable auth debugging
FRONTEND_URL=http://localhost:3001  # For redirect after auth
NODE_ENV=development
```

### Development
```bash
# Install dependencies
npm install

# Generate Prisma client
npm run prisma:generate

# Run migrations and seed
npm run prisma:migrate
npm run prisma:seed

# Start development server
npm run start:dev
```

### Docker Deployment
```bash
# Start all services (PostgreSQL, MinIO, NSQ, API)
docker-compose up -d

# Check logs
docker-compose logs -f swaplify-api
```

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## API Documentation

### Authentication Endpoints

#### Redirect-based Login (for web browsers)
- `GET /auth/prime/login` - Redirect to PrimeAuth login page
- `GET /auth/callback` - Handle OAuth callback and set cookies

#### Manual Login (for SPA/Next.js)
- `POST /auth/prime/manual-login` - Manual login with email/password
- `GET /auth/me` - Get current user info from cookies
- `POST /auth/logout` - Logout and clear cookies

**Manual Login Example**:
```bash
curl -X POST http://localhost:3000/auth/prime/manual-login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password123"}' \
  -c cookies.txt
```

### Core API Endpoints

#### Jobs (Face Swapping)
- `POST /jobs` - Create face swap job
- `GET /jobs` - List user jobs
- `GET /jobs/:id` - Get job details
- `GET /jobs/capabilities` - Get worker capabilities

#### Plans & Entitlements
- `GET /plans` - List available plans
- `GET /plans/:id/entitlements` - Get plan entitlements
- `POST /plans/:id/entitlements` - Create entitlement
- `PUT /plans/:id/entitlements/:entitlementId` - Update entitlement
- `DELETE /plans/:id/entitlements/:entitlementId` - Delete entitlement

#### Features
- `GET /features` - List features (with filtering)
- `GET /features/processors` - Get processors for dropdown
- `GET /features/processor-options` - Get processor options for dropdown

#### Media Assets
- `POST /media/presign-upload` - Get presigned upload URL
- `GET /media/presign-download/:filename` - Get presigned download URL

### Detailed Documentation
- [Manual Login API](./docs/MANUAL_LOGIN_API.md) - Complete manual login documentation
- [Manual Login Testing](./docs/MANUAL_LOGIN_TESTING.md) - Testing guide and examples
- [Frontend Auth Flow](./docs/FRONTEND_AUTH_FLOW.md) - Authentication flow for SPAs
- [API Testing](./docs/API_TESTING.md) - Complete API testing guide

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
