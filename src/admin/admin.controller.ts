import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from '@prisma/client';

class CreatePrimeUserDto {
  email!: string;
  fullName!: string;
  password?: string;
  makeAdmin?: boolean;
}

@Controller('admin')
@UseGuards(AuthGuard('jwt'))
@Roles('ADMIN')
export class AdminController {
  constructor(private service: AdminService) {}

  @Post('primeauth/users')
  async createPrimeAuthUser(@Body() dto: CreatePrimeUserDto) {
    const res = await this.service.createUserInPrimeAuthAndLocal(dto);
    return {
      message: 'User created in PrimeAuth and synced locally',
      user: res.user,
      // sembunyikan detail sensitif dari PrimeAuth bila perlu
    };
  }
}