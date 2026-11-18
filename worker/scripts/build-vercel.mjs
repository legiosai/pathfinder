// Builds the chat's Vercel function in Build Output API v3 form, in .vercel/output. vercel.json
// names this as the build command, so Vercel runs it on every deploy, from Git or from
// `vercel deploy`. The function is vercel/entry.ts bundled behind vercel/node-adapter.mjs; every
// path goes to it, as the old rewrite to /api did.

import { build } from 'esbuild';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, '.vercel', 'output');
const fn = join(output, 'functions', 'api.func');

// The build image runs the project's Node.js version; the function runs the same major.
const major = process.versions.node.split('.')[0];

await rm(output, { recursive: true, force: true });
await mkdir(fn, { recursive: true });

await build({
  stdin: {
    contents: [
      "import * as entry from './vercel/entry.ts';",
      "import { nodeAdapter } from './vercel/node-adapter.mjs';",
      'export default nodeAdapter(entry);',
    ].join('\n'),
    resolveDir: root,
    sourcefile: 'vercel-function.mjs',
    loader: 'js',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: join(fn, 'index.mjs'),
  logLevel: 'warning',
});

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

await writeFile(
  join(fn, '.vc-config.json'),
  json({
    runtime: `nodejs${major}.x`,
    handler: 'index.mjs',
    launcherType: 'Nodejs',
    shouldAddHelpers: false,
    supportsResponseStreaming: true,
    maxDuration: 60,
  }),
);

await writeFile(
  join(output, 'config.json'),
  json({
    version: 3,
    routes: [{ src: '/(.*)', dest: '/api' }],
  }),
);

console.log(`Built .vercel/output: one function (api, nodejs${major}.x) for every path.`);
