import { Injectable } from '@nestjs/common';
import axios from 'axios';

type OidcEndpoints = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
};

@Injectable()
export class OidcProviderService {
  private cached?: OidcEndpoints;

  async get(): Promise<OidcEndpoints> {
    const manualIssuer = process.env.PRIMEAUTH_ISSUER;
    const manualAuth   = process.env.PRIMEAUTH_AUTH_URL;
    const manualToken  = process.env.PRIMEAUTH_TOKEN_URL;
    const manualUser   = process.env.PRIMEAUTH_USERINFO_URL;
    const manualJwks   = process.env.PRIMEAUTH_JWKS_URI;

    // 1) mode manual
    if (manualIssuer && manualAuth && manualToken && manualUser && manualJwks) {
      this.cached = {
        issuer: manualIssuer,
        authorization_endpoint: manualAuth,
        token_endpoint: manualToken,
        userinfo_endpoint: manualUser,
        jwks_uri: manualJwks,
      };
      return this.cached;
    }

    // 2) fallback discovery
    const discovery = process.env.OIDC_DISCOVERY_URL;
    if (discovery) {
      const { data } = await axios.get<OidcEndpoints>(discovery, { timeout: 5000 });
      this.cached = data;
      return this.cached;
    }

    // 3) kalau dua-duanya ga ada → lempar error
    throw new Error('Manual OIDC endpoints not fully set and discovery is unavailable');
  }
}