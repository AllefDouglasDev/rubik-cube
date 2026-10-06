// Feature flags, replaced by constants at build time (see `define` in vite.config.ts) so that disabled code
// is dropped from the bundle. Use the globals directly: re-exporting them would hide the constant from the
// bundler.
//
// __CAMERA_FEATURES__: the camera scan and move tracking tabs (experimental, need the MediaPipe/OpenCV
// assets from `npm run setup`). On in `npm run dev`, off in production builds; VITE_CAMERA_FEATURES=true or
// false overrides both.
declare global {
  const __CAMERA_FEATURES__: boolean;
}

export {};
