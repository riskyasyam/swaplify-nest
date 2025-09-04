import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { default as request } from 'supertest';
import axios from 'axios';

// Mock axios completely
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Admin Mocked Axios Integration Test', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    // Setup axios mocks for token validation
    mockedAxios.post.mockImplementation((url: string, body: any) => {
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
            realm_id: '8930ef74-b6cf-465a-9a74-8f9cc591c3e3',
            role: 'ADMIN'
          }
        });
      }
      
      return Promise.reject(new Error('Unmocked axios call'));
    });

    mockedAxios.get.mockImplementation((url: string) => {
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
      
      return Promise.reject(new Error('Unmocked axios call'));
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get(PrismaService);
    await app.init();
  });

  beforeEach(async () => {
    const timestamp = Date.now();
    
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
    console.log('✅ Admin user created with ADMIN role');
  });

  afterAll(async () => {
    await app.close();
    jest.clearAllMocks();
  });

  it('should get all users with mocked axios validation', async () => {
    // First check the user in DB
    const dbUser = await prisma.user.findUnique({ where: { authSub: 'admin-test-user' } });
    console.log('User in DB:', dbUser);

    const response = await request(app.getHttpServer())
      .get('/user')
      .set('Authorization', 'Bearer mock_admin_token_for_test');

    console.log('Response status:', response.status);
    console.log('Response body:', response.body);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    console.log('✅ Successfully got users!');
  });

  it('should get user features', async () => {
    const response = await request(app.getHttpServer())
      .get('/features')
      .set('Authorization', 'Bearer mock_admin_token_for_test');

    console.log('Features response:', response.status, response.body);
    expect(response.status).toBe(200);
  });

  it('should get user plans', async () => {
    const response = await request(app.getHttpServer())
      .get('/plans')
      .set('Authorization', 'Bearer mock_admin_token_for_test');

    console.log('Plans response:', response.status, response.body);
    expect(response.status).toBe(200);
  });
});
