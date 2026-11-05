import { defineHandler } from "void";
import { flagQuery, json, parseInput, readJson, requireHousehold, run } from "../../../src/http";
import { shoppingCreateSchema } from "../../../src/schemas";
import { addShopping, listShopping } from "../../../src/store";

export const GET = defineHandler(async (c) => {
  const denied = await requireHousehold(c);
  if (denied) return denied;
  return run(c, async () => {
    const includeChecked = flagQuery(c.req.query("includeChecked"), "includeChecked", true);
    return json(c, await listShopping(includeChecked));
  });
});

export const POST = defineHandler(async (c) => {
  const denied = await requireHousehold(c);
  if (denied) return denied;
  return run(c, async () => {
    const body = parseInput(shoppingCreateSchema, await readJson(c));
    return json(c, await addShopping(body), 201);
  });
});
