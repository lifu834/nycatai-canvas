import { defineConfig, mergeConfig } from "vitest/config";

import viteConfig from "./vite.config";

// NYCATAI: 单测设施（上游无任何测试）。复用 vite.config 的 alias 与 define。
export default mergeConfig(
    viteConfig,
    defineConfig({
        test: {
            environment: "happy-dom",
            include: ["src/**/*.test.{ts,tsx}"],
        },
    }),
);
