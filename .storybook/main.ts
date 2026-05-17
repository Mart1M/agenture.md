import { fileURLToPath } from "url";
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import type { StorybookConfig } from "@storybook/react-vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config: StorybookConfig = {
  stories: [
    "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)",
  ],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  docs: {},
  viteFinal: async (viteConfig) => {
    // Add Tailwind v4 plugin if not already included
    viteConfig.plugins = viteConfig.plugins ?? [];
    const hasTailwind = viteConfig.plugins.some(
      (p) => p && typeof p === "object" && "name" in p && (p as { name: string }).name === "tailwindcss"
    );
    if (!hasTailwind) {
      viteConfig.plugins.push(tailwindcss());
    }

    // Ensure the @/* path alias resolves correctly
    viteConfig.resolve = viteConfig.resolve ?? {};
    viteConfig.resolve.alias = {
      ...(viteConfig.resolve.alias as Record<string, string> | undefined),
      "@": path.resolve(__dirname, "../src"),
    };

    // Remove Tauri-specific server constraints
    viteConfig.server = {
      ...(viteConfig.server ?? {}),
      port: undefined,
      strictPort: false,
      hmr: true,
    };

    return viteConfig;
  },
};

export default config;
