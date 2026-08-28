import { defineConfig } from "vitest/config";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/mirrorMayhem/" : "/",
  test: {
    environment: "node",
  },
}));
