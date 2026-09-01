/**
 * Ambient module for `.css` imports: esbuild bundles them as text (see
 * build.mjs `loader`), so from TypeScript's point of view a stylesheet import
 * is just a string.
 * @module @scrum-harness/ui/client/css.d
 */

declare module '*.css' {
  /** The stylesheet source, verbatim. */
  const css: string
  export default css
}
