import { Body, Controller, Get, Post, Delete, Param } from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';

@Controller('user')
export class UserController {
    constructor(private readonly userService: UserService) {}

    @Post()
    async createUser(@Body() data: CreateUserDto){
        const user = await this.userService.createUser(data);
        const { password, ...result } = user;
        return result;
    }

    @Get()
    async getAllUser() {
        return this.userService.getAllUser();
    }

    @Delete(':id')
    async deleteUser(@Param('id') id: string) {
        return this.userService.deleteUser(+id);
    }
}
