import { describe, expect, test } from "bun:test";
import { addCalendarDays, expiryState, isCalendarDate, warsawDate } from "../src/dates";
import {
  authorizeBearer,
  authorizeHousehold,
  configuredToken,
  createSessionValue,
  hasTokenQuery,
  verifySessionValue,
} from "../src/household-auth";
import { inventoryCreateSchema, mealCreateSchema } from "../src/schemas";

const token = "household-token-value";

describe("household access", () => {
  test("treats a missing or short token as unconfigured", () => {
    expect(configuredToken(undefined)).toBeNull();
    expect(configuredToken("")).toBeNull();
    expect(configuredToken("too-short")).toBeNull();
    expect(configuredToken(token)).toBe(token);
  });

  test("rejects secrets placed in the query string", () => {
    expect(hasTokenQuery(new URL("https://app.example/api/inventory?token=abc"))).toBe(true);
    expect(hasTokenQuery(new URL("https://app.example/mcp?access_token=abc"))).toBe(true);
    expect(hasTokenQuery(new URL("https://app.example/api/inventory"))).toBe(false);
  });

  test("signs a session that does not contain the household token", async () => {
    const now = 1_700_000_000;
    const value = await createSessionValue(token, now);
    expect(value.includes(token)).toBe(false);
    expect(await verifySessionValue(token, value, now + 10)).toBe(true);
    expect(await verifySessionValue("another-household-token", value, now + 10)).toBe(false);
    expect(await verifySessionValue(token, value, now + 60 * 60 * 24 * 8)).toBe(false);
  });

  test("denies private access when unconfigured, wrong, or cross-origin", async () => {
    const base = {
      configured: token,
      authorization: null,
      sessionCookie: null,
      method: "GET",
      origin: null,
      requestOrigin: "http://127.0.0.1:5191",
      hasTokenQuery: false,
    };
    expect(await authorizeHousehold({ ...base, configured: null })).toMatchObject({
      status: 503,
      error: "household_access_unconfigured",
    });
    expect(await authorizeBearer({ ...base, authorization: "Bearer wrong-token-value" })).toMatchObject({
      status: 401,
    });
    expect(await authorizeHousehold({ ...base, hasTokenQuery: true, authorization: `Bearer ${token}` })).toMatchObject({
      status: 400,
      error: "token_in_url",
    });
    const session = await createSessionValue(token);
    expect(await authorizeHousehold({ ...base, sessionCookie: session, method: "POST", origin: "https://evil.example" })).toMatchObject({
      status: 403,
      error: "cross_origin",
    });
    expect(await authorizeBearer({ ...base, authorization: `Bearer ${token}` })).toEqual({ ok: true });
    expect(await authorizeHousehold({ ...base, sessionCookie: session })).toEqual({ ok: true });
  });
});

describe("Poland calendar dates", () => {
  test("uses the Warsaw calendar day across CET and CEST midnights", () => {
    expect(warsawDate(new Date("2026-01-15T23:30:00.000Z"))).toBe("2026-01-16");
    expect(warsawDate(new Date("2026-07-15T21:30:00.000Z"))).toBe("2026-07-15");
    expect(warsawDate(new Date("2026-07-15T22:30:00.000Z"))).toBe("2026-07-16");
  });

  test("rejects impossible dates and compares expiry without timezone shifts", () => {
    expect(isCalendarDate("2024-02-29")).toBe(true);
    expect(isCalendarDate("2026-02-29")).toBe(false);
    expect(isCalendarDate("2026-11-31")).toBe(false);
    expect(addCalendarDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(expiryState("2026-11-04", "2026-11-05")).toBe("expired");
    expect(expiryState("2026-11-05", "2026-11-05")).toBe("today");
    expect(expiryState("2026-11-07", "2026-11-05")).toBe("soon");
    expect(expiryState("2026-12-01", "2026-11-05")).toBe("ok");
  });
});

describe("input validation", () => {
  test("rejects unsafe inventory and meal payloads", () => {
    expect(inventoryCreateSchema.safeParse({ name: "Mleko", quantity: -1, unit: "l" }).success).toBe(false);
    expect(inventoryCreateSchema.safeParse({ name: "Mleko", quantity: 1, unit: "l", expiresOn: "2026-02-31" }).success).toBe(false);
    expect(inventoryCreateSchema.safeParse({ name: "Mle\u0000ko", quantity: 1, unit: "l" }).success).toBe(false);
    expect(inventoryCreateSchema.safeParse({ name: "Mleko", quantity: 1, unit: "l", extra: true }).success).toBe(false);
    expect(mealCreateSchema.safeParse({ title: "Zupa", servings: 0 }).success).toBe(false);
    expect(inventoryCreateSchema.safeParse({ name: "Mleko", quantity: 1.25, unit: "l", expiresOn: "2026-11-08" }).success).toBe(true);
  });
});
