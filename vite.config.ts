import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, "index.html"),
        "service-worker": resolve(__dirname, "src/service-worker.ts"),
      },
      output: {
        // Side panel assets go under sidepanel/ to match manifest path
        entryFileNames: (chunk) => {
          if (chunk.name === "service-worker") return "service-worker.js";
          return "sidepanel/assets/[name]-[hash].js";
        },
        chunkFileNames: "sidepanel/assets/[name]-[hash].js",
        assetFileNames: (asset) => {
          if (asset.name === "index.css") return "sidepanel/index.css";
          return "sidepanel/assets/[name]-[hash][extname]";
        },
      },
    },
  },
});
