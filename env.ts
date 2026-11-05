import { defineEnv, string } from "void/env";

export default defineEnv({
  // Server-only household gate. Missing or shorter than 16 characters denies
  // every private API and the MCP endpoint. Never prefix this with VITE_.
  HOUSEHOLD_TOKEN: string().optional(),
});
