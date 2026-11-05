export const HOUSEHOLD_COOKIE = "household_session";
export const MIN_TOKEN_LENGTH = 16;
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const TOKEN_QUERY_KEYS = ["token", "access_token", "api_key", "household_token"];

export type AccessFailure = {
  ok: false;
  status: 400 | 401 | 403 | 503;
  error: "token_in_url" | "household_access_unconfigured" | "unauthorized" | "cross_origin";
};

export function configuredToken(value: string | undefined | null): string | null {
  if (typeof value !== "string" || value.length < MIN_TOKEN_LENGTH) return null;
  return value;
}

export function hasTokenQuery(url: URL): boolean {
  for (const key of TOKEN_QUERY_KEYS) {
    if (url.searchParams.has(key)) return true;
  }
  return false;
}

function viewBytes(value: BufferSource): Uint8Array {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

function timingSafeEqual(left: BufferSource, right: BufferSource): boolean {
  const subtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual?: (a: BufferSource, b: BufferSource) => boolean;
  };
  if (subtle.timingSafeEqual) return subtle.timingSafeEqual(left, right);
  const a = viewBytes(left);
  const b = viewBytes(right);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return diff === 0;
}

export async function tokensMatch(provided: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  return timingSafeEqual(providedHash, expectedHash);
}

function bytesToBase64Url(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function sign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return bytesToBase64Url(signature);
}

async function signaturesMatch(provided: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const providedBytes = encoder.encode(provided);
  const expectedBytes = encoder.encode(expected);
  if (providedBytes.byteLength !== expectedBytes.byteLength) return false;
  return timingSafeEqual(providedBytes, expectedBytes);
}

export async function createSessionValue(token: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
  const exp = nowSeconds + SESSION_TTL_SECONDS;
  const payload = `v1.${exp}`;
  return `${payload}.${await sign(token, payload)}`;
}

export async function verifySessionValue(
  token: string,
  value: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const [version, expText, signature] = parts;
  if (version !== "v1" || !expText || !signature || !/^\d+$/.test(expText)) return false;
  const exp = Number(expText);
  if (!Number.isSafeInteger(exp) || exp <= nowSeconds || exp > nowSeconds + SESSION_TTL_SECONDS + 60) return false;
  const expected = await sign(token, `v1.${expText}`);
  return signaturesMatch(signature, expected);
}

export function readCookie(header: string | undefined | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    const raw = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return null;
    }
  }
  return null;
}

export function sessionCookie(value: string, secure: boolean, maxAge = SESSION_TTL_SECONDS): string {
  const parts = [
    `${HOUSEHOLD_COOKIE}=${encodeURIComponent(value)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie(secure: boolean): string {
  return sessionCookie("", secure, 0);
}

function bearerToken(authorization: string | null): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
  return match?.[1] ?? null;
}

function originAllowed(origin: string | null, requestOrigin: string): boolean {
  if (!origin) return true;
  return origin === requestOrigin;
}

export async function authorizeBearer(input: {
  configured: string | null;
  authorization: string | null;
  origin: string | null;
  requestOrigin: string;
  hasTokenQuery: boolean;
}): Promise<{ ok: true } | AccessFailure> {
  if (input.hasTokenQuery) return { ok: false, status: 400, error: "token_in_url" };
  if (!input.configured) return { ok: false, status: 503, error: "household_access_unconfigured" };
  if (!originAllowed(input.origin, input.requestOrigin)) return { ok: false, status: 403, error: "cross_origin" };
  const presented = bearerToken(input.authorization);
  if (!presented || !(await tokensMatch(presented, input.configured))) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  return { ok: true };
}

export async function authorizeHousehold(input: {
  configured: string | null;
  authorization: string | null;
  sessionCookie: string | null;
  method: string;
  origin: string | null;
  requestOrigin: string;
  hasTokenQuery: boolean;
}): Promise<{ ok: true } | AccessFailure> {
  if (input.hasTokenQuery) return { ok: false, status: 400, error: "token_in_url" };
  if (!input.configured) return { ok: false, status: 503, error: "household_access_unconfigured" };
  if (input.authorization) {
    const presented = bearerToken(input.authorization);
    if (!presented || !(await tokensMatch(presented, input.configured))) {
      return { ok: false, status: 401, error: "unauthorized" };
    }
    return { ok: true };
  }
  if (input.sessionCookie && (await verifySessionValue(input.configured, input.sessionCookie))) {
    const unsafe = input.method !== "GET" && input.method !== "HEAD";
    if (unsafe && !originAllowed(input.origin, input.requestOrigin)) {
      return { ok: false, status: 403, error: "cross_origin" };
    }
    return { ok: true };
  }
  return { ok: false, status: 401, error: "unauthorized" };
}
