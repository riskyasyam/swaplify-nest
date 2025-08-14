import { Body, Controller, Get, Post, Delete, Param, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@Controller('user')
export class UserController {
    constructor(private readonly userService: UserService) {}

    @Post()
    async createUser(@Body() data: CreateUserDto){
        const user = await this.userService.createUser(data);
        const { password, ...result } = user;
        return result;
    }

    @UseGuards(JwtAuthGuard)
    @Get()
    async getAllUser() {
        return this.userService.getAllUser();
    }

    @UseGuards(JwtAuthGuard)
    @Delete(':id')
    async deleteUser(@Param('id') id: string) {
        const deletedUser = await this.userService.deleteUser(+id);
        return{
            message: `User dengan id ${id} berhasil dihapus`,
            user: {
                id: deletedUser.id,
                email: deletedUser.email,
                createdAt: deletedUser.createdAt,
            }
        }
    }
}
