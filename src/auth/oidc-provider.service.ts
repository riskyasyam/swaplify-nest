import { Injectable } from '@nestjs/common';
import axios from 'axios';

type ProviderMeta = {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  issuer?: string;
};

@Injectable()
export class OidcProviderService {
  private cached?: ProviderMeta;

  async get(): Promise<ProviderMeta> {
    // 1) Kalau ada manual endpoints di ENV, pakai itu
    const base = process.env.PRIMEAUTH_AUTH_SERVICE_URL?.replace(/\/+$/, '');
    const realm = process.env.REALM_ID;
    if (base && realm) {
      const auth = `${base}/realms/${realm}/protocol/openid-connect/auth`;
      const token = `${base}/realms/${realm}/protocol/openid-connect/token`;
      const userinfo = `${base}/realms/${realm}/protocol/openid-connect/userinfo`;
      this.cached = {
        authorization_endpoint: auth,
        token_endpoint: token,
        userinfo_endpoint: userinfo,
        issuer: process.env.PRIMEAUTH_ISSUER,
      };
      return this.cached;
    }

    // 2) (Opsional) Discovery URL kalau disediakan
    const discovery = process.env.OIDC_DISCOVERY_URL;
    if (discovery) {
      const { data } = await axios.get(discovery, { timeout: 8000 });
      this.cached = {
        authorization_endpoint: data.authorization_endpoint,
        token_endpoint: data.token_endpoint,
        userinfo_endpoint: data.userinfo_endpoint,
        issuer: data.issuer,
      };
      return this.cached;
    }

    throw new Error('Manual OIDC endpoints not fully set and discovery is unavailable');
  }
}
