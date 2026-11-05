import { defineHandler } from "void";
import { json, parseInput, readJson, requireHousehold, run } from "../../../src/http";
import { inventoryUpdateSchema } from "../../../src/schemas";
import { updateInventory } from "../../../src/store";
import { z } from "zod";

const idSchema = z.uuid();

export const PATCH = defineHandler(async (c) => {
  const denied = await requireHousehold(c);
  if (denied) return denied;
  return run(c, async () => {
    const id = idSchema.safeParse(c.req.param("id"));
    if (!id.success) return json(c, { error: "validation_failed", message: "id: expected a UUID" }, 400);
    const body = parseInput(inventoryUpdateSchema, await readJson(c));
    return json(c, await updateInventory(id.data, body));
  });
});
