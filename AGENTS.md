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
