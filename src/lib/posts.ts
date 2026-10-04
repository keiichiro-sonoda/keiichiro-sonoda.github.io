import { getCollection, type CollectionEntry } from "astro:content";

export type Post = CollectionEntry<"posts">;

// 日付は日本時間で読む。Jekyll の記事は「2023-07-11 19:34:00 +0900」の形で、UTC で読むと日がずれることがある
const ymd = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function dateParts(d: Date): [string, string, string] {
  const [y, m, day] = ymd.format(d).split("-");
  return [y, m, day];
}

export function formatDate(d: Date): string {
  return dateParts(d).join("-");
}

// Jekyll（minima）と同じ URL: /YYYY/MM/DD/<名前>.html
// <名前> はファイル名から先頭の「YYYY-MM-DD-」を除いたもの
export function postSlug(post: Post): string {
  const name = post.id.replace(/^\d{4}-\d{2}-\d{2}-/, "");
  return [...dateParts(post.data.date), name].join("/");
}

export function postUrl(post: Post): string {
  return `/${postSlug(post)}.html`;
}

export async function listPosts(): Promise<Post[]> {
  const posts = await getCollection("posts", (p) => import.meta.env.DEV || !p.data.draft);
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}
