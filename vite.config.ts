import { defineConfig, type ProxyOptions } from "vite";

const accountProxy: ProxyOptions = {
  target: "https://api.squeekchain.com",
  changeOrigin: true,
  configure: (proxy) => {
    proxy.on("proxyReq", (proxyReq, req) => {
      const url = new URL(req.url ?? "", "http://local");
      const address = (url.searchParams.get("address") ?? "").toLowerCase();
      proxyReq.path = `/v1/accounts/${address}?limit=25`;
    });
  },
};

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
      "/api/account": accountProxy,
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
      "/api/account": accountProxy,
    },
  },
});
