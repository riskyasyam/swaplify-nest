import { IsEnum, IsInt, Min } from 'class-validator';

export enum FeatureStatusDto {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE'
}
export class LinkFeatureDto {
  @IsInt() @Min(1)
  featureId!: number;

  @IsEnum(FeatureStatusDto)
  status!: FeatureStatusDto;
}