import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { z } from "zod";

/**
 * Bridge between the studio website and the studio agent (TechGenie's API).
 *
 * Two job modes:
 * - "full": the agent makes EVERYTHING — script, storyboard, characters,
 *   video — following the active skill end-to-end. Queued by the 1-click
 *   "Generate video" button (delegateFullPipeline).
 * - "video": only the generate_video stage is delegated (user ran the text
 *   stages manually). Queued by delegateVideoToWorker.
 *
 * The worker polls GET for jobs, then reports back with POST — either once
 * with everything, or twice (text stages first for early progress, then the
 * finished video). Auth: header `x-worker-secret` must match `worker_secret`
 * in internal_config (falls back to `cron_secret`).
 */

const VIDEO_STAGES = ["final_prompt", "storyboard", "characters", "world"] as const;
const FULL_STAGE_KEYS = ["meta_prompt", "analysis", "characters", "world", "storyboard", "final_prompt", "video_analysis", "editing", "final_qa", "metadata"] as const;

async function checkSecret(request: Request): Promise<{ ok: boolean; db?: any }> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: rows } = await db.from("internal_config").select("key, value").in("key", ["worker_secret", "cron_secret"]);
  const want = rows?.find((r: any) => r.key === "worker_secret")?.value ?? rows?.find((r: any) => r.key === "cron_secret")?.value ?? "";
  const got = Buffer.from(request.headers.get("x-worker-secret") ?? "");
  const wantBuf = Buffer.from(want);
  if (!wantBuf.length || got.length !== wantBuf.length || !timingSafeEqual(got, wantBuf)) return { ok: false };
  return { ok: true, db };
}

const CLAIM_TIMEOUT_MIN = 30;
const stale = (started_at: string | null) => !!started_at && new Date(started_at).getTime() < Date.now() - CLAIM_TIMEOUT_MIN * 60_000;

export const Route = createFileRoute("/api/public/hooks/video-jobs")({
  server: {
    handlers: {
      /** Lists jobs for the worker, and claims them. */
      GET: async ({ request }) => {
        const { ok, db } = await checkSecret(request);
        if (!ok || !db) return new Response("Unauthorized", { status: 401 });
        const now = new Date().toISOString();

        // 1) Full-pipeline jobs: the agent makes everything.
        const { data: fullSteps } = await db.from("pipeline_steps").select("project_id, status, started_at").eq("step_key", "full_pipeline").in("status", ["queued", "running"]);
        const fullIds = (fullSteps ?? []).filter((s: any) => s.status === "queued" || stale(s.started_at)).map((s: any) => s.project_id);
        let fullJobs: any[] = [];
        if (fullIds.length) {
          await db.from("pipeline_steps").update({ status: "running", error: `TechGenie picked this up at ${now}.`, started_at: now, finished_at: null })
            .in("project_id", fullIds).eq("step_key", "full_pipeline");
          const { data: projects } = await db.from("projects").select("id, user_id, title, idea, topic, target_duration_seconds, aspect_ratio, target_platform, target_audience, language, visual_style, video_requirements, reference_notes").in("id", fullIds);
          fullJobs = (projects ?? []).map((p: any) => ({
            mode: "full" as const, projectId: p.id, userId: p.user_id, title: p.title, idea: p.idea, topic: p.topic,
            durationSeconds: p.target_duration_seconds, aspectRatio: p.aspect_ratio, targetPlatform: p.target_platform,
            targetAudience: p.target_audience, language: p.language, visualStyle: p.visual_style,
            videoRequirements: p.video_requirements, referenceNotes: p.reference_notes,
          }));
        }
        const fullSet = new Set(fullIds);

        // 2) Video-only jobs: final prompt is done, video stage needs work.
        const { data: steps } = await db.from("pipeline_steps")
          .select("project_id, step_key, status, started_at")
          .in("step_key", ["final_prompt", "generate_video"]);
        const byProject = new Map<string, { finalDone: boolean; video: { status: string; started_at: string | null } | null }>();
        for (const s of steps ?? []) {
          if (fullSet.has(s.project_id)) continue;
          const e = byProject.get(s.project_id) ?? { finalDone: false, video: null };
          if (s.step_key === "final_prompt" && s.status === "done") e.finalDone = true;
          if (s.step_key === "generate_video") e.video = { status: s.status, started_at: s.started_at };
          byProject.set(s.project_id, e);
        }
        const ids = [...byProject.entries()]
          .filter(([, e]) => {
            if (!e.finalDone) return false;
            const v = e.video;
            if (!v) return true;
            if (["queued", "pending", "blocked", "failed"].includes(v.status)) return true;
            if (v.status === "running" && stale(v.started_at)) return true;
            return false;
          })
          .map(([id]) => id);
        let videoJobs: any[] = [];
        if (ids.length) {
          await db.from("pipeline_steps")
            .update({ status: "running", error: `Video worker picked this up at ${now}.`, started_at: now, finished_at: null })
            .in("project_id", ids).eq("step_key", "generate_video");
          const [{ data: projects }, { data: outputs }] = await Promise.all([
            db.from("projects").select("id, user_id, title, idea, target_duration_seconds, aspect_ratio, language, target_platform").in("id", ids),
            db.from("pipeline_steps").select("project_id, step_key, output").in("project_id", ids).in("step_key", VIDEO_STAGES),
          ]);
          const outMap = new Map<string, Record<string, string>>();
          for (const o of outputs ?? []) {
            const e = outMap.get(o.project_id) ?? {};
            e[o.step_key] = o.output ?? "";
            outMap.set(o.project_id, e);
          }
          videoJobs = (projects ?? []).map((p: any) => {
            const o = outMap.get(p.id) ?? {};
            return {
              mode: "video" as const, projectId: p.id, userId: p.user_id, title: p.title, idea: p.idea,
              durationSeconds: p.target_duration_seconds, aspectRatio: p.aspect_ratio,
              language: p.language, targetPlatform: p.target_platform,
              finalPrompt: o["final_prompt"] ?? "", storyboard: o["storyboard"] ?? "",
              characters: o["characters"] ?? "", world: o["world"] ?? "",
            };
          });
        }
        return Response.json({ jobs: [...fullJobs, ...videoJobs] });
      },

      /** Accepts stage outputs and/or a finished video from the worker. */
      POST: async ({ request }) => {
        const { ok, db } = await checkSecret(request);
        if (!ok || !db) return new Response("Unauthorized", { status: 401 });

        const stageSchema = z.record(z.string(), z.string().max(60000));
        const bodySchema = z.object({
          projectId: z.string().uuid(),
          // Text/production stage outputs (meta_prompt, analysis, characters,
          // world, storyboard, final_prompt, video_analysis, editing, final_qa,
          // metadata). The worker may send these first, then the video later.
          stages: stageSchema.optional(),
          // Set true on the final delivery: marks full_pipeline done, ensures
          // metadata, completes the project and queues READY posts.
          done: z.boolean().optional(),
          // Video delivery (video mode, or final part of full mode).
          clips: z.array(z.object({
            from_s: z.number(), to_s: z.number(), prompt: z.string().max(8000), video_url: z.string().url(),
          })).min(1).max(40).optional(),
          finalVideoUrl: z.string().url().optional(),
          thumbnailUrl: z.string().url().optional(),
          analysisReport: z.string().max(20000).optional(),
          qaPassed: z.boolean().optional(),
          failedSegments: z.array(z.object({ from: z.number(), to: z.number(), kind: z.string().max(60), reason: z.string().max(2000), fix: z.string().max(2000).optional() })).default([]),
          editNotes: z.string().max(8000).optional(),
        });
        const parsed = bodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ ok: false, error: "Invalid payload." }, { status: 400 });
        const b = parsed.data;

        const { data: project } = await db.from("projects").select("id, user_id, title").eq("id", b.projectId).single();
        if (!project) return Response.json({ ok: false, error: "Project not found." }, { status: 404 });

        const now = new Date().toISOString();
        const finish = (step_key: string, output: string) =>
          db.from("pipeline_steps").upsert(
            { project_id: b.projectId, user_id: project.user_id, step_key, status: "done", output, error: null, finished_at: now },
            { onConflict: "project_id,step_key" },
          );

        // 1) Text/production stages.
        for (const [key, output] of Object.entries(b.stages ?? {})) {
          if (!(FULL_STAGE_KEYS as readonly string[]).includes(key)) continue;
          await finish(key, output);
          if (key === "storyboard") await db.from("storyboards").insert({ project_id: b.projectId, user_id: project.user_id, content: output });
          if (key === "characters") await db.from("characters").insert({ project_id: b.projectId, user_id: project.user_id, name: `${project.title} cast`, description: output });
        }
        if (Object.keys(b.stages ?? {}).length) {
          await db.from("production_history").insert({ project_id: b.projectId, action: "Production stages delivered", detail: Object.keys(b.stages ?? {}).join(", ") });
        }

        // 2) Video delivery.
        let videoId: string | null = null;
        if (b.clips?.length && b.finalVideoUrl) {
          const { data: existing } = await db.from("pipeline_steps").select("status").eq("project_id", b.projectId).eq("step_key", "generate_video").maybeSingle();
          if (existing?.status === "done") return Response.json({ ok: false, error: "Video stage already done." }, { status: 409 });
          const clipRows = b.clips.map((c, i) => ({
            project_id: b.projectId, user_id: project.user_id, position: i, from_s: c.from_s, to_s: c.to_s,
            prompt: c.prompt, video_url: c.video_url, source: "worker", status: "ready",
          }));
          const { error: clipErr } = await db.from("video_clips").insert(clipRows);
          if (clipErr) return Response.json({ ok: false, error: `Could not save clips: ${clipErr.message}` }, { status: 500 });
          await db.from("video_assets").insert({ project_id: b.projectId, user_id: project.user_id, kind: "final", url: b.finalVideoUrl, metadata: { source: "worker" } });
          if (b.thumbnailUrl) await db.from("video_assets").insert({ project_id: b.projectId, user_id: project.user_id, kind: "thumbnail", url: b.thumbnailUrl, metadata: { source: "worker" } });
          const { data: videoRow } = await db.from("videos").insert({
            project_id: b.projectId, user_id: project.user_id, provider: "studio-worker", status: "done", video_url: b.finalVideoUrl,
          }).select("id").single();
          videoId = videoRow?.id ?? null;
          await finish("generate_video", `Generated by the studio worker: ${b.clips.length} clip(s), stitched into the final video.`);
          await finish("video_analysis", b.analysisReport ?? "QA performed by the studio worker during generation.");
          await finish("editing", b.editNotes ?? "The worker applied QA fixes and regeneration during generation; no further edits were needed.");
          await finish("final_qa", (b.qaPassed ?? true) ? `FINAL QA: PASS.\n\n${b.analysisReport ?? ""}` : `FINAL QA: ISSUES NOTED.\n\n${b.analysisReport ?? ""}`);
          await db.from("projects").update({ status: "FINAL_QA", current_stage: "final_qa", last_error: null, updated_at: now }).eq("id", b.projectId);
          await db.from("production_history").insert({ project_id: b.projectId, action: "Video delivered by the worker", detail: `${b.clips.length} clips; QA ${(b.qaPassed ?? true) ? "passed" : "noted issues"}.` });
        }

        // 3) Finalize the full-pipeline job.
        let warning: string | null = null;
        if (b.done) {
          await db.from("pipeline_steps").upsert(
            { project_id: b.projectId, user_id: project.user_id, step_key: "full_pipeline", status: "done", error: null, finished_at: now },
            { onConflict: "project_id,step_key" },
          );
          const { data: metaStep } = await db.from("pipeline_steps").select("status").eq("project_id", b.projectId).eq("step_key", "metadata").maybeSingle();
          if (metaStep?.status !== "done") {
            try {
              const { runStage } = await import("@/lib/ai/orchestrator.server");
              const res = await runStage(db, project.user_id, b.projectId, "metadata");
              if (!res.ok) warning = `Video saved, but the metadata stage needs attention: ${res.error}`;
            } catch (e) {
              warning = `Video saved, but the metadata stage failed: ${(e as Error).message}`;
            }
          }
          const { logActivity } = await import("@/lib/jobs/jobs.server");
          await logActivity({ userId: project.user_id, category: "production", level: "success", projectId: b.projectId, event: "Video finished — ready for review", detail: project.title });
        }
        return Response.json({ ok: true, videoId, warning });
      },
    },
  },
});
