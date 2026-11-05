import { inventoryItems, mealIngredients, mealSuggestions, shoppingItems } from "@schema";
import { and, eq, isNull } from "void/db";
import { db } from "void/db";
import { addCalendarDays, expiryState, warsawDate, type ExpiryState } from "./dates";
import { FoodError } from "./errors";

type InventoryInsert = {
  name: string;
  quantity: number;
  unit: string;
  expiresOn?: string | null;
  isExample?: boolean;
  id?: string;
};

type InventoryPatch = {
  name?: string;
  quantity?: number;
  unit?: string;
  expiresOn?: string | null;
};

type IngredientInput = {
  name: string;
  quantity?: number | null;
  unit?: string | null;
};

type MealInsert = {
  title: string;
  notes?: string | null;
  servings?: number | null;
  ingredients?: IngredientInput[];
  source: "ui" | "mcp";
};

type ShoppingInsert = {
  name: string;
  quantity?: number | null;
  unit?: string | null;
};

type ShoppingPatch = {
  name?: string;
  quantity?: number | null;
  unit?: string | null;
  checked?: boolean;
};

export type InventoryRecord = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  expiresOn: string | null;
  consumedAt: string | null;
  isExample: boolean;
  expiryState: ExpiryState;
  createdAt: string;
  updatedAt: string;
};

export type MealRecord = {
  id: string;
  title: string;
  notes: string | null;
  servings: number | null;
  source: "ui" | "mcp";
  createdAt: string;
  ingredients: Array<{ id: string; name: string; quantity: number | null; unit: string | null }>;
};

export type ShoppingRecord = {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  checked: boolean;
  createdAt: string;
  updatedAt: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function mapInventory(row: typeof inventoryItems.$inferSelect, today: string): InventoryRecord {
  return {
    id: row.id,
    name: row.name,
    quantity: asNumber(row.quantity) ?? 0,
    unit: row.unit,
    expiresOn: row.expiresOn,
    consumedAt: row.consumedAt,
    isExample: row.isExample === 1,
    expiryState: expiryState(row.expiresOn, today),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listInventory(options: { includeConsumed?: boolean; expiringWithinDays?: number } = {}): Promise<{
  today: string;
  timeZone: "Europe/Warsaw";
  items: InventoryRecord[];
}> {
  const today = warsawDate();
  const query = db.select().from(inventoryItems);
  const rows = await (options.includeConsumed ? query : query.where(isNull(inventoryItems.consumedAt)));
  let items = rows.map((row) => mapInventory(row, today));
  items.sort((a, b) => {
    if (a.expiresOn === b.expiresOn) return a.name.localeCompare(b.name, "pl");
    if (a.expiresOn === null) return 1;
    if (b.expiresOn === null) return -1;
    return a.expiresOn < b.expiresOn ? -1 : 1;
  });
  if (!options.includeConsumed) items = items.filter((item) => item.consumedAt === null);
  if (options.expiringWithinDays !== undefined) {
    const limit = addCalendarDays(today, options.expiringWithinDays);
    items = items.filter((item) => item.expiresOn !== null && item.expiresOn <= limit);
  }
  return { today, timeZone: "Europe/Warsaw", items };
}

export async function addInventory(input: InventoryInsert): Promise<InventoryRecord> {
  const today = warsawDate();
  const timestamp = nowIso();
  const id = input.id ?? crypto.randomUUID();
  await db
    .insert(inventoryItems)
    .values({
      id,
      name: input.name,
      quantity: input.quantity,
      unit: input.unit,
      expiresOn: input.expiresOn ?? null,
      consumedAt: null,
      isExample: input.isExample ? 1 : 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoNothing();
  const [row] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
  if (!row) throw new FoodError(500, "internal", "Could not save the inventory item");
  return mapInventory(row, today);
}

export async function updateInventory(id: string, patch: InventoryPatch): Promise<InventoryRecord> {
  const [existing] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
  if (!existing) throw new FoodError(404, "not_found", "Inventory item was not found");
  if (existing.consumedAt) throw new FoodError(409, "already_consumed", "Consumed items cannot be edited");
  const timestamp = nowIso();
  await db
    .update(inventoryItems)
    .set({
      name: patch.name ?? existing.name,
      quantity: patch.quantity ?? asNumber(existing.quantity) ?? 0,
      unit: patch.unit ?? existing.unit,
      expiresOn: patch.expiresOn === undefined ? existing.expiresOn : patch.expiresOn,
      updatedAt: timestamp,
    })
    .where(eq(inventoryItems.id, id));
  const [row] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
  if (!row) throw new FoodError(404, "not_found", "Inventory item was not found");
  return mapInventory(row, warsawDate());
}

export async function consumeInventory(id: string): Promise<InventoryRecord> {
  const [existing] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
  if (!existing) throw new FoodError(404, "not_found", "Inventory item was not found");
  if (!existing.consumedAt) {
    await db
      .update(inventoryItems)
      .set({ consumedAt: nowIso(), updatedAt: nowIso() })
      .where(and(eq(inventoryItems.id, id), isNull(inventoryItems.consumedAt)));
  }
  const [row] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
  if (!row) throw new FoodError(404, "not_found", "Inventory item was not found");
  return mapInventory(row, warsawDate());
}

const EXAMPLE_ITEMS = [
  { id: "example-mleko", name: "Mleko (przykład)", quantity: 1, unit: "l", days: 3 },
  { id: "example-jajka", name: "Jajka (przykład)", quantity: 10, unit: "szt", days: 12 },
  { id: "example-maslo", name: "Masło (przykład)", quantity: 200, unit: "g", days: 21 },
  { id: "example-pomidory", name: "Pomidory (przykład)", quantity: 4, unit: "szt", days: -1 },
] as const;

export async function insertExampleInventory(): Promise<InventoryRecord[]> {
  const today = warsawDate();
  for (const item of EXAMPLE_ITEMS) {
    await addInventory({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      expiresOn: addCalendarDays(today, item.days),
      isExample: true,
    });
  }
  const listed = await listInventory({ includeConsumed: true });
  return listed.items.filter((item) => item.isExample);
}

export async function listMeals(): Promise<{ meals: MealRecord[] }> {
  const meals = await db.select().from(mealSuggestions);
  meals.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const ingredients = meals.length ? await db.select().from(mealIngredients) : [];
  ingredients.sort((a, b) => a.position - b.position);
  return {
    meals: meals.map((meal) => ({
      id: meal.id,
      title: meal.title,
      notes: meal.notes,
      servings: meal.servings,
      source: meal.source === "mcp" ? "mcp" : "ui",
      createdAt: meal.createdAt,
      ingredients: ingredients
        .filter((ingredient) => ingredient.mealId === meal.id)
        .map((ingredient) => ({
          id: ingredient.id,
          name: ingredient.name,
          quantity: asNumber(ingredient.quantity),
          unit: ingredient.unit,
        })),
    })),
  };
}

export async function saveMeal(input: MealInsert): Promise<MealRecord> {
  const id = crypto.randomUUID();
  const createdAt = nowIso();
  const ingredients = input.ingredients ?? [];
  await db.insert(mealSuggestions).values({
    id,
    title: input.title,
    notes: input.notes ?? null,
    servings: input.servings ?? null,
    source: input.source,
    createdAt,
  });
  if (ingredients.length > 0) {
    try {
      await db.insert(mealIngredients).values(
        ingredients.map((ingredient, position) => ({
          id: crypto.randomUUID(),
          mealId: id,
          position,
          name: ingredient.name,
          quantity: ingredient.quantity ?? null,
          unit: ingredient.unit ?? null,
        })),
      );
    } catch (error) {
      await db.delete(mealSuggestions).where(eq(mealSuggestions.id, id));
      throw error;
    }
  }
  const listed = await listMeals();
  const saved = listed.meals.find((meal) => meal.id === id);
  if (!saved) throw new FoodError(500, "internal", "Could not save the meal");
  return saved;
}

export async function listShopping(includeChecked = true): Promise<{ items: ShoppingRecord[] }> {
  const rows = await db.select().from(shoppingItems);
  const items = rows
    .filter((row) => includeChecked || row.checked === 0)
    .map((row) => ({
      id: row.id,
      name: row.name,
      quantity: asNumber(row.quantity),
      unit: row.unit,
      checked: row.checked === 1,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  items.sort((a, b) => {
    if (a.checked !== b.checked) return a.checked ? 1 : -1;
    return a.name.localeCompare(b.name, "pl");
  });
  return { items };
}

export async function addShopping(input: ShoppingInsert): Promise<ShoppingRecord> {
  const timestamp = nowIso();
  const id = crypto.randomUUID();
  await db.insert(shoppingItems).values({
    id,
    name: input.name,
    quantity: input.quantity ?? null,
    unit: input.unit ?? null,
    checked: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  const listed = await listShopping(true);
  const saved = listed.items.find((item) => item.id === id);
  if (!saved) throw new FoodError(500, "internal", "Could not save the shopping item");
  return saved;
}

export async function updateShopping(id: string, patch: ShoppingPatch): Promise<ShoppingRecord> {
  const [existing] = await db.select().from(shoppingItems).where(eq(shoppingItems.id, id));
  if (!existing) throw new FoodError(404, "not_found", "Shopping item was not found");
  await db
    .update(shoppingItems)
    .set({
      name: patch.name ?? existing.name,
      quantity: patch.quantity === undefined ? existing.quantity : patch.quantity,
      unit: patch.unit === undefined ? existing.unit : patch.unit,
      checked: patch.checked === undefined ? existing.checked : patch.checked ? 1 : 0,
      updatedAt: nowIso(),
    })
    .where(eq(shoppingItems.id, id));
  const listed = await listShopping(true);
  const saved = listed.items.find((item) => item.id === id);
  if (!saved) throw new FoodError(404, "not_found", "Shopping item was not found");
  return saved;
}
