import { resolve } from "node:path";
import type { PluginOption, UserConfig } from "vite";

export type WebViteConfigOptions = {
  apiBaseUrl: string;
  host?: string;
  plugins: PluginOption[];
  port?: number;
  rootDir: string;
};

export function createWebViteConfig({
  apiBaseUrl,
  host = "127.0.0.1",
  plugins,
  port = 5177,
  rootDir
}: WebViteConfigOptions): UserConfig {
  return {
    root: rootDir,
    plugins,
    resolve: {
      alias: {
        "@": resolve(rootDir, "src")
      }
    },
    server: {
      host,
      port,
      proxy: {
        "/api": apiBaseUrl
      }
    },
    build: {
      outDir: "dist"
    }
  };
}
