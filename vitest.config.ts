import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Ensure Vitest uses the monorepo root even when executed from a workspace
const repoRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    environment: "node",
    // Support running from repo root and from within a workspace
    include: [
      "packages/*/src/**/*.{test,spec}.{ts,tsx}",
      "src/**/*.{test,spec}.{ts,tsx}"
    ],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/build/**",
      "**/out/**"
    ],
    reporters: "default",
    coverage: {
      enabled: false
    }
  }
});