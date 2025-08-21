import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptions } from 'passport-jwt';
import * as jwksRsa from 'jwks-rsa';

// ambil token dari cookie "access_token" ATAU Authorization: Bearer
const cookieOrAuthExtractor = (req: any) => {
  if (!req) return null;
  const c = req.cookies?.['access_token'];
  if (typeof c === 'string' && c.length > 0) return c;

  const h = req.headers?.authorization || req.headers?.Authorization;
  if (typeof h === 'string' && h.startsWith('Bearer ')) return h.slice(7);
  return null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    const issuer = process.env.PRIMEAUTH_ISSUER || undefined;   // e.g. https://.../auth/realms/<REALM_ID>
    const audience = process.env.API_AUDIENCE || undefined;     // optional

    if (!process.env.PRIMEAUTH_JWKS_URI) {
      throw new Error('PRIMEAUTH_JWKS_URI is required for RS256 verification');
    }

    const secretProvider = jwksRsa.passportJwtSecret({
      cache: true,
      cacheMaxEntries: 5,
      cacheMaxAge: 10 * 60 * 1000,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: process.env.PRIMEAUTH_JWKS_URI,
    });

    const opts: StrategyOptions = {
      jwtFromRequest: ExtractJwt.fromExtractors([cookieOrAuthExtractor]),
      ignoreExpiration: false,
      algorithms: ['RS256'],                    // <— RS256 ONLY
      ...(issuer ? { issuer } : {}),
      ...(audience ? { audience } : {}),
      secretOrKeyProvider: (req, rawJwt, done) => {
        (secretProvider as any)(req, rawJwt, done);
      },
    };

    super(opts);
  }

  async validate(payload: any) {
    if (!payload?.sub) throw new UnauthorizedException('Invalid token payload');
    return {
      sub: payload.sub,
      userId: payload.sub,
      email: payload.email,
      name: payload.name || payload.preferred_username,
      role: payload.role || 'USER',
    };
  }
}