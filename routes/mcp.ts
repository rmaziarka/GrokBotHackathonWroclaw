import { defineHandler } from "void";
import { requireBearer } from "../src/http";
import { handleMcp } from "../src/mcp";

async function mcp(c: Parameters<typeof requireBearer>[0]): Promise<Response> {
  const denied = await requireBearer(c);
  if (denied) return denied;
  return handleMcp(c.req.raw);
}

export const GET = defineHandler(mcp);
export const POST = defineHandler(mcp);
export const DELETE = defineHandler(mcp);
