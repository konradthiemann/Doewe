import { defineCollection } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

// Starlight content collection. The actual Markdown is generated at build time
// by scripts/sync-docs.mjs into src/content/docs/ (gitignored).
export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
};
