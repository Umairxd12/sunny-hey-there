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

- Pipeline step definitions live in `src/lib/pipeline.ts`; AI steps run only via `runPipelineStep` server fn — keeps prompts, skill content and keys server-side.
- The active SKILL.md is loaded server-side and injected into every AI step's system prompt — never hard-code skill content in the frontend.
- Skill versions are append-only rows in `skill_versions`; activating/restoring only changes `skills.active_version_id` — preserves full history.
- External services (video AI, Facebook, YouTube, TikTok, analytics) implement the adapter interfaces in `src/lib/providers.ts` — lets providers be plugged in without UI rewrites.
- First signed-up user becomes admin via the `handle_new_user` trigger; roles live in `user_roles` — avoids privilege escalation.
- All signed-in pages live under `src/routes/_authenticated/` and render inside `AppShell`.
