import { createFileRoute } from "@tanstack/react-router";

const back = (origin: string, q: Record<string, string>) =>
  Response.redirect(`${origin}/social?${new URLSearchParams(q)}`, 302);

export const Route = createFileRoute("/api/public/oauth/$platform/callback")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const platform = params.platform;
        if (!["facebook", "youtube", "tiktok"].includes(platform)) return new Response("Unknown platform", { status: 404 });
        const state = url.searchParams.get("state");
        const code = url.searchParams.get("code");
        const providerErr = url.searchParams.get("error_description") ?? url.searchParams.get("error");
        if (!state) return new Response("Missing state", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // Single-use state, bound to the user who started the flow, valid 15 minutes.
        const { data: row } = await supabaseAdmin.from("oauth_states").delete().eq("state", state).select("*").maybeSingle();
        if (!row || row.platform !== platform || Date.now() - new Date(row.created_at).getTime() > 15 * 60_000)
          return back(url.origin, { error: "This connection link expired. Please try again." });
        if (providerErr || !code) return back(url.origin, { error: providerErr ?? "Authorization was cancelled." });

        try {
          const { exchangeCode } = await import("@/lib/social/oauth.server");
          const { saveConnectedAccounts } = await import("@/lib/social/accounts.server");
          const accounts = await exchangeCode(platform as any, code, row.redirect_uri, row.code_verifier);
          if (!accounts.length) return back(url.origin, { error: `No ${platform === "facebook" ? "Pages" : "channels"} were authorized.` });
          await saveConnectedAccounts(row.user_id, platform as any, accounts);
          return back(url.origin, { connected: platform, count: String(accounts.length) });
        } catch (e) {
          console.error("OAuth callback failed", e);
          return back(url.origin, { error: (e as Error).message.slice(0, 300) });
        }
      },
    },
  },
});
