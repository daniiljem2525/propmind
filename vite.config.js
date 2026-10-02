import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// base задаётся переменной окружения VITE_BASE (например, /propmind/
// для GitHub Pages). Через env, а не через аргумент CLI: Git Bash
// на Windows искажает аргументы с ведущим слешем.
export default defineConfig({
  base: process.env.VITE_BASE || "/",
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    host: true,
    port: 5173,
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Стабильные вендорские чанки: кэш браузера не сбрасывается
        // при каждой правке страниц приложения
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
});
