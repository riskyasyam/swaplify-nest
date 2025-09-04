import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { default as request } from 'supertest';
import { PrismaService } from '../../../src/prisma/prisma.service';

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

describe('PrimeAuth Integration Tests - Fixed', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get(PrismaService);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    // Setup axios mocks
    const mockAxios = axios as jest.Mocked<typeof axios>;
    mockAxios.post.mockReset();
    mockAxios.get.mockReset();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // Helper function to create valid JWT tokens
  function createMockJWT(payload: any = {}) {
    const header = { alg: 'RS256', typ: 'JWT' };
    const defaultPayload = {
      sub: 'b5a9babd-6e00-4546-88ce-634016820b6f',
      aud: 'primeauth-admin',
      iss: 'https://api.primeauth.meetaza.com/auth/realms/8930ef74-b6cf-465a-9a74-8f9cc591c3e3',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      email: 'test@example.com',
      email_verified: true,
      preferred_username: 'testuser',
      ...payload
    };
    const signature = 'mock_signature';
    
    return [
      Buffer.from(JSON.stringify(header)).toString('base64'),
      Buffer.from(JSON.stringify(defaultPayload)).toString('base64'),
      signature
    ].join('.');
  }

  // Helper function to setup basic mocks
  function setupBasicMocks(userInfoData: any = {}) {
    const mockAxios = axios as jest.Mocked<typeof axios>;
    
    const mockJWT = createMockJWT();
    
    // Mock OIDC discovery
    mockAxios.get.mockImplementation((url: string) => {
      if (url.includes('/.well-known/openid_configuration')) {
        return Promise.resolve({
          data: {
            issuer: 'https://api.primeauth.meetaza.com/auth/realms/8930ef74-b6cf-465a-9a74-8f9cc591c3e3',
            authorization_endpoint: 'https://api.primeauth.meetaza.com/auth/realms/8930ef74-b6cf-465a-9a74-8f9cc591c3e3/protocol/openid-connect/auth',
            token_endpoint: 'https://api.primeauth.meetaza.com/auth/realms/8930ef74-b6cf-465a-9a74-8f9cc591c3e3/protocol/openid-connect/token',
            userinfo_endpoint: 'https://api.primeauth.meetaza.com/auth/realms/8930ef74-b6cf-465a-9a74-8f9cc591c3e3/protocol/openid-connect/userinfo'
          }
        });
      }
      
      if (url.includes('/protocol/openid-connect/userinfo')) {
        const defaultUserInfo = {
          sub: 'b5a9babd-6e00-4546-88ce-634016820b6f',
          username: '',
          email: '',
          email_verified: false,
          preferred_username: '',
          realm_id: '8930ef74-b6cf-465a-9a74-8f9cc591c3e3',
          updated_at: new Date().toISOString(),
          ...userInfoData
        };
        return Promise.resolve({ data: defaultUserInfo });
      }
      
      return Promise.reject(new Error(`Unexpected GET request to ${url}`));
    });
    
    // Mock token exchange
    mockAxios.post.mockImplementation((url: string) => {
      if (url.includes('/protocol/openid-connect/token')) {
        return Promise.resolve({
          data: {
            access_token: mockJWT,
            id_token: mockJWT,
            refresh_token: 'mock_refresh_token_abcde',
            token_type: 'Bearer',
            expires_in: 3600,
            scope: 'openid profile email'
          }
        });
      }
      
      return Promise.reject(new Error(`Unexpected POST request to ${url}`));
    });
  }

  describe('GET /auth/prime/login', () => {
    it('should redirect to PrimeAuth login page', async () => {
      setupBasicMocks();

      const response = await request(app.getHttpServer())
        .get('/auth/prime/login')
        .expect(302);

      expect(response.headers.location).toContain('api.primeauth.meetaza.com');
      expect(response.headers.location).toContain('client_id=primeauth-admin');
      expect(response.headers.location).toContain('response_type=code');
      expect(response.headers.location).toContain('scope=openid+profile+email');
    });
  });

  describe('GET /auth/callback', () => {
    it('should handle successful OAuth callback with fallback user', async () => {
      setupBasicMocks();

      const response = await request(app.getHttpServer())
        .get('/auth/callback')
        .query({ code: 'test_auth_code_12345', state: 'test_state' })
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Login berhasil');
      expect(response.body).toHaveProperty('access_token');
      expect(response.body).toHaveProperty('refresh_token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('email', 'test@example.com'); // From JWT token claims
    });

    it('should create user in database on first login', async () => {
      setupBasicMocks();

      const initialCount = await prisma.user.count();

      const response = await request(app.getHttpServer())
        .get('/auth/callback')
        .query({ code: 'test_auth_code_new_user', state: 'test_state' })
        .expect(200);

      const finalCount = await prisma.user.count();
      expect(finalCount).toBe(initialCount + 1);

      const user = await prisma.user.findUnique({
        where: { id: response.body.user.id }
      });
      expect(user).toBeTruthy();
      expect(user?.email).toBe('test@example.com');
    });

    it('should create FREE subscription for new user', async () => {
      setupBasicMocks();

      const response = await request(app.getHttpServer())
        .get('/auth/callback')
        .query({ code: 'test_auth_code_subscription', state: 'test_state' })
        .expect(200);

      const subscription = await prisma.subscription.findFirst({
        where: { userId: response.body.user.id },
        include: { plan: true }
      });
      
      expect(subscription).toBeTruthy();
      expect(subscription?.plan.code).toBe('FREE');
    });

    it('should handle admin user promotion', async () => {
      setupBasicMocks({
        email: 'admin@primeauth.dev',
        first_name: 'Admin',
        last_name: 'User'
      });

      const response = await request(app.getHttpServer())
        .get('/auth/callback')
        .query({ code: 'test_auth_code_admin', state: 'test_state' })
        .expect(200);

      const user = response.body.user;
      expect(user.role).toBe('ADMIN');
    });

    it('should handle failed OAuth callback', async () => {
      const mockAxios = axios as jest.Mocked<typeof axios>;
      
      mockAxios.get.mockImplementation((url: string) => {
        if (url.includes('/.well-known/openid_configuration')) {
          return Promise.resolve({
            data: {
              token_endpoint: 'https://api.primeauth.meetaza.com/auth/realms/8930ef74-b6cf-465a-9a74-8f9cc591c3e3/protocol/openid-connect/token'
            }
          });
        }
        return Promise.reject(new Error(`Unexpected GET request to ${url}`));
      });
      
      mockAxios.post.mockImplementation((url: string) => {
        if (url.includes('/protocol/openid-connect/token')) {
          return Promise.reject(new Error('Token exchange failed'));
        }
        return Promise.reject(new Error(`Unexpected POST request to ${url}`));
      });

      await request(app.getHttpServer())
        .get('/auth/callback')
        .query({ code: 'invalid_code', state: 'test_state' })
        .expect(500); // AuthService throws InternalServerError on failed token exchange
    });

    it('should handle missing authorization code', async () => {
      await request(app.getHttpServer())
        .get('/auth/callback')
        .expect(400);
    });
  });

  describe('POST /auth/refresh', () => {
    it('should refresh access token successfully', async () => {
      const mockAxios = axios as jest.Mocked<typeof axios>;
      
      mockAxios.post.mockImplementation((url: string) => {
        if (url.includes('/protocol/openid-connect/token')) {
          return Promise.resolve({
            data: {
              access_token: 'new_mock_access_token_12345',
              id_token: 'new_mock_id_token_67890',
              refresh_token: 'new_mock_refresh_token_abcde',
              token_type: 'Bearer',
              expires_in: 3600,
              scope: 'openid profile email'
            }
          });
        }
        return Promise.reject(new Error(`Unexpected POST request to ${url}`));
      });

      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refresh_token: 'mock_refresh_token_abcde' })
        .expect(201); // POST endpoints typically return 201

      expect(response.body).toHaveProperty('access_token');
      expect(response.body).toHaveProperty('refresh_token');
    });

    it('should handle invalid refresh token', async () => {
      const mockAxios = axios as jest.Mocked<typeof axios>;
      
      mockAxios.post.mockImplementation((url: string) => {
        if (url.includes('/protocol/openid-connect/token')) {
          return Promise.reject(new Error('Invalid refresh token'));
        }
        return Promise.reject(new Error(`Unexpected POST request to ${url}`));
      });

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refresh_token: 'invalid_refresh_token' })
        .expect(500); // AuthService throws InternalServerError on failed refresh
    });
  });

  describe('Complete Authentication Flow', () => {
    it('should complete full login flow for known user', async () => {
      setupBasicMocks();

      // Step 1: Get login redirect
      const loginResponse = await request(app.getHttpServer())
        .get('/auth/prime/login')
        .expect(302);

      expect(loginResponse.headers.location).toContain('api.primeauth.meetaza.com');

      // Step 2: Simulate callback after user login
      const callbackResponse = await request(app.getHttpServer())
        .get('/auth/callback')
        .query({ code: 'test_complete_flow', state: 'test_state' })
        .expect(200);

      // Step 3: Verify complete response
      expect(callbackResponse.body.message).toBe('Login berhasil');
      expect(callbackResponse.body.user.email).toBe('test@example.com');

      // Step 4: Verify user exists in database
      const user = await prisma.user.findUnique({
        where: { id: callbackResponse.body.user.id }
      });
      expect(user).toBeTruthy();
      expect(user?.email).toBe('test@example.com');
    });
  });
});
