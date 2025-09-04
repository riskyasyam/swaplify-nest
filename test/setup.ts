import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import nock from 'nock';

export class TestDatabaseSetup {
  private static prisma: PrismaClient;

  static async setupTestDb() {
    // Setup test environment variables
    process.env.CLIENT_ID = 'primeauth-admin';
    process.env.CLIENT_SECRET = 'DWITLTR1u5L_se4Fr37Ye2pg1LdHETiD';
    process.env.REDIRECT_URI = 'http://localhost:30 00/auth/callback';
    process.env.PRIMEAUTH_AUTH_SERVICE_URL = 'https://api.primeauth.meetaza.com/auth';
    process.env.REALM_ID = '8930ef74-b6cf-465a-9a74-8f9cc591c3e3';
    process.env.PRIMEAUTH_BASE_URL = 'https://api.primeauth.meetaza.com';
    process.env.ADMIN_EMAILS = 'admin@primeauth.dev,asyam@gmail.com';
    process.env.INTERNAL_API_KEY = 'internalsecret';
    
    // Use test database URL
    process.env.DATABASE_URL = 'postgresql://postgres:asyam123@localhost:5432/swaplify_test?schema=public';
    process.env.NODE_ENV = 'test';
    
    // Create test database if not exists
    try {
      execSync('docker-compose exec -T postgres createdb -U postgres swaplify_test', { stdio: 'ignore' });
    } catch (error) {
      // Database might already exist, ignore error
    }

    // Initialize Prisma client
    this.prisma = new PrismaClient();
    
    try {
      // Run migrations
      execSync('npx prisma migrate deploy', { 
        stdio: 'inherit',
        env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL }
      });
      
      // Seed test data
      execSync('npx prisma db seed', { 
        stdio: 'inherit',
        env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL }
      });
      
      console.log('✅ Test database setup completed');
    } catch (error) {
      console.error('❌ Test database setup failed:', error);
      throw error;
    }
  }

  static async cleanup() {
    if (this.prisma) {
      // Clean test data
      await this.prisma.job.deleteMany();
      await this.prisma.subscription.deleteMany();
      await this.prisma.user.deleteMany();
      
      await this.prisma.$disconnect();
    }
  }

  static async resetDatabase() {
    if (this.prisma) {
      // Reset database to clean state
      await this.prisma.job.deleteMany();
      await this.prisma.subscription.deleteMany(); 
      await this.prisma.user.deleteMany();
    }
  }
}

// Global test setup
beforeAll(async () => {
  await TestDatabaseSetup.setupTestDb();
});

afterAll(async () => {
  await TestDatabaseSetup.cleanup();
  nock.cleanAll();
});

beforeEach(async () => {
  // Clean nock interceptors before each test
  nock.cleanAll();
  
  // Reset database state
  await TestDatabaseSetup.resetDatabase();
});

afterEach(() => {
  // Ensure all nocks are used
  if (!nock.isDone()) {
    console.warn('Warning: Some nock interceptors were not used');
    nock.cleanAll();
  }
});
