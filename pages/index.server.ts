import { defineHandler, type InferProps } from "void";

export type Props = InferProps<typeof loader>;

export const loader = defineHandler(() => {
  return { message: "Hello from GrokBot Hackathon Wrocław" };
});
