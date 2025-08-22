import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreatePlanDto {
  @IsString() @IsNotEmpty()
  code!: string;

  @IsString() @IsNotEmpty()
  name!: string;

  @IsInt() @Min(0)
  @IsOptional()
  priority?: number = 0;
}