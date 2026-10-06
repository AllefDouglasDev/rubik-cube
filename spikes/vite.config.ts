import { createReadStream, existsSync } from "node:fs";
import { extname, resolve } from "node:path";
import { type Plugin, defineConfig } from "vite";

// The WASM runtimes import their own loaders at runtime (`import("/vendor/…mjs")`). In dev, Vite rewrites
// those requests with `?import` and refuses to serve public files as modules, so /vendor is served raw.
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
        Object.entries(isolationHeaders).forEach(([k, v]) => res.setHeader(k, v));
        createReadStream(file).pipe(res);
      });
    },
  };
}

// COOP/COEP enable SharedArrayBuffer (multithreaded WASM in ONNX Runtime). All assets are local.
const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  plugins: [serveVendorRaw()],
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  worker: { format: "es" },
  optimizeDeps: { exclude: ["onnxruntime-web", "@mediapipe/tasks-vision"] },
  build: {
    target: "esnext",
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, "index.html"),
        s1: resolve(import.meta.dirname, "s1.html"),
        s2: resolve(import.meta.dirname, "s2.html"),
      },
    },
  },
});
