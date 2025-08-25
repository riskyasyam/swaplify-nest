import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './user/user.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { UserController } from './user/user.controller';
import { PlansModule } from './plans/plans.module';
import { FeaturesModule } from './features/features.module';
import { S3Module } from './storage/s3.module';
import { JobsModule } from './jobs/jobs.module';
import { MediaAssetsModule } from './media-assets/media-assets.module';
import { PrimeAuthIntrospectionGuard } from './auth/primeauth-introspection.guard';

@Module({
  imports: [
    UserModule, 
    PrismaModule, 
    AuthModule, 
    ConfigModule.forRoot({ isGlobal: true }), 
    PlansModule, 
    FeaturesModule, 
    S3Module, 
    JobsModule, 
    MediaAssetsModule],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: PrimeAuthIntrospectionGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule { }
