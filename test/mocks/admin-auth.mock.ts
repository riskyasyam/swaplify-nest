import { default as nock } from 'nock';
import * as jwt from 'jsonwebtoken';

export class AdminAuthMock {
  private static readonly JWT_SECRET = 'test-secret-key-for-jwt-testing';
  
  static setupAuthMocks() {
    // Clean any existing nocks first
    nock.cleanAll();
    
    // Mock the exact endpoint from .env: PRIMEAUTH_AUTH_SERVICE_URL/api/v1/auth/validate
    nock('https://api.primeauth.meetaza.com')
      .persist()
      .post('/auth/api/v1/auth/validate')
      .reply((uri, requestBody: any) => {
        console.log('🔍 Auth validation request received:', { uri, body: requestBody });
        
        // Mock successful token validation for admin tokens
        if ((requestBody.token && requestBody.token.includes('admin')) ||
            (requestBody.access_token && requestBody.access_token.includes('admin'))) {
          console.log('✅ Returning admin validation response');
          return [200, {
            valid: true,
            active: true,
            user_id: 'admin-test-user',
            sub: 'admin-test-user',
            email: 'admin@primeauth.dev',
            preferred_username: 'admin',
            realm_id: '8930ef74-b6cf-465a-9a74-8f9cc591c3e3',
            client_id: 'primeauth-admin',
            exp: Math.floor(Date.now() / 1000) + 3600,
            iat: Math.floor(Date.now() / 1000),
            iss: 'https://api.primeauth.meetaza.com/auth/realms/8930ef74-b6cf-465a-9a74-8f9cc591c3e3'
          }];
        }
        
        // Mock successful token validation for user tokens
        if ((requestBody.token && requestBody.token.includes('user')) || 
            (requestBody.access_token && requestBody.access_token.includes('user'))) {
          console.log('✅ Returning user validation response');
          return [200, {
            valid: true,
            active: true,
            user_id: 'regular-test-user',
            sub: 'regular-test-user',
            email: 'user@example.com',
            preferred_username: 'testuser',
            realm_id: '8930ef74-b6cf-465a-9a74-8f9cc591c3e3',
            client_id: 'primeauth-admin'
          }];
        }
        
        console.log('❌ Returning invalid token response');
        return [401, { valid: false, active: false }];
      });
      
    // Also mock userinfo endpoints that might be called
    nock('https://api.primeauth.meetaza.com')
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
      
    nock('https://api.primeauth.meetaza.com')
      .persist()
      .get((uri) => uri.includes('/users/'))
      .reply(200, {
        data: {
          email: 'admin@primeauth.dev',
          first_name: 'Admin',
          last_name: 'User',
          username: 'admin'
        }
      });
      
    // Mock userinfo OIDC endpoint
    nock('https://api.primeauth.meetaza.com')
      .persist()
      .get('/auth/realms/8930ef74-b6cf-465a-9a74-8f9cc591c3e3/protocol/openid-connect/userinfo')
      .reply(200, {
        sub: 'admin-test-user',
        email: 'admin@primeauth.dev',
        preferred_username: 'admin',
        name: 'Admin User'
      });
  }

  static generateAdminJWT() {
    // Generate simple token that can be identified by introspection mock
    return 'admin-mock-token-123';
  }

  static generateUserJWT() {
    // Generate simple token that can be identified by introspection mock
    return 'user-mock-token-456';
  }
}
