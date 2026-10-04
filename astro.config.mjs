// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import react from "@astrojs/react";

export default defineConfig({
  site: "https://keiichiro-sonoda.github.io",
  integrations: [mdx(), react()],
  build: {
    // 置いた形のまま出力する。Jekyll 時代の URL（/2023/07/11/tsp-ga.html と /explainers/hot-layout/）を両方保つため
    format: "preserve",
  },
});
