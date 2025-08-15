import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from 'src/user/user.service';
import { LoginUserDto } from './dto/login-user.dto';
// HAPUS bcrypt di sini untuk OAuth random password (biar tidak double-hash)

interface OAuthUserData {
  email: string;
  firstName?: string;
  lastName?: string;
  picture?: string;     // ✅ foto profil dari Google
  accessToken?: string; // kalau mau dipakai ke Google API
}

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
  ) {}

  async login(data: LoginUserDto) {
    const user = await this.userService.findByEmail(data.email);
    if (!user) {
      throw new UnauthorizedException('Email tidak ditemukan');
    }

    const valid = await this.userService.comparePassword(data.password, user.password);
    // ^ Rekomendasi: pindahkan bcrypt.compare ke UserService.comparePassword
    if (!valid) {
      throw new UnauthorizedException('Password salah');
    }

    const payload = { sub: user.id, email: user.email };
    const token = this.jwtService.sign(payload);

    return { message: 'Login berhasil', accessToken: token };
  }

  async validateOAuthUser(userData: OAuthUserData) {
    let user = await this.userService.findByEmail(userData.email);

    if (!user) {
      // Buat password acak PLAIN (UserService yang hash)
      const randomPassword = Math.random().toString(36);

      // ✅ create user lengkap dengan nama & foto (jika UserService mendukung field ini)
      user = await this.userService.createUser({
        email: userData.email,
        password: randomPassword,
        firstName: userData.firstName,
        lastName: userData.lastName,
        picture: userData.picture, // <-- opsional: butuh kolom picture di DB
      });
    } else {
      // ✅ isi nama/foto kalau sebelumnya masih null
      const patch: Partial<{
        firstName: string | null;
        lastName: string | null;
        picture: string | null;
      }> = {};

      if (!user.firstName && userData.firstName) patch.firstName = userData.firstName;
      if (!user.lastName && userData.lastName) patch.lastName = userData.lastName;
      // hanya update picture kalau belum ada atau kosong
      // (kalau mau selalu update, ubah logika sesuai kebutuhanmu)
      if ((user as any).picture === null || (user as any).picture === undefined) {
        if (userData.picture) patch.picture = userData.picture;
      }

      if (Object.keys(patch).length > 0) {
        user = await this.userService.update(user.id, patch);
      }
    }

    const payload = { sub: user.id, email: user.email };
    const token = this.jwtService.sign(payload);

    return {
      message: 'Login Google berhasil',
      accessToken: token,
      user,
    };
  }
}