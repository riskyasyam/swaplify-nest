import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class PrimeAuthService {
  private get tokenUrl() {
    return `${process.env.PRIMEAUTH_AUTH_SERVICE_URL}/realms/${process.env.REALM_ID}/protocol/openid-connect/token`;
  }
  private get identityBase() {
    return process.env.IDENTITY_SERVICE_URL!;
  }

  async getServiceAccessToken() {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.CLIENT_ID!,
      client_secret: process.env.CLIENT_SECRET!,
      scope: 'openid profile email',
    });
    const { data } = await axios.post(this.tokenUrl, body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 8000,
    });
    return data.access_token as string;
  }

  async createIdentityUser(params: {
    email: string;
    fullName: string;
    password?: string;     // kalau API tidak izinkan, kirim tanpa field ini
    status?: 'ACTIVE' | 'INACTIVE';
  }) {
    const accessToken = await this.getServiceAccessToken();
    const payload: Record<string, any> = {
      email: params.email,
      full_name: params.fullName,
      status: params.status ?? 'ACTIVE',
    };
    if (params.password) payload.password = params.password;

    const { data } = await axios.post(
      `${this.identityBase}/api/v1/users`,
      payload,
      { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 8000 },
    );
    return data; // biasanya mengandung id/sub user
  }
}