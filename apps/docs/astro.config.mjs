// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import mermaid from 'astro-mermaid';
import { SITE, BASE, REPO_URL } from './site.config.mjs';

// https://astro.build/config
export default defineConfig({
  site: SITE,
  base: BASE,
  integrations: [
    // astro-mermaid MUST be registered before Starlight so it claims ```mermaid
    // code blocks before Starlight's own code-block handling. autoTheme + client-
    // side rendering → no headless browser needed in CI.
    mermaid({ theme: 'default', autoTheme: true }),
    starlight({
      title: 'Doewe Docs',
      description:
        'Entwickler- und Architektur-Dokumentation der Doewe Personal-Finance-Plattform.',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: REPO_URL,
        },
      ],
      // Sidebar derived from the real top-level docs/*.md files. Slugs are the
      // lowercased filename without .md (README.md → index, the landing page).
      sidebar: [
        {
          label: 'Übersicht',
          items: [
            { label: 'Getting Started', slug: 'getting-started' },
            { label: 'Architecture', slug: 'architecture' },
            { label: 'Project Requirements', slug: 'project-requirements-document' },
          ],
        },
        {
          label: 'Datenmodell & API',
          items: [
            { label: 'Data Model', slug: 'data-model' },
            { label: 'API Reference', slug: 'api-reference' },
            { label: 'Data Analysis Findings', slug: 'data-analysis-findings' },
          ],
        },
        {
          label: 'Flows & Betrieb',
          items: [
            { label: 'User Flows', slug: 'flows' },
            { label: 'Database Management', slug: 'database_management' },
            { label: 'Deployment & CI', slug: 'deployment' },
          ],
        },
      ],
    }),
  ],
});
