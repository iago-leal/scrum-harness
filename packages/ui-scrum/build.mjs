/**
 * Client-bundle build: wraps the browser half into the DSH module-loader
 * factory format (CJS body, externals resolved through the injected require
 * from the shell's module table). Mirrors the monorepo's tsdown clientBundle
 * output contract for out-of-tree packages.
 */
import { build } from 'esbuild'

const ID = '@scrum-harness/ui'

/** Shell-seeded platform modules plus the preloaded runtime row. */
const EXTERNALS = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-runtime/client',
]

await build({
  entryPoints: ['src/client/index.ts'],
  outfile: 'lib/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  // Primer token stylesheets (@primer/primitives) ride the bundle as strings.
  loader: { '.css': 'text' },
  // comp-44 R7 (measured): the mermaid engine is embedded in this single CJS
  // file — the platform has no lazy-load for plugin bundles, and the loader
  // takes exactly one file. Minified it costs 3.79 MB / 1.01 MB gz; unminified
  // 7.93 MB / 1.44 MB gz. On the pre-mermaid bundle minify only saved 14%
  // (the bulk is the Primer CSS as a string) and left the .map unchanged.
  // banner/footer stay verbatim and require/module/exports are never mangled.
  minify: true,
  sourcemap: true,
  external: EXTERNALS,
  define: { 'process.env.NODE_ENV': '"production"' },
  banner: {
    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => { var module = { exports: {} }; var exports = module.exports;`,
  },
  footer: { js: 'return module.exports; } });' },
})

console.log('built lib/client.js')
