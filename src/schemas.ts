import { z } from "zod";
import { isCalendarDate } from "./dates";

const controlChars = /[\u0000-\u001F\u007F]/;

function atMostThreeDecimals(value: number): boolean {
  return Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-6;
}

export const itemName = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine((value) => !controlChars.test(value), "Control characters are not allowed");

export const itemUnit = z
  .string()
  .trim()
  .min(1)
  .max(24)
  .refine((value) => !controlChars.test(value), "Control characters are not allowed");

export const itemQuantity = z.number().finite().positive().max(100_000).refine(atMostThreeDecimals, "Use at most 3 decimal places");

export const calendarDate = z.string().refine(isCalendarDate, "Use a real calendar date YYYY-MM-DD");

export const optionalQuantity = itemQuantity.nullable().optional();
export const optionalUnit = itemUnit.nullable().optional();

export const inventoryCreateSchema = z
  .object({
    name: itemName,
    quantity: itemQuantity,
    unit: itemUnit,
    expiresOn: calendarDate.nullable().optional(),
  })
  .strict();

const inventoryUpdateFields = z
  .object({
    name: itemName.optional(),
    quantity: itemQuantity.optional(),
    unit: itemUnit.optional(),
    expiresOn: calendarDate.nullable().optional(),
  })
  .strict();

export const inventoryUpdateSchema = inventoryUpdateFields.refine(
  (value) => Object.keys(value).length > 0,
  "Provide at least one field",
);

export const ingredientSchema = z
  .object({
    name: itemName,
    quantity: optionalQuantity,
    unit: optionalUnit,
  })
  .strict();

export const mealCreateSchema = z
  .object({
    title: itemName,
    notes: z.string().trim().max(2000).nullable().optional(),
    servings: z.number().int().min(1).max(50).nullable().optional(),
    ingredients: z.array(ingredientSchema).max(40).optional(),
  })
  .strict();

export const shoppingCreateSchema = z
  .object({
    name: itemName,
    quantity: optionalQuantity,
    unit: optionalUnit,
  })
  .strict();

const shoppingUpdateFields = z
  .object({
    name: itemName.optional(),
    quantity: optionalQuantity,
    unit: optionalUnit,
    checked: z.boolean().optional(),
  })
  .strict();

export const shoppingUpdateSchema = shoppingUpdateFields.refine(
  (value) => Object.keys(value).length > 0,
  "Provide at least one field",
);

export const sessionSchema = z
  .object({
    token: z.string().min(1).max(500),
  })
  .strict();

export const listInventorySchema = z
  .object({
    includeConsumed: z.boolean().optional(),
    expiringWithinDays: z.number().int().min(0).max(365).optional(),
  })
  .strict();

export const idSchema = z.object({ id: z.uuid() }).strict();

export const updateInventoryToolSchema = inventoryUpdateFields
  .extend({ id: z.uuid() })
  .refine((value) => {
    const { id: _id, ...rest } = value;
    return Object.keys(rest).length > 0;
  }, "Provide at least one field");

export const consumeToolSchema = z.object({ id: z.uuid() }).strict();
export const listShoppingSchema = z.object({ includeChecked: z.boolean().optional() }).strict();

export const updateShoppingToolSchema = shoppingUpdateFields
  .extend({ id: z.uuid() })
  .refine((value) => {
    const { id: _id, ...rest } = value;
    return Object.keys(rest).length > 0;
  }, "Provide at least one field");
