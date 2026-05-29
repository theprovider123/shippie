/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Showcases are baked into the platform worker at `static/__shippie-run/<slug>/`
// and served from `https://<host>/run/golazo/`. A relative base keeps every
// asset reference portable across that sub-path, root hosting, and `vite
// preview`.
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    port: 5253,
  },
  build: {
    target: "es2021",
    outDir: "dist",
    sourcemap: false,
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: [],
  },
});
