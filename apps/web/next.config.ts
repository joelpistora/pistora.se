import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Repo is an npm-workspaces monorepo; point Next's file tracing at the root
  // so production builds trace the right files and it stops guessing the
  // workspace root from lockfile locations.
  outputFileTracingRoot: path.join(__dirname, "../../"),
};

export default nextConfig;
