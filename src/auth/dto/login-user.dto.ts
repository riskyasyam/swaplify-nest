import { IsEmail, IsNotEmpty } from 'class-validator';

export class LoginUserDto {
  @IsEmail({}, { message: 'Email tidak valid' })
  email: string;

  @IsNotEmpty({ message: 'Password wajib diisi' })
  password: string;
}