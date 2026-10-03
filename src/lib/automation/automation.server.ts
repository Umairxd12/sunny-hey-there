import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getTextProvider } from "@/lib/ai/registry.server";
import { PLATFORM_INFO, type SocialPlatform } from "@/lib/social/types";
import { COUNTRIES, nextSlot, type ScheduleRule } from "./schedule";

type Db = SupabaseClient<Database>;
type Settings = Database["public"]["Tables"]["automation_settings"]["Row"];

export const DEFAULT_SETTINGS = (userId: string): Settings => ({
  user_id: userId, country: "US", timezone: "America/New_York", frequency: "daily", days_of_week: [1, 2, 3, 4, 5],
  publish_times: ["18:00"], custom_slots: [], platforms: [], account_ids: [], emergency_stop: false,
  emergency_stopped_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
});

export async function loadSettings(db: Db, userId: string): Promise<Settings> {
  const { data } = await db.from("automation_settings").select("*").eq("user_id", userId).maybeSingle();
  return data ?? DEFAULT_SETTINGS(userId);
}

const rule = (s: Settings): ScheduleRule => ({ timezone: s.timezone, frequency: s.frequency as ScheduleRule["frequency"], days_of_week: s.days_of_week, publish_times: s.publish_times, custom_slots: s.custom_slots });

/**
 * Called when a project reaches COMPLETED. Auto-publish OFF → READY posts; ON → SCHEDULED posts
 * at the next free slot. One post per target account, keyed so it can never be created twice.
 */
export async function queueCompletedProject(db: Db, userId: string, projectId: string) {
  const { data: project } = await db.from("projects").select("id, title, auto_publish").eq("id", projectId).single();
  if (!project) return;
  const settings = await loadSettings(db, userId);
  const { data: video } = await db.from("videos").select("id").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { data: linked } = await db.from("project_social_accounts").select("account_id").eq("project_id", projectId);
  const accountIds = linked?.length ? linked.map((l) => l.account_id) : settings.account_ids;
  const { data: accounts } = accountIds.length
    ? await db.from("social_accounts").select("id, platform").in("id", accountIds).eq("status", "connected")
    : { data: [] as { id: string; platform: string }[] };
  const targets = (accounts ?? []).filter((a) => !settings.platforms.length || settings.platforms.includes(a.platform));

  const automatic = project.auto_publish && !settings.emergency_stop;
  const { data: busy } = await db.from("scheduled_posts").select("next_attempt_at").in("status", ["SCHEDULED", "RETRYING"]);
  const taken = (busy ?? []).map((b) => (b.next_attempt_at ? new Date(b.next_attempt_at).getTime() : 0));
  const slot = automatic ? nextSlot(rule(settings), new Date(), taken) : null;

  const base = { user_id: userId, project_id: projectId, video_id: video?.id ?? null, title: project.title, automated: automatic };
  const rows = targets.length
    ? targets.map((a) => ({ ...base, platform: a.platform, social_account_id: a.id, idempotency_key: `${projectId}:${video?.id ?? "novideo"}:${a.id}`,
        status: slot ? "SCHEDULED" : "READY", scheduled_for: slot?.toISOString() ?? null, next_attempt_at: slot?.toISOString() ?? null,
        status_detail: automatic && !slot ? "No upcoming publishing time in your automation settings." : null }))
    : [{ ...base, platform: "unassigned", idempotency_key: `${projectId}:${video?.id ?? "novideo"}:none`, status: "READY", automated: false,
        status_detail: "No publishing account selected yet." }];
  await db.from("scheduled_posts").upsert(rows, { onConflict: "idempotency_key", ignoreDuplicates: true });
}

/** Localized, platform-specific metadata. Falls back to existing text when no text AI is available. */
export async function localizeMetadata(input: { platform: string; country: string; title: string; idea: string; metadataStage: string }) {
  const provider = getTextProvider();
  if (!provider) return null;
  const country = COUNTRIES.find((c) => c.code === input.country) ?? COUNTRIES[0];
  const name = PLATFORM_INFO[input.platform as SocialPlatform]?.name ?? input.platform;
  const { text } = await provider.generate({
    system: `You write social media metadata for short 3D cartoon videos. Audience: ${country.name}. Write natural ${country.language} with hooks, references and humor that feel native to ${country.name}. Never claim the video was filmed in, or the creator is located in, any physical place. Respond with JSON only.`,
    prompt: `Platform: ${name}\nVideo title: ${input.title}\nIdea: ${input.idea}\nExisting metadata notes:\n${input.metadataStage.slice(0, 4000)}\n\nReturn {"title": string (max 90 chars), "caption": string (max 1500 chars, ends with a short call to action), "hashtags": string[] (8-12 tags without #, relevant to ${country.name} viewers)}`,
  });
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  const parsed = JSON.parse(json) as { title?: string; caption?: string; hashtags?: string[] };
  if (!parsed.caption) return null;
  return { title: (parsed.title ?? input.title).slice(0, 100), caption: parsed.caption.slice(0, 2000), hashtags: (parsed.hashtags ?? []).map((h) => h.replace(/^#/, "")).slice(0, 15).join(" ") };
}

const isRetryable = (msg: string) => /\[(429|5\d\d)\]|fetch failed|network|timed? ?out/i.test(msg);

/** Processes due posts. Bounded batch, single-flight lock, claim per post, never re-posts once a platform ID exists. */
export async function processDuePosts(batch = 5) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: locked } = await db.rpc("acquire_job_lock", { _name: "publish-due", _seconds: 240 });
  if (!locked) return { skipped: "another run is in progress" };
  const report = { published: 0, processing: 0, failed: 0, retrying: 0, paused: 0 };
  try {
    const now = new Date().toISOString();
    const { getCredentials } = await import("@/lib/social/accounts.server");
    const { PUBLISHERS } = await import("@/lib/social/publishers.server");

    // 1) Interrupted publishes: never retry blindly — the platform might already have the video.
    await db.from("scheduled_posts").update({ status: "FAILED", last_error: "Publishing was interrupted. Check the platform before retrying so the video isn't posted twice." })
      .eq("status", "PUBLISHING").is("external_post_id", null).lt("locked_until", now);
    await db.from("scheduled_posts").update({ status: "PROCESSING" }).eq("status", "PUBLISHING").not("external_post_id", "is", null).lt("locked_until", now);

    // 2) Track processing status of posts already accepted by a platform.
    const { data: processing } = await db.from("scheduled_posts").select("*").eq("status", "PROCESSING").limit(batch);
    for (const p of processing ?? []) {
      try {
        const { platform, cred } = await getCredentials(p.user_id, p.social_account_id!);
        const st = await PUBLISHERS[platform].getPublishStatus(cred, p.external_post_id!);
        if (st.status === "published") {
          await db.from("scheduled_posts").update({ status: "PUBLISHED", published_at: new Date().toISOString(), status_detail: st.detail ?? null, updated_at: new Date().toISOString() }).eq("id", p.id);
          await db.from("social_accounts").update({ last_published_at: new Date().toISOString(), last_published_title: p.title }).eq("id", p.social_account_id!);
          report.published++;
        } else if (st.status === "failed") {
          await db.from("scheduled_posts").update({ status: "FAILED", last_error: `${platform} rejected the video: ${st.detail ?? "no reason given"}` }).eq("id", p.id);
          report.failed++;
        } else report.processing++;
      } catch (e) {
        await db.from("scheduled_posts").update({ status_detail: `Status check failed: ${(e as Error).message.slice(0, 300)}` }).eq("id", p.id);
      }
    }

    // 3) Publish due posts.
    const { data: due } = await db.from("scheduled_posts").select("*").in("status", ["SCHEDULED", "RETRYING"]).lte("next_attempt_at", now).order("next_attempt_at").limit(batch);
    for (const p of due ?? []) {
      const settings = await loadSettings(db, p.user_id);
      if (settings.emergency_stop) { report.paused++; continue; }
      const { data: claimed } = await db.rpc("claim_scheduled_post", { _id: p.id, _seconds: 600 });
      if (!claimed) continue;
      try {
        if (p.external_post_id) { // already accepted earlier — track instead of re-posting
          await db.from("scheduled_posts").update({ status: "PROCESSING" }).eq("id", p.id); continue;
        }
        if (!p.social_account_id) throw new Error("No publishing account selected.");
        const { data: video } = p.video_id ? await db.from("videos").select("video_url").eq("id", p.video_id).maybeSingle() : { data: null };
        if (!video?.video_url) throw new Error("The final video file is missing.");
        const { data: project } = p.project_id ? await db.from("projects").select("title, idea").eq("id", p.project_id).maybeSingle() : { data: null };
        const { data: meta } = p.project_id ? await db.from("pipeline_steps").select("output").eq("project_id", p.project_id).eq("step_key", "metadata").maybeSingle() : { data: null };

        let { title, caption, hashtags } = p;
        const opts = (p.options ?? {}) as Record<string, unknown>;
        if (!opts["localized"]) {
          const loc = await localizeMetadata({ platform: p.platform, country: settings.country, title: project?.title ?? p.title ?? "", idea: project?.idea ?? "", metadataStage: meta?.output ?? "" });
          if (loc) {
            ({ title, caption, hashtags } = loc);
            await db.from("scheduled_posts").update({ title, caption, hashtags, options: { ...opts, localized: settings.country } }).eq("id", p.id);
          }
        }

        const { platform, cred } = await getCredentials(p.user_id, p.social_account_id);
        const res = await PUBLISHERS[platform].publishVideo(cred, {
          videoUrl: video.video_url, title: title ?? "", description: caption ?? "", tags: (hashtags ?? "").split(/[\s,]+/).filter(Boolean),
          privacy: opts["privacy"] as string | undefined, categoryId: opts["categoryId"] as string | undefined, playlistId: opts["playlistId"] as string | undefined,
        });
        // Store the platform ID immediately — this is what prevents any duplicate post later.
        await db.from("scheduled_posts").update({ external_post_id: res.externalPostId, published_url: res.url ?? null, status: res.status === "published" ? "PUBLISHED" : "PROCESSING",
          published_at: res.status === "published" ? new Date().toISOString() : null, last_error: null, attempts: p.attempts + 1, updated_at: new Date().toISOString() }).eq("id", p.id);
        report.processing++;
      } catch (e) {
        const msg = (e as Error).message.slice(0, 500);
        const attempts = p.attempts + 1;
        const retry = isRetryable(msg) && attempts < p.max_attempts;
        await db.from("scheduled_posts").update({
          status: retry ? "RETRYING" : "FAILED", attempts, last_error: msg, locked_until: null,
          next_attempt_at: retry ? new Date(Date.now() + 5 * 60_000 * 2 ** (attempts - 1)).toISOString() : p.next_attempt_at, updated_at: new Date().toISOString(),
        }).eq("id", p.id);
        retry ? report.retrying++ : report.failed++;
      }
    }
    return report;
  } finally {
    await db.rpc("release_job_lock", { _name: "publish-due" });
  }
}
