import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api/status": {
        target: "https://api.squeekchain.com",
        changeOrigin: true,
        rewrite: () => "/v1/status",
      },
      "/api/settlements": {
        target: "https://api.squeekchain.com",
        changeOrigin: true,
        rewrite: () => "/v1/settlements?range=24h",
      },
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    proxy: {
      "/api/status": {
        target: "https://api.squeekchain.com",
        changeOrigin: true,
        rewrite: () => "/v1/status",
      },
      "/api/settlements": {
        target: "https://api.squeekchain.com",
        changeOrigin: true,
        rewrite: () => "/v1/settlements?range=24h",
      },
    },
  },
});
