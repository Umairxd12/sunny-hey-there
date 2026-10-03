import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

export const Route = createFileRoute("/api/public/hooks/sync-analytics")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin.from("internal_config").select("value").eq("key", "cron_secret").maybeSingle();
        const got = Buffer.from(request.headers.get("x-cron-secret") ?? "");
        const want = Buffer.from(data?.value ?? "");
        if (!want.length || got.length !== want.length || !timingSafeEqual(got, want)) return new Response("Unauthorized", { status: 401 });
        const { syncDueUsers } = await import("@/lib/analytics/analytics.server");
        return Response.json(await syncDueUsers(10));
      },
    },
  },
});
