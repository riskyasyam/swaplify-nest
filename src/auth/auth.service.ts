import { Injectable, BadRequestException } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from 'src/prisma/prisma.service';
import type { Role } from '@prisma/client';
import { OidcProviderService } from './oidc-provider.service'; // ⬅️ tambah ini
import { decodeJwt } from './utils/jwt.util';


type PrimeTokens = {
  access_token?: string;
  id_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
};

type TokenClaims = {
  sub: string;
  email?: string;
  name?: string;
  role?: 'USER' | 'ADMIN';
  [k: string]: any;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly oidc: OidcProviderService
  ) {}

  /**
   * Dipanggil oleh controller callback: tukar code -> tokens, upsert user, return user+tokens.
   */
  async handlePrimeAuthCallback(code: string) {
    if (!code) throw new BadRequestException('Missing authorization code');

    const tokens = await this.exchangeCodeForTokens(code);

    const jwt = tokens.id_token ?? tokens.access_token;
    if (!jwt) throw new BadRequestException('No JWT returned from PrimeAuth');

    // 1) Decode claims dari id_token/access_token
    const claims = this.decodeJwt(jwt); // { sub, email?, name?, role?, ... }

    // 2) Tarik userinfo (prioritaskan access_token)
    const me = await axios.get(
      `${process.env.PRIMEAUTH_AUTH_SERVICE_URL}/realms/${process.env.REALM_ID}/protocol/openid-connect/userinfo`,
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    ).then(r => r.data).catch(() => ({}));

    // 3) Merge data: userinfo > claims > fallback
    const merged = {
      sub: claims.sub,
      email: me?.email ?? claims?.email ?? '',
      name:  me?.name  ?? claims?.name  ?? null,
      role:  (claims?.role ?? 'USER') as Role,
    };

    // 4) Upsert dengan data final
    const user = await this.prisma.user.upsert({
      where: { authSub: merged.sub },
      update: { email: merged.email, displayName: merged.name, role: merged.role },
      create: { authSub: merged.sub, email: merged.email, displayName: merged.name, role: merged.role },
      select: { id: true, email: true, displayName: true, role: true },
    });

    // 5) Pastikan subscription gratis
    await this.ensureFreeSubscription(user.id);

    return { user, tokens };
  }

  private async exchangeCodeForTokens(code: string): Promise<PrimeTokens> {
    const d = await this.oidc.get(); // ⬅️ ambil discovery
    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: process.env.CLIENT_ID!,
        client_secret: process.env.CLIENT_SECRET!, // kalau confidential client
        redirect_uri: process.env.REDIRECT_URI!,
        code,
    });

    const { data } = await axios.post<PrimeTokens>(d.token_endpoint, body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return data;
    }

  /** decode tanpa verifikasi; verifikasi signature dilakukan oleh JwtStrategy di request berikutnya */
  private decodeJwt(jwt: string) {
    return decodeJwt(jwt);
}

  /**
   * Upsert user berdasar klaim PrimeAuth (sub/email/name/role).
   * authSub wajib → mapping identitas antar sistem.
   */
  private async upsertUserFromClaims(claims: TokenClaims) {
    const authSub = claims.sub;
    if (!authSub) throw new BadRequestException('Token missing sub');

    const email = claims.email ?? '';
    const displayName = claims.name ?? null;
    const role = (claims.role ?? 'USER') as Role;

    return this.prisma.user.upsert({
      where: { authSub },
      update: { email, displayName, role },
      create: { authSub, email, displayName, role },
      select: { id: true, email: true, displayName: true, role: true },
    });
  }

  private async ensureFreeSubscription(userId: number) {
    const hasActive = await this.prisma.userSubscription.findFirst({
      where: { userId, isActive: true },
      select: { id: true },
    });
    if (hasActive) return;

    const freePlan = await this.prisma.plan.findUnique({
      where: { code: 'FREE' },
      select: { id: true },
    });
    if (!freePlan) return;

    await this.prisma.userSubscription.create({
      data: { userId, planId: freePlan.id, isActive: true, startedAt: new Date() },
    });
  }
}