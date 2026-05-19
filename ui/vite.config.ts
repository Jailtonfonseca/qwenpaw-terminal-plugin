import { defineConfig } from "vite";

export default defineConfig({
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    lib: {
      entry: "src/index.tsx",
      formats: ["es"],
      fileName: () => "index.js",
    },
    rollupOptions: {
      external: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "antd",
        "@ant-design/icons",
      ],
    },
    target: "es2020",
    minify: "esbuild",
  },
  esbuild: {
    loader: "tsx",
    include: /\.tsx?$/,
  },
});
