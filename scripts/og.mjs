// Render the Open Graph share images into site/og/ with headless Chrome.
// Usage: npm run build && node scripts/og.mjs [cert-id ...]   (CHROME=/path/to/chrome to override)
// Needs Chrome and ImageMagick. The JPEGs are committed, so CI and Pages never need either.
import { execFile, spawn } from 'node:child_process';
import { copyFile, mkdir, readFile, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const out = join(root, 'site', 'og');
const chrome = process.env.CHROME || 'google-chrome';
const port = 8700 + Math.floor(Math.random() * 200);

const catalog = JSON.parse(await readFile(join(dist, 'catalog.json'), 'utf8'));
const wanted = process.argv.slice(2);
const ids = wanted.length ? wanted : ['', ...catalog.certifications.map((c) => c.id)];

await mkdir(out, { recursive: true });
await copyFile(join(root, 'scripts', 'og-template.html'), join(dist, 'og-render.html'));
const server = spawn(process.execPath, [join(root, 'scripts', 'serve.mjs'), String(port)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 400));

try {
  for (const id of ids) {
    const png = join(out, `${id || 'home'}.png`);
    const file = png.replace(/\.png$/, '.jpg');
    const url = `http://127.0.0.1:${port}/og-render.html${id ? `?id=${encodeURIComponent(id)}` : ''}`;
    await run(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1200,630', '--virtual-time-budget=6000', `--screenshot=${png}`, url]);
    // JPEG keeps each image near 60 KB; link previews accept it everywhere.
    await run(process.env.MAGICK || 'magick', [png, '-strip', '-quality', '84', '-sampling-factor', '4:2:0', file]);
    await unlink(png);
    console.log(`og/${id || 'home'}.jpg`);
  }
} finally {
  server.kill();
  await unlink(join(dist, 'og-render.html')).catch(() => {});
}
