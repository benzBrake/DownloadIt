import { defineCollection } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";

function preserveDocSlug({ entry }: { entry: string }): string {
  const slug = entry
    .replace(/\\/g, "/")
    .replace(/\.(?:md|mdx)$/i, "")
    .replace(/\/index$/i, "");
  return slug || "index";
}

export const collections = {
  docs: defineCollection({
    loader: docsLoader({ generateId: preserveDocSlug }),
    schema: docsSchema(),
  }),
};
