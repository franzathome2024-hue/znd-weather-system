// v0.1 frontend build is a no-op: the public/ folder is served directly by
// Cloudflare Workers Assets. This script exists so that `npm run build` and
// the Cloudflare Builds pipeline have a stable entrypoint. Future versions
// can swap this in for a real bundler (esbuild/vite/etc.) without changing
// the package.json scripts.
console.log("znd-weather-system v0.1 — frontend build: no-op (public/ is served as-is).");
