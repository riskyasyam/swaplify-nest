import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptions } from 'passport-jwt';
import * as jwksRsa from 'jwks-rsa';
import { PrismaService } from 'src/prisma/prisma.service';
import { Role } from '@prisma/client'; // <— penting kalau pakai enum dari Prisma

// Ambil token dari cookie "access_token" ATAU Authorization: Bearer
const cookieOrAuthExtractor = (req: any) => {
  if (!req) return null;
  const c = req.cookies?.['access_token'];
  if (typeof c === 'string' && c.length > 0) return c;

  const h = req.headers?.authorization || req.headers?.Authorization;
  if (typeof h === 'string' && h.startsWith('Bearer ')) return h.slice(7);
  return null;
};

function isAdminEmail(email: string, emails: string[], domain?: string) {
  const norm = (s: string) => s.trim().toLowerCase();
  const hitEmail = emails.map(norm).includes(norm(email));
  const hitDomain = domain ? norm(email).endsWith(`@${norm(domain)}`) : false;
  return hitEmail || hitDomain;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    if (!process.env.PRIMEAUTH_JWKS_URI) {
      throw new Error('PRIMEAUTH_JWKS_URI is required for RS256 verification');
    }

    const issuer = process.env.PRIMEAUTH_ISSUER || undefined;
    const audience = process.env.API_AUDIENCE || undefined;

    const secretProvider = jwksRsa.passportJwtSecret({
      cache: true,
      cacheMaxEntries: 5,
      cacheMaxAge: 10 * 60 * 1000,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: process.env.PRIMEAUTH_JWKS_URI!,
    });

    const opts: StrategyOptions = {
      jwtFromRequest: ExtractJwt.fromExtractors([cookieOrAuthExtractor]),
      ignoreExpiration: false,
      algorithms: ['RS256'],
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

    const sub: string = payload.sub;
    const email: string | undefined = payload.email;

    // Upsert user lokal berdasarkan authSub (BUKAN sub)
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

    // Auto-promote ADMIN berdasarkan email/domain whitelist
    const adminEmails = (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const adminDomain = process.env.ADMIN_EMAIL_DOMAIN || undefined;

    const emailVerifiedOk = payload.email_verified !== false;

    if (
      email &&
      emailVerifiedOk &&
      isAdminEmail(email, adminEmails, adminDomain) &&
      user.role !== Role.ADMIN // <— pakai enum
    ) {
      user = await this.prisma.user.update({
        where: { authSub: sub },
        data: { role: Role.ADMIN },
        select: { id: true, email: true, authSub: true, displayName: true, role: true },
      });
    }

    // Ini yang jadi req.user
    return {
      id: user.id,
      sub: user.authSub,          // <— mapping ke sub untuk konsistensi downstream
      email: user.email,
      role: user.role,
      displayName: user.displayName,
    };
  }
}