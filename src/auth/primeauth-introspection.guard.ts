import {
  CanActivate, ExecutionContext, Injectable, UnauthorizedException, ForbiddenException, Logger
} from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { PrismaService } from 'src/prisma/prisma.service';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from 'src/common/decorators/public.decorator';

const log = new Logger('PrimeAuthIntrospection');

type ValidatePayload = Record<string, any>;

@Injectable()
export class PrimeAuthIntrospectionGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private reflector: Reflector,
  ) {}

  private get authBases(): string[] {
    const a = process.env.PRIMEAUTH_AUTH_SERVICE_URL?.replace(/\/+$/, '');
    const r = process.env.PRIMEAUTH_REALM_SERVICE_URL?.replace(/\/+$/, '');
    return [a, r].filter(Boolean) as string[];
  }

  private extractToken(req: any): string | null {
    const bearer = typeof req.headers?.authorization === 'string'
      && req.headers.authorization.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null;
    const cookie = typeof req.cookies?.access_token === 'string' ? req.cookies.access_token : null;
    return bearer ?? cookie;
  }

  private buildBodies(token: string): ValidatePayload[] {
    const realmId = process.env.REALM_ID;
    const clientId = process.env.CLIENT_ID;
    const list: ValidatePayload[] = [
      { token },
      { access_token: token },
    ];
    if (realmId) {
      list.push(
        { token, realmId }, 
        { token, realmid: realmId },
        { token, realm_id: realmId },
        { access_token: token, realm_id: realmId }
      );
    }
    if (clientId) {
      list.push(
        { token, clientId },
        { token, client_id: clientId },
        { access_token: token, client_id: clientId }
      );
    }
    if (realmId && clientId) {
      list.push(
        { token, realmId, clientId }, 
        { token, realmid: realmId, clientId },
        { token, realm_id: realmId, client_id: clientId },
        { access_token: token, realm_id: realmId, client_id: clientId }
      );
    }
    return list;
  }

  private buildHeaders(): Array<Record<string, string>> {
    const realmId = process.env.REALM_ID;
    const clientId = process.env.CLIENT_ID;
    const arr: Array<Record<string, string>> = [{}];
    if (realmId) arr.push({ 'X-Realm-Id': realmId });
    if (clientId) arr.push({ 'X-Client-Id': clientId });
    if (realmId && clientId) arr.push({ 'X-Realm-Id': realmId, 'X-Client-Id': clientId });
    return arr;
  }

  private get paths(): string[] {
    return [
      '/api/v1/auth/validate',
    ];
  }

  private async remoteValidate(token: string) {
    const bases = this.authBases;
    if (!bases.length) throw new UnauthorizedException('PrimeAuth base URL not configured');

    const bodies = this.buildBodies(token);
    const headersList = this.buildHeaders();
    const paths = this.paths;

    const attempts: string[] = [];

    for (const base of bases) {
      for (const path of paths) {
        const url = `${base}${path}`;
        for (const body of bodies) {
          for (const hdr of headersList) {
            try {
              const { data } = await axios.post(url, body, {
                timeout: 8000,
                headers: { 'Content-Type': 'application/json', ...hdr },
              });
              
              // Handle PrimeAuth response structure: { data: { valid: true, ... } }
              const responseData = data?.data || data;
              
              log.debug('Introspection success:', { url, responseData });
              return responseData;
            } catch (e) {
              const ax = e as AxiosError<any>;
              const status = ax.response?.status;
              const detail = ax.response?.data?.detail || ax.message;
              attempts.push(`${status || 'ERR'} ${url} body=${JSON.stringify(body)} hdr=${JSON.stringify(hdr)} :: ${detail}`);
              if (status === 401) throw new UnauthorizedException('Invalid/expired token');
              if (status === 403) throw new ForbiddenException('Forbidden');
            }
          }
        }
      }
    }

    log.warn(`All validate attempts failed. Last traces:\n${attempts.slice(-5).join('\n')}`);
    throw new UnauthorizedException('Token validation failed');
  }

  private async fetchUserInfo(accessToken: string, userId?: string): Promise<any> {
    if (!accessToken) return {};
    
    const attempts: string[] = [];
    
    // Attempt 1: Try /me endpoint (should work for current user)
    try {
      const { data } = await axios.get(
        `${process.env.PRIMEAUTH_AUTH_SERVICE_URL}/api/v1/users/me`,
        { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 7000 },
      );
      if (data?.data) return data.data;
      if (data) return data;
    } catch (e: any) {
      attempts.push(`/me endpoint failed: ${e.message}`);
    }
    
    // Attempt 2: Try users API endpoint (admin only)
    if (userId) {
      try {
        const { data } = await axios.get(
          `${process.env.PRIMEAUTH_AUTH_SERVICE_URL}/api/v1/users/${userId}`,
          { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 7000 },
        );
        if (data?.data) return data.data;
        if (data) return data;
      } catch (e: any) {
        attempts.push(`users API failed: ${e.message}`);
      }
    }
    
    // Attempt 3: Try userinfo endpoint
    try {
      const { data } = await axios.get(
        `${process.env.PRIMEAUTH_AUTH_SERVICE_URL}/realms/${process.env.REALM_ID}/protocol/openid-connect/userinfo`,
        { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 7000 },
      );
      if (data?.data) return data.data;
      if (data) return data;
    } catch (e: any) {
      attempts.push(`userinfo failed: ${e.message}`);
    }
    
    log.warn('All userinfo attempts failed:', attempts);
    return {};
  }

  // Helper untuk normalize string kosong
  private nz(v?: string | null): string | undefined {
    if (!v) return undefined;
    const t = String(v).trim();
    return t.length ? t : undefined;
  }

  private async upsertLocalUser(claims: any, accessToken?: string) {
    // PrimeAuth response structure: { valid: true, user_id: "...", realm_id: "...", ... }
    const sub: string | undefined = claims?.user_id || claims?.sub;
    if (!sub) throw new UnauthorizedException('Token missing user_id/sub');

    log.debug('Claims received for user:', claims);

    let email = this.nz(claims?.email);
    let displayName = this.nz(claims?.name) ?? this.nz(claims?.preferred_username) ?? this.nz(claims?.username);

    // Selalu coba fetch dari userinfo untuk mendapat data yang lebih lengkap
    try {
      log.debug(`Attempting to fetch userinfo for user ${sub}`);
      const userInfo = await this.fetchUserInfo(accessToken || '', sub);
      log.debug('UserInfo fetched:', userInfo);
      
      const originalEmail = email;
      const originalDisplayName = displayName;
      
      // Handle PrimeAuth user API response structure - prioritaskan data dari API
      email = this.nz(userInfo?.email) || email;
      displayName = 
        this.nz(`${userInfo?.first_name ?? ''} ${userInfo?.last_name ?? ''}`.trim()) ||
        this.nz(userInfo?.username) ||
        this.nz(userInfo?.name) ||
        this.nz(userInfo?.preferred_username) ||
        displayName;
        
      log.debug('Email update:', { original: originalEmail, new: email });
      log.debug('DisplayName update:', { original: originalDisplayName, new: displayName });
    } catch (e: any) {
      log.warn('Failed to fetch userinfo:', e.message);
    }

    // Fallback values
    email = email ?? `${sub}@${(process.env.PLACEHOLDER_EMAIL_DOMAIN ?? 'no-email.local')}`;
    displayName = displayName || `User-${sub.slice(-8)}`; // Lebih user-friendly

    log.debug('Upserting user with:', { sub, email, displayName });

    return this.prisma.user.upsert({
      where: { authSub: sub },
      create: { authSub: sub, email, displayName },
      update: { email, displayName }, // Force update even if user exists
      select: { id: true, email: true, displayName: true, role: true, authSub: true },
    });
  }

  async canActivate(ctx: ExecutionContext) {
    // HORMATI @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const token = this.extractToken(req);
    if (!token) throw new UnauthorizedException('No token');

    log.debug(`Validating token: ${token.substring(0, 20)}...`);
    
    const data = await this.remoteValidate(token);
    if (!data?.valid) throw new UnauthorizedException('Invalid token');

    const user = await this.upsertLocalUser(data, token);
    req.user = { id: user.id, sub: user.authSub, email: user.email, role: user.role, displayName: user.displayName };
    return true;
  }
}