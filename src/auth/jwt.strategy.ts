import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptions } from 'passport-jwt';
import * as jwksRsa from 'jwks-rsa';
import { PrismaService } from 'src/prisma/prisma.service';
import { Role } from '@prisma/client';

const log = new Logger('JwtStrategy');

// Ambil token dari Authorization: Bearer ... atau cookie "access_token"
const cookieOrAuthExtractor = (req: any) => {
  if (!req) return null;
  const h = req.headers?.authorization || req.headers?.Authorization;
  if (typeof h === 'string' && h.startsWith('Bearer ')) return h.slice(7);
  const c = req.cookies?.['access_token'];
  if (typeof c === 'string' && c.length > 0) return c;
  return null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly prisma: PrismaService) {
    const hsSecret = process.env.PRIMEAUTH_JWT_SECRET; // kalau ada → HS256
    const issuer = process.env.PRIMEAUTH_ISSUER;       // opsional
    const audience = process.env.API_AUDIENCE;         // opsional

    let opts: StrategyOptions;

    if (hsSecret) {
      // === Mode HS256 (secret) ===
      opts = {
        jwtFromRequest: ExtractJwt.fromExtractors([
          cookieOrAuthExtractor,
          ExtractJwt.fromAuthHeaderAsBearerToken(),
        ]),
        ignoreExpiration: false,
        algorithms: ['HS256'],
        secretOrKey: hsSecret,
        ...(issuer ? { issuer } : {}),
        ...(audience ? { audience } : {}),
      };
      log.log('JWT Strategy: HS256 (PRIMEAUTH_JWT_SECRET found)');
    } else {
      // === Mode RS256 (JWKS) ===
      const jwksUri =
        process.env.PRIMEAUTH_JWKS_URI ??
        (process.env.PRIMEAUTH_AUTH_SERVICE_URL && process.env.REALM_ID
          ? `${process.env.PRIMEAUTH_AUTH_SERVICE_URL.replace(/\/+$/, '')}/realms/${process.env.REALM_ID}/protocol/openid-connect/certs`
          : undefined);

      if (!jwksUri) {
        throw new Error(
          'Untuk RS256, set PRIMEAUTH_JWKS_URI atau PRIMEAUTH_AUTH_SERVICE_URL + REALM_ID',
        );
      }

      log.log(`JWT Strategy: RS256 via JWKS (${jwksUri})`);

      const jwksSecret: any = jwksRsa.passportJwtSecret({
        cache: true,
        cacheMaxEntries: 5,
        cacheMaxAge: 10 * 60 * 1000,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri,
      });

      opts = {
        jwtFromRequest: ExtractJwt.fromExtractors([
          cookieOrAuthExtractor,
          ExtractJwt.fromAuthHeaderAsBearerToken(),
        ]),
        ignoreExpiration: true, // TEMPORARY: disable expiration check for debugging
        algorithms: ['RS256'],
        secretOrKeyProvider: jwksSecret,
        // TEMPORARY: disable issuer and audience check for debugging
        // ...(issuer ? { issuer } : {}),
        // ...(audience ? { audience } : {}),
      };
    }

    super(opts as any);
  }

  async validate(payload: any) {
    try {
      log.debug('JWT payload received:', payload);
      
      if (!payload?.sub) throw new UnauthorizedException('Invalid token payload');

      const sub: string = payload.sub;
      const email: string | undefined = payload.email;

      // Upsert user lokal berdasarkan authSub (= sub)
      let user = await this.prisma.user.upsert({
        where: { authSub: sub },
        create: {
          authSub: sub,
          email: email ?? null,
          displayName: payload.name ?? payload.preferred_username ?? null,
        },
        update: {},
        select: { id: true, email: true, authSub: true, displayName: true, role: true },
      });

      // Optional: auto ADMIN via ENV
      const adminEmails = (process.env.ADMIN_EMAILS ?? '')
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);
      const adminDomain = (process.env.ADMIN_EMAIL_DOMAIN ?? '').toLowerCase();
      const isAdmin = !!email && (adminEmails.includes(email.toLowerCase()) ||
                       (adminDomain && email.toLowerCase().endsWith(`@${adminDomain}`)));

      if (isAdmin && user.role !== Role.ADMIN) {
        user = await this.prisma.user.update({
          where: { authSub: sub },
          data: { role: Role.ADMIN },
          select: { id: true, email: true, authSub: true, displayName: true, role: true },
        });
      }

      return {
        id: user.id,
        sub: user.authSub,
        email: user.email,
        role: user.role,
        displayName: user.displayName,
      };
    } catch (e) {
      log.warn(`JWT validate failed: ${e instanceof Error ? e.message : e}`);
      throw new UnauthorizedException('Invalid/expired token');
    }
  }
}