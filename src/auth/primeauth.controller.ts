// src/auth/prime-auth.controller.ts
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

class RefreshDto {
  @IsString()
  refresh_token!: string;
}

class LogoutDto {
  @IsString()
  refresh_token!: string; // optional kalau API logout PrimeAuth butuh ini
}

@Controller('auth/prime')
export class PrimeAuthController {
  constructor(
    private readonly oidc: OidcProviderService,
    private readonly authService: AuthService
  ) {}

  // ======== OIDC login (redirect) ========
  @Public()
  @Get('login')
  async login(@Res() res: Response) {
    const ep = await this.oidc.get();
    const state = randomUUID();

    const params = new URLSearchParams({
      client_id: process.env.CLIENT_ID!,
      redirect_uri: process.env.REDIRECT_URI!,      // pastikan sama persis dgn yg terdaftar
      response_type: 'code',
      scope: 'openid profile email',
      response_mode: 'query',
      state,
    });

    params.set(
      'claims',
      JSON.stringify({
        userinfo: { email: { essential: true }, name: { essential: true } },
        id_token: { email: { essential: true }, name: { essential: true } },
      })
    );

    return res.redirect(`${ep.authorization_endpoint}?${params.toString()}`);
  }

  // ======== OIDC callback (balik JSON, tanpa redirect) ========
  @Public()
  @Get('callback')
  async callback(@Query('code') code: string) {
    if (!code) throw new BadRequestException('Missing authorization code');

    const { user, tokens } = await this.authService.handlePrimeAuthCallback(code);

    return {
      message: 'Login berhasil',
      access_token: tokens.id_token ?? tokens.access_token,
      refresh_token: tokens.refresh_token,
      user,
    };
  }

  // ======== Refresh token ========
  // Public by design (mengandalkan refresh_token di body), atau bisa kamu proteksi sesuai kebutuhan
  @Public()
  @Post('refresh')
  async refresh(@Body() b: RefreshDto) {
    if (!b?.refresh_token) throw new BadRequestException('refresh_token is required');

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: b.refresh_token,
      client_id: process.env.CLIENT_ID!,
      // NOTE: kalau client kamu confidential, sertakan client_secret
      ...(process.env.CLIENT_SECRET ? { client_secret: process.env.CLIENT_SECRET } : {}),
      redirect_uri: process.env.REDIRECT_URI!, // beberapa IdP minta ini ikut
    });

    const tokenUrl =
      process.env.PRIMEAUTH_TOKEN_URL ||
      `${process.env.PRIMEAUTH_AUTH_SERVICE_URL}/realms/${process.env.REALM_ID}/protocol/openid-connect/token`;

    const { data } = await axios.post(tokenUrl, body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 8000,
    });

    return {
      message: 'Token refreshed',
      ...data, // access_token, refresh_token (jika diberikan), expires_in, id_token (jika diberikan)
    };
  }

  // ======== Logout ========
  // Versi umum: bersihkan cookie local + (opsional) panggil logout PrimeAuth

  @Public()
  @Post('logout')
  async logout(
    @Req() req: Request, 
    @Res({ passthrough: true }) res: Response, 
    @Body() b: LogoutDto) {
    // 1) Hapus cookie access_token lokal (kalau kamu pakai cookie httpOnly)
    res.clearCookie('access_token', { path: '/' });

    // 2) (Opsional) panggil endpoint logout/revoke PrimeAuth
    //    Banyak IdP minta Authorization: Bearer <access_token> + refresh_token + realm_id
    try {
      const access =
        req.cookies?.access_token ||
        (typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer ')
          ? req.headers.authorization.slice(7)
          : undefined);

      if (access && b?.refresh_token) {
        await axios.post(
          `${process.env.PRIMEAUTH_AUTH_SERVICE_URL}/api/v1/auth/logout`,
          { refresh_token: b.refresh_token, realm_id: process.env.REALM_ID },
          {
            headers: {
              Authorization: `Bearer ${access}`,
              'Content-Type': 'application/json',
            },
            timeout: 5000,
          },
        );
      }
    } catch {
      // Jangan bocorkan error ke user; logout lokal tetap dianggap sukses
    }

    return { message: 'Logged out' };
  }
}