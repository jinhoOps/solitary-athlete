import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
await mkdir('.edge-dist', { recursive: true });
for (const name of ['mukmuk-discord-grass', 'mukmuk-discord-cleanup', 'mukmuk-weekly-code', 'mukmuk-monthly-code', 'mukmuk-discord-photos']) {
  await build({ entryPoints: [`supabase/functions/${name}/index.ts`], bundle: true,
    platform: 'neutral', format: 'esm', target: 'es2022', external: ['npm:*'],
    banner: { js: '// @ts-nocheck\n// Generated deployment bundle. Type-checked source is in supabase/functions/.' },
    outfile: `.edge-dist/${name}.ts` });
}
console.log('Edge functions bundled for the Dashboard editor.');
