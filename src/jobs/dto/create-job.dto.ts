import { IsUUID, IsArray, IsOptional, IsObject, ArrayNotEmpty, IsString } from 'class-validator';

export class CreateJobDto {
  @IsUUID()
  sourceAssetId!: string;

  @IsUUID()
  targetAssetId!: string;

  @IsOptional()
  @IsUUID()
  audioAssetId?: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  processors!: string[]; // contoh: ["face_swapper"]

  @IsOptional()
  @IsObject()
  options?: Record<string, any>;
}