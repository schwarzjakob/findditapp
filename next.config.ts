import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.resolve ??= {};
    config.resolve.alias ??= {};
    Object.assign(config.resolve.alias, {
      "webworker-threads": false,
      bufferutil: false,
      "utf-8-validate": false,
    });
    return config;
  },
};

export default nextConfig;
