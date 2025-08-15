import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { LoginUserDto } from './dto/login-user.dto';
import { AuthService } from './auth.service';
import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}
    
    @Post('login')
    async login(@Body() data: LoginUserDto) {
        return this.authService.login(data);
    }

    @Get('google')
    @UseGuards(AuthGuard('google'))
    async googleAuth() {
        return { message: 'Redirect ke Google Login' };
    }

    @Get('google/callback')
    @UseGuards(AuthGuard('google'))
    googleAuthRedirect(@Req() req) {
        return req.user
    }

    @Get('profile')
    @UseGuards(JwtAuthGuard)
    getProfile(@Req() req){
        return {
            message: 'Token valid',
            user: req.user,
        }
    }

}
