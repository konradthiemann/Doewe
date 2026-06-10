import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL(".", import.meta.url));

/**
 * Separate Vitest config for component tests (jsdom environment).
 * API integration tests (node environment) continue to use the root vitest.config.ts.
 * Run with: npx vitest run --config apps/web/vitest.config.ts
 */
export default defineConfig({
  esbuild: {
    // Required for tsx/jsx transforms in tests
    jsx: "automatic",
    jsxImportSource: "react",
  },
  test: {
    name: "web-components",
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["components/**/*.test.{ts,tsx}", "app/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**"],
  },
  resolve: {
    alias: {
      "@doewe/shared": `${dir}../../packages/shared/src/index.ts`,
    },
  },
});
