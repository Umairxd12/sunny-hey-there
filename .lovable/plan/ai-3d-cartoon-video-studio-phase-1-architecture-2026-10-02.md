# AI 3D Cartoon Video Studio — Phase 1: Architecture

Note: the pasted "error" is a product brief, not a code error. This plan builds the foundation for it.

## What you will see after Phase 1
- A light, clean dashboard with the 13 sections in a sidebar: Dashboard, Create Video, Projects, Characters, Storyboards, Videos, Social Accounts, Scheduler, Analytics, Content Calendar, Skill Manager, AI Providers, Settings.
- Sign-in for the administrator.
- **Skill Manager fully working**: upload SKILL.md, preview, version history, set active version, enable/disable, restore an older version, created/updated dates.
- **Create Video wizard** showing the full pipeline as steps (Idea, Meta Prompt, Analysis, Characters, World, Storyboard, Final Prompt, Generate, Review, Publish) with live status and progress bars.
- **Text AI steps working for real** (meta prompt through final video prompt and title/description/hashtags), always using the active skill.
- Video generation, Facebook, YouTube, TikTok and analytics shown as "Not connected" with clear setup cards. No fake results.

## Phases after this
2. Connect a video AI provider + review/regenerate failed parts.
3. Facebook, YouTube, TikTok connection and publishing.
4. Scheduler, content calendar automation, analytics collection.

## Technical details
- Lovable Cloud for auth, database, file storage; Lovable AI for text steps (server-side only).
- Tables: profiles, user_roles (admin), skills, skill_versions, projects, pipeline_runs, pipeline_steps, characters, worlds, storyboards, storyboard_frames, videos, video_reviews, social_accounts, scheduled_posts, post_metrics, ai_providers. RLS on all.
- SKILL.md stored in a private storage bucket + parsed text in skill_versions; only one active version enforced server-side; injected into every AI step on the server, never shipped to the browser except for admin preview.
- Provider adapter interfaces: `VideoProvider` (submit, poll, fetch), `SocialPublisher` (connect, publish, schedule, metrics), `AnalyticsSource`. Each has a "not configured" implementation until keys/OAuth are added as secrets.
- Server functions for all pipeline steps; OAuth callbacks and scheduling under public API routes with verification.
