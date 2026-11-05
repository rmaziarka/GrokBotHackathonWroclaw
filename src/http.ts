import type { CloudContext } from "void";
import { z } from "zod";
import { FoodError } from "./errors";
import {
  HOUSEHOLD_COOKIE,
  authorizeBearer,
  authorizeHousehold,
  clearSessionCookie,
  configuredToken,
  createSessionValue,
  hasTokenQuery,
  readCookie,
  sessionCookie,
  tokensMatch,
  verifySessionValue,
} from "./household-auth";

const MAX_BODY_BYTES = 65_536;

type AppContext = CloudContext;

export function json(c: AppContext, body: unknown, status = 200, extra?: Record<string, string>): Response {
  const headers = new Headers(extra);
  headers.set("Cache-Control", "no-store");
  headers.set("x-revalidate", "0");
  return c.json(body, status as 200, Object.fromEntries(headers.entries()));
}

export function isSecureRequest(c: AppContext): boolean {
  const forwarded = c.req.header("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0]?.trim() === "https";
  return new URL(c.req.url).protocol === "https:";
}

function requestFacts(c: AppContext) {
  return {
    configured: configuredToken(c.env.HOUSEHOLD_TOKEN),
    authorization: c.req.header("authorization") ?? null,
    origin: c.req.header("origin") ?? null,
    requestOrigin: new URL(c.req.url).origin,
    hasTokenQuery: hasTokenQuery(new URL(c.req.url)),
  };
}

export async function requireBearer(c: AppContext): Promise<Response | null> {
  const decision = await authorizeBearer(requestFacts(c));
  if (decision.ok) return null;
  return json(c, { error: decision.error }, decision.status);
}

export async function requireHousehold(c: AppContext): Promise<Response | null> {
  const facts = requestFacts(c);
  const decision = await authorizeHousehold({
    ...facts,
    sessionCookie: readCookie(c.req.header("cookie"), HOUSEHOLD_COOKIE),
    method: c.req.method,
  });
  if (decision.ok) return null;
  return json(c, { error: decision.error }, decision.status);
}

export async function readJson(c: AppContext): Promise<unknown> {
  const contentType = c.req.header("content-type");
  if (!contentType || !contentType.toLowerCase().startsWith("application/json")) {
    throw new FoodError(415, "unsupported_media_type", "Content-Type must be application/json");
  }
  const declared = Number(c.req.header("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new FoodError(413, "body_too_large", "Request body is too large");
  }
  const text = await c.req.text();
  if (text.length > MAX_BODY_BYTES) throw new FoodError(413, "body_too_large", "Request body is too large");
  if (text.trim() === "") return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new FoodError(400, "invalid_json", "Request body is not valid JSON");
  }
}

export function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const message = result.error.issues
    .slice(0, 8)
    .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
    .join("; ");
  throw new FoodError(400, "validation_failed", message || "Invalid input");
}

export function flagQuery(value: string | undefined, name: string, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  throw new FoodError(400, "validation_failed", `${name}: expected true or false`);
}

export async function accessStatus(c: AppContext): Promise<{ configured: boolean; authenticated: boolean }> {
  const token = configuredToken(c.env.HOUSEHOLD_TOKEN);
  if (!token) return { configured: false, authenticated: false };
  if (hasTokenQuery(new URL(c.req.url))) return { configured: true, authenticated: false };
  const authorization = c.req.header("authorization");
  if (authorization) {
    const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
    return { configured: true, authenticated: Boolean(match && (await tokensMatch(match[1], token))) };
  }
  const cookie = readCookie(c.req.header("cookie"), HOUSEHOLD_COOKIE);
  return { configured: true, authenticated: Boolean(cookie && (await verifySessionValue(token, cookie))) };
}

export async function login(c: AppContext, token: string): Promise<Response> {
  if (hasTokenQuery(new URL(c.req.url))) return json(c, { error: "token_in_url" }, 400);
  const origin = c.req.header("origin");
  if (origin && origin !== new URL(c.req.url).origin) return json(c, { error: "cross_origin" }, 403);
  const configured = configuredToken(c.env.HOUSEHOLD_TOKEN);
  if (!configured) return json(c, { error: "household_access_unconfigured" }, 503);
  if (!(await tokensMatch(token, configured))) return json(c, { error: "unauthorized" }, 401);
  const secure = isSecureRequest(c);
  return json(c, { authenticated: true }, 200, { "Set-Cookie": sessionCookie(await createSessionValue(configured), secure) });
}

export function logout(c: AppContext): Response {
  if (hasTokenQuery(new URL(c.req.url))) return json(c, { error: "token_in_url" }, 400);
  const origin = c.req.header("origin");
  if (origin && origin !== new URL(c.req.url).origin) return json(c, { error: "cross_origin" }, 403);
  return json(c, { authenticated: false }, 200, { "Set-Cookie": clearSessionCookie(isSecureRequest(c)) });
}

export async function run(c: AppContext, action: () => Promise<Response>): Promise<Response> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof FoodError) return json(c, { error: error.code, message: error.message }, error.status);
    console.error(JSON.stringify({ message: "request failed", error: error instanceof Error ? error.message : "unknown" }));
    return json(c, { error: "internal" }, 500);
  }
}
