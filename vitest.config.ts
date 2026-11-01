import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    include: ["tests/domain/**/*.test.ts"],
    coverage: { reporter: ["text", "json-summary"] },
  },
});
