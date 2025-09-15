// src/user/user.controller.ts
import { Controller, Get, Delete, Param, UseGuards, Put, Body, Patch } from '@nestjs/common';
import { UserService } from './user.service';
import { Roles } from 'src/common/decorators/roles.decorator';
import { AuthGuard } from '@nestjs/passport';
import { Public } from 'src/common/decorators/public.decorator';
import { PrimeAuthIntrospectionGuard } from 'src/auth/primeauth-introspection.guard';
import { UpdateUserSubscriptionDto, UpdateUserRoleDto, UpdateUserProfileDto } from './dto/update-user-subscription.dto';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  // GET /user/:id/quota  (id = UUID string)
  @Get(':id/quota')
  async getUserQuota(@Param('id') id: string) {
    return this.userService.getUserQuota(id);
  }

  @Roles('ADMIN')
  @Get()
  async getAllUser() {
    return this.userService.getAllUser();
  }

  // GET /user/subscriptions - Get all users with their subscription details (for admin table)
  @Roles('ADMIN')
  @Get('subscriptions')
  async getAllUsersWithSubscriptions() {
    return this.userService.getAllUsersWithSubscriptions();
  }

  @Roles('ADMIN')
  @Delete(':id')
  async deleteUser(@Param('id') id: string) {
    const deletedUser = await this.userService.deleteUser(id);
    return {
      message: `User ${id} dihapus`,
      user: {
        id: deletedUser.id,
        email: deletedUser.email,
        createdAt: deletedUser.createdAt,
      },
    };
  }

  // ============= SUBSCRIPTION MANAGEMENT =============

  @Roles('ADMIN')
  @Put(':id/subscription')
  async updateUserSubscription(
    @Param('id') userId: string,
    @Body() dto: UpdateUserSubscriptionDto
  ) {
    return this.userService.updateUserSubscription(userId, dto);
  }

  @Roles('ADMIN')  
  @Put(':id/role')
  async updateUserRole(
    @Param('id') userId: string,
    @Body() dto: UpdateUserRoleDto
  ) {
    return this.userService.updateUserRole(userId, dto);
  }

  @Patch(':id/profile')
  async updateUserProfile(
    @Param('id') userId: string,
    @Body() dto: UpdateUserProfileDto
  ) {
    return this.userService.updateUserProfile(userId, dto);
  }

  @Get(':id/details')
  async getUserDetails(@Param('id') userId: string) {
    return this.userService.getUserWithSubscription(userId);
  }

  @Get('plans/available')
  @Public()
  async getAvailablePlans() {
    return this.userService.getAllPlans();
  }
}
