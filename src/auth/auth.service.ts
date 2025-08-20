import { Injectable, BadRequestException } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from 'src/prisma/prisma.service';
import type { Role } from '@prisma/client';
import { OidcProviderService } from './oidc-provider.service';
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
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
  role?: 'USER' | 'ADMIN';
  [k: string]: any;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly oidc: OidcProviderService
  ) {}

  // === Helper kecil: normalize string kosong -> undefined ===
  private nz(v?: string | null): string | undefined {
    if (!v) return undefined;
    const t = v.trim();
    return t.length ? t : undefined;
  }

  // === Helper: tarik /userinfo (pakai access_token) ===
  private async fetchUserInfo(accessToken?: string): Promise<any> {
    if (!accessToken) return {};
    try {
      const { data } = await axios.get(
        `${process.env.PRIMEAUTH_AUTH_SERVICE_URL}/realms/${process.env.REALM_ID}/protocol/openid-connect/userinfo`,
        { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 7000 }
      );
      return data ?? {};
    } catch {
      return {};
    }
  }

  // === Helper: fallback ke Identity Service ===
  private async fetchIdentityUser(sub: string, accessToken?: string): Promise<any> {
    if (!accessToken || !process.env.IDENTITY_SERVICE_URL) return {};
    try {
      const { data } = await axios.get(
        `${process.env.IDENTITY_SERVICE_URL}/api/v1/users/${sub}`,
        { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 7000 }
      );
      return data ?? {};
    } catch {
      return {};
    }
  }

  /**
   * Tukar code -> tokens, merge claims + userinfo + identity, upsert user, return user+tokens
   */
  async handlePrimeAuthCallback(code: string) {
    if (!code) throw new BadRequestException('Missing authorization code');

    const tokens = await this.exchangeCodeForTokens(code);
    const jwt = tokens.id_token ?? tokens.access_token;
    if (!jwt) throw new BadRequestException('No JWT returned from PrimeAuth');

    const claims = this.decodeJwt(jwt) as TokenClaims;
    const sub = claims?.sub;
    if (!sub) throw new BadRequestException('Token missing sub');

    // helper: normalize string kosong -> undefined
    const nz = (v?: string | null) => (v && `${v}`.trim().length ? `${v}`.trim() : undefined);

    // 1) /userinfo
    let me: any = {};
    try {
      const r = await axios.get(
        `${process.env.PRIMEAUTH_AUTH_SERVICE_URL}/realms/${process.env.REALM_ID}/protocol/openid-connect/userinfo`,
        { headers: { Authorization: `Bearer ${tokens.access_token}` }, timeout: 7000 }
      );
      me = r.data ?? {};
    } catch {}

    // 2) /identity
    let idu: any = {};
    try {
      if (process.env.IDENTITY_SERVICE_URL) {
        const r = await axios.get(
          `${process.env.IDENTITY_SERVICE_URL}/api/v1/users/${sub}`,
          { headers: { Authorization: `Bearer ${tokens.access_token}` }, timeout: 7000 }
        );
        idu = r.data ?? {};
      }
    } catch {}

    // IMPORTANT: Kedua API bungkus payload di 'data'
    const ui = me?.data ?? {};   // userinfo inner
    const id = idu?.data ?? {};  // identity inner

    if (process.env.DEBUG_AUTH === '1') {
      console.log('DEBUG ui (userinfo.data):', ui);
      console.log('DEBUG id (identity.data):', id);
    }

    // 3) Merge prioritas: userinfo > identity > jwt claims
    const email =
      nz(ui.email) ??
      nz(id.email) ??
      nz(claims.email) ??
      `${sub}@${process.env.PLACEHOLDER_EMAIL_DOMAIN ?? 'no-email.local'}`;

    const displayName =
      nz(ui.name) ??
      nz(`${ui.given_name ?? ''} ${ui.family_name ?? ''}`) ??
      nz(ui.preferred_username) ??
      nz(id.full_name) ?? nz(id.name) ?? nz(id.username) ??
      nz(claims.name) ?? nz(claims.preferred_username) ??
      sub;

    const role = (claims?.role ?? 'USER') as Role;

    // 4) Upsert: selalu update supaya record lama yang kosong terisi
    const user = await this.prisma.user.upsert({
      where: { authSub: sub },
      update: { email, displayName, role },
      create: { authSub: sub, email, displayName, role },
      select: { id: true, email: true, displayName: true, role: true },
    });

    await this.ensureFreeSubscription(user.id);
    return { user, tokens };
  }

  private async exchangeCodeForTokens(code: string): Promise<PrimeTokens> {
    const d = await this.oidc.get();
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.CLIENT_ID!,
      ...(process.env.CLIENT_SECRET ? { client_secret: process.env.CLIENT_SECRET! } : {}),
      redirect_uri: process.env.REDIRECT_URI!,
      code,
    });

    const { data } = await axios.post<PrimeTokens>(d.token_endpoint, body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 8000,
    });
    return data;
  }

  private decodeJwt(token: string) {
    return decodeJwt(token);
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