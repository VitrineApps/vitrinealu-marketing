VitrineAlu Marketing Automation Plan (v2)
1) Executive Summary
Automate creation of cinematic short videos and branded image posts from your installation photos (local + Google Drive), generate platform specific captions/hashtags, and schedule drafts for a once a week owner approval. Stack: Google Gemini (image enhancement), OpenAI Sora via API where available (image→video), fallbacks (Runway/Pika/FFmpeg), n8n orchestration (Docker), Buffer/Wix for scheduling. Outputs target IG/TikTok/FB/YouTube Shorts (vertical) + LinkedIn (B2B).
2) Objectives
•	Leads & reach: Consistent, premium content to drive quote requests.
•	Low admin: “Approve once per week”; no daily manual editing.
•	Cinematic look: High quality images, subtle camera motion, tasteful overlays.
•	Brand consistency: Fonts/colors/logo watermark; privacy safe (faces/plates blurred).
3) Constraints & Assumptions
•	Budget: ≤ £150/mo leveraging existing subs (ChatGPT Pro, Gemini, Wix). Buffer allowed.
•	Hardware: Windows 11, i7 8700K + RTX 4070 Super always on.
•	Assets: Photos on local NAS + Google Drive.
•	Access: Sora/API availability can vary by region/provider; include fallbacks.
4) System Architecture (Services & Tools)
•	Enhance Service (Python/FastAPI)
o	Primary: Google Gemini Image API (enhance, denoise, upscale, color grade).
o	Optional local: Real ESRGAN/CodeFormer (GPU) if needed.
o	Background: cleanup or replace (mask product; composite new background).
o	Privacy: face & license plate blur; watermark; export variants.
•	Video Service (Node/TypeScript)
o	Adapter pattern: Sora (Azure OpenAI) → Runway/Pika → FFmpeg (Ken Burns + crossfades)
o	Inputs: enhanced image(s) + prompt/beat sheet + brand overlay; Outputs: MP4 (9:16 / 16:9).
•	Captioner (Node/TS)
o	LLM providers: OpenAI + Gemini; platform tuned prompts (IG/TikTok casual; LinkedIn pro).
o	JSON output: caption, 3–5 hashtags, CTA, safe words/guardrails.
•	Orchestrator (n8n in Docker)
o	Watch folders (Drive/local) → Enhance → Video → Caption → Upload → Create Buffer drafts.
o	Weekly HTML digest email (thumb + caption + slot) with signed approve/reject links → webhook finalizes publishing.
•	Scheduler
o	Preferred: Buffer API (multi platform, drafts, timing).
o	Wix: use Automations/Webhooks to trigger n8n or display videos on site if desired.
•	Data & Infra
o	Storage: /assets/source, /assets/ready, /assets/renders.
o	DB: Postgres (posts, assets, approvals, metrics). Queue: Redis.
o	Docker Compose for n8n, services, Redis, Postgres; healthchecks & logs.
o	Config: /config/brand.yaml, /config/schedule.yaml, /config/providers.yaml.
5) End to End Workflow
1.	Ingest: New photos arrive in Drive/local “incoming/”.
2.	Enhance: Gemini Image applies upscale/denoise/color; optional background replace (keep product). Face/plate blur; watermark; save to “ready/”.
3.	Assemble Video:
o	Try Sora (image + prompt → 10–20s cinematic clip).
o	If unavailable/unsuitable: Runway/Pika; else FFmpeg (Ken Burns, crossfades, brand end card).
4.	Caption: LLM produces platform optimized caption + hashtags + CTA (tone rules).
5.	Draft & Approve: Upload assets; create Buffer drafts per schedule.yaml; send weekly digest (Approve/Reject links).
6.	Publish: On approval, drafts are confirmed to auto post.
7.	Metrics: Pull performance (views/likes/clicks) weekly → DB → summary in email.
6) Content Strategy & Cadence
•	IG/TikTok/FB/Shorts: 3 posts/week (vertical 1080×1920; 15–30s).
•	LinkedIn: 1–2 posts/week (image carousel or 16:9 30–60s; spec/value focus).
•	Optional: Wed story/pin repurpose.
•	Seasonality: Jan–May lighter; Jun+ heavier.
7) Brand, Safety & Quality
•	Brand: logo (70% opacity, BR corner), fonts (Poppins/Inter or specified), palette in brand.yaml.
•	Safety: forbid exact addresses; auto blur faces/plates; avoid medical/claims; “authentic but premium.”
•	QA: size/aspect checks; max hashtags; caption length; fallback if any step fails.
8) Implementation Roadmap (Phased)
Phase 1 – Foundations (1):
•	Docker Compose for n8n, Enhance (FastAPI), Video (Node), Captioner, Redis, Postgres.
•	Google Drive/local watch; enhance pipeline; watermark/blur; write to ready/.
Phase 2 – Video (2):
•	Video adapters: Sora (Azure API) submit/poll; Runway/Pika fallback; FFmpeg fallback with Ken Burns + crossfades + brand end card.
•	Config flags: VIDEO_BACKEND=sora|runway|pika|ffmpeg.
Phase 3 – Orchestration & Scheduling (3):
•	n8n flow: ingest→enhance→video→caption→upload→Buffer drafts per schedule.yaml.
•	Weekly digest email (thumbnails, captions, times) with HMAC signed approve/reject; webhook to finalize.
Phase 4 – Copy & Carousels (4):
•	Platform prompt packs; hashtag rules; carousel grouping (2–5 images) and Buffer multi asset post.
Phase 5 – Metrics & Reports (5):
•	Nightly metrics harvester; Sunday summary; top performers + learnings.
Phase 6 – Hardening (6): ✅ COMPLETE
•	Retries/backoff; cost guards; observability (pino logs, alerts); security (secrets, scopes).
Phase 7 – Production Implementation (7): 🚀 CURRENT PHASE
•	Environment setup (.env configuration); API key management; Docker deployment.
•	Service validation; n8n workflow import; end-to-end testing.
•	Go-live with automated content generation; weekly approval workflow training.
•	Performance monitoring; backup strategy; production support.
9) Config & Env (examples)
•	GEMINI_API_KEY, OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY
•	RUNWAY_API_KEY, PIKA_API_KEY, BUFFER_TOKEN, WIX_WEBHOOK_SECRET
•	GOOGLE_SA_JSON, DB_URL, REDIS_URL, MAIL_HOST/USER/PASS
•	brand.yaml (logo path, colors, fonts, watermark opacity/pos)
•	schedule.yaml (weekly slots by platform/timezone, max lengths, aspect)
•	providers.yaml (backend selection, timeouts, retries, cost caps)
10) Risks & Mitigations
•	Sora access/region → Use Azure where available; fall back to Runway/Pika/FFmpeg.
•	API rate/cost → throttle in n8n; queue + backoff; weekly batch.
•	“AI look” backgrounds → conservative prompts; easy toggle to original/blurred background.
•	Music/licensing → use royalty free library; avoid trending audio automation.
11) Acceptance Criteria (DoD)
•	Drop 10 new photos → within 1–2 hrs system produces 3+ vertical clips + 1 LinkedIn asset, all on brand, privacy safe, with captions/hashtags, queued as Buffer drafts, and included in one digest email with working approve/reject links.
•	On approval, posts publish at configured times; metrics appear in Sunday email.
________________________________________
Quick “How We Operate” (owner view)
1.	Add photos during week.
2.	Sunday: open the digest email; Approve All (or tweak rejects).
3.	Done—content auto posts all week.

