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
    // No custom manualChunks: splitting vendor code by package-name substring
    // produced circular chunk imports (e.g. vendor <-> react-vendor), which
    // left React's export undefined at module-init time and rendered a blank
    // page. Rollup's automatic chunking respects the real dependency graph,
    // so it can't produce an init-order cycle like that.
  },
}));
