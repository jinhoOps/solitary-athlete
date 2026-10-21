import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  return {
    resolve: {alias: {'npm:postgres@3.4.9':'postgres'}},
    base: '/solitary-athlete/',
    define: {
      __PUBLIC_CONFIG__: JSON.stringify({
        url: env.SUPABASE_URL ?? '', key: env.SUPABASE_PUBLISHABLE_KEY ?? '',
      }),
    },
    test: { include: ['tests/web/**/*.test.ts', 'tests/edge/**/*.test.ts'] },
  };
});
