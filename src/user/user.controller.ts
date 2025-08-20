import { Controller, Get, Delete, Param, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { Roles } from 'src/common/decorators/roles.decorator';
import { AuthGuard } from '@nestjs/passport';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get(':id/quota')
  async getUserQuota(@Param('id') id: string) {
    return this.userService.getUserQuota(Number(id));
  }

  @UseGuards(AuthGuard('jwt'))
  @Roles('ADMIN')
  @Get()
  async getAllUser() {
    return this.userService.getAllUser();
  }

  @UseGuards(AuthGuard('jwt'))
  @Roles('ADMIN')
  @Delete(':id')
  async deleteUser(@Param('id') id: string) {
    const deletedUser = await this.userService.deleteUser(+id);
    return {
      message: `User ${id} dihapus`,
      user: { id: deletedUser.id, email: deletedUser.email, createdAt: deletedUser.createdAt },
    };
  }
}