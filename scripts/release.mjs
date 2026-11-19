#!/usr/bin/env node
/**
 * Package this plugin for release, and write the one-entry market index the
 * registry aggregates.
 *
 * Output (default `dist-packages/`):
 *   <id>-<version>.zip   the runtime payload
 *   index.json           one MarketEntry: version, absolute zip URL, sha256
 *
 * The zip contains the RUNTIME PAYLOAD only — manifest, dist/, ui-dist/, ui/,
 * assets/, docs/, PLUGIN.md. src/ tests/ scripts/ vendor/ node_modules/ are
 * build inputs and never ship.
 *
 * The zip URL is ABSOLUTE and pinned to the release tag
 * (`https://github.com/<owner>/<repo>/releases/download/v<version>/<zip>`), so
 * a registry that merged this entry keeps pointing at an immutable release
 * even after a newer one is published. Without `--repo` (or
 * `GITHUB_REPOSITORY` in Actions) a relative URL is written — useful for a
 * local market, not for a published one.
 *
 * Usage:
 *   node scripts/release.mjs [--out <dir>] [--repo <owner/name>] [--tag <tag>]
 *                            [--stamp] [--stamp-label <label>]
 *
 *   --stamp  local testing only: version becomes `<version>-dev.<label>`, so
 *            an installed copy shows it as an update. Never for a release.
 */
import AdmZip from 'adm-zip';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Build inputs, never read at runtime. */
const EXCLUDED_DIRS = new Set(['node_modules', 'src', 'tests', 'scripts', 'vendor', 'dist-packages']);
const EXCLUDED_FILES = /^(\.DS_Store|package-lock\.json|pnpm-lock\.yaml|tsconfig.*\.json|.*\.tsbuildinfo)$/;

function argValue(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i < 0) return fallback;
  const value = process.argv[i + 1];
  if (!value || value.startsWith('--')) {
    console.error(`${name} needs a value`);
    process.exit(2);
  }
  return value;
}

const OUT = resolve(argValue('--out', join(ROOT, 'dist-packages')));
const REPO = argValue('--repo', process.env.GITHUB_REPOSITORY ?? null);
const STAMP = process.argv.includes('--stamp');
const stampLabel = argValue(
  '--stamp-label',
  new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14),
);

const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf-8'));
if (!manifest.id || !manifest.version) {
  console.error('manifest.json is missing id or version');
  process.exit(1);
}

const version = STAMP ? `${manifest.version}-dev.${stampLabel}` : manifest.version;
const tag = argValue('--tag', `v${version}`);

// A manifest entry is a promise about the zip's contents. `ui-dist/` is
// gitignored build output, so a checkout that skipped `npm run build` would
// otherwise produce a zip with no panel — discovered only at load time on a
// user machine.
const declared = [manifest.backend, manifest.icon]
  .concat((manifest.contributes?.panels ?? []).map((p) => p.entry))
  .filter(Boolean);
const missing = declared.filter((rel) => !existsSync(join(ROOT, rel)));
if (missing.length > 0) {
  console.error(`manifest references missing build outputs:\n  ${missing.join('\n  ')}`);
  console.error('build the plugin first: npm run build');
  process.exit(1);
}

/** Every file that belongs in the zip, as paths relative to the plugin root. */
function collectPayload(rel = '') {
  const out = [];
  for (const entry of readdirSync(join(ROOT, rel), { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isDirectory() && EXCLUDED_DIRS.has(entry.name)) continue;
    if (entry.isFile() && EXCLUDED_FILES.test(entry.name)) continue;
    const next = rel ? rel + '/' + entry.name : entry.name;
    if (entry.isDirectory()) out.push(...collectPayload(next));
    else out.push(next);
  }
  return out;
}

// One fixed timestamp for every zip entry, so identical sources produce an
// identical sha256 (SOURCE_DATE_EPOCH per the reproducible-builds convention;
// otherwise the zip epoch, 1980-01-01).
const epoch = Number(process.env.SOURCE_DATE_EPOCH);
const SOURCE_DATE = new Date(Number.isFinite(epoch) && epoch > 0 ? epoch * 1000 : Date.UTC(1980, 0, 1));

const zip = new AdmZip();
let rawBytes = 0;
for (const rel of collectPayload()) {
  if (STAMP && rel === 'manifest.json') continue; // re-added below, stamped
  const content = readFileSync(join(ROOT, rel));
  rawBytes += content.length;
  zip.addFile(rel, content).header.time = SOURCE_DATE;
}
if (STAMP) {
  const content = Buffer.from(`${JSON.stringify({ ...manifest, version }, null, 2)}\n`, 'utf-8');
  rawBytes += content.length;
  zip.addFile('manifest.json', content).header.time = SOURCE_DATE;
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const zipName = `${manifest.id}-${version}.zip`;
const zipBytes = zip.toBuffer();
writeFileSync(join(OUT, zipName), zipBytes);

const url = REPO
  ? `https://github.com/${REPO}/releases/download/${tag}/${zipName}`
  : zipName;
if (!REPO) {
  console.warn('note: no --repo/GITHUB_REPOSITORY — index URL is relative (local market only)');
}

const index = {
  version: 1,
  updated: new Date().toISOString(),
  plugins: [
    {
      id: manifest.id,
      name: manifest.name,
      description: manifest.description ?? '',
      version,
      apiVersion: manifest.apiVersion,
      url,
      sha256: createHash('sha256').update(zipBytes).digest('hex'),
      size: zipBytes.length,
      permissions: manifest.permissions ?? [],
    },
  ],
};
writeFileSync(join(OUT, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);

const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;
console.log(`✓ ${zipName}  ${mb(zipBytes.length)} (${zip.getEntries().length} files, ${mb(rawBytes)} raw)`);
console.log(`✓ index.json  ${url}`);
