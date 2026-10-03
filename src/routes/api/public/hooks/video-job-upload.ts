import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

/**
 * Receives a finished MP4 (or clip) from the external video worker and stores
 * it in the site's own Supabase storage bucket ("videos", created on demand),
 * returning a public URL the site can play and the social publishers can fetch.
 *
 * Multipart form fields: projectId, name (e.g. "final.mp4"), file.
 * Auth: header `x-worker-secret` must match `worker_secret` in internal_config
 * (falls back to `cron_secret`).
 */

const BUCKET = "videos";

export const Route = createFileRoute("/api/public/hooks/video-job-upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const { data: rows } = await db.from("internal_config").select("key, value").in("key", ["worker_secret", "cron_secret"]);
        const want = rows?.find((r: any) => r.key === "worker_secret")?.value ?? rows?.find((r: any) => r.key === "cron_secret")?.value ?? "";
        const got = Buffer.from(request.headers.get("x-worker-secret") ?? "");
        const wantBuf = Buffer.from(want);
        if (!wantBuf.length || got.length !== wantBuf.length || !timingSafeEqual(got, wantBuf)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const form = await request.formData().catch(() => null);
        const projectId = form?.get("projectId");
        const name = form?.get("name");
        const file = form?.get("file");
        if (typeof projectId !== "string" || !/^[0-9a-f-]{36}$/i.test(projectId) || typeof name !== "string" || !(file instanceof File)) {
          return Response.json({ ok: false, error: "Expected multipart fields: projectId (uuid), name, file." }, { status: 400 });
        }
        const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "video.mp4";
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (!bytes.length || bytes.length > 100 * 1024 * 1024) {
          return Response.json({ ok: false, error: "File is empty or larger than 100 MB." }, { status: 400 });
        }
        const path = `${projectId}/${Date.now()}-${safeName}`;

        let { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: file.type || "video/mp4", upsert: false });
        if (error && /bucket not found/i.test(error.message)) {
          const { error: mkErr } = await db.storage.createBucket(BUCKET, { public: true });
          if (mkErr) return Response.json({ ok: false, error: `Could not create storage bucket: ${mkErr.message}` }, { status: 500 });
          ({ error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: file.type || "video/mp4", upsert: false }));
        }
        if (error) return Response.json({ ok: false, error: `Upload failed: ${error.message}` }, { status: 500 });

        const { data: pub } = db.storage.from(BUCKET).getPublicUrl(path);
        return Response.json({ ok: true, url: pub.publicUrl, path });
      },
    },
  },
});
