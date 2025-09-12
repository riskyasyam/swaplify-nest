import {
  BadRequestException, Body, Controller, Get, Post, Query, Req, Res
} from '@nestjs/common';
import type { Response, Request } from 'express';
import axios from 'axios';
import { OidcProviderService } from './oidc-provider.service';
import { AuthService } from './auth.service';
import { Public } from 'src/common/decorators/public.decorator';
import { randomUUID } from 'crypto';
import { IsString } from 'class-validator';

class RefreshDto { @IsString() refresh_token!: string; }
class LogoutDto { @IsString() refresh_token!: string; }

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

  // GET /auth/callback  <-- ini cocok dengan REDIRECT_URI-mu
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
    res.clearCookie('access_token', { path: '/' });
    try {
      const access =
        (typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer ')
          ? req.headers.authorization.slice(7)
          : undefined) || (req.cookies?.access_token as string | undefined);

      if (access && b?.refresh_token) {
        await axios.post(
          `${process.env.PRIMEAUTH_AUTH_SERVICE_URL}/api/v1/auth/logout`,
          { refresh_token: b.refresh_token, realm_id: process.env.REALM_ID },
          { headers: { Authorization: `Bearer ${access}` }, timeout: 5000 },
        );
      }
    } catch {}
    return { message: 'Logged out' };
  }

  // GET /auth/me - Get current user info from cookies
  @Public()
  @Get('me')
  async getCurrentUser(@Req() req: Request) {
    const accessToken = req.cookies?.access_token;
    if (!accessToken) {
      throw new BadRequestException('No access token found');
    }

    try {
      // Decode JWT to get user info
      const jwt = require('jsonwebtoken');
      const payload = jwt.decode(accessToken);
      
      if (!payload) {
        throw new BadRequestException('Invalid access token');
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
      throw new BadRequestException('Invalid access token');
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