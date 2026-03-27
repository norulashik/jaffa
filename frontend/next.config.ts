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
  reactStrictMode: true,
  outputFileTracingRoot: frontendRoot,
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
