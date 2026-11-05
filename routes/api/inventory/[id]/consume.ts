import { defineHandler } from "void";
import { json, requireHousehold, run } from "../../../../src/http";
import { consumeInventory } from "../../../../src/store";
import { z } from "zod";

const idSchema = z.uuid();

export const POST = defineHandler(async (c) => {
  const denied = await requireHousehold(c);
  if (denied) return denied;
  return run(c, async () => {
    const id = idSchema.safeParse(c.req.param("id"));
    if (!id.success) return json(c, { error: "validation_failed", message: "id: expected a UUID" }, 400);
    return json(c, await consumeInventory(id.data));
  });
});
