// Fetch the issuers' official badge images listed in data/badges.json into site/badges/<id>.webp.
// Usage: node scripts/badges.mjs [id ...]   (no ids: every entry)
// Needs ImageMagick 7 (`magick`), and Chrome for SVG badges (CHROME=/path/to/chrome to override).
// Run it when data/badges.json changes, then commit the images.
//
// Each image is downloaded once, a plain white backdrop is made transparent (some issuers ship
// badges on white, which shows as a square in dark mode), trimmed, and resized to fit 224 px.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
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
const CHROME = process.env.CHROME || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(existsSync);

// ImageMagick draws SVG gradients poorly, so SVG badges are rendered by headless Chrome on a
// transparent page first. An <img> never runs scripts inside the SVG.
async function rasterizeSvg(svgPath, pngPath) {
  if (!CHROME) throw new Error('SVG badge needs Chrome (set CHROME)');
  const page = join(dirname(svgPath), 'render.html');
  await writeFile(page, `<!doctype html><html><body style="margin:0;background:transparent"><img src="${svgPath.split('/').pop()}" style="display:block;width:900px;height:900px;object-fit:contain"></body></html>`);
  await run(CHROME, ['--headless', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000', '--window-size=900,900', `--screenshot=${pngPath}`, `file://${page}`]);
}

try {
  for (const e of entries) {
    if (only.size && !only.has(e.id)) continue;
    const res = await fetch(e.image_url);
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !type.startsWith('image/')) {
      console.error(`${e.id}: ${res.status} ${type}, skipped`);
      continue;
    }
    let src = join(work, `${e.id}.src`);
    await writeFile(src, Buffer.from(await res.arrayBuffer()));
    if (type.includes('svg')) {
      await rename(src, `${src}.svg`);
      await rasterizeSvg(`${src}.svg`, `${src}.png`);
      src = `${src}.png`;
    }
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
