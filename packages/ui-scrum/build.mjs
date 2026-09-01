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
  sourcemap: true,
  external: EXTERNALS,
  define: { 'process.env.NODE_ENV': '"production"' },
  banner: {
    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => { var module = { exports: {} }; var exports = module.exports;`,
  },
  footer: { js: 'return module.exports; } });' },
})

console.log('built lib/client.js')
