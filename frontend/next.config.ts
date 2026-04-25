import type { NextConfig } from "next";
import path from "path";

const frontendRoot = __dirname;
const workspaceRoot = path.dirname(frontendRoot);

function escapeForRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ignorePath(targetPath: string) {
  return new RegExp(`^${escapeForRegex(targetPath)}(?:[\\\\/].*)?$`);
}

const nextConfig: NextConfig = {
  // Prod keeps strict mode on; dev copies (C:\dev) disable it for HMR memory
  // reasons but `next build` is single-pass so we don't pay the dev cost in
  // prod. Strict mode helps catch accidental double-effects.
  reactStrictMode: true,
  outputFileTracingRoot: frontendRoot,
  // Rewrite `react-icons/<family>` barrel imports into per-icon paths so dev
  // mode no longer drags in entire 6000-icon families for every page.
  modularizeImports: {
    "react-icons/gi":  { transform: "react-icons/gi/{{member}}" },
    "react-icons/io5": { transform: "react-icons/io5/{{member}}" },
    "react-icons/fa":  { transform: "react-icons/fa/{{member}}" },
    "react-icons/md":  { transform: "react-icons/md/{{member}}" },
    "react-icons/bi":  { transform: "react-icons/bi/{{member}}" },
    "react-icons/hi":  { transform: "react-icons/hi/{{member}}" },
  },
  experimental: {
    // Dev-only tree-shake for packages Next can safely rewrite. Complements
    // modularizeImports by covering Radix, framer-motion, lucide, recharts.
    optimizePackageImports: [
      "lucide-react",
      "react-icons",
      "framer-motion",
      "@radix-ui/react-dialog",
      "@radix-ui/react-popover",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-select",
      "@radix-ui/react-tabs",
      "@radix-ui/react-accordion",
      "@radix-ui/react-navigation-menu",
      "@radix-ui/react-scroll-area",
      "@radix-ui/react-tooltip",
      "@radix-ui/react-menubar",
      "@radix-ui/react-context-menu",
      "@radix-ui/react-alert-dialog",
      "@radix-ui/react-avatar",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-collapsible",
      "@radix-ui/react-hover-card",
      "@radix-ui/react-label",
      "@radix-ui/react-progress",
      "@radix-ui/react-radio-group",
      "@radix-ui/react-separator",
      "@radix-ui/react-slider",
      "@radix-ui/react-slot",
      "@radix-ui/react-switch",
      "@radix-ui/react-toggle",
      "@radix-ui/react-toggle-group",
      "recharts",
    ],
    webpackMemoryOptimizations: true,
  },
  // Unload idle routes faster so the dev worker doesn't hoard RAM.
  onDemandEntries: {
    maxInactiveAge: 15_000,
    pagesBufferLength: 2,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "g.cricapi.com",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
  webpack: (config, { dev }) => {
    config.resolve = config.resolve ?? {};
    config.resolve.modules = [
      path.join(frontendRoot, "node_modules"),
      "node_modules",
      ...(config.resolve.modules ?? []),
    ];

    if (dev) {
      // Disable source maps in dev — they balloon the worker's memory as
      // the module graph grows. Stack traces still resolve via line/col.
      config.devtool = false;

      // Disable webpack's cache entirely in dev. The default in-memory cache
      // retained compile artifacts across HMR passes and eventually OOMed on
      // the match page. Trade-off: slower re-compiles, no stuck pack writes.
      config.cache = false;

      // Don't minimize in dev; dev should never minimize anyway but being
      // explicit prevents TerserPlugin workers from spinning up.
      config.optimization = {
        ...(config.optimization ?? {}),
        minimize: false,
        removeAvailableModules: false,
        removeEmptyChunks: false,
        splitChunks: false,
      };

      const ignoredPaths = [
        path.join(workspaceRoot, ".next"),
        path.join(workspaceRoot, "dist"),
        path.join(workspaceRoot, "jaffa_zip"),
        path.join(workspaceRoot, "stitch_login_otp"),
        path.join(workspaceRoot, "node_modules"),
      ];

      config.watchOptions = {
        ...(config.watchOptions ?? {}),
        ignored: new RegExp(
          ignoredPaths
            .map((ignoredPath) => ignorePath(ignoredPath).source)
            .join("|")
        ),
      };
    }

    return config;
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:5000/api/:path*",
      },
      {
        source: "/socket.io/:path*",
        destination: "http://localhost:5000/socket.io/:path*",
      },
    ];
  },
};

export default nextConfig;
