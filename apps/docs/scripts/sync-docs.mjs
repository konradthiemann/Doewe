// Sync the repo-level docs/ directory into Starlight's content collection.
// docs/*.md are plain Markdown without frontmatter (also read on GitHub / by AI).
// Starlight needs a `title` in frontmatter → derive it at build time so the
// source files stay clean and there is no double maintenance.
import { readdir, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..'); // apps/docs/scripts -> repo root
const SRC_DOCS = join(REPO_ROOT, 'docs');
const OUT_DIR = resolve(__dirname, '../src/content/docs');

const RENAME = { 'README.md': 'index.md' };

function extractTitle(raw, fallback) {
  const lines = raw.split('\n');
  const idx = lines.findIndex((line) => /^#\s+/.test(line));
  if (idx === -1) return { title: fallback, body: raw };
  const title = lines[idx].replace(/^#\s+/, '').trim();
  lines.splice(idx, 1);
  if (lines[idx] === '') lines.splice(idx, 1);
  return { title, body: lines.join('\n') };
}

function toYamlString(value) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

async function main() {
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });
  const entries = await readdir(SRC_DOCS, { withFileTypes: true });
  let synced = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue; // skip subdirs
    const raw = await readFile(join(SRC_DOCS, entry.name), 'utf8');
    const outName = RENAME[entry.name] ?? entry.name;
    const fallbackTitle = outName.replace(/\.md$/, '');
    const { title, body } = extractTitle(raw, fallbackTitle);
    const frontmatter = `---\ntitle: ${toYamlString(title)}\n---\n\n`;
    await writeFile(join(OUT_DIR, outName), frontmatter + body, 'utf8');
    synced += 1;
  }
  console.log(`[sync-docs] synced ${synced} file(s): ${SRC_DOCS} -> ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('[sync-docs] failed:', err);
  process.exit(1);
});
