import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Node env — we test business logic and route handlers, not RSC rendering. The tsconfig-paths
// plugin resolves the `@/` alias so tests import the same way the app does. All db/network/auth
// is mocked per-test, so the suite runs fully offline.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
