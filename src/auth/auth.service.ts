import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from 'src/user/user.service';
import { LoginUserDto } from './dto/login-user.dto';
import * as bcrypt from 'bcrypt';

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

        const valid = await bcrypt.compare(data.password, user.password);
        if (!valid) {
            throw new UnauthorizedException('Password salah');
        }

        const payload = { sub: user.id, email: user.email };
        const token = this.jwtService.sign(payload);
        
        return {
            message: 'Login berhasil',
            accessToken: token,
        };
    }
}
