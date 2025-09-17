import { 
  IsUUID, 
  IsArray, 
  IsOptional, 
  IsObject, 
  ArrayNotEmpty, 
  IsString, 
  IsBoolean, 
  IsNumber, 
  IsIn, 
  Min, 
  Max, 
  ValidateNested 
} from 'class-validator';
import { Type } from 'class-transformer';

export class FaceEditorParamsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  eyeOpenRatio?: number;

  @IsOptional()
  @IsNumber()
  @Min(-1)
  @Max(1)
  mouthSmile?: number;

  @IsOptional()
  @IsNumber()
  @Min(-30)
  @Max(30)
  headYaw?: number;

  @IsOptional()
  @IsNumber()
  @Min(-30)
  @Max(30)
  headPitch?: number;

  @IsOptional()
  @IsNumber()
  @Min(-30)
  @Max(30)
  headRoll?: number;
}

export class FaceFusionOptionsDto {
  // Hardware
  @IsOptional()
  @IsBoolean()
  useCuda?: boolean;

  @IsOptional()
  @IsString()
  deviceId?: string;

  // Face Swapper
  @IsOptional()
  @IsIn(['inswapper_128', 'inswapper_128_fp16', 'simswap_512', 'simswap_224', 'deepinsight_128'])
  faceSwapperModel?: string;

  @IsOptional()
  @IsIn(['1x', '2x', '4x'])
  faceSwapperPixelBoost?: string;

  // Face Enhancer
  @IsOptional()
  @IsIn(['gfpgan_1.4', 'gfpgan_1.3', 'codeformer', 'restoreformer'])
  faceEnhancerModel?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  faceEnhancerBlend?: number;

  // Frame Enhancer
  @IsOptional()
  @IsIn(['realesrgan_x2plus', 'realesrgan_x4plus', 'realesrnet_x4plus', 'esrgan_4x'])
  frameEnhancerModel?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  frameEnhancerBlend?: number;

  // Age Modifier
  @IsOptional()
  @IsNumber()
  @Min(-20)
  @Max(20)
  ageModifierDirection?: number;

  @IsOptional()
  @IsIn(['aginggan'])
  ageModifierModel?: string;

  // Expression Restorer
  @IsOptional()
  @IsIn(['live_portrait'])
  expressionRestorerModel?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  expressionRestorerFactor?: number;

  // Face Debugger
  @IsOptional()
  @IsString()
  faceDebuggerItems?: string; // comma-separated: "bbox,landmark,face-mask"

  // Face Editor
  @IsOptional()
  @IsIn(['live_portrait', 'stylegan_edit'])
  faceEditorModel?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => FaceEditorParamsDto)
  faceEditorParams?: FaceEditorParamsDto;

  // Frame Colorizer
  @IsOptional()
  @IsIn(['deoldify', 'instacolor'])
  frameColorizerModel?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  frameColorizerBlend?: number;

  // Lip Syncer
  @IsOptional()
  @IsIn(['wav2lip', 'wav2lip_gan'])
  lipSyncerModel?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  lipSyncerWeight?: number;

  // Deep Swapper
  @IsOptional()
  @IsIn(['deepface_lab', 'simswap_512'])
  deepSwapperModel?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  deepSwapperMorph?: number;

  // Face Classifier
  @IsOptional()
  @IsIn(['genderage', 'arcface'])
  faceClassifierModel?: string;

  // Face Landmarker
  @IsOptional()
  @IsIn(['face_alignment', 'mediapipe'])
  faceLandmarkerModel?: string;

  // Face Selection
  @IsOptional()
  @IsIn(['automatic', 'reference', 'one', 'many', 'best-worst', 'left-right'])
  faceSelectorMode?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  referenceFaceDistance?: number;

  @IsOptional()
  @IsIn(['left-right', 'right-left', 'top-bottom', 'bottom-top', 'small-large', 'large-small', 'best-worst', 'worst-best'])
  faceSelectorOrder?: string;

  @IsOptional()
  @IsIn(['any', 'male', 'female'])
  faceSelectorGender?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  faceSelectorAgeStart?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  faceSelectorAgeEnd?: number;

  // Face Detection
  @IsOptional()
  @IsIn(['retinaface', 'yoloface', 'mtcnn'])
  faceDetectorModel?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  faceDetectorScore?: number;

  // Face Masking
  @IsOptional()
  @IsString()
  faceMaskTypes?: string; // comma-separated: "box,occlusion"

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  faceMaskBlur?: number;

  @IsOptional()
  @IsString()
  faceMaskPadding?: string; // "0,0,0,0"

  // Output
  @IsOptional()
  @IsIn(['libx264', 'libx265', 'libvpx-vp9', 'h264_nvenc', 'hevc_nvenc'])
  outputVideoEncoder?: string;

  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(100)
  outputVideoQuality?: number;

  @IsOptional()
  @IsString()
  outputVideoResolution?: string; // "1920x1080"

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(120)
  outputVideoFps?: number;

  @IsOptional()
  @IsIn(['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow'])
  outputVideoPreset?: string;
}

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
  @IsIn(['face_swapper', 'face_enhancer', 'frame_enhancer', 'age_modifier', 'expression_restorer', 'face_debugger', 'face_editor', 'frame_colorizer', 'lip_syncer', 'deep_swapper'], { each: true })
  processors!: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => FaceFusionOptionsDto)
  options?: FaceFusionOptionsDto;
}