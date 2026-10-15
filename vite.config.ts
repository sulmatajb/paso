import vinext from 'vinext';
import { defineConfig, type Plugin } from 'vite';
import { sites } from './build/sites-vite-plugin';
export default defineConfig(async () => {
  process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= 'false';
  process.env.WRANGLER_SEND_METRICS ??= 'false';
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_REGISTRY_PATH ??= '.wrangler/dev-registry';
  const { cloudflare } = await import('@cloudflare/vite-plugin');
  return {
    worker: {
      format: 'es' as const,
      // Preserve real global checks: a browser worker has no window.
      plugins: () => [
        {
          name: 'paso-worker-scope',
          enforce: 'pre' as const,
          transform(code: string) {
            return code.includes('typeof window')
              ? { code: code.replace(/typeof\s+window\b/g, 'typeof globalThis.window'), map: null }
              : null;
          },
        },
      ],
    },
    plugins: [
      vinext(),
      sites({ mockAuth: true }),
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        inspectorPort: false,
        config: {
          main: './build/sites-worker.ts',
          compatibility_flags: ['nodejs_compat'],
          d1_databases: [
            {
              binding: 'DB',
              database_name: 'paso-d1',
              database_id: '00000000-0000-4000-8000-000000000000',
            },
          ],
        },
      }),
      {
        name: 'omit-unused-onnx-fallback',
        generateBundle(_options, bundle) {
          for (const file of Object.keys(bundle))
            if (/ort-wasm-simd-threaded\.asyncify-.*\.wasm$/.test(file)) delete bundle[file];
        },
      } as Plugin,
    ],
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
  };
});
