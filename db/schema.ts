import { integer, real, sqliteTable, text } from "void/schema-d1";

export const inventoryItems = sqliteTable("inventory_items", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  quantity: real("quantity").notNull(),
  unit: text("unit").notNull(),
  expiresOn: text("expires_on"),
  consumedAt: text("consumed_at"),
  isExample: integer("is_example").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const mealSuggestions = sqliteTable("meal_suggestions", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  notes: text("notes"),
  servings: integer("servings"),
  source: text("source").notNull(),
  createdAt: text("created_at").notNull(),
});

export const mealIngredients = sqliteTable("meal_ingredients", {
  id: text("id").primaryKey(),
  mealId: text("meal_id")
    .notNull()
    .references(() => mealSuggestions.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  name: text("name").notNull(),
  quantity: real("quantity"),
  unit: text("unit"),
});

export const shoppingItems = sqliteTable("shopping_items", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  quantity: real("quantity"),
  unit: text("unit"),
  checked: integer("checked").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
