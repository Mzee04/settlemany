import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const shim = (name: string) => fileURLToPath(new URL(`./src/xo/shims/${name}.ts`, import.meta.url));

/**
 * `@xo-cash/engine` 0.1.1-next pulls Node storage (`better-sqlite3`, `fs`, `path`)
 * even when the browser uses IndexedDB. Vitest runs in Node and needs the real modules.
 */
const browserShims = process.env.VITEST
  ? []
  : [
      { find: "better-sqlite3", replacement: shim("better-sqlite3") },
      { find: "sqlite3", replacement: shim("better-sqlite3") },
      { find: "fs", replacement: shim("fs") },
      { find: "node:fs", replacement: shim("fs") },
      { find: "path", replacement: shim("path") },
      { find: "node:path", replacement: shim("path") },
    ];

/**
 * GitHub Pages serves the site at https://mzee04.github.io/settlemany/.
 * Local `vite` stays at `/` so the dev server does not need that prefix.
 * `vite build` (including the Pages workflow) uses `/settlemany/`, or
 * `VITE_BASE` when Actions passes the Pages base path.
 */
function productionBase(): string {
  const fromEnv = process.env.VITE_BASE?.trim();
  const raw = fromEnv && fromEnv !== "/" ? fromEnv : "/settlemany/";
  return raw.endsWith("/") ? raw : `${raw}/`;
}

export default defineConfig(({ command }) => ({
  base: command === "build" ? productionBase() : "/",
  resolve: { alias: browserShims },
  define: { global: "globalThis" },
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 4178,
  },
  preview: {
    host: "0.0.0.0",
    port: 4178,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 20_000,
  },
}));
