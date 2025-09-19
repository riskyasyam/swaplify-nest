import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // ========== 1) Plans ==========
  const planDefs = [
    { code: 'FREE',    name: 'Free',    priority: 1 },
    { code: 'PREMIUM', name: 'Premium', priority: 2 },
    { code: 'PRO',     name: 'Pro',     priority: 3 },
  ];
  for (const p of planDefs) {
    await prisma.plan.upsert({
      where: { code: p.code },
      update: { name: p.name, priority: p.priority },
      create: { code: p.code, name: p.name, priority: p.priority },
    });
  }
  console.log('Plans upserted ✅');

  const plans = await prisma.plan.findMany();
  const idByCode = (code: string) => plans.find(p => p.code === code)!.id;

  // ========== 2) Entitlements (VERSI 1) ==========
  const entitlementsByPlan: Record<string, any> = {
    FREE: {
      max_video_sec: 30,
      max_resolution: '480p',
      concurrency: 1,
      watermark: true,
      max_processors_per_job: 2,
      max_weight_per_job: 3,
      daily_weight_quota: 10,
    },
    PREMIUM: {
      max_video_sec: 60,
      max_resolution: '720p',
      concurrency: 2,
      watermark: true,
      max_processors_per_job: 3,
      max_weight_per_job: 5,
      daily_weight_quota: 25,
    },
    PRO: {
      max_video_sec: 120,
      max_resolution: '1080p',
      concurrency: 3,
      watermark: false,
      max_processors_per_job: 4,
      max_weight_per_job: 8,
      daily_weight_quota: 60,
    },
  };

  for (const code of Object.keys(entitlementsByPlan)) {
    const planId = idByCode(code);
    await prisma.planEntitlement.upsert({
      where: { planId_version: { planId, version: 1 } },
      update: { entitlements: entitlementsByPlan[code] },
      create: { planId, version: 1, entitlements: entitlementsByPlan[code] },
    });
  }
  console.log('Plan entitlements upserted ✅');

  // ========== 3) Features ==========
  type FeatureSeed = {
    name: string;
    value?: string;
    type: 'processor' | 'processor_option' | 'feature';
    status: 'ACTIVE' | 'INACTIVE';
    weight?: number;
    category?: string;
  };

  // Core processors
  const CORE_PROCESSORS: FeatureSeed[] = [
    { name: 'frame_enhancer',      type: 'processor', status: 'ACTIVE', weight: 5 },
    { name: 'deep_swapper',        type: 'processor', status: 'ACTIVE', weight: 4 },
    { name: 'lip_syncer',          type: 'processor', status: 'ACTIVE', weight: 3 },
    { name: 'face_swapper',        type: 'processor', status: 'ACTIVE', weight: 3 },
    { name: 'face_enhancer',       type: 'processor', status: 'ACTIVE', weight: 2 },
    { name: 'expression_restorer', type: 'processor', status: 'ACTIVE', weight: 2 },
    { name: 'frame_colorizer',     type: 'processor', status: 'ACTIVE', weight: 2 },
    { name: 'face_editor',         type: 'processor', status: 'ACTIVE', weight: 2 },
    { name: 'face_debugger',       type: 'processor', status: 'ACTIVE', weight: 1 },
    { name: 'age_modifier',        type: 'processor', status: 'ACTIVE', weight: 1 },
  ];

  // Processor options/parameters → weight 0
  // Organized by categories for frontend dropdown usage
  const modelCategories = {
    face_swapper_model: [
      'blendswap_256',
      'inswapper_128', 
      'inswapper_128_fp16',
      'simswap_256',
      'simswap_512',
      'uniface_256'
    ],
    face_enhancer_model: [
      'codeformer',
      'gfpgan_1.2',
      'gfpgan_1.3', 
      'gfpgan_1.4',
      'gpen_bfr_256',
      'gpen_bfr_512',
      'gpen_bfr_1024',
      'gpen_bfr_2048',
      'restoreformer_plus_plus'
    ],
    frame_enhancer_model: [
      'real_esrgan_x2plus',
      'real_esrgan_x4plus',
      'real_esrgan_x4plus_anime_6b',
      'real_hatgan_x4'
    ],
    face_detector_model: [
      'retinaface',
      'yoloface', 
      'mtcnn'
    ],
    frame_colorizer_model: [
      'deoldify',
      'instacolor'
    ],
    lip_syncer_model: [
      'wav2lip',
      'wav2lip_gan'
    ],
    deep_swapper_model: [
      'deepface_lab',
      'simswap_512'
    ],
    face_editor_model: [
      'live_portrait',
      'stylegan_edit'
    ],
    expression_restorer_model: [
      'live_portrait'
    ],
    age_modifier_model: [
      'aginggan'
    ],
    face_classifier_model: [
      'genderage',
      'arcface'
    ],
    face_landmarker_model: [
      'face_alignment',
      'mediapipe'
    ]
  };

  // Convert categories to processor options array
  const PROCESSOR_OPTIONS: FeatureSeed[] = [];
  
  // Generate model options from categories
  Object.entries(modelCategories).forEach(([category, values]) => {
    values.forEach(value => {
      PROCESSOR_OPTIONS.push({
        name: `${category}_${value}`,
        type: 'processor_option',
        status: 'ACTIVE',
        weight: 0,
        value: value,
        category: category
      });
    });
  });

  // Add processor option parameters (non-model options)
  PROCESSOR_OPTIONS.push(
    { name: 'face_enhancer_blend', type: 'processor_option', status: 'ACTIVE', weight: 0 },
    { name: 'frame_enhancer_blend', type: 'processor_option', status: 'ACTIVE', weight: 0 },
    { name: 'expression_restorer_factor', type: 'processor_option', status: 'ACTIVE', weight: 0 },
    { name: 'lip_syncer_weight', type: 'processor_option', status: 'ACTIVE', weight: 0 },
    { name: 'deep_swapper_morph', type: 'processor_option', status: 'ACTIVE', weight: 0 },
    { name: 'frame_colorizer_blend', type: 'processor_option', status: 'ACTIVE', weight: 0 },
    { name: 'face_editor_params', type: 'processor_option', status: 'ACTIVE', weight: 0 },
    { name: 'face_debugger_items', type: 'processor_option', status: 'ACTIVE', weight: 0 },
    { name: 'face_swapper_pixel_boost', type: 'processor_option', status: 'ACTIVE', weight: 0 },
    { name: 'age_modifier_direction', type: 'processor_option', status: 'ACTIVE', weight: 0 }
  );

  // Non-processor features (global options)
  const NON_PROCESSORS: FeatureSeed[] = [
    { name: 'face_detector_model', type: 'feature', status: 'ACTIVE', weight: 2 },
    { name: 'face_detector_score', type: 'feature', status: 'ACTIVE', weight: 1 },
    { name: 'face_selector_mode', type: 'feature', status: 'ACTIVE', weight: 1 },
    { name: 'face_selector_order', type: 'feature', status: 'ACTIVE', weight: 1 },
    { name: 'face_selector_gender', type: 'feature', status: 'ACTIVE', weight: 1 },
    { name: 'face_selector_age_start', type: 'feature', status: 'ACTIVE', weight: 1 },
    { name: 'face_selector_age_end', type: 'feature', status: 'ACTIVE', weight: 1 },
    { name: 'reference_face_distance', type: 'feature', status: 'ACTIVE', weight: 1 },
    { name: 'face_mask_types', type: 'feature', status: 'ACTIVE', weight: 1 },
    { name: 'face_mask_blur', type: 'feature', status: 'ACTIVE', weight: 1 },
    { name: 'face_mask_padding', type: 'feature', status: 'ACTIVE', weight: 1 },
    { name: 'output_video_quality', type: 'feature', status: 'ACTIVE', weight: 1 },
    { name: 'output_video_resolution', type: 'feature', status: 'ACTIVE', weight: 1 },
    { name: 'output_video_fps', type: 'feature', status: 'ACTIVE', weight: 1 },
    { name: 'output_video_encoder', type: 'feature', status: 'ACTIVE', weight: 0 },
    { name: 'output_video_preset', type: 'feature', status: 'ACTIVE', weight: 0 },
    { name: 'use_cuda', type: 'feature', status: 'ACTIVE', weight: 0 },
    { name: 'device_id', type: 'feature', status: 'ACTIVE', weight: 0 },
  ];

  const ALL_FEATURES: FeatureSeed[] = [
    ...CORE_PROCESSORS,
    ...PROCESSOR_OPTIONS,
    ...NON_PROCESSORS,
  ];

  for (const f of ALL_FEATURES) {
    await prisma.feature.upsert({
      where: { name: f.name },
      update: {
        name: f.name,
        value: f.value ?? "",
        type: f.type,
        status: f.status,
        weight: f.weight ?? 1,
      },
      create: {
        name: f.name,
        value: f.value ?? "",
        type: f.type,
        status: f.status,
        weight: f.weight ?? 1,
      },
    });
  }
  console.log('Features upserted (with weight) ✅');
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log('Seeding done ✅');
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
