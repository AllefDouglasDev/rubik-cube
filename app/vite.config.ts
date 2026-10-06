import { createReadStream, existsSync } from "node:fs";
import { extname, resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { type Plugin } from "vite";
import { defineConfig } from "vitest/config";

// MediaPipe imports its WASM loader at runtime (`import("/vendor/…js")`). In dev, Vite rewrites those
// requests with `?import` and refuses to serve public files as modules, so /vendor is served raw.
function serveVendorRaw(): Plugin {
  const types: Record<string, string> = { ".mjs": "text/javascript", ".js": "text/javascript", ".wasm": "application/wasm" };
  return {
    name: "serve-vendor-raw",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split("?")[0] ?? "";
        if (!path.startsWith("/vendor/")) return next();
        const file = resolve(import.meta.dirname, "public", `.${path}`);
        if (!existsSync(file)) return next();
        res.setHeader("Content-Type", types[extname(file)] ?? "application/octet-stream");
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), serveVendorRaw()],
  worker: { format: "es" },
  // cubing.js spawns its own workers (scramble/search); pre-bundling breaks their URLs.
  optimizeDeps: { exclude: ["cubing", "@mediapipe/tasks-vision"] },
  // The curriculum content is read from ../docs/curriculum.
  server: { fs: { allow: [".."] } },
  // Two pages: the trainer (index.html) and the solo timer (solo.html).
  build: { target: "esnext", rollupOptions: { input: { main: "index.html", solo: "solo.html" } } },
  test: { environment: "node" },
});
