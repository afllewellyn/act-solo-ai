import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split large third-party libraries into their own chunks so the main
        // app bundle stays small and vendor code can be cached independently.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/[\\/]react(-dom|-router-dom)?[\\/]/.test(id)) return "react-vendor";
          if (id.includes("@radix-ui")) return "radix-vendor";
          if (id.includes("@tiptap") || id.includes("prosemirror")) return "editor-vendor";
          if (id.includes("recharts") || id.includes("d3-")) return "charts-vendor";
          return "vendor";
        },
      },
    },
  },
}));
