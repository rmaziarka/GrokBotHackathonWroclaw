import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import {
  consumeToolSchema,
  inventoryCreateSchema,
  listInventorySchema,
  listShoppingSchema,
  mealCreateSchema,
  shoppingCreateSchema,
  updateInventoryToolSchema,
  updateShoppingToolSchema,
} from "./schemas";
import { FoodError } from "./errors";
import {
  addInventory,
  addShopping,
  consumeInventory,
  listInventory,
  listMeals,
  listShopping,
  saveMeal,
  updateInventory,
  updateShopping,
} from "./store";

const MAX_MCP_BODY_BYTES = 65_536;

function textResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent: value as Record<string, unknown>,
  };
}

function failure(error: unknown) {
  if (error instanceof FoodError) {
    return {
      content: [{ type: "text" as const, text: `${error.code}: ${error.message}` }],
      isError: true as const,
    };
  }
  console.error(JSON.stringify({ message: "mcp tool failed", error: error instanceof Error ? error.message : "unknown" }));
  return {
    content: [{ type: "text" as const, text: "internal: The tool could not finish" }],
    isError: true as const,
  };
}

async function call<T>(action: () => Promise<T>) {
  try {
    return textResult(await action());
  } catch (error) {
    return failure(error);
  }
}

export function createFoodServer(): McpServer {
  const server = new McpServer({ name: "spizarnia", version: "1.0.0" });

  server.registerTool(
    "list_inventory",
    {
      title: "List fridge inventory",
      description:
        "Read the household fridge. expiresOn is a calendar date in Europe/Warsaw (YYYY-MM-DD), not a timestamp. expiryState is computed for that timezone.",
      inputSchema: listInventorySchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async (args) => call(() => listInventory(args)),
  );

  server.registerTool(
    "add_inventory_item",
    {
      title: "Add fridge item",
      description: "Add one product to the shared fridge. quantity must be greater than 0. expiresOn is an optional Warsaw calendar date.",
      inputSchema: inventoryCreateSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (args) => call(() => addInventory(args)),
  );

  server.registerTool(
    "update_inventory_item",
    {
      title: "Update fridge item",
      description: "Change the name, quantity, unit, or expiry of an active fridge item. Pass expiresOn: null to clear the date.",
      inputSchema: updateInventoryToolSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (args) => call(() => updateInventory(args.id, args)),
  );

  server.registerTool(
    "consume_inventory_item",
    {
      title: "Mark fridge item consumed",
      description: "Mark an inventory item as used. The row stays in storage and disappears from the active list.",
      inputSchema: consumeToolSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (args) => call(() => consumeInventory(args.id)),
  );

  server.registerTool(
    "list_meal_suggestions",
    {
      title: "List saved meals",
      description: "List meal proposals already saved by the household UI or by an MCP client. This server does not invent meals.",
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async () => call(() => listMeals()),
  );

  server.registerTool(
    "save_meal_suggestion",
    {
      title: "Save meal suggestion",
      description:
        "Store a meal proposal and its ingredients in the shared household database. The caller does the reasoning; this tool only saves the result.",
      inputSchema: mealCreateSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (args) => call(() => saveMeal({ ...args, source: "mcp" })),
  );

  server.registerTool(
    "list_shopping_items",
    {
      title: "List shopping items",
      description: "Read the shared shopping list. This does not look up shop prices or promotions.",
      inputSchema: listShoppingSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async (args) => call(() => listShopping(args.includeChecked ?? true)),
  );

  server.registerTool(
    "add_shopping_item",
    {
      title: "Add shopping item",
      description: "Add one item to the shared shopping list.",
      inputSchema: shoppingCreateSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (args) => call(() => addShopping(args)),
  );

  server.registerTool(
    "update_shopping_item",
    {
      title: "Update shopping item",
      description: "Rename a shopping item, change its quantity or unit, or mark it checked.",
      inputSchema: updateShoppingToolSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (args) => call(() => updateShopping(args.id, args)),
  );

  return server;
}

export async function handleMcp(request: Request): Promise<Response> {
  const handler = createMcpHandler(() => createFoodServer(), {
    maxRequestBodySize: MAX_MCP_BODY_BYTES,
    responseMode: "json",
  });
  const response = await handler.fetch(request);
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("x-revalidate", "0");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
