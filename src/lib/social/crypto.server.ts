// AES-256-GCM encryption for OAuth tokens. Key never leaves the server.
const enc = new TextEncoder();
let keyPromise: Promise<CryptoKey> | undefined;

function getKey() {
  const raw = process.env['SOCIAL_TOKEN_ENCRYPTION_KEY'];
  if (!raw) throw new Error("SOCIAL_TOKEN_ENCRYPTION_KEY is not configured");
  keyPromise ??= crypto.subtle.digest("SHA-256", enc.encode(raw)).then((h) =>
    crypto.subtle.importKey("raw", h, "AES-GCM", false, ["encrypt", "decrypt"]));
  return keyPromise;
}

const b64 = (b: Uint8Array) => Buffer.from(b).toString("base64");

export async function encryptToken(plain: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await getKey(), enc.encode(plain)));
  return `v1:${b64(iv)}:${b64(ct)}`;
}

export async function decryptToken(blob: string) {
  const [, iv, ct] = blob.split(":");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: Buffer.from(iv!, "base64") }, await getKey(), Buffer.from(ct!, "base64"));
  return new TextDecoder().decode(pt);
}
