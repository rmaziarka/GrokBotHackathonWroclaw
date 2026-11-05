import { defineHandler, defineHead, type InferProps } from "void";
import { warsawDate } from "../src/dates";
import { accessStatus } from "../src/http";
import { listInventory, listMeals, listShopping, type InventoryRecord, type MealRecord, type ShoppingRecord } from "../src/store";

export type Props = InferProps<typeof loader>;

export const revalidate = 0;

export const head = defineHead(() => ({
  title: "Spiżarnia",
  meta: [
    {
      name: "description",
      content: "Wspólny pulpit lodówki, posiłków i zakupów dla jednego gospodarstwa.",
    },
  ],
}));

export const loader = defineHandler(async (c) => {
  c.header("Cache-Control", "no-store");
  c.header("x-revalidate", "0");
  const access = await accessStatus(c);
  const empty = {
    access,
    today: warsawDate(),
    inventory: [] as InventoryRecord[],
    meals: [] as MealRecord[],
    shopping: [] as ShoppingRecord[],
    storageError: false,
  };
  if (!access.authenticated) return empty;
  try {
    const [inventory, meals, shopping] = await Promise.all([
      listInventory({ includeConsumed: true }),
      listMeals(),
      listShopping(true),
    ]);
    return {
      access,
      today: inventory.today,
      inventory: inventory.items,
      meals: meals.meals,
      shopping: shopping.items,
      storageError: false,
    };
  } catch (error) {
    console.error(JSON.stringify({ message: "dashboard load failed", error: error instanceof Error ? error.message : "unknown" }));
    return { ...empty, storageError: true };
  }
});
