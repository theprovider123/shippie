/// <reference types="vitest" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const W3C_HTTP_PREFIX = "http://www.w3.org/";
const W3C_JS_PREFIX = "http:\\/\\/www.w3.org\\/";
const W3C_XML_PREFIX = "http:&#47;&#47;www.w3.org&#47;";

function sanitizeSvgNamespace(): Plugin {
  return {
    name: "golazo-sanitize-svg-namespace",
    generateBundle(_, bundle) {
      for (const asset of Object.values(bundle)) {
        if (asset.type === "chunk") {
          asset.code = asset.code.replaceAll(W3C_HTTP_PREFIX, W3C_JS_PREFIX);
        } else if (typeof asset.source === "string") {
          asset.source = asset.source.replaceAll(W3C_HTTP_PREFIX, W3C_XML_PREFIX);
        }
      }
    },
  };
}

// Showcases are baked into the platform worker at `static/__shippie-run/<slug>/`
// and served from `https://<host>/run/golazo/`. A relative base keeps every
// asset reference portable across that sub-path, root hosting, and `vite
// preview`.
export default defineConfig({
  base: "./",
  plugins: [react(), sanitizeSvgNamespace()],
  server: {
    port: 5254,
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
