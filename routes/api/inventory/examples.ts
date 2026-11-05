import { defineHandler } from "void";
import { json, requireHousehold, run } from "../../../src/http";
import { insertExampleInventory } from "../../../src/store";

export const POST = defineHandler(async (c) => {
  const denied = await requireHousehold(c);
  if (denied) return denied;
  return run(c, async () => json(c, { items: await insertExampleInventory() }));
});
