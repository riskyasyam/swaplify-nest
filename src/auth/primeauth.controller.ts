import {
  BadRequestException, Body, Controller, Get, Post, Query, Req, Res
} from '@nestjs/common';
import type { Response, Request } from 'express';
import axios from 'axios';
import { OidcProviderService } from './oidc-provider.service';
import { AuthService } from './auth.service';
import { Public } from 'src/common/decorators/public.decorator';
import { randomUUID } from 'crypto';
import { IsString, IsOptional, MinLength } from 'class-validator';

class RefreshDto { @IsString() refresh_token!: string; }
class LogoutDto { 
  @IsString() 
  @IsOptional()
  refresh_token?: string; 
}
class ManualLoginDto {
  @IsString()
  @MinLength(3)
  username: string;

  @IsString()
  @MinLength(6)
  password: string;
}

@Controller('auth') // <— base path jadi /auth
export class PrimeAuthController {
  constructor(
    private readonly oidc: OidcProviderService,
    private readonly authService: AuthService
  ) {}

  // GET /auth/prime/login
  @Public()
  @Get('prime/login')
  async login(@Res() res: Response) {
    const ep = await this.oidc.get();
    const state = randomUUID();

    const params = new URLSearchParams({
      client_id: process.env.CLIENT_ID!,
      redirect_uri: process.env.REDIRECT_URI!, // --> harus http://localhost:3000/auth/callback
      response_type: 'code',
      scope: 'openid profile email',
      response_mode: 'query',
      state,
    });

    params.set('claims', JSON.stringify({
      userinfo: { email: { essential: true }, name: { essential: true } },
      id_token: { email: { essential: true }, name: { essential: true } },
    }));

    return res.redirect(`${ep.authorization_endpoint}?${params.toString()}`);
  }

  // POST /auth/prime/manual-login - Manual login untuk SPA/Next.js
  @Public()
  @Post('prime/manual-login') 

  async manualLogin(@Body() loginDto: ManualLoginDto, @Res({ passthrough: true }) res: Response) {
    try {
      console.log('Manual login request received:', { username: loginDto.username, hasPassword: !!loginDto.password });
      
      // Validate input
      if (!loginDto.username || !loginDto.password) {
        throw new BadRequestException({
          message: 'Username and password are required',
          error: 'missing_credentials',
          statusCode: 400
        });
      }

      // Use PrimeAuth direct login endpoint instead of OIDC token endpoint
      const loginUrl = `${process.env.PRIMEAUTH_AUTH_SERVICE_URL}/api/v1/auth/login`;
      
      const requestBody = {
        identifier: loginDto.username,
        password: loginDto.password,
        realm_id: process.env.REALM_ID,
        client_id: process.env.CLIENT_ID
      };

      console.log('Direct login attempt for:', loginDto.username);
      console.log('Using login endpoint:', loginUrl);
      console.log('Request body:', { ...requestBody, password: '[HIDDEN]' });

      const loginResponse = await axios.post(loginUrl, requestBody, {
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 10000,
      });

      const loginData = loginResponse.data;
      console.log('Login response received:', { 
        success: loginData.success,
        hasAccessToken: !!loginData.access_token,
        hasRefreshToken: !!loginData.refresh_token,
        hasUser: !!loginData.user
      });

      if (!loginData.data || !loginData.data.access_token) {
        console.error('Login failed:', loginData);
        throw new BadRequestException({
          message: 'Login failed: Invalid credentials',
          error: 'invalid_credentials',
          statusCode: 401
        });
      }

      // Extract tokens from response
      const tokens = {
        access_token: loginData.data.access_token,
        refresh_token: loginData.data.refresh_token,
        id_token: loginData.data.id_token,
        expires_in: loginData.data.expires_in
      };

      // Use user data from response or decode JWT as fallback
      let userData = loginData.data.user;
      if (!userData) {
        const jwt = require('jsonwebtoken');
        const payload = jwt.decode(tokens.access_token || tokens.id_token);
        
        if (!payload || !payload.sub) {
          console.error('Invalid token payload:', payload);
          throw new BadRequestException({
            message: 'Login failed: Invalid token received',
            error: 'invalid_token',
            statusCode: 400
          });
        }

        userData = {
          id: payload.sub,
          email: payload.email,
          name: payload.name || payload.preferred_username,
          username: payload.preferred_username
        };
      }

      console.log('User data:', { id: userData.id, email: userData.email, name: userData.name });

      // Process user in database (create or update)
      const { user } = await this.authService.handleManualLoginTokens(tokens);
      console.log('User processed:', { id: user.id, email: user.email, role: user.role });
      
      // Prioritize id_token for JWT validation
      const jwt_token = tokens.id_token ?? tokens.access_token;
      
      // Set tokens as HTTP-only cookies (more secure)
      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        path: '/'
      };

      res.cookie('access_token', jwt_token, cookieOptions);
      
      if (tokens.refresh_token) {
        res.cookie('refresh_token', tokens.refresh_token, {
          ...cookieOptions,
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });
      }

      console.log('Login successful for user:', user.email);

      return {
        message: 'Login successful',
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
        },
        isAuthenticated: true,
        // Optional: return tokens for client-side storage if needed
        // tokens: {
        //   access_token: jwt_token,
        //   refresh_token: tokens.refresh_token,
        //   expires_in: tokens.expires_in
        // }
      };

    } catch (error) {
      console.error('Manual login error details:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
        stack: error.stack
      });
      
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const errorData = error.response?.data;
        
        console.error('Axios error details:', {
          status,
          statusText: error.response?.statusText,
          data: errorData,
          headers: error.response?.headers
        });
        
        if (status === 400) {
          throw new BadRequestException({
            message: 'Invalid credentials or client configuration',
            error: 'bad_request',
            details: errorData?.message || errorData?.error || 'Check username, password, and client settings',
            statusCode: 400
          });
        } else if (status === 401) {
          throw new BadRequestException({
            message: 'Invalid username or password',
            error: 'invalid_credentials',
            statusCode: 401
          });
        } else if (status === 404) {
          throw new BadRequestException({
            message: 'Login endpoint not found',
            error: 'endpoint_not_found',
            details: 'Check PrimeAuth service URL and realm configuration',
            statusCode: 404
          });
        } else if (status && status >= 500) {
          throw new BadRequestException({
            message: 'Authentication server error',
            error: 'server_error',
            details: 'Please try again later',
            statusCode: 502
          });
        }
      }
      
      // If it's already a BadRequestException, re-throw it
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      throw new BadRequestException({
        message: 'Login failed',
        error: 'authentication_failed',
        details: error.message || 'Unknown error occurred',
        statusCode: 400
      });
    }
  }

  // POST /auth/debug-manual-login - Debug version untuk troubleshooting
  @Public()
  @Post('debug-manual-login')
  async debugManualLogin(@Body() loginDto: ManualLoginDto) {
    try {
      console.log('Debug manual login request:', { username: loginDto.username, hasPassword: !!loginDto.password });
      
      // Validate input
      if (!loginDto.username || !loginDto.password) {
        return {
          success: false,
          error: 'missing_credentials',
          message: 'Username and password are required'
        };
      }

      // Check environment variables
      const envCheck = {
        CLIENT_ID: !!process.env.CLIENT_ID,
        CLIENT_SECRET: !!process.env.CLIENT_SECRET,
        PRIMEAUTH_AUTH_SERVICE_URL: !!process.env.PRIMEAUTH_AUTH_SERVICE_URL,
        REALM_ID: !!process.env.REALM_ID,
        values: {
          CLIENT_ID: process.env.CLIENT_ID,
          PRIMEAUTH_AUTH_SERVICE_URL: process.env.PRIMEAUTH_AUTH_SERVICE_URL,
          REALM_ID: process.env.REALM_ID
        }
      };

      // Use PrimeAuth direct login endpoint (same as main manual login)
      const loginUrl = `${process.env.PRIMEAUTH_AUTH_SERVICE_URL}/api/v1/auth/login`;
      
      const requestBody = {
        identifier: loginDto.username,
        password: loginDto.password,
        realm_id: process.env.REALM_ID,
        client_id: process.env.CLIENT_ID
      };

      const requestInfo = {
        endpoint: loginUrl,
        method: 'POST',
        content_type: 'application/json',
        username: loginDto.username,
        realm_id: process.env.REALM_ID,
        client_id: process.env.CLIENT_ID,
        has_client_secret: !!process.env.CLIENT_SECRET
      };

      // Try the direct login request
      try {
        const loginResponse = await axios.post(loginUrl, requestBody, {
          headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 10000,
        });

        const loginData = loginResponse.data;
        
        return {
          success: true,
          message: 'Manual login debug successful',
          env_check: envCheck,
          request_info: requestInfo,
          response_info: {
            status: loginResponse.status,
            success: loginData.success,
            has_access_token: !!loginData.access_token,
            has_id_token: !!loginData.id_token,
            has_refresh_token: !!loginData.refresh_token,
            has_user: !!loginData.user,
            response_keys: Object.keys(loginData)
          },
          response_data: loginData // Be careful with this in production
        };

      } catch (axiosError) {
        return {
          success: false,
          error: 'login_request_failed',
          message: 'Failed to authenticate with direct login API',
          env_check: envCheck,
          request_info: requestInfo,
          axios_error: {
            status: axiosError.response?.status,
            statusText: axiosError.response?.statusText,
            data: axiosError.response?.data,
            message: axiosError.message
          }
        };
      }

    } catch (error) {
      return {
        success: false,
        error: 'debug_failed',
        message: 'Debug endpoint failed',
        details: error.message,
        stack: error.stack
      };
    }
  }
  @Public()
  @Get('callback')
  async callback(@Query('code') code: string, @Res() res: Response) {
    if (!code) throw new BadRequestException('Missing authorization code');
    
    try {
      const { user, tokens } = await this.authService.handlePrimeAuthCallback(code);
      
      // Prioritaskan id_token untuk JWT validation
      const jwt_token = tokens.id_token ?? tokens.access_token;
      
      // Set tokens as HTTP-only cookies (more secure)
      res.cookie('access_token', jwt_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        path: '/'
      });
      
      res.cookie('refresh_token', tokens.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/'
      });

      // Redirect ke frontend success page
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
      const redirectUrl = `${frontendUrl}/auth/success?user_id=${user.id}&email=${encodeURIComponent(user.email || '')}`;
      
      return res.redirect(redirectUrl);
      
    } catch (error) {
      // Jika error, redirect ke error page
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const errorUrl = `${frontendUrl}/auth/error?message=${encodeURIComponent('Login failed')}`;
      return res.redirect(errorUrl);
    }
  }

  // GET /auth/callback-debug - Debug version yang return JSON (for testing)
  @Public()
  @Get('callback-debug')
  async callbackDebug(@Query('code') code: string) {
    if (!code) throw new BadRequestException('Missing authorization code');
    
    const { user, tokens } = await this.authService.handlePrimeAuthCallback(code);
    
    // Prioritaskan id_token untuk JWT validation
    const jwt_token = tokens.id_token ?? tokens.access_token;
    
    return {
      message: 'Login berhasil (Debug Mode)',
      access_token: jwt_token,
      id_token: tokens.id_token,
      raw_access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      user,
      note: 'This endpoint is for testing only. Use /auth/callback for production.'
    };
  }

  // POST /auth/refresh (opsional)
  @Public()
  @Post('refresh')
  async refresh(@Body() b: RefreshDto) {
    if (!b?.refresh_token) throw new BadRequestException('refresh_token is required');

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: b.refresh_token,
      client_id: process.env.CLIENT_ID!,
      ...(process.env.CLIENT_SECRET ? { client_secret: process.env.CLIENT_SECRET } : {}),
      redirect_uri: process.env.REDIRECT_URI!,
    });

    const tokenUrl =
      process.env.PRIMEAUTH_TOKEN_URL ||
      `${process.env.PRIMEAUTH_AUTH_SERVICE_URL}/realms/${process.env.REALM_ID}/protocol/openid-connect/token`;

    try {
      const { data } = await axios.post(tokenUrl, body, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 8000,
      });

      return { message: 'Token refreshed', ...data };
    } catch (error) {
      // Handle different types of refresh token errors
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const errorData = error.response?.data;
        
        if (status === 400) {
          // Refresh token expired or invalid
          throw new BadRequestException({
            message: 'Refresh token is invalid or expired',
            error: 'invalid_refresh_token',
            details: errorData?.error_description || 'Please login again',
            statusCode: 400
          });
        } else if (status === 401) {
          // Unauthorized
          throw new BadRequestException({
            message: 'Authentication failed',
            error: 'unauthorized',
            details: 'Please login again',
            statusCode: 401
          });
        } else if (status && status >= 500) {
          // Server error
          throw new BadRequestException({
            message: 'Authentication server error',
            error: 'server_error',
            details: 'Please try again later',
            statusCode: 502
          });
        }
      }
      
      // Generic error for unexpected cases
      throw new BadRequestException({
        message: 'Failed to refresh token',
        error: 'refresh_failed',
        details: 'Please login again',
        statusCode: 400
      });
    }
  }

  // POST /auth/logout (opsional)
  @Public()
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() b: LogoutDto) {
    // Clear cookies dengan opsi yang sama seperti saat set
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/'
    };
    
    res.clearCookie('access_token', cookieOptions);
    res.clearCookie('refresh_token', cookieOptions);
    
    try {
      const access =
        (typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer ')
          ? req.headers.authorization.slice(7)
          : undefined) || (req.cookies?.access_token as string | undefined);

      const refreshToken = b?.refresh_token || (req.cookies?.refresh_token as string | undefined);

      if (access && refreshToken) {
        await axios.post(
          `${process.env.PRIMEAUTH_AUTH_SERVICE_URL}/api/v1/auth/logout`,
          { refresh_token: refreshToken, realm_id: process.env.REALM_ID },
          { headers: { Authorization: `Bearer ${access}` }, timeout: 5000 },
        );
      }
    } catch (error) {
      // Log error untuk debugging, tapi tetap return success
      console.warn('Logout API call failed:', error.message);
    }
    
    return { message: 'Logged out successfully' };
  }

  // GET /auth/logout-simple - Logout tanpa body validation (untuk frontend)
  @Public()
  @Get('logout-simple')
  async logoutSimple(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    // Clear cookies dengan opsi yang sama seperti saat set
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/'
    };
    
    res.clearCookie('access_token', cookieOptions);
    res.clearCookie('refresh_token', cookieOptions);
    
    try {
      const access = req.cookies?.access_token as string | undefined;
      const refreshToken = req.cookies?.refresh_token as string | undefined;

      if (access && refreshToken) {
        await axios.post(
          `${process.env.PRIMEAUTH_AUTH_SERVICE_URL}/api/v1/auth/logout`,
          { refresh_token: refreshToken, realm_id: process.env.REALM_ID },
          { headers: { Authorization: `Bearer ${access}` }, timeout: 5000 },
        );
      }
    } catch (error) {
      console.warn('Logout API call failed:', error.message);
    }
    
    return { message: 'Logged out successfully' };
  }

  // GET /auth/me - Get current user info from cookies
  @Public()
  @Get('me')
  async getCurrentUser(@Req() req: Request) {
    const accessToken = req.cookies?.access_token;
    if (!accessToken) {
      return {
        isAuthenticated: false,
        message: 'No access token found',
        user: null
      };
    }

    try {
      // Decode JWT to get user info
      const jwt = require('jsonwebtoken');
      const payload = jwt.decode(accessToken);
      
      if (!payload) {
        return {
          isAuthenticated: false,
          message: 'Invalid access token',
          user: null
        };
      }

      return {
        user: {
          id: payload.sub,
          email: payload.email,
          name: payload.name,
          preferred_username: payload.preferred_username,
        },
        isAuthenticated: true
      };
    } catch (error) {
      return {
        isAuthenticated: false,
        message: 'Invalid access token',
        user: null
      };
    }
  }

  // GET /auth/token-info - Get token info from cookies (for testing)
  @Public()
  @Get('token-info')
  async getTokenInfo(@Req() req: Request) {
    const accessToken = req.cookies?.access_token;
    const refreshToken = req.cookies?.refresh_token;
    
    if (!accessToken) {
      return {
        message: 'No tokens found in cookies',
        hasAccessToken: false,
        hasRefreshToken: false,
        instruction: 'Login first via /auth/prime/login'
      };
    }

    try {
      // Decode JWT to get info
      const jwt = require('jsonwebtoken');
      const payload = jwt.decode(accessToken);
      
      return {
        message: 'Tokens found in cookies',
        hasAccessToken: true,
        hasRefreshToken: !!refreshToken,
        access_token: accessToken,
        refresh_token: refreshToken,
        token_payload: payload,
        bearer_header: `Bearer ${accessToken}`,
        note: 'Copy the access_token or bearer_header to use in Postman Authorization header'
      };
    } catch (error) {
      return {
        message: 'Invalid token in cookies',
        hasAccessToken: true,
        hasRefreshToken: !!refreshToken,
        error: error.message,
        instruction: 'Login again via /auth/prime/login'
      };
    }
  }

  // POST /auth/debug-token (untuk testing)
  @Public()
  @Post('debug-token')
  async debugToken(@Body() body: { token: string }) {
    const { token } = body;
    if (!token) throw new BadRequestException('Token required');
    
    try {
      // Test JWT decode
      const jwt = require('jsonwebtoken');
      const decoded = jwt.decode(token, { complete: true });
      
      // Test manual JWT verification (without signature verification for debug)
      const payload = jwt.decode(token);
      
      return {
        success: true,
        token_type: typeof token,
        token_length: token.length,
        decoded_header: decoded?.header,
        decoded_payload: payload,
        token_preview: token.substring(0, 50) + '...',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        token_preview: token.substring(0, 50) + '...',
      };
    }
  }

  // GET /auth/test-protected (endpoint untuk test auth)
  @Get('test-protected')
  async testProtected(@Req() req: any) {
    return {
      message: 'Auth berhasil!',
      user: req.user,
    };
  }

  // POST /auth/test-fetch-userinfo (test manual fetch)
  @Public()
  @Post('test-fetch-userinfo')
  async testFetchUserinfo(@Body() body: { token: string }) {
    const { token } = body;
    if (!token) throw new BadRequestException('Token required');
    
    const results: any = {};
    
    // Test /me endpoint
    try {
      const { data } = await axios.get(
        `${process.env.PRIMEAUTH_AUTH_SERVICE_URL}/api/v1/users/me`,
        { headers: { Authorization: `Bearer ${token}` }, timeout: 7000 },
      );
      results.me_endpoint = { success: true, data };
    } catch (e: any) {
      results.me_endpoint = { 
        success: false, 
        status: e.response?.status, 
        error: e.response?.data || e.message 
      };
    }
    
    // Test userinfo endpoint
    try {
      const { data } = await axios.get(
        `${process.env.PRIMEAUTH_AUTH_SERVICE_URL}/realms/${process.env.REALM_ID}/protocol/openid-connect/userinfo`,
        { headers: { Authorization: `Bearer ${token}` }, timeout: 7000 },
      );
      results.userinfo_endpoint = { success: true, data };
    } catch (e: any) {
      results.userinfo_endpoint = { 
        success: false, 
        status: e.response?.status, 
        error: e.response?.data || e.message 
      };
    }
    
    return results;
  }
  async testIntrospect(@Body() body: { token: string }) {
    const { token } = body;
    if (!token) throw new BadRequestException('Token required');
    
    const bases = [
      process.env.PRIMEAUTH_AUTH_SERVICE_URL?.replace(/\/+$/, ''),
      process.env.PRIMEAUTH_REALM_SERVICE_URL?.replace(/\/+$/, '')
    ].filter(Boolean);
    
    const paths = [
      '/v1/auth/validate',
      '/api/v1/auth/validate', 
      '/auth/validate',
      `/realms/${process.env.REALM_ID}/protocol/openid-connect/token/introspect`,
    ];
    
    const results: any[] = [];
    
    for (const base of bases) {
      for (const path of paths) {
        const url = `${base}${path}`;
        try {
          const { data } = await axios.post(url, 
            { token, realm_id: process.env.REALM_ID, client_id: process.env.CLIENT_ID }, 
            {
              timeout: 8000,
              headers: { 'Content-Type': 'application/json' },
            }
          );
          results.push({ url, success: true, data });
        } catch (e) {
          const ax = e as any;
          results.push({ 
            url, 
            success: false, 
            status: ax.response?.status, 
            error: ax.response?.data || ax.message 
          });
        }
      }
    }
    
    return { results };
  }
}