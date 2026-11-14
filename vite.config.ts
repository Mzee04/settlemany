import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

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
