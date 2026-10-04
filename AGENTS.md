<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Architecture rules

- Pipeline stages and the project status state machine live in `src/lib/pipeline.ts`; stages run strictly in order via `runStage` in `src/lib/ai/orchestrator.server.ts` — no stage may be skipped, and redoing a stage resets later ones.
- Every production request is assembled by `buildProductionContext` (system instructions + active skill + project settings + request + characters + world + storyboard + video requirements) on the server — the skill never ships in frontend code.
- Exactly one `skill_versions` row may have `status='active'` (partial unique index); activation goes through the `activate_skill_version` RPC — keeps the single-active invariant atomic.
- Provider contracts live in `src/lib/ai/types.ts`; concrete adapters are `*.server.ts` files registered in `src/lib/ai/registry.server.ts` — external providers are preferred, the built-in Lovable AI text provider is only a fallback.
- A stage whose provider is missing is marked `blocked` (not failed, not skipped) so the user sees exactly what to connect.
- First signed-up user becomes admin via the `handle_new_user` trigger; roles live in `user_roles` — avoids privilege escalation.
- `/` is the public home page; all signed-in pages live under `src/routes/_authenticated/` and render inside `AppShell`.
- Meta prompt QA loops (analyze → fix → analyze) inside the `analysis` stage and fails the stage if it never passes; the approved meta prompt is stored before the `# QA LOG` marker — later stages read only the approved part.
- The storyboard stage is rejected unless every second 00..duration-1 has a `SECOND NN` block — guarantees per-second coverage.
- Video provider contracts (`src/lib/ai/types.ts`) carry modes, references, first/last frame, seed, clips and per-segment regeneration — adapters plug in without changing the orchestrator.
- Video edits are stored as an edit list (`video_clips` trims/order/transitions/volume + `video_audio_tracks`); the final MP4 is rendered only by a connected `VideoEditingProvider` via `renderMaster` — Workers cannot run ffmpeg.
- Publishing is never automatic unless `projects.auto_publish` is true; workspace Publish/Schedule only create draft `scheduled_posts`.
- Automated publishing runs only through `processDuePosts` (`src/lib/automation/automation.server.ts`), called by the `/api/public/hooks/publish-due` route (verified with the `internal_config.cron_secret` header) — single-flight `job_locks`, per-post `claim_scheduled_post`, bounded batch.
- A post that has an `external_post_id` is never re-published, and interrupted publishes without one become FAILED instead of auto-retrying — prevents duplicate posts.
- `scheduled_posts.idempotency_key` (project:video:account) is unique — a completed project can't queue the same post twice.
- The `publish-due-posts` pg_cron job is created by a trigger when posts are queued and removed by `stop_publish_cron_if_idle` once the queue drains — no permanent polling.
- Emergency stop (`automation_settings.emergency_stop`) is checked per post right before publishing; it never touches already-published posts.
- Completed projects queue posts via `queueCompletedProject`: READY when auto-publish is off (or emergency stop is on), SCHEDULED at the next slot from `nextSlot` (`src/lib/automation/schedule.ts`) otherwise.
- Analytics sync runs only via `syncUserAnalytics` (`src/lib/analytics/analytics.server.ts`) — manual "Sync now" or the hourly `/api/public/hooks/sync-analytics` cron (same cron secret, single-flight lock, bounded users/posts); every run appends snapshots (`account_metrics`, `video_metrics`, `analytics_snapshots`) so history is never overwritten, and writes one `sync_logs` row per account.
- Earnings come only from `SocialPublisher.getEarnings`, which returns platform-reported amounts or `{available:false}` — never estimates; totals sum only verified rows in USD, other currencies are listed separately until an exchange-rate provider exists.
- Every automation job (pipeline stage, publish, analytics sync) records an `automation_jobs` row and user-visible events go to `activity_log`, both written only server-side via `src/lib/jobs/jobs.server.ts` (service role) or security-definer audit triggers — users can read but never forge their history.
- The dashboard command center reads everything through `getCommandCenter` (`src/lib/dashboard.functions.ts`); board columns come from `boardColumnFor` in `src/lib/pipeline.ts` — one place maps statuses to the simple board.
- Manual publishing claims the post (status PUBLISHING, only if it has no `external_post_id`) before calling the platform — prevents double-click/cron double posts.
- Disconnecting an account revokes at the platform where supported (`revokeAccess`), always deletes stored tokens, and returns its waiting posts to READY.
- Every bridge insert that lands in a user-owned table (`video_clips`, `video_assets`, `videos`, …) must set `user_id` explicitly to the project owner — under the service role `auth.uid()` is NULL, so relying on the column default either fails the NOT NULL insert or creates rows the owner's RLS policy can never return (this once made delivered videos invisible in Videos history).
- Videos made outside the website pipeline (chat/WhatsApp) are registered into history via `POST /api/public/hooks/video-chat-delivery` (multipart: title, topic?, description?, file) — it creates a COMPLETED project, stores the MP4 in the `videos` bucket and writes owned `video_assets`/`videos` rows, so the Videos page shows them with a "Made in chat" badge next to studio-made ones.
- `deleteProject` removes the project row; every project FK is `ON DELETE CASCADE`, so stages, clips, assets, videos and posts go with it. `resetProject` clears pipeline_steps, characters, storyboards, videos, video_clips, video_assets, video_audio_tracks, video_reviews, production_history, automation_jobs and unsent scheduled_posts, then returns the project to DRAFT — title/idea/settings are kept. Both verify ownership, log to activity_log, and are exposed on the project page as "Dobara banao" / "Delete".
- `deleteVideo` (automation.functions.ts) removes only the finished video (videos, video_clips, video_assets, video_audio_tracks), resets the generate_video/video_analysis/editing/final_qa steps and cancels unsent posts — script/storyboard/final-prompt stages are kept so the video can be regenerated. Exposed as "Delete video" on the workspace review page and on each Videos card.
- Project page never dumps raw prompt text openly: stage cards show model/finished/size summary, full text hides inside a collapsed "Poora text dekho" details element.
- `create.tsx` and `projects.$projectId.tsx` use the shared `RouteErrorFallback` errorComponent (Roman Urdu, retry + error message) so a render crash never dead-ends on the static error page.
- Videos page groups finished videos into platform sections (TikTok, Facebook Reels, Facebook feed, YouTube Shorts, YouTube (wide), Other) from `projects.target_platform`; the Projects table shows a Platform column.
- 2D Studio: nav item "2D Studio" links to `/create?mode=2d` (same create form, visual_style preset to the TWOD_STYLE art direction). `buildProductionContext` appends a 2D STYLE OVERRIDE to the system prompt when `projects.visual_style` mentions 2D (flat cartoon: bold outlines, cel shading — characters/world/story/comedy unchanged). The bridge passes `visualStyle` to the worker; WORKER.md §3 has the 2D render branch. Videos cards and the Projects table show a 2D badge/Style column.
- Idea/brief generation never repeats old scenes: `generateBrief` and `suggestIdeas` receive the user's 15 most recent project titles/topics/ideas (`recentConcepts`) as a do-not-repeat block; every brief and stage prompt enforces ONE invention / ONE continuous scene per video (no multi-gag compilations).
