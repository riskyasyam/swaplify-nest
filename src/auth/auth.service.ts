// src/auth/auth.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from 'src/prisma/prisma.service';
import { Role } from '@prisma/client';
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
    private readonly oidc: OidcProviderService,
  ) {}

  private async ensureAdminByEmail(email?: string | null) {
    if (!email) return;

    const adminEmails = (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);
    const adminDomain = (process.env.ADMIN_EMAIL_DOMAIN ?? '').toLowerCase();

    const isListed = adminEmails.includes(email.toLowerCase());
    const isDomain = adminDomain && email.toLowerCase().endsWith(`@${adminDomain}`);

    if (isListed || isDomain) {
      await this.prisma.user.updateMany({
        where: { email },
        data: { role: Role.ADMIN },
      });
    }
  }

  // normalize: string kosong -> undefined
  private nz(v?: string | null): string | undefined {
    if (!v) return undefined;
    const t = String(v).trim();
    return t.length ? t : undefined;
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

  private async fetchUserInfo(accessToken?: string): Promise<any> {
    if (!accessToken) return {};
    
    console.log('AuthService: Fetching userinfo with token:', accessToken.substring(0, 20) + '...');
    
    // Try /me endpoint first (should work for current user)
    try {
      const { data: meData } = await axios.get(
        `${process.env.PRIMEAUTH_AUTH_SERVICE_URL}/api/v1/users/me`,
        { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 7000 },
      );
      console.log('AuthService: /me endpoint response:', meData);
      if (meData?.data) return meData.data;
      if (meData) return meData;
    } catch (e: any) {
      console.log('AuthService: /me endpoint failed:', e.response?.status, e.response?.data || e.message);
    }
    
    // Fallback to userinfo endpoint
    try {
      const { data } = await axios.get(
        `${process.env.PRIMEAUTH_AUTH_SERVICE_URL}/realms/${process.env.REALM_ID}/protocol/openid-connect/userinfo`,
        { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 7000 },
      );
      console.log('AuthService: userinfo endpoint response:', data);
      return data?.data || data || {};
    } catch (e: any) {
      console.log('AuthService: userinfo endpoint failed:', e.response?.status, e.response?.data || e.message);
      return {};
    }
  }

  // Public method untuk digunakan oleh guard
  async getUserInfo(accessToken: string): Promise<any> {
    return this.fetchUserInfo(accessToken);
  }

  private async fetchIdentityUser(sub: string, accessToken?: string): Promise<any> {
    if (!accessToken || !process.env.IDENTITY_SERVICE_URL) return {};
    try {
      const { data } = await axios.get(
        `${process.env.IDENTITY_SERVICE_URL}/api/v1/users/${sub}`,
        { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 7000 },
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

    const claims = decodeJwt(jwt) as TokenClaims;
    const sub = claims?.sub;
    if (!sub) throw new BadRequestException('Token missing sub');

    // Ambil userinfo & identity (kalau tersedia)
    const me = await this.fetchUserInfo(tokens.access_token);
    const idu = await this.fetchIdentityUser(sub, tokens.access_token);

    const ui = me?.data ?? me ?? {};
    const id = idu?.data ?? idu ?? {};

    if (process.env.DEBUG_AUTH === '1') {
      console.log('DEBUG claims:', claims);
      console.log('DEBUG userinfo:', me);
      console.log('DEBUG identity:', idu);
    }

    const email =
      this.nz(ui.email) ??
      this.nz(id.email) ??
      this.nz(claims.email) ??
      `${sub}@${process.env.PLACEHOLDER_EMAIL_DOMAIN ?? 'no-email.local'}`;

    const displayName =
      this.nz(`${ui.first_name ?? ''} ${ui.last_name ?? ''}`.trim()) ??
      this.nz(ui.username) ??
      this.nz(ui.name) ??
      this.nz(ui.preferred_username) ??
      this.nz(id.full_name) ??
      this.nz(id.name) ??
      this.nz(id.username) ??
      this.nz(claims.name) ??
      this.nz(claims.preferred_username) ??
      `User-${sub.slice(-8)}`; // Lebih user-friendly daripada UUID penuh

    // --- Penting: JANGAN overwrite role dari claims saat update ---
    // 1) cek apakah user sudah ada
    const existing = await this.prisma.user.findUnique({
      where: { authSub: sub },
      select: { id: true, role: true },
    });

    if (existing) {
      // update data profil saja (role tidak diubah)
      await this.prisma.user.update({
        where: { authSub: sub },
        data: { email, displayName },
      });
    } else {
      // create user baru dengan default USER
      await this.prisma.user.create({
        data: {
          authSub: sub,
          email,
          displayName,
          role: Role.USER,
        },
      });
    }

    // 2) Promote via whitelist (ENV) bila match
    await this.ensureAdminByEmail(email);

    // 3) Reload user untuk dapatkan role terbaru
    const user = await this.prisma.user.findUnique({
      where: { authSub: sub },
      select: { id: true, email: true, displayName: true, role: true },
    });

    // Safety: jika karena suatu alasan user null
    if (!user) throw new BadRequestException('User upsert failed');

    // Pastikan FREE subscription aktif (skema baru)
    await this.ensureFreeSubscription(user.id);

    return { user, tokens };
  }

  /**
   * Skema baru:
   * - Subscription pakai status/currentStart/currentEnd
   * - userId = UUID (string)
   */
  private async ensureFreeSubscription(userId: string) {
    const existing = await this.prisma.subscription.findFirst({
      where: { userId, status: 'ACTIVE', currentEnd: null },
      select: { id: true },
    });
    if (existing) return;

    const freePlan = await this.prisma.plan.findUnique({
      where: { code: 'FREE' },
      select: { id: true },
    });
    if (!freePlan) return;

    await this.prisma.subscription.create({
      data: {
        userId,                 // UUID string
        planId: freePlan.id,
        status: 'ACTIVE',
        currentStart: new Date(),
        currentEnd: null,
        billingRef: null,
      },
    });
  }
}
