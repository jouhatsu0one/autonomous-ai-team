const encoder = new TextEncoder();

export async function verifyHmac(secret: string, payload: Uint8Array<ArrayBuffer>, signature: string) {
  if (!secret || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const bytes = Uint8Array.from(signature.slice(7).match(/../g)!, hex => parseInt(hex, 16));
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
  );
  return crypto.subtle.verify("HMAC", key, bytes, payload);
}

export async function verifyBearer(expected: string | undefined, header: string | null) {
  if (!expected || expected.length < 32 || !header?.startsWith("Bearer ") || header.length > 512) return false;
  const supplied = header.slice(7);
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(expected), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"],
  );
  const message = encoder.encode("dashboard-auth");
  const candidate = await crypto.subtle.importKey(
    "raw", encoder.encode(supplied || "-"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return crypto.subtle.verify("HMAC", key, await crypto.subtle.sign("HMAC", candidate, message), message);
}
