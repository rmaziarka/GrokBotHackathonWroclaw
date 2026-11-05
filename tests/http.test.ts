import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const token = "integration-test-household-token";
const port = 5191;

type RunningServer = {
  base: string;
  persist: string;
  stop: () => Promise<void>;
  output: () => string;
};

let server: RunningServer;
const marker = `test-${crypto.randomUUID().slice(0, 8)}`;

async function startServer(listenPort: number, householdToken: string, persist?: string): Promise<RunningServer> {
  const directory = persist ?? (await mkdtemp(join(tmpdir(), "spizarnia-d1-")));
  const child = Bun.spawn(["bun", "run", "dev", "--", "--host", "127.0.0.1", "--port", String(listenPort), "--strictPort"], {
    cwd: root,
    env: { ...process.env, HOUSEHOLD_TOKEN: householdToken, FOOD_D1_PERSIST: directory },
    stdout: "pipe",
    stderr: "pipe",
  });
  let stopped = false;
  const chunks: string[] = [];
  const collect = async (stream: ReadableStream<Uint8Array> | null) => {
    if (!stream) return;
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      chunks.push(decoder.decode(next.value));
    }
  };
  void collect(child.stdout);
  void collect(child.stderr);
  const base = `http://127.0.0.1:${listenPort}`;
  const started = Date.now();
  let last = "no response";
  while (Date.now() - started < 90_000) {
    if (child.exitCode !== null) break;
    try {
      const response = await fetch(`${base}/api/hello`);
      if (response.ok) {
        return {
          base,
          persist: directory,
          output: () => chunks.join("").slice(-4000),
          stop: async () => {
            if (stopped) return;
            stopped = true;
            child.kill();
            await child.exited;
          },
        };
      }
      last = `status ${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : "connection failed";
    }
    await Bun.sleep(300);
  }
  child.kill();
  await child.exited;
  throw new Error(`Dev server did not start (${last})\n${chunks.join("").slice(-4000)}`);
}

async function readJson(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Expected JSON, got ${response.status}: ${text.slice(0, 500)}`);
  }
}

async function mcp(base: string, householdToken: string | null, message: Record<string, unknown>) {
  const headers = new Headers({
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  });
  if (householdToken) headers.set("authorization", `Bearer ${householdToken}`);
  const response = await fetch(`${base}/mcp`, { method: "POST", headers, body: JSON.stringify(message) });
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  let payload: unknown = text;
  if (contentType.includes("application/json")) payload = JSON.parse(text);
  else {
    const data = text
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);
    payload = data.length > 0 ? JSON.parse(data[data.length - 1] ?? "") : text;
  }
  return { response, payload, text };
}

function toolValue(payload: unknown) {
  const result = (payload as { result?: { isError?: boolean; content?: Array<{ text?: string }> } }).result;
  if (!result || result.isError) throw new Error(JSON.stringify(payload));
  return JSON.parse(result.content?.[0]?.text ?? "{}") as Record<string, unknown>;
}

beforeAll(async () => {
  server = await startServer(port, token);
}, 100_000);

afterAll(async () => {
  await server?.stop();
  if (server?.persist) await rm(server.persist, { recursive: true, force: true });
});

test("private APIs and MCP share D1 and reject bad access", async () => {
  const open = await fetch(`${server.base}/api/inventory`);
  expect(open.status).toBe(401);

  const hello = await fetch(`${server.base}/api/hello`);
  expect(hello.status).toBe(200);

  const wrong = await fetch(`${server.base}/api/inventory`, { headers: { authorization: "Bearer wrong-token-value" } });
  expect(wrong.status).toBe(401);

  const tokenInUrl = await fetch(`${server.base}/api/inventory?token=${token}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(tokenInUrl.status).toBe(400);

  const login = await fetch(`${server.base}/api/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  expect(login.status).toBe(200);
  const setCookie = login.headers.get("set-cookie") ?? "";
  expect(setCookie.toLowerCase()).toContain("httponly");
  expect(setCookie).not.toContain(token);
  const cookie = setCookie.split(";")[0] ?? "";

  const sessionRead = await fetch(`${server.base}/api/inventory`, { headers: { cookie } });
  expect(sessionRead.status).toBe(200);

  const crossOrigin = await fetch(`${server.base}/api/inventory`, {
    method: "POST",
    headers: { cookie, origin: "https://evil.example", "content-type": "application/json" },
    body: JSON.stringify({ name: "Obcy", quantity: 1, unit: "szt" }),
  });
  expect(crossOrigin.status).toBe(403);

  const invalid = await fetch(`${server.base}/api/inventory`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ name: `${marker}-zly`, quantity: -1, unit: "szt" }),
  });
  expect(invalid.status).toBe(400);

  const createdResponse = await fetch(`${server.base}/api/inventory`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ name: `${marker} mleko`, quantity: 1, unit: "l", expiresOn: "2026-11-20" }),
  });
  expect(createdResponse.status).toBe(201);
  const created = await readJson(createdResponse);
  const id = String(created.id);

  const reloaded = await fetch(`${server.base}/api/inventory`, { headers: { authorization: `Bearer ${token}` } });
  const reloadedBody = await readJson(reloaded);
  const items = reloadedBody.items as Array<{ id: string; name: string }>;
  expect(items.some((item) => item.id === id)).toBe(true);

  const initialized = await mcp(server.base, token, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "spizarnia-test", version: "1.0.0" } },
  });
  expect(initialized.response.status).toBe(200);
  expect(JSON.stringify(initialized.payload)).toContain("protocolVersion");

  const listedTools = await mcp(server.base, token, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  expect(listedTools.response.status).toBe(200);
  const names = ((listedTools.payload as { result?: { tools?: Array<{ name: string }> } }).result?.tools ?? []).map((tool) => tool.name);
  expect(names).toEqual(expect.arrayContaining(["list_inventory", "save_meal_suggestion", "add_shopping_item"]));

  const anonymousMcp = await mcp(server.base, null, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "x", version: "0" } } });
  expect(anonymousMcp.response.status).toBe(401);

  const cookieMcp = await fetch(`${server.base}/mcp`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  expect(cookieMcp.status).toBe(401);

  const fromMcp = toolValue(
    (
      await mcp(server.base, token, {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "list_inventory", arguments: {} },
      })
    ).payload,
  );
  expect((fromMcp.items as Array<{ id: string }>).some((item) => item.id === id)).toBe(true);

  const badTool = await mcp(server.base, token, {
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "add_inventory_item", arguments: { name: `${marker} bad`, quantity: -5, unit: "szt" } },
  });
  expect(badTool.response.status).toBeLessThan(500);
  const badResult = (badTool.payload as { result?: { isError?: boolean }; error?: unknown }).result;
  expect(badResult?.isError || (badTool.payload as { error?: unknown }).error).toBeTruthy();

  toolValue(
    (
      await mcp(server.base, token, {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "update_inventory_item", arguments: { id, quantity: 2, unit: "l" } },
      })
    ).payload,
  );
  const edited = await readJson(await fetch(`${server.base}/api/inventory`, { headers: { authorization: `Bearer ${token}` } }));
  expect((edited.items as Array<{ id: string; quantity: number }>).find((item) => item.id === id)?.quantity).toBe(2);

  const meal = toolValue(
    (
      await mcp(server.base, token, {
        jsonrpc: "2.0",
        id: 6,
        method: "tools/call",
        params: {
          name: "save_meal_suggestion",
          arguments: { title: `${marker} zupa`, ingredients: [{ name: "Mleko", quantity: 0.2, unit: "l" }] },
        },
      })
    ).payload,
  );
  const meals = await readJson(await fetch(`${server.base}/api/meals`, { headers: { authorization: `Bearer ${token}` } }));
  expect((meals.meals as Array<{ id: string; source: string }>).some((item) => item.id === meal.id && item.source === "mcp")).toBe(true);

  const manualMeal = await fetch(`${server.base}/api/meals`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ title: `${marker} recznie`, ingredients: [] }),
  });
  expect(manualMeal.status).toBe(201);

  const shopping = await fetch(`${server.base}/api/shopping`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ name: `${marker} chleb`, quantity: 1, unit: "szt" }),
  });
  expect(shopping.status).toBe(201);
  const shoppingBody = await readJson(shopping);
  const shoppingFromMcp = toolValue(
    (
      await mcp(server.base, token, {
        jsonrpc: "2.0",
        id: 7,
        method: "tools/call",
        params: { name: "list_shopping_items", arguments: {} },
      })
    ).payload,
  );
  expect((shoppingFromMcp.items as Array<{ id: string }>).some((item) => item.id === shoppingBody.id)).toBe(true);

  const checked = await fetch(`${server.base}/api/shopping/${shoppingBody.id}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ checked: true }),
  });
  expect(checked.status).toBe(200);

  const consumed = await fetch(`${server.base}/api/inventory/${id}/consume`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  expect(consumed.status).toBe(200);
  const active = await readJson(await fetch(`${server.base}/api/inventory`, { headers: { authorization: `Bearer ${token}` } }));
  expect((active.items as Array<{ id: string }>).some((item) => item.id === id)).toBe(false);
  const history = await readJson(
    await fetch(`${server.base}/api/inventory?includeConsumed=true`, { headers: { authorization: `Bearer ${token}` } }),
  );
  expect((history.items as Array<{ id: string; consumedAt: string | null }>).find((item) => item.id === id)?.consumedAt).toBeTruthy();
}, 40_000);

test("the same D1 file is still there after the dev server restarts", async () => {
  const persist = server.persist;
  await server.stop();
  server = await startServer(port, token, persist);
  const history = await readJson(
    await fetch(`${server.base}/api/inventory?includeConsumed=true`, { headers: { authorization: `Bearer ${token}` } }),
  );
  expect((history.items as Array<{ name: string }>).some((item) => item.name === `${marker} mleko`)).toBe(true);
}, 100_000);

test("an unconfigured household token denies inventory and MCP", async () => {
  const denied = await startServer(5192, "too-short");
  try {
    const inventory = await fetch(`${denied.base}/api/inventory`);
    expect(inventory.status).toBe(503);
    const mcpResponse = await mcp(denied.base, "too-short", {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "x", version: "0" } },
    });
    expect(mcpResponse.response.status).toBe(503);
  } finally {
    await denied.stop();
    await rm(denied.persist, { recursive: true, force: true });
  }
}, 100_000);
