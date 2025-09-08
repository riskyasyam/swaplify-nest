import nock from 'nock';

/**
 * Mock class for PrimeAuth API endpoints
 */
export class PrimeAuthMock {
  private static readonly PRIMEAUTH_BASE_URL = 'https://api.primeauth.meetaza.com';
  private static readonly REALM_ID = '8930ef74-b6cf-465a-9a74-8f9cc591c3e3';

  /**
   * Mock OIDC discovery endpoint
   */
  static mockOidcDiscovery() {
    return nock(this.PRIMEAUTH_BASE_URL)
      .get(`/auth/realms/${this.REALM_ID}/.well-known/openid_configuration`)
      .reply(200, {
        issuer: `https://api.primeauth.meetaza.com/auth/realms/${this.REALM_ID}`,
        authorization_endpoint: `https://api.primeauth.meetaza.com/auth/realms/${this.REALM_ID}/protocol/openid-connect/auth`,
        token_endpoint: `https://api.primeauth.meetaza.com/auth/realms/${this.REALM_ID}/protocol/openid-connect/token`,
        userinfo_endpoint: `https://api.primeauth.meetaza.com/auth/realms/${this.REALM_ID}/protocol/openid-connect/userinfo`,
        jwks_uri: `https://api.primeauth.meetaza.com/auth/realms/${this.REALM_ID}/protocol/openid-connect/certs`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        scopes_supported: ['openid', 'profile', 'email']
      });
  }

  /**
   * Mock successful token exchange with valid JWT format
   */
  static mockTokenExchange() {
    // Create valid JWT tokens (base64 encoded JSON for simple mock)
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
      sub: 'b5a9babd-6e00-4546-88ce-634016820b6f',
      aud: 'primeauth-admin',
      iss: `https://api.primeauth.meetaza.com/auth/realms/${this.REALM_ID}`,
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      email: 'test@example.com',
      email_verified: true,
      preferred_username: 'testuser'
    };
    const signature = 'mock_signature';
    
    const accessToken = [
      Buffer.from(JSON.stringify(header)).toString('base64'),
      Buffer.from(JSON.stringify(payload)).toString('base64'),
      signature
    ].join('.');
    
    const idToken = [
      Buffer.from(JSON.stringify(header)).toString('base64'),
      Buffer.from(JSON.stringify(payload)).toString('base64'),
      signature
    ].join('.');

    return nock(this.PRIMEAUTH_BASE_URL)
      .post(`/auth/realms/${this.REALM_ID}/protocol/openid-connect/token`)
      .reply(200, {
        access_token: accessToken,
        id_token: idToken,
        refresh_token: 'mock_refresh_token_abcde',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'openid profile email'
      });
  }

  /**
   * Mock userinfo endpoint - returns empty data (simulating real PrimeAuth issue)
   */
  static mockUserInfoEmpty() {
    const mockScope = nock(this.PRIMEAUTH_BASE_URL);
    
    // Mock OIDC userinfo endpoint (primary)
    mockScope
      .get(`/auth/realms/${this.REALM_ID}/protocol/openid-connect/userinfo`)
      .reply(200, {
        sub: 'b5a9babd-6e00-4546-88ce-634016820b6f',
        username: '',
        email: '',
        email_verified: false,
        preferred_username: '',
        realm_id: this.REALM_ID,
        updated_at: new Date().toISOString()
      });

    // Mock alternative API endpoints that AuthService tries
    const endpoints = [
      '/api/v1/users/me',
      '/api/v1/user/profile', 
      '/api/v1/user/me',
      '/api/users/me',
      '/users/me',
      '/me',
      '/management/users/me',
      '/admin/users/me',
      '/v1/users/me',
      '/v2/users/me',
    ];

    endpoints.forEach(endpoint => {
      mockScope
        .get(endpoint)
        .reply(404, { message: 'Not found' });
    });

    return mockScope;
  }

  /**
   * Mock userinfo endpoint - returns full user data
   */
  static mockUserInfoSuccess(userData: any = {}) {
    const defaultUser = {
      sub: 'b5a9babd-6e00-4546-88ce-634016820b6f',
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'User',
      username: 'testuser',
      email_verified: true,
      preferred_username: 'testuser',
      realm_id: this.REALM_ID,
      updated_at: new Date().toISOString()
    };

    const mockScope = nock(this.PRIMEAUTH_BASE_URL);
    
    // Mock OIDC userinfo endpoint (primary)
    mockScope
      .get(`/auth/realms/${this.REALM_ID}/protocol/openid-connect/userinfo`)
      .reply(200, { ...defaultUser, ...userData });

    // Mock alternative API endpoints that AuthService tries
    const endpoints = [
      '/api/v1/users/me',
      '/api/v1/user/profile', 
      '/api/v1/user/me',
      '/api/users/me',
      '/users/me',
      '/me',
      '/management/users/me',
      '/admin/users/me',
      '/v1/users/me',
      '/v2/users/me',
    ];

    endpoints.forEach(endpoint => {
      mockScope
        .get(endpoint)
        .reply(404, { message: 'Not found' });
    });

    return mockScope;
  }

  /**
   * Mock admin user login
   */
  static mockAdminLogin() {
    return this.mockUserInfoSuccess({
      sub: '60e9929e-6e30-431c-9f1b-529b61867759',
      email: 'admin@primeauth.dev',
      first_name: 'Admin',
      last_name: 'User',
      username: 'admin'
    });
  }

  /**
   * Mock regular user login (Risky Asyam)
   */
  static mockRiskyAsynLogin() {
    return this.mockUserInfoSuccess({
      sub: 'b5a9babd-6e00-4546-88ce-634016820b6f',
      email: 'asyam@gmail.com',
      first_name: 'Risky',
      last_name: 'Asyam',
      username: 'asyam'
    });
  }

  /**
   * Mock failed token exchange
   */
  static mockTokenExchangeError() {
    return nock(this.PRIMEAUTH_BASE_URL)
      .post(`/auth/realms/${this.REALM_ID}/protocol/openid-connect/token`)
      .reply(400, {
        error: 'invalid_grant',
        error_description: 'Invalid authorization code'
      });
  }

  /**
   * Mock refresh token
   */
  static mockRefreshToken() {
    return nock(this.PRIMEAUTH_BASE_URL)
      .post(`/auth/realms/${this.REALM_ID}/protocol/openid-connect/token`)
      .reply(200, {
        access_token: 'new_mock_access_token_12345',
        id_token: 'new_mock_id_token_67890',
        refresh_token: 'new_mock_refresh_token_abcde',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'openid profile email'
      });
  }

  /**
   * Setup complete successful login flow
   */
  static setupSuccessfulLogin(userData?: any) {
    this.mockOidcDiscovery();
    this.mockTokenExchange();
    if (userData) {
      this.mockUserInfoSuccess(userData);
    } else {
      this.mockUserInfoEmpty(); // Simulate real PrimeAuth behavior
    }
  }

  /**
   * Setup failed login flow
   */
  static setupFailedLogin() {
    this.mockOidcDiscovery();
    this.mockTokenExchangeError();
  }
}
