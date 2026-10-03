import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PLATFORMS, PLATFORM_INFO } from "./social/types";

/**
 * Which integrations are configured. Only booleans and secret *names* are returned — never values.
 * Secret names are only shown to admins.
 */
export const getIntegrationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    const { listProviderStatus } = await import("./ai/registry.server");
    const { isConfigured } = await import("./social/oauth.server");
    const has = (n: string) => !!process.env[n];
    const ai = listProviderStatus().map((p) => ({
      id: p.capability, group: "AI providers" as const, name: p.label, configured: p.configured, detail: p.providerName ?? p.note,
      secrets: p.capability === "text" ? ["AI_TEXT_BASE_URL", "AI_TEXT_API_KEY", "AI_TEXT_MODEL"] : [],
      note: p.capability === "text" && p.configured && !has("AI_TEXT_API_KEY") ? "Using the built-in fallback until your own key is added." : p.note,
    }));
    const social = PLATFORMS.map((p) => ({
      id: p, group: "Social platforms" as const, name: PLATFORM_INFO[p].name, configured: isConfigured(p), detail: null,
      secrets: PLATFORM_INFO[p].secrets, note: `Developer app keys for ${PLATFORM_INFO[p].name} sign-in.`,
    }));
    const other = [
      { id: "token_encryption", group: "Security" as const, name: "Token encryption key", configured: has("SOCIAL_TOKEN_ENCRYPTION_KEY"), detail: null, secrets: ["SOCIAL_TOKEN_ENCRYPTION_KEY"], note: "Encrypts every social access key before it is stored." },
      { id: "exchange_rates", group: "Security" as const, name: "Exchange-rate provider", configured: false, detail: null, secrets: [], note: "Optional. Without it, earnings in other currencies are listed separately, not converted." },
    ];
    const all = [...ai, ...social, ...other];
    return { isAdmin: !!isAdmin, integrations: isAdmin ? all : all.map((i) => ({ ...i, secrets: [] as string[] })) };
  });
