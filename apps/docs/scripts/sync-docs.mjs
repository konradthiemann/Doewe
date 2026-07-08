// Sync the repo-level docs/ directory into Starlight's content collection.
// docs/*.md are plain Markdown without frontmatter (also read on GitHub / by AI).
// Starlight needs a `title` in frontmatter → derive it at build time so the
// source files stay clean and there is no double maintenance.
// Relative Markdown-Links werden für die Site umgeschrieben: Doc-zu-Doc-Links
// (./foo.md) → Routen unter BASE, Links auf Repo-Dateien außerhalb docs/ →
// GitHub-URLs. Astro/Starlight schreibt .md-Links NICHT selbst um — ohne
// Rewriting wären das auf der gehosteten Site 404s.
import { readdir, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { join, resolve, dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE, REPO_URL } from '../site.config.mjs';

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

function splitAnchor(target) {
  const i = target.indexOf('#');
  return i === -1 ? [target, ''] : [target.slice(0, i), target.slice(i)];
}

// Ein Link-Ziel für die gehostete Site umschreiben:
// - ./foo.md (Top-Level-Doc) → Route unter BASE (README.md → BASE selbst;
//   Slug = Dateiname ohne .md, kleingeschrieben — wie Starlight ihn erzeugt)
// - relative Repo-Pfade (../apps/…) → GitHub-URL auf main (Datei → blob,
//   Verzeichnis → tree, erkannt am fehlenden Punkt im letzten Segment)
// - externe URLs und reine #Anchors bleiben unverändert
function rewriteTarget(target, docFileNames) {
  if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(target)) return target;
  const [path, anchor] = splitAnchor(target);
  const clean = path.replace(/^\.\//, '');
  if (docFileNames.has(clean)) {
    const slug = clean === 'README.md' ? '' : `${clean.replace(/\.md$/, '').toLowerCase()}/`;
    return `${BASE}${slug}${anchor}`;
  }
  const fromRoot = posix.normalize(posix.join('docs', clean));
  if (fromRoot.startsWith('..')) return target;
  const kind = fromRoot.split('/').pop().includes('.') ? 'blob' : 'tree';
  return `${REPO_URL}/${kind}/main/${fromRoot}${anchor}`;
}

function rewriteLinks(body, docFileNames) {
  return body.replace(/\]\(([^)\s]+)\)/g, (m, target) => `](${rewriteTarget(target, docFileNames)})`);
}

async function main() {
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });
  const entries = await readdir(SRC_DOCS, { withFileTypes: true });
  const mdFiles = entries.filter((e) => e.isFile() && e.name.endsWith('.md')); // skip subdirs
  const docFileNames = new Set(mdFiles.map((e) => e.name));
  let synced = 0;
  for (const entry of mdFiles) {
    const raw = await readFile(join(SRC_DOCS, entry.name), 'utf8');
    const outName = RENAME[entry.name] ?? entry.name;
    const fallbackTitle = outName.replace(/\.md$/, '');
    const { title, body } = extractTitle(raw, fallbackTitle);
    const frontmatter = `---\ntitle: ${toYamlString(title)}\n---\n\n`;
    await writeFile(join(OUT_DIR, outName), frontmatter + rewriteLinks(body, docFileNames), 'utf8');
    synced += 1;
  }
  console.log(`[sync-docs] synced ${synced} file(s): ${SRC_DOCS} -> ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('[sync-docs] failed:', err);
  process.exit(1);
});
