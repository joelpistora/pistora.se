import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Repo is an npm-workspaces monorepo; point Next's file tracing at the root
  // so production builds trace the right files and it stops guessing the
  // workspace root from lockfile locations.
  outputFileTracingRoot: path.join(__dirname, "../../"),

  // The frontend is a pure client-side app — it talks to the storage API from
  // the browser and never fetches data server-side. `next build` emits a static
  // site to `out/`, deployable to pistora.se over FTP like a plain HTML page
  // (no Node runtime on the host). `next dev` is unaffected.
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
