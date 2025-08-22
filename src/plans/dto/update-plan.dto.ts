import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdatePlanDto {

  @IsString() @IsOptional()
  code?: string;
  
  @IsString() @IsOptional()
  name?: string;

  @IsInt() @Min(0) @IsOptional()
  priority?: number;
}