// src/auth/jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptions } from 'passport-jwt';
import * as jwksRsa from 'jwks-rsa';

// ambil token dari cookie "access_token" atau Authorization: Bearer
const cookieOrAuthExtractor = (req: any) => {
  if (!req) return null;
  // 1) cookie
  if (req.cookies && req.cookies['access_token']) {
    return req.cookies['access_token'];
  }
  // 2) header
  const auth = req.headers?.authorization || req.headers?.Authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    return auth.slice('Bearer '.length);
  }
  return null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    const issuer = process.env.PRIMEAUTH_ISSUER || undefined;
    const audience = process.env.API_AUDIENCE || undefined;

    // pakai JWKS dari PrimeAuth
    const jwksUri = process.env.PRIMEAUTH_JWKS_URI!;
    const secretProvider = jwksRsa.passportJwtSecret({
      cache: true,
      cacheMaxEntries: 5,
      cacheMaxAge: 10 * 60 * 1000, // 10 menit
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri,
    });

    const opts: StrategyOptions = {
      jwtFromRequest: ExtractJwt.fromExtractors([cookieOrAuthExtractor]),
      ignoreExpiration: false,
      algorithms: ['RS256'],
      // SEMENTARA: jangan set issuer/audience kalau belum yakin
      ...(issuer ? { issuer } : {}),
      ...(audience ? { audience } : {}),
      secretOrKeyProvider: (request, rawJwtToken, done) => {
        (secretProvider as any)(request, rawJwtToken, done);
      },
    };

    super(opts);
  }

  async validate(payload: any) {
    // payload sudah diverifikasi signature-nya
    // kamu bisa map claim dari PrimeAuth → req.user
    // contoh umum: sub, email, name, role
    if (!payload || !payload.sub) {
      throw new UnauthorizedException('Invalid token payload');
    }
    return {
      userId: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role || 'USER',
    };
  }
}