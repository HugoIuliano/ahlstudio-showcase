import path from "node:path";
import { defineConfig } from "vitest/config";

const here = import.meta.dirname;
const dbFile = path.resolve(here, "tests/.tmp/test.db").split(path.sep).join("/");

export default defineConfig({
  resolve: { alias: { "@": path.resolve(here, "src") } },
  test: {
    environment: "node",
    globalSetup: ["./tests/global-setup.ts"],
    setupFiles: ["./tests/setup.ts"],
    fileParallelism: false, // banco SQLite compartilhado entre arquivos
    testTimeout: 30_000,
    include: ["tests/**/*.test.ts"],
    env: { TURSO_DATABASE_URL: `file:${dbFile}`, TURSO_AUTH_TOKEN: "", AUTH_SECRET: "test-secret", MP_ACCESS_TOKEN: "" },
  },
});
