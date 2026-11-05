import { defineConfig } from "vite";
import { voidPlugin } from "void";
import { voidReact } from "@void/react/plugin";

export default defineConfig({
  plugins: [
    voidPlugin(process.env.FOOD_D1_PERSIST ? { persistTo: process.env.FOOD_D1_PERSIST } : {}),
    voidReact({ react: { compiler: true } }),
  ],
});
