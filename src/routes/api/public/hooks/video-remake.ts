import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { z } from "zod";

/**
 * Worker-accessible project reset for remakes.
 * Same cleanup as the "Dobara banao" resetProject server function, but authed
 * with the worker secret so the studio agent can remake a video without the
 * user's login. After this, the project is DRAFT and the worker can re-run
 * the full pipeline and POST a fresh completion (the normal completion
 * handler 409s when generate_video is already done, hence the reset).
 */

async function checkSecret(request: Request): Promise<{ ok: boolean; db?: any }> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: rows } = await db.from("internal_config").select("key, value").in("key", ["worker_secret", "cron_secret"]);
  const want = rows?.find((r: any) => r.key === "worker_secret")?.value ?? rows?.find((r: any) => r.key === "cron_secret")?.value ?? "";
  const got = Buffer.from(request.headers.get("x-worker-secret") ?? "");
  const wantBuf = Buffer.from(want);
  if (!wantBuf.length || got.length !== wantBuf.length || !timingSafeEqual(got, wantBuf)) return { ok: false };
  return { ok: true, db };
}

const RESET_TABLES = ["pipeline_steps", "characters", "storyboards", "videos", "video_clips", "video_assets", "video_audio_tracks", "video_reviews", "production_history", "automation_jobs"] as const;

export const Route = createFileRoute("/api/public/hooks/video-remake")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { ok, db } = await checkSecret(request);
        if (!ok || !db) return new Response("Unauthorized", { status: 401 });
        let body: any;
        try {
          body = z.object({ projectId: z.string().uuid(), reason: z.string().max(500).optional() }).parse(await request.json());
        } catch {
          return Response.json({ ok: false, error: "projectId is required." }, { status: 400 });
        }
        const { data: project } = await db.from("projects").select("id, user_id, title").eq("id", body.projectId).single();
        if (!project) return Response.json({ ok: false, error: "Project not found." }, { status: 404 });
        for (const table of RESET_TABLES) {
          const { error } = await db.from(table).delete().eq("project_id", body.projectId);
          if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
        }
        const { error: postErr } = await db.from("scheduled_posts").delete().eq("project_id", body.projectId).is("external_post_id", null);
        if (postErr) return Response.json({ ok: false, error: postErr.message }, { status: 500 });
        const now = new Date().toISOString();
        const { error: pErr } = await db.from("projects")
          .update({ status: "DRAFT", current_stage: null, last_error: null, updated_at: now })
          .eq("id", body.projectId);
        if (pErr) return Response.json({ ok: false, error: pErr.message }, { status: 500 });
        await db.from("production_history").insert({
          project_id: body.projectId, user_id: project.user_id, action: "Remake requested by the studio worker",
          detail: body.reason ?? "rebuilding as one continuous story",
        });
        return Response.json({ ok: true, projectId: body.projectId, title: project.title });
      },
    },
  },
});
