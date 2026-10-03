import { decryptToken, encryptToken } from "./crypto.server";
import { refreshAccess, type ConnectedAccount } from "./oauth.server";
import type { AccountCredentials, SocialPlatform } from "./types";

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

export async function saveConnectedAccounts(userId: string, platform: SocialPlatform, accounts: ConnectedAccount[]) {
  const db = await admin();
  for (const a of accounts) {
    const { data: row, error } = await db.from("social_accounts").upsert({
      user_id: userId, platform, external_id: a.profile.externalId, account_name: a.profile.name,
      avatar_url: a.profile.avatarUrl ?? null, status: "connected", token_status: "valid",
      token_expires_at: a.expiresAt?.toISOString() ?? null, scopes: a.scopes, last_sync_at: new Date().toISOString(),
      last_error: null, updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,platform,external_id" }).select("id").single();
    if (error) throw error;
    await db.from("social_tokens").upsert({
      account_id: row.id, access_token_enc: await encryptToken(a.accessToken),
      refresh_token_enc: a.refreshToken ? await encryptToken(a.refreshToken) : null, updated_at: new Date().toISOString(),
    });
  }
}

/** Load decrypted credentials for an account the caller owns, refreshing if near expiry. */
export async function getCredentials(userId: string, accountId: string): Promise<{ platform: SocialPlatform; cred: AccountCredentials }> {
  const db = await admin();
  const { data: acc } = await db.from("social_accounts").select("*").eq("id", accountId).eq("user_id", userId).single();
  if (!acc || acc.status !== "connected") throw new Error("Account is not connected.");
  const { data: tok } = await db.from("social_tokens").select("*").eq("account_id", accountId).single();
  if (!tok) throw new Error("No stored authorization — reconnect this account.");
  let accessToken = await decryptToken(tok.access_token_enc);
  const refresh = tok.refresh_token_enc ? await decryptToken(tok.refresh_token_enc) : null;
  const platform = acc.platform as SocialPlatform;
  if (acc.token_expires_at && new Date(acc.token_expires_at).getTime() < Date.now() + 120_000) {
    if (!refresh) { await markTokenProblem(accountId, "expired", "Authorization expired — reconnect."); throw new Error("Authorization expired — reconnect this account."); }
    try {
      const r = await refreshAccess(platform, refresh);
      accessToken = r.accessToken;
      await db.from("social_tokens").update({ access_token_enc: await encryptToken(r.accessToken), ...(r.refreshToken ? { refresh_token_enc: await encryptToken(r.refreshToken) } : {}), updated_at: new Date().toISOString() }).eq("account_id", accountId);
      await db.from("social_accounts").update({ token_expires_at: r.expiresAt.toISOString(), token_status: "valid" }).eq("id", accountId);
    } catch (e) {
      await markTokenProblem(accountId, "invalid", (e as Error).message);
      throw e;
    }
  }
  return { platform, cred: { accessToken, refreshToken: refresh, externalId: acc.external_id! } };
}

export async function markTokenProblem(accountId: string, tokenStatus: string, err: string) {
  const db = await admin();
  await db.from("social_accounts").update({ token_status: tokenStatus, last_error: err.slice(0, 500) }).eq("id", accountId);
}
