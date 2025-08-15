import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginUserDto } from './dto/login-user.dto';
import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard } from './jwt-auth.guard';
// ⬇️ penting: type-only import untuk Express types
import type { Request, Response } from 'express';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    // LOGIN EMAIL/PASSWORD → set JWT ke cookie
    @Post('login')
    async login(@Body() data: LoginUserDto, @Res({ passthrough: true }) res: Response) {
        const result = await this.authService.login(data);
        res.cookie('access_token', result.accessToken, {
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            maxAge: 1000 * 60 * 60,
            path: '/',
        });
        return { message: result.message, accessToken: result.accessToken };
    }

    // START OAUTH GOOGLE
    @Get('google')
    @UseGuards(AuthGuard('google'))
    async googleAuth() {
        return { message: 'Redirect ke Google Login' };
    }

    // CALLBACK GOOGLE → set JWT ke cookie
    @Get('google/callback')
    @UseGuards(AuthGuard('google'))
    googleAuthRedirect(
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response,
    ) {
        // req.user dari AuthService.validateOAuthUser()
        const { accessToken, message, user } = req.user as any;

        // set HttpOnly cookie tetap jalan
        res.cookie('access_token', accessToken, {
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            maxAge: 1000 * 60 * 60, // 1 jam
            path: '/',
        });

        // ⬅️ balikin detail yang kamu mau lihat di Postman
        return { message, accessToken, user };
    }

    // PROFILE → butuh JwtAuthGuard
    @Get('profile')
    @UseGuards(JwtAuthGuard)
    getProfile(@Req() req: Request) {
        return {
            message: 'Token valid',
            user: (req as any).user,
        };
    }

    // LOGOUT → hapus cookie
    @Post('logout')
    logout(@Res({ passthrough: true }) res: Response) {
        res.clearCookie('access_token', {
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            path: '/',
        });
        return { message: 'Logout berhasil' };
    }
}