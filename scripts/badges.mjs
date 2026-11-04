// Fetch the issuers' official badge images listed in data/badges.json into site/badges/<id>.webp.
// Usage: node scripts/badges.mjs [id ...]   (no ids: every entry)
// Needs ImageMagick 7 (`magick`). Run it when data/badges.json changes, then commit the images.
//
// Each image is downloaded once, a plain white backdrop is made transparent (some issuers ship
// badges on white, which shows as a square in dark mode), trimmed, and resized to fit 224 px.
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const entries = JSON.parse(await readFile(join(root, 'data', 'badges.json'), 'utf8'));
const only = new Set(process.argv.slice(2));
const out = join(root, 'site', 'badges');
await mkdir(out, { recursive: true });
const work = await mkdtemp(join(tmpdir(), 'pathfinder-badges-'));
const SIZE = 224;

try {
  for (const e of entries) {
    if (only.size && !only.has(e.id)) continue;
    const res = await fetch(e.image_url);
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !type.startsWith('image/')) {
      console.error(`${e.id}: ${res.status} ${type}, skipped`);
      continue;
    }
    const src = join(work, `${e.id}.src`);
    await writeFile(src, Buffer.from(await res.arrayBuffer()));
    // Flood-fill from each corner only through near-white pixels, so white inside the badge stays.
    const { stdout } = await run('magick', ['identify', '-format', '%w %h', `${src}[0]`]);
    const [w, h] = stdout.trim().split(' ').map(Number);
    const corners = ['0,0', `${w - 1},0`, `0,${h - 1}`, `${w - 1},${h - 1}`];
    const args = [src, '-alpha', 'set', '-fuzz', '4%', '-fill', 'none'];
    for (const c of corners) args.push('-draw', `color ${c} floodfill`);
    args.push('-trim', '+repage', '-resize', `${SIZE}x${SIZE}`, '-background', 'none', '-gravity', 'center', '-extent', `${SIZE}x${SIZE}`, '-quality', '88', join(out, `${e.id}.webp`));
    await run('magick', args);
    console.log(`${e.id}: ok`);
  }
} finally {
  await rm(work, { recursive: true, force: true });
}
