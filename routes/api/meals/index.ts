import { defineHandler } from "void";
import { json, parseInput, readJson, requireHousehold, run } from "../../../src/http";
import { mealCreateSchema } from "../../../src/schemas";
import { listMeals, saveMeal } from "../../../src/store";

export const GET = defineHandler(async (c) => {
  const denied = await requireHousehold(c);
  if (denied) return denied;
  return run(c, async () => json(c, await listMeals()));
});

export const POST = defineHandler(async (c) => {
  const denied = await requireHousehold(c);
  if (denied) return denied;
  return run(c, async () => {
    const body = parseInput(mealCreateSchema, await readJson(c));
    return json(c, await saveMeal({ ...body, source: "ui" }), 201);
  });
});
