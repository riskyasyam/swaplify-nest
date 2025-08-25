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
  async callback(@Query('code') code: string) {
    if (!code) throw new BadRequestException('Missing authorization code');
    const { user, tokens } = await this.authService.handlePrimeAuthCallback(code);
    
    // Prioritaskan id_token untuk JWT validation
    const jwt_token = tokens.id_token ?? tokens.access_token;
    
    return {
      message: 'Login berhasil',
      access_token: jwt_token,
      id_token: tokens.id_token,
      raw_access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      user,
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

    const { data } = await axios.post(tokenUrl, body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 8000,
    });

    return { message: 'Token refreshed', ...data };
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