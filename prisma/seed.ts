import { PrismaClient, SubscriptionStatus } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // 1) Plans (idempotent)
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
  const idByCode = (code: string) => {
    const x = plans.find(p => p.code === code);
    if (!x) throw new Error(`Plan ${code} not found`);
    return x.id;
  };

  // 2) PlanEntitlements (version 1)
  const entitlementsByPlan: Record<string, any> = {
    FREE: {
      max_video_sec: 30,
      max_resolution: "480p",
      concurrency: 1,
      watermark: true,
    },
    PREMIUM: {
      max_video_sec: 60,
      max_resolution: "720p",
      concurrency: 2,
      watermark: true,
    },
    PRO: {
      max_video_sec: 120,
      max_resolution: "1080p",
      concurrency: 1,
      watermark: true,
    },
  };

  for (const code of Object.keys(entitlementsByPlan)) {
    const planId = idByCode(code);
    await prisma.planEntitlement.upsert({
      where: { planId_version: { planId, version: 1 } },
      update: { entitlements: entitlementsByPlan[code] },
      create: {
        planId,
        version: 1,
        entitlements: entitlementsByPlan[code],
      },
    });
  }
  console.log("Plan entitlements upserted ✅");

  // ========== 3) Seed Feature (processors + extra features) ==========
  type FeatureSeed = {
    name: string;
    value: string;
    type: "processor" | "feature";
    status: "ACTIVE" | "INACTIVE";
  };

  // Semua processor dari create_swap
  const PROCESSORS: FeatureSeed[] = [
    { name: "face_swapper", value: "enabled", type: "processor", status: "ACTIVE" },
    { name: "face_enhancer_model", value: "None", type: "processor", status: "INACTIVE" },
    { name: "face_enhancer_blend", value: "50", type: "processor", status: "INACTIVE" },
    { name: "frame_enhancer_model", value: "None", type: "processor", status: "INACTIVE" },
    { name: "frame_enhancer_blend", value: "80", type: "processor", status: "INACTIVE" },
    { name: "age_modifier_direction", value: "None", type: "processor", status: "INACTIVE" },
    { name: "expression_restorer_model", value: "live_portrait", type: "processor", status: "INACTIVE" },
    { name: "expression_restorer_factor", value: "None", type: "processor", status: "INACTIVE" },
    { name: "face_debugger_items", value: "None", type: "processor", status: "INACTIVE" },
    { name: "face_editor_model", value: "live_portrait", type: "processor", status: "INACTIVE" },
    { name: "face_editor_eyebrow_direction", value: "None", type: "processor", status: "INACTIVE" },
    { name: "face_editor_eye_gaze_horizontal", value: "None", type: "processor", status: "INACTIVE" },
    { name: "face_editor_eye_gaze_vertical", value: "None", type: "processor", status: "INACTIVE" },
    { name: "face_editor_eye_open_ratio", value: "None", type: "processor", status: "INACTIVE" },
    { name: "face_editor_lip_open_ratio", value: "None", type: "processor", status: "INACTIVE" },
    { name: "face_editor_mouth_grim", value: "None", type: "processor", status: "INACTIVE" },
    { name: "face_editor_mouth_pout", value: "None", type: "processor", status: "INACTIVE" },
    { name: "face_editor_mouth_smile", value: "None", type: "processor", status: "INACTIVE" },
    { name: "face_editor_mouth_position_horizontal", value: "None", type: "processor", status: "INACTIVE" },
    { name: "face_editor_mouth_position_vertical", value: "None", type: "processor", status: "INACTIVE" },
    { name: "face_editor_head_pitch", value: "None", type: "processor", status: "INACTIVE" },
    { name: "face_editor_head_yaw", value: "None", type: "processor", status: "INACTIVE" },
    { name: "face_editor_head_roll", value: "None", type: "processor", status: "INACTIVE" },
    { name: "frame_colorizer_model", value: "None", type: "processor", status: "INACTIVE" },
    { name: "frame_colorizer_blend", value: "80", type: "processor", status: "INACTIVE" },
    { name: "lip_syncer_model", value: "None", type: "processor", status: "INACTIVE" },
    { name: "lip_syncer_weight", value: "1.0", type: "processor", status: "INACTIVE" },
    { name: "deep_swapper_model", value: "None", type: "processor", status: "INACTIVE" },
    { name: "deep_swapper_morph", value: "80", type: "processor", status: "INACTIVE" },
  ];

  // Parameter tambahan (fitur tambahan)
  const EXTRA_FEATURES: FeatureSeed[] = [
    { name: "face_selector_mode", value: "None", type: "feature", status: "INACTIVE" },
    { name: "reference_face_distance", value: "0.3", type: "feature", status: "ACTIVE" },
    { name: "face_mask_types", value: "None", type: "feature", status: "INACTIVE" },
    { name: "face_mask_blur", value: "0.3", type: "feature", status: "ACTIVE" },
    { name: "face_mask_padding", value: "None", type: "feature", status: "INACTIVE" },
    { name: "output_video_encoder", value: "libx264", type: "feature", status: "ACTIVE" },
    { name: "output_video_quality", value: "80", type: "feature", status: "ACTIVE" },
    { name: "output_video_resolution", value: "None", type: "feature", status: "INACTIVE" },
    { name: "output_video_fps", value: "None", type: "feature", status: "INACTIVE" },
    { name: "face_swapper_model", value: "None", type: "feature", status: "INACTIVE" },
    { name: "face_swapper_pixel_boost", value: "None", type: "feature", status: "INACTIVE" },
    { name: "face_detector_model", value: "None", type: "feature", status: "INACTIVE" },
    { name: "face_detector_score", value: "None", type: "feature", status: "INACTIVE" },
    { name: "face_selector_order", value: "None", type: "feature", status: "INACTIVE" },
    { name: "face_selector_gender", value: "None", type: "feature", status: "INACTIVE" },
    { name: "face_selector_age_start", value: "None", type: "feature", status: "INACTIVE" },
    { name: "face_selector_age_end", value: "None", type: "feature", status: "INACTIVE" },
    { name: "output_video_preset", value: "medium", type: "feature", status: "ACTIVE" },
  ];

  const ALL_FEATURES: FeatureSeed[] = [...PROCESSORS, ...EXTRA_FEATURES];

  // Upsert idempotent
  for (const f of ALL_FEATURES) {
    await prisma.feature.upsert({
      where: { name: f.name },
      update: { value: f.value, type: f.type, status: f.status },
      create: { name: f.name, value: f.value, type: f.type, status: f.status },
    });
  }
  console.log("Features upserted ✅");
}


main()
  .then(async () => { await prisma.$disconnect(); console.log('Seeding done ✅'); })
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });