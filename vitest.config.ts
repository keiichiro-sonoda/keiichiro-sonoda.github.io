import { defineConfig } from "vitest/config";

// 単体テスト（npm test）。e2e は Playwright（e2e/、npm run test:e2e）
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      // 画面に依存しない部分だけを測る。画面（.tsx）と Worker の入口は e2e で確かめる
      include: ["src/components/tsp/engine/**/*.ts", "src/components/tsp/runner.ts", "src/components/tsp/numberInput.ts"],
      exclude: ["**/*.test.ts"],
      reporter: ["text", "html"],
      reportsDirectory: "coverage",
      thresholds: { lines: 95, functions: 95, branches: 90, statements: 95 },
    },
  },
});
