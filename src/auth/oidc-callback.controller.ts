import { BadRequestException, Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from 'src/common/decorators/public.decorator';
import { AuthService } from './auth.service';

@Controller('auth') // <- base path "auth"
export class OidcCallbackController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Get('callback') // <- /auth/callback (harus sama dengan REDIRECT_URI)
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

}