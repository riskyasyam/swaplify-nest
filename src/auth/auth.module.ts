import { Module, Global } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from 'src/prisma/prisma.module';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { OidcProviderService } from './oidc-provider.service';
import { AuthService } from './auth.service';
import { PrimeAuthController } from './primeauth.controller';

@Global()
@Module({
  imports: [PassportModule, PrismaModule],
  providers: [JwtStrategy, JwtAuthGuard, OidcProviderService, AuthService],
  controllers: [PrimeAuthController],
  exports: [JwtAuthGuard, AuthService],
})
export class AuthModule {}