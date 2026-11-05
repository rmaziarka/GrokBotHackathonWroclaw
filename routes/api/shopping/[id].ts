import { defineHandler } from "void";
import { json, parseInput, readJson, requireHousehold, run } from "../../../src/http";
import { shoppingUpdateSchema } from "../../../src/schemas";
import { updateShopping } from "../../../src/store";
import { z } from "zod";

const idSchema = z.uuid();

export const PATCH = defineHandler(async (c) => {
  const denied = await requireHousehold(c);
  if (denied) return denied;
  return run(c, async () => {
    const id = idSchema.safeParse(c.req.param("id"));
    if (!id.success) return json(c, { error: "validation_failed", message: "id: expected a UUID" }, 400);
    const body = parseInput(shoppingUpdateSchema, await readJson(c));
    return json(c, await updateShopping(id.data, body));
  });
});
