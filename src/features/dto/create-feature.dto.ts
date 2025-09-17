import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { FeatureStatus, FeatureType } from '@prisma/client';

export class CreateFeatureDto {
  @IsString() @IsNotEmpty()
  name!: string;                // unique

  @IsString() @IsOptional()
  value?: string;               // bebas: default/model/etc.

  @IsEnum(FeatureType)
  type!: FeatureType;           // 'processor' | 'processor_option' | 'feature'

  @IsEnum(FeatureStatus)
  status!: FeatureStatus;       // 'ACTIVE' | 'INACTIVE'

  @IsInt() @IsNotEmpty()
  weight!: number;

  @IsString() @IsOptional()
  category?: string;            // for grouping processor options
}
