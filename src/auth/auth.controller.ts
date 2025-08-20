import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { PrimeAuthIntrospectionGuard } from './primeauth-introspection.guard';

@Controller('auth')
export class AuthController {
  // /auth/me -> butuh login
  @UseGuards(PrimeAuthIntrospectionGuard)
  @Get('me')
  me(@Req() req: any) {
    return req.user; // diisi oleh PrimeAuthIntrospectionGuard
  }
}