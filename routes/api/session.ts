import { defineHandler } from "void";
import { accessStatus, json, login, logout, parseInput, readJson, run } from "../../src/http";
import { sessionSchema } from "../../src/schemas";

export const GET = defineHandler(async (c) => {
  return json(c, await accessStatus(c));
});

export const POST = defineHandler(async (c) => {
  return run(c, async () => {
    const body = parseInput(sessionSchema, await readJson(c));
    return login(c, body.token);
  });
});

export const DELETE = defineHandler((c) => logout(c));
