import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { PrismaService } from 'src/prisma/prisma.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AuthModule } from 'src/auth/auth.module';
import { SubscriptionModule } from 'src/common/subscription/subscription.module';

@Module({
  providers: [UserService],
  controllers: [UserController],
  imports: [PrismaModule, SubscriptionModule],
  exports: [UserService],
})
export class UserModule {}
