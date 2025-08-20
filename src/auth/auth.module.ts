import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './jwt.strategy';
import { PrimeAuthController } from './primeauth.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AuthService } from './auth.service';
import { OidcProviderService } from './oidc-provider.service';
import { OidcCallbackController } from './oidc-callback.controller';
import { AuthController } from './auth.controller';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}) // tidak menerbitkan token sendiri; hanya supaya guard aktif
    ,PrismaModule,
  ],
  controllers: [AuthController, PrimeAuthController, OidcCallbackController],
  providers: [JwtStrategy, AuthService, OidcProviderService],
  exports: [AuthService]
})
export class AuthModule {}