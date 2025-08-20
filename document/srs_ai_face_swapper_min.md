# AI Face Swapper – Software Requirements Specification (Simplified)

## 1. Document Control
- Version: 0.7 (MVP draft – added combined subscription+invoice endpoint)
- Owner: Engineering
- Status: Draft for implementation

## 2. Purpose
Define a clear, minimal, implementable set of requirements for the first production MVP of an asynchronous AI Face Swap service (image + video) with modular services.

## 3. Scope (MVP)
- Users upload a source face image and a target media (image or short video) and receive a swapped result asynchronously.
- Supports web browser clients only (web).
- Image swap and short video swap (≤ 2 min, 1080p, ≤ 500 MB, TBD).
- Basic subscription plan model (admin managed) with simple entitlements (daily job limit, priority placeholder).
- Manual invoice issuance & tracking by admin (no automated payments integration, amount in IDR only; optional future gateway fields unused now).

## 4. References
- Open-source: FaceFusion (pipeline inspiration)
- OIDC / OAuth 2.1 (PrimeAuth)

## 5. Glossary
- Job: A unit of work for a requested face swap.
- Source Asset: Image containing the face to extract.
- Target Asset: Image or video to modify.
- Queue Service: Orchestrator that assigns jobs to ML workers.
- Worker (FaceFusion Service): Performs the actual swap.
- Plan: Definition of limits & priority for users (e.g., FREE, PRO).
- Subscription: Assignment of a user to a plan within a time period.
- Entitlements: Structured limits associated with a plan (JSON).
- Invoice: Administrative record of an amount owed by a user for a plan (columns: user_id, plan_id, amount_idr, description, status PENDING|PAID|EXPIRED|CANCELLED, expires_at, paid_at, optional gateway/pay_url/metadata placeholders; manual lifecycle).

## 6. Stakeholders & Roles
- End User (role: user)
- Admin (role: admin)
- System Services (API, Queue, ML Worker)

## 7. System Overview (High-Level)
Frontend (React/Next) → Backend API (Node) → NSQ → Queue Service (Go/Node) → FaceFusion Worker (Python) → MinIO (storage) + PostgreSQL (metadata). Auth via PrimeAuth (OIDC). Frontend polls job status.

## 8. User Stories (MVP)
1. As a user, I log in using PrimeAuth.
2. I submit source & target media and create a job in a single combined request (one‑step flow) to reduce round trips.
3. I poll job status until it finishes and download result.
4. As an admin, I can view job list and statuses (basic read).
5. As an admin, I can manage User accounts (create, read, update, delete).
6. As an admin, I can manage Plans (create, read, update, deactivate).
7. As an admin, I can assign or change a User's Subscription to a Plan.
8. As a user, I can view my current plan & remaining daily jobs.
9. As an admin, I can create and manage manual Invoices for users (for offline / manual billing tracking) using the ERD schema.
10. As an admin, I can create or update a User's Subscription and an Invoice in a single request.

## 9. Functional Requirements
- FR-1 Auth: OIDC login (PrimeAuth). Accept JWTs; validate signature, expiry, roles.
- FR-2 Combined Submit: POST /jobs (multipart) accepts source_file, target_file, job_type, options?, idempotency_key?. Backend atomically: (a) validates inputs, (b) streams both files to storage while computing SHA256, (c) creates media_asset rows, (d) creates job row, (e) publishes queue message, (f) returns job representation. On validation error no job is created and uploaded objects may be deleted (best effort) or flagged for GC.
- FR-3 Atomicity (Logical): Combined submit returns success only if job successfully created & published; otherwise returns error and no RUNNING/QUEUED job remains orphaned.
- FR-4 Queue Publish: Backend publishes JSON message to NSQ topic based on job type.
- FR-5 Consumption: Queue Service consumes messages (basic validation only in MVP).
- FR-6 Execution Start: Queue Service marks job RUNNING and invokes worker (HTTP/gRPC) with S3 URLs.
- FR-7 Processing (Worker): Perform pipeline (see section 14) and upload result artifact to output bucket.
- FR-8 Completion: Queue Service updates DB (SUCCEEDED or FAILED) with output pointer or error.
- FR-9 Status API: Client can GET /jobs/:id returning status, progress (video), and signed download URL when done.
- FR-10 Logging: All services emit structured logs (JSON) with correlation (trace/job id).
- FR-11 Metrics: Expose Prometheus metrics: request counts, job durations, failures, queue lag.
- FR-12 Audit: Record status transitions in job_events.
- FR-13 Idempotency: Optional idempotency key accepted on job create; reuse existing job if identical (future-ready, store key now).
- FR-14 Error Handling: Failed worker attempt sets FAILED unless retry policy triggers (basic: up to 2 retries on transient errors).
- FR-15 Dead-Letter: Messages exceeding retry limit sent to *.dlq topic.
- FR-16 Admin Read: Admin can list jobs filtered by status/user (basic, no mutation yet).
- FR-17 Plan Management: Admin can CRUD plans (code unique; cannot delete if active subscriptions exist; may set active=false). Entitlements JSON includes: daily_jobs (int), max_video_seconds (int), max_image_size_mb (int), max_video_size_mb (int), max_resolution (string), priority (1=high,2=normal,3=low).
- FR-18 Subscription Management: Admin can create or update a subscription for a user (plan_id, current_start, current_end, status). Only one ACTIVE subscription per user enforced.
- FR-19 Quota Tracking: System decrements remaining daily job allowance when a job is created (using user_quotas.used_today or derived from subscription entitlements). If limit exceeded, job creation rejected with 429/limit_exceeded.
- FR-20 Daily Reset: A scheduled task (or first request after UTC midnight) resets used_today for all users (or rolling window logic) without losing historical usage (usage_counters incremented).
- FR-21 User Plan Info: Endpoint exposes current plan, entitlements, used_today, remaining_daily_jobs.
- FR-22 Invoice Create: Admin creates invoice with fields: user_id (UUID), plan_id (INT), amount_idr (BIGINT >0), description (≤512 chars, optional), expires_at (optional DATETIME). Status defaults PENDING. Optional gateway, pay_url, metadata accepted but ignored in logic.
- FR-23 Invoice Update (while PENDING): Admin may PATCH description, amount_idr, expires_at. plan_id change allowed only while PENDING (or reject 409; choose implementation but must be consistent).
- FR-24 Invoice Status Transitions: Allowed transitions: PENDING→PAID (sets paid_at now), PENDING→CANCELLED, PENDING→EXPIRED (auto or admin if now > expires_at). Terminal statuses (PAID, CANCELLED, EXPIRED) cannot transition further (409 on attempt).
- FR-25 Invoice Listing: Admin can list invoices filtered by user_id and/or status.
- FR-26 Invoice Integrity: plan_id must reference existing plan; otherwise 400.
- FR-27 Combined Subscription+Invoice Create: Admin can create (atomically) an ACTIVE subscription and (optional) PENDING invoice in a single call POST /admin/subscribe. Request body: { user_id, plan_id, current_start?, current_end?, invoice? { amount_idr, description?, expires_at? }, replace_active? }. Rules: (a) If user already has ACTIVE subscription and replace_active not true → 409. (b) If replace_active true, existing ACTIVE subscription set status=CANCELLED effective now before creating new one (single transaction). (c) Subscription created with status ACTIVE. (d) If invoice object supplied, invoice created with status PENDING referencing plan_id; amount_idr required >0. (e) Entire operation atomic; on any validation failure neither record persists. (f) Returns { subscription, invoice? }.


## 10. Constraints / Limits
- Image ≤ 20 MB (JPEG/PNG/WebP). Video ≤ 2 min, ≤ 1080p, ≤ 500 MB, MP4 (H.264 + AAC) accepted; others rejected or pre-transcoded later.
- Concurrency: Start with 1–2 workers (manual scaling).
- Jobs/day target: ~1k.
- Default FREE plan daily_jobs = 20 (example) unless configured.
- Invoices: Max description length 512 chars; amount_idr > 0; expires_at optional but if present governs automatic EXPIRED transition.

## 11. Non-Functional Requirements (NFR)
- NFR-1 Availability: Best effort; single-region deployment acceptable.
- NFR-2 Performance: Job latency not guaranteed; status polling ≤ 2 req/sec/user.
- NFR-3 Security: All uploads authenticated; backend enforces size/type; generated download URLs (signed) expire ≤ 15 min.
- NFR-4 Privacy: Strip EXIF; do not retain originals beyond user bucket objects.
- NFR-5 Observability: 95% of video jobs have progress updates at least every 30s.
- NFR-6 Scalability: Architecture allows horizontal addition of workers & consumers.
- NFR-7 Maintainability: Clear service boundaries; infra as code (placeholder).
- NFR-8 Compliance (Basic): No storage of biometric templates outside pipeline memory.
- NFR-9 Combined Endpoint Throughput: Combined submit should not exceed 2 sequential synchronous copies; streaming direct to MinIO (no full buffering in memory) for video.
- NFR-10 Quota Check Overhead: Additional quota read/write adds ≤ 15 ms p95.

## 12. API (Minimal Set)
POST /auth/callback (OIDC flow completion – handled client-side mostly)

POST /jobs (multipart: source_file, target_file, job_type=IMAGE_SWAP|VIDEO_SWAP, options?, idempotency_key?) -> job

GET /jobs/:id

GET /jobs (Admin can see all, filters by status/user. User can see own jobs only)

GET /me/plan (current user plan + entitlements + usage)

-- Admin Plan APIs --

POST /plans {code,name,entitlementsJSON}

GET /plans

GET /plans/:id

PATCH /plans/:id {name?, entitlementsJSON?, active?}

-- Admin Subscription APIs --

POST /subscriptions {user_id, plan_id, current_start, current_end}

PATCH /subscriptions/:id {status?, current_end?}

GET /subscriptions?user_id=...

POST /admin/subscribe {user_id, plan_id, current_start?, current_end?, invoice?{amount_idr, description?, expires_at?}, replace_active?} -> {subscription, invoice?}

-- Admin Invoice APIs --

POST /invoices {user_id, plan_id, amount_idr, description?, expires_at?}

GET /invoices?user_id=&status=

GET /invoices/:id

PATCH /invoices/:id {description?, amount_idr?, expires_at?, plan_id?, status?} (status validated per FR-24)

Health endpoints: /healthz, /metrics

Response (GET /me/plan) sample:
{ plan: {code,name,priority}, entitlements: {...}, used_today, remaining_daily_jobs }

Response (POST /jobs) sample:
{ id, status, source_asset_id, target_asset_id, created_at }

Response (GET /jobs/:id) sample:
{ id, status, progress_pct, result: { download_url? }, error_code?, created_at }

Response (POST /invoices) sample:
{ id, user_id, plan_id, status, amount_idr, description, expires_at, paid_at, created_at }

Response (POST /admin/subscribe) sample:
{ subscription: { id, user_id, plan_id, status, current_start, current_end }, invoice: { id, status, amount_idr }? }

## 13. Message Queue Contract (NSQ)
Topics: face.swap.image, face.swap.video (+ future priority variants). DLQ: face.swap.image.dlq, face.swap.video.dlq.
Message JSON (schema_version=1) fields:
- job_id, user_id
- type: IMAGE_SWAP | VIDEO_SWAP
- source {bucket,key}
- target {bucket,key}
- options {face_index?, fps_cap?, watermark?, safety_checks?} (fields may be ignored in MVP)
- attempt (int)
- trace_id

## 14. Data Model (Summary)
Users (id, auth_sub, role)
Media Assets (id, user_id, type, bucket, key, metadata...)
Jobs (id, job_type, source_asset_id, target_asset_id, status, progress_pct, output_asset_id, error, timestamps, idempotency_key)
Job Events (job_id, from_status, to_status, message, created_at)
Plans (id, code, name, priority, active, created_at)
Plan Entitlements (plan_id, version, entitlements JSONB)
Subscriptions (id, user_id, plan_id, status, current_start, current_end)
User Quotas (user_id, daily_limit, used_today, reset_at) – fast daily counter
Usage Counters (user_id, period_start, period_end, jobs_total) – historical aggregation
Invoices (id, user_id, plan_id, amount_idr, description, status[PENDING|PAID|EXPIRED|CANCELLED], gateway, pay_url, expires_at, paid_at, metadata JSONB, created_at)
Payments (future/out-of-scope automation placeholder)
(Prepared but optional initially): payments integration workflows.

## 15. Retry Policy
- Transient worker/IO errors: Retry up to 2 times with exponential backoff (e.g., 15s, 45s).
- Permanent errors (unsupported format, validation errors): No retry.

## 16. Security Notes
- Validate MIME and size before accepting and streaming file to storage.
- Store SHA256 of uploaded object after upload for dedupe (future optimization).
- Limit upload endpoint to authenticated users; enforce max size via server & reverse proxy.
- Stream each file directly to object storage (chunked) to avoid large memory usage.
- Plan & subscription admin endpoints require admin role; enforce RBAC middleware.
- Invoice admin endpoints require admin role (no user self-access in MVP).

## 17. Operational / DevOps
- Containerize each service.
- Single docker-compose (dev) with: api, queue, nsqd, nsqlookupd, nsqadmin, minio, postgres, (optional redis), worker.
- Metrics scraped by Prometheus (optional initial stub).

## 18. Out of Scope (MVP)
- Real-time streaming face swap.
- Mobile native apps.
- WebSockets for push updates (polling only).
- Automated payment processing / gateway integration (future).
- CDN, thumbnails, localization.
- NSFW / age moderation (future feature).
- Output watermarking (future feature).

## 19. Future / Optional (Prepared)
- Moderation (NSFW + age estimation): Pre-check uploads; reject disallowed content with error codes; configurable models.
- Watermark: Semi-transparent text/logo applied to all outputs; toggle by plan/config.
- Priority queues by subscription tier (use plan.priority to route to topic variants).
- Quotas & credits enforcement (extension beyond daily count: monthly, concurrency).
- Autoscaling (KEDA) for workers.
- Webhooks for job completion.
- Admin dashboard (UI) with filtering & moderation review.
- Payment integration (local gateways) activating automated payment reconciliation.

## 20. Acceptance Criteria / KPIs (MVP)
- AC-1 90% of valid image jobs succeed under normal load.
- AC-2 80% of 1-min video jobs finish < 5 min on baseline GPU.
- AC-3 Job status transitions recorded with no gaps (QUEUED→RUNNING→SUCCEEDED/FAILED).
- AC-4 Metrics endpoint exposes job_counts_total, job_failures_total, job_duration_seconds histogram.
- AC-5 Combined submit returns job id in ≤ 3s (excluding upload transfer time) for 95% of requests under nominal load.
- AC-6 No orphan jobs created from failed combined submissions (verified via periodic audit script).
- AC-7 Plan CRUD: Admin can create plan and see it in GET /plans within 1s; duplicate code rejected (409/validation).
- AC-8 Subscription assignment enforces single ACTIVE subscription per user (attempt to add second returns 409/conflict).
- AC-9 Quota denial: When user exceeds daily_jobs, POST /jobs returns 429 with error_code=limit_exceeded and no job row created.
- AC-10 /me/plan shows correct remaining_daily_jobs (daily_limit - used_today) for 95% of requests (eventual consistency within 1 job creation).
- AC-11 Invoice lifecycle: PENDING→PAID, PENDING→CANCELLED, PENDING→EXPIRED paths work; paid_at populated for PAID.
- AC-12 Invalid invoice transitions (e.g., PAID→PENDING, CANCELLED→PAID) return 409/conflict with no mutation.
- AC-13 Nonexistent plan_id during invoice create returns 400 and no invoice created.
- AC-14 Combined subscribe endpoint: creating subscription + invoice either fully succeeds (both persisted) or both absent on simulated failure (verified via transaction test).
- AC-15 Attempt to call combined endpoint when ACTIVE subscription exists without replace_active=true returns 409.

---
End of SRS.
