import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 10_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/cli.ts",
        "src/types.ts",
        "src/types/**",
        "src/formats/types.ts",
      ],
    },
  },
});
