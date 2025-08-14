import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';

export class CreateUserDto {
    @IsEmail({ message: 'Email tidak valid' }) // cukup 1 argumen
    email: string;

    @IsNotEmpty()
    @MinLength(6)
    password: string;
}