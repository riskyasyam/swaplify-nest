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
    type: 'processor' | 'feature';
    status: 'ACTIVE' | 'INACTIVE';
    weight?: number;
  };

  // Core processors
  const CORE_PROCESSORS: FeatureSeed[] = [
    { name: 'frame_enhancer',      type: 'processor', status: 'INACTIVE', weight: 5 },
    { name: 'deep_swapper',        type: 'processor', status: 'INACTIVE', weight: 4 },
    { name: 'lip_syncer',          type: 'processor', status: 'INACTIVE', weight: 3 },
    { name: 'face_swapper',        type: 'processor', status: 'ACTIVE',   weight: 3 },
    { name: 'face_enhancer',       type: 'processor', status: 'INACTIVE', weight: 2 },
    { name: 'expression_restorer', type: 'processor', status: 'INACTIVE', weight: 2 },
    { name: 'frame_colorizer',     type: 'processor', status: 'INACTIVE', weight: 2 },
    { name: 'face_editor',         type: 'processor', status: 'INACTIVE', weight: 2 },
    { name: 'face_debugger',       type: 'processor', status: 'INACTIVE', weight: 1 },
  ];

  // Parameter/fitur tambahan → weight 0
  const PARAM_FEATURES: FeatureSeed[] = [
    { name: 'face_enhancer_model', type: 'processor', status: 'INACTIVE', weight: 0 },
    { name: 'face_enhancer_blend', type: 'processor', status: 'INACTIVE', weight: 0 },
    { name: 'frame_enhancer_model', type: 'processor', status: 'INACTIVE', weight: 0 },
    { name: 'frame_enhancer_blend', type: 'processor', status: 'INACTIVE', weight: 0 },
    { name: 'expression_restorer_model', type: 'processor', status: 'INACTIVE', weight: 0 },
    { name: 'expression_restorer_factor', type: 'processor', status: 'INACTIVE', weight: 0 },
    { name: 'lip_syncer_model', type: 'processor', status: 'INACTIVE', weight: 0 },
    { name: 'lip_syncer_weight', type: 'processor', status: 'INACTIVE', weight: 0 },
    { name: 'deep_swapper_model', type: 'processor', status: 'INACTIVE', weight: 0 },
    { name: 'deep_swapper_morph', type: 'processor', status: 'INACTIVE', weight: 0 },
    { name: 'frame_colorizer_model', type: 'processor', status: 'INACTIVE', weight: 0 },
    { name: 'frame_colorizer_blend', type: 'processor', status: 'INACTIVE', weight: 0 },
    { name: 'face_editor_model', type: 'processor', status: 'INACTIVE', weight: 0 },
    { name: 'face_editor_*', type: 'processor', status: 'INACTIVE', weight: 0 }, // catch all editor params
    { name: 'face_debugger_items', type: 'processor', status: 'INACTIVE', weight: 0 },
  ];

  // Non-processor features
  const NON_PROCESSORS: FeatureSeed[] = [
    { name: 'face_detector_model', type: 'feature', status: 'INACTIVE', weight: 2 },
    { name: 'face_detector_score', type: 'feature', status: 'INACTIVE', weight: 1 },
    { name: 'face_selector_mode', type: 'feature', status: 'INACTIVE', weight: 1 },
    { name: 'face_selector_order', type: 'feature', status: 'INACTIVE', weight: 1 },
    { name: 'face_selector_gender', type: 'feature', status: 'INACTIVE', weight: 1 },
    { name: 'face_selector_age_start', type: 'feature', status: 'INACTIVE', weight: 1 },
    { name: 'face_selector_age_end', type: 'feature', status: 'INACTIVE', weight: 1 },
    { name: 'reference_face_distance', type: 'feature', status: 'ACTIVE', weight: 1 },
    { name: 'face_mask_types', type: 'feature', status: 'INACTIVE', weight: 1 },
    { name: 'face_mask_blur', type: 'feature', status: 'ACTIVE', weight: 1 },
    { name: 'face_mask_padding', type: 'feature', status: 'INACTIVE', weight: 1 },
    { name: 'face_swapper_model', type: 'feature', status: 'INACTIVE', weight: 1 },
    { name: 'face_swapper_pixel_boost', type: 'feature', status: 'INACTIVE', weight: 1 },
    { name: 'output_video_quality', type: 'feature', status: 'ACTIVE', weight: 1 },
    { name: 'output_video_resolution', type: 'feature', status: 'INACTIVE', weight: 1 },
    { name: 'output_video_fps', type: 'feature', status: 'INACTIVE', weight: 1 },
    { name: 'output_video_encoder', type: 'feature', status: 'ACTIVE', weight: 0 },
    { name: 'output_video_preset', type: 'feature', status: 'ACTIVE', weight: 0 },
  ];

  const ALL_FEATURES: FeatureSeed[] = [
    ...CORE_PROCESSORS,
    ...PARAM_FEATURES,
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
