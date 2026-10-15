import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
// Use only against a fresh disposable preview database, such as CI.
for (const file of (await readdir('drizzle')).filter((f) => f.endsWith('.sql')).sort()) {
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      './scripts/sites-env.mjs',
      './node_modules/wrangler/bin/wrangler.js',
      'd1',
      'execute',
      'DB',
      '--local',
      '--config',
      'dist/server/wrangler.json',
      '--persist-to',
      '.wrangler/state',
      '--file',
      `drizzle/${file}`,
    ],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
