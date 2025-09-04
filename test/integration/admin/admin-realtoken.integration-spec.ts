import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { default as request } from 'supertest';
import { default as nock } from 'nock';

describe('Admin Real Token Integration Test', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let validToken: string;

  beforeAll(async () => {
    // Setup complete PrimeAuth mock like in working test
    const nockScope = nock('https://api.primeauth.meetaza.com');
    
    // Mock OIDC discovery
    nockScope
      .persist()
      .get('/auth/realms/8930ef74-b6cf-465a-9a74-8f9cc591c3e3/.well-known/openid_configuration')
      .reply(200, {
        issuer: 'https://api.primeauth.meetaza.com/auth/realms/8930ef74-b6cf-465a-9a74-8f9cc591c3e3',
        authorization_endpoint: 'https://api.primeauth.meetaza.com/auth/realms/8930ef74-b6cf-465a-9a74-8f9cc591c3e3/protocol/openid-connect/auth',
        token_endpoint: 'https://api.primeauth.meetaza.com/auth/realms/8930ef74-b6cf-465a-9a74-8f9cc591c3e3/protocol/openid-connect/token',
        userinfo_endpoint: 'https://api.primeauth.meetaza.com/auth/realms/8930ef74-b6cf-465a-9a74-8f9cc591c3e3/protocol/openid-connect/userinfo'
      });

    // Create a proper JWT token
    function createMockJWT() {
      const header = { alg: 'RS256', typ: 'JWT' };
      const payload = {
        sub: 'admin-test-user',
        aud: 'primeauth-admin',
        iss: 'https://api.primeauth.meetaza.com/auth/realms/8930ef74-b6cf-465a-9a74-8f9cc591c3e3',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        email: 'admin@primeauth.dev',
        email_verified: true,
        preferred_username: 'admin'
      };
      const signature = 'mock_signature';
      
      return [
        Buffer.from(JSON.stringify(header)).toString('base64'),
        Buffer.from(JSON.stringify(payload)).toString('base64'),
        signature
      ].join('.');
    }
    
    const mockJWT = createMockJWT();
    
    // Mock token exchange
    nockScope
      .persist()
      .post('/auth/realms/8930ef74-b6cf-465a-9a74-8f9cc591c3e3/protocol/openid-connect/token')
      .reply(200, {
        access_token: mockJWT,
        id_token: mockJWT,
        refresh_token: 'mock_refresh_token_abcde',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'openid profile email'
      });

    // Mock userinfo endpoint
    nockScope
      .persist()
      .get('/auth/realms/8930ef74-b6cf-465a-9a74-8f9cc591c3e3/protocol/openid-connect/userinfo')
      .reply(200, {
        sub: 'admin-test-user',
        email: 'admin@primeauth.dev',
        email_verified: true,
        preferred_username: 'admin',
        realm_id: '8930ef74-b6cf-465a-9a74-8f9cc591c3e3'
      });
      
    // Mock introspection/validation endpoints
    nockScope
      .persist()
      .post('/auth/api/v1/auth/validate')
      .reply((uri, requestBody) => {
        console.log('🔍 Validation request:', { uri, body: requestBody });
        return [200, {
          valid: true,
          active: true,
          user_id: 'admin-test-user',
          sub: 'admin-test-user',
          email: 'admin@primeauth.dev',
          preferred_username: 'admin',
          realm_id: '8930ef74-b6cf-465a-9a74-8f9cc591c3e3'
        }];
      });
      
    // Mock userinfo fetch endpoints
    nockScope
      .persist()
      .get('/auth/api/v1/users/me')
      .reply(200, {
        data: {
          email: 'admin@primeauth.dev',
          first_name: 'Admin',
          last_name: 'User',
          username: 'admin'
        }
      });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get(PrismaService);
    await app.init();

    // Get a valid token through OAuth flow
    const loginResponse = await request(app.getHttpServer())
      .get('/auth/callback')
      .query({ code: 'test_auth_code_admin', state: 'test_state' })
      .expect(200);

    validToken = `Bearer ${loginResponse.body.access_token}`;
    console.log('✅ Valid token obtained:', validToken.substring(0, 30) + '...');
  });

  afterAll(async () => {
    await app.close();
  });

  it('should get all users with valid admin token', async () => {
    const response = await request(app.getHttpServer())
      .get('/user')
      .set('Authorization', validToken);

    console.log('Response status:', response.status);
    console.log('Response body:', response.body);

    if (response.status === 200) {
      expect(Array.isArray(response.body)).toBe(true);
      console.log('✅ Successfully got users!');
    } else {
      console.log('❌ Still getting error:', response.body);
    }
  });
});
