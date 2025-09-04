import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { default as request } from 'supertest';

// Mock axios at the module level
jest.mock('axios', () => ({
  post: jest.fn(),
  get: jest.fn(),
  create: jest.fn(() => ({
    post: jest.fn(),
    get: jest.fn(),
  })),
}));

import axios from 'axios';

describe('Admin Fixed Integration Test', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminHeaders: any;

  beforeAll(async () => {
    // Setup axios mocks for PrimeAuth token validation
    const mockAxios = axios as jest.Mocked<typeof axios>;
    
    mockAxios.post.mockImplementation((url: string, body: any) => {
      console.log('🔍 Axios POST called:', { url, body });
      
      if (url.includes('/api/v1/auth/validate')) {
        return Promise.resolve({
          data: {
            valid: true,
            active: true,
            user_id: 'admin-test-user',
            sub: 'admin-test-user',
            email: 'admin@primeauth.dev',
            preferred_username: 'admin',
            realm_id: '8930ef74-b6cf-465a-9a74-8f9cc591c3e3'
          }
        });
      }
      
      return Promise.reject(new Error('Unmocked axios call'));
    });

    mockAxios.get.mockImplementation((url: string) => {
      console.log('🔍 Axios GET called:', { url });
      
      if (url.includes('/api/v1/users/me')) {
        return Promise.resolve({
          data: {
            data: {
              email: 'admin@primeauth.dev',
              first_name: 'Admin',
              last_name: 'User',
              username: 'admin'
            }
          }
        });
      }
      
      return Promise.resolve({ data: {} });
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get(PrismaService);
    await app.init();

    adminHeaders = {
      'Authorization': 'Bearer mock_admin_token_for_test',
      'Content-Type': 'application/json'
    };
  });

  beforeEach(async () => {
    // Create admin user before each test (after DB reset)
    await prisma.user.upsert({
      where: { authSub: 'admin-test-user' },
      create: { 
        authSub: 'admin-test-user', 
        email: 'admin@primeauth.dev', 
        displayName: 'Admin User',
        role: 'ADMIN'
      },
      update: { 
        email: 'admin@primeauth.dev', 
        displayName: 'Admin User',
        role: 'ADMIN'
      }
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('should get all users with mocked admin authentication', async () => {
    const response = await request(app.getHttpServer())
      .get('/user')
      .set(adminHeaders);

    console.log('Response status:', response.status);
    console.log('Response body:', response.body);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });
});
