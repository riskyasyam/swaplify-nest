import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { FeatureStatus, FeatureType } from '@prisma/client';

export class UpdateFeatureDto {
  @IsString() @IsOptional()
  name?: string;                // unique
  
  @IsString() @IsOptional()
  value?: string;

  @IsEnum(FeatureType)
  type!: FeatureType;

  @IsEnum(FeatureStatus) @IsOptional()
  status?: FeatureStatus;

  @IsInt() @IsOptional()
    weight!: number;
}
