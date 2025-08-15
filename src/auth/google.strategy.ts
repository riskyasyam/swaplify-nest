import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { AuthService } from './auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private readonly authService: AuthService) {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL, // jangan string literal
      scope: [
        'openid',
        'email',
        'profile',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
      ],
    });
  }
  
  authorizationParams(): any {
    return {
      prompt: 'select_account',
      // kalau mau paksa login ulang beneran: prompt: 'login'
      // bisa juga tambahkan login_hint / hd kalau perlu
    };
  }

  async validate(
  accessToken: string,
  refreshToken: string,
  profile: any,
  done: VerifyCallback,
  ): Promise<any> {
    // OPTIONAL: saat debug, lihat struktur profile dari Google
    // console.log(JSON.stringify(profile, null, 2));

    const { emails, name, displayName, photos, _json } = profile;

    // Ambil email aman
    const email = emails?.[0]?.value ?? _json?.email;

    // Fallback chain untuk firstName / lastName
    const firstName =
      name?.givenName ??
      _json?.given_name ??
      (displayName ? displayName.split(' ')[0] : undefined);

    const lastName =
      name?.familyName ??
      _json?.family_name ??
      (displayName
        ? displayName.split(' ').slice(1).join(' ') || undefined
        : undefined);

    // Foto profil (kalau mau disimpan)
    const picture = photos?.[0]?.value ?? _json?.picture;

    const user = await this.authService.validateOAuthUser({
      email,
      firstName,
      lastName,
      picture,
      accessToken,  // pakai kalau perlu akses Google API
      // picture,   // aktifkan kalau service/DB kamu sudah menampungnya
    });

    done(null, user);
  }
}