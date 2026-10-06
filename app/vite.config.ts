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
  build: {
    target: "esnext",
    // Two pages: the trainer (index.html) and the solo timer (solo.html).
    rollupOptions: {
      input: { main: "index.html", solo: "solo.html" },
      // cubing.js loads its search worker entry through dynamic imports. Vite's preload helper touches
      // `document` and crashes inside the worker (no scrambles in production) whenever an import has
      // preload deps: JS deps are off (modulePreload below), and keeping dependencies out of the app chunks
      // keeps CSS deps away from cubing's imports.
      output: {
        manualChunks(id: string) {
          const cubing = /node_modules\/cubing\/dist\/lib\/cubing\/(.+)\.js$/.exec(id)?.[1];
          if (cubing) return `cubing-${cubing.replace(/\//g, "-")}`;
          const pkg = /node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(id)?.[1];
          return pkg ? `vendor-${pkg.replace("/", "-")}` : undefined;
        },
      },
    },
    modulePreload: false,
  },
  test: { environment: "node" },
});
