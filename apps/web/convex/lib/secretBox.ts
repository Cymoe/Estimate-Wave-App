// A secret kept so it can be read back: AES-GCM on Web Crypto, keyed by the
// MAILBOX_KEY environment variable (32 random bytes, base64). Used for the
// Gmail refresh token, which Google needs back in full, unlike the hashed
// tokens of lib/oauth.ts. A value is "v1.<iv>.<ciphertext>", base64url.

const b64url = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64 = (s: string) => {
  const std = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(std + "=".repeat((4 - (std.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

/** Whether a key is set: without one nothing can be stored, and connecting says so. */
export const hasKey = (env: Record<string, string | undefined> = process.env) => Boolean(env.MAILBOX_KEY);

async function keyOf(secret = process.env.MAILBOX_KEY): Promise<CryptoKey> {
  if (!secret) throw new Error("MAILBOX_KEY isn't set on the deployment");
  const raw = fromB64(secret);
  if (raw.length !== 32) throw new Error("MAILBOX_KEY must be 32 bytes, base64");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function seal(plain: string, secret?: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const box = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await keyOf(secret), new TextEncoder().encode(plain)));
  return `v1.${b64url(iv)}.${b64url(box)}`;
}

export async function open(sealed: string, secret?: string): Promise<string> {
  const [version, iv, box] = sealed.split(".");
  if (version !== "v1" || !iv || !box) throw new Error("Not a sealed value");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(iv) }, await keyOf(secret), fromB64(box));
  return new TextDecoder().decode(plain);
}
