import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class PrimeAuthIntrospectionGuard implements CanActivate {
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const token =
      req.cookies?.access_token ||
      (req.headers.authorization?.startsWith('Bearer ') && req.headers.authorization.slice(7));
    if (!token) throw new UnauthorizedException('No token');

    const { data } = await axios.post(
      `${process.env.PRIMEAUTH_AUTH_SERVICE_URL}/api/v1/auth/validate`,
      { token },
      { timeout: 3000 }
    );
    if (!data?.valid) throw new UnauthorizedException('Invalid token');

    // set req.user dari claims
    req.user = data.claims; // { sub, email, role, ... } tergantung server
    return true;
  }
}