export interface PlanEntitlementValues {
  // Existing fields
  max_processors_per_job: number;
  max_weight_per_job: number;
  daily_weight_quota: number;
  max_video_sec: number;
  max_resolution: string;
  
  // New requested fields
  watermark: boolean;
  concurrency: number;
  
  [key: string]: any;
}