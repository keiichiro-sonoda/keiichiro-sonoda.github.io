import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

// 記事。ファイル名は Jekyll と同じ「日付-名前.md(x)」にし、URL は名前と date から作る（src/lib/posts.ts）
const posts = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/posts" }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string().optional(),
    draft: z.boolean().default(false),
    // true なら、ページからの通信（fetch・WebSocket・送信の類）をブラウザに止めさせる。手元のデータを扱う道具のため
    offline: z.boolean().default(false),
  }),
});

export const collections = { posts };
