import { defineHandler } from "void";
import { flagQuery, json, parseInput, readJson, requireHousehold, run } from "../../../src/http";
import { inventoryCreateSchema } from "../../../src/schemas";
import { addInventory, listInventory } from "../../../src/store";

export const GET = defineHandler(async (c) => {
  const denied = await requireHousehold(c);
  if (denied) return denied;
  return run(c, async () => {
    const includeConsumed = flagQuery(c.req.query("includeConsumed"), "includeConsumed", false);
    const expiring = c.req.query("expiringWithinDays");
    const expiringWithinDays = expiring === undefined ? undefined : Number(expiring);
    if (expiringWithinDays !== undefined && (!Number.isInteger(expiringWithinDays) || expiringWithinDays < 0 || expiringWithinDays > 365)) {
      return json(c, { error: "validation_failed", message: "expiringWithinDays: expected an integer from 0 to 365" }, 400);
    }
    return json(c, await listInventory({ includeConsumed, expiringWithinDays }));
  });
});

export const POST = defineHandler(async (c) => {
  const denied = await requireHousehold(c);
  if (denied) return denied;
  return run(c, async () => {
    const body = parseInput(inventoryCreateSchema, await readJson(c));
    return json(c, await addInventory(body), 201);
  });
});
