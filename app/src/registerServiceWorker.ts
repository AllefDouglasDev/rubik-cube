// Registers the offline service worker (public/sw.js) in production builds only, so the dev server never
// serves stale modules from the cache.
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error: unknown) => console.warn("service worker:", error));
  });
}
