/**
 * Primer design tokens (GitHub's design system), bundled from
 * `@primer/primitives` as text by esbuild. Decision of the v0.8 spike
 * (task-52): adopt the *primitives* layer only — semantic CSS variables such
 * as `--bgColor-default`, `--fgColor-muted`, `--space-sm` — keeping our own
 * markup and `scrum-*` classes; `styles.ts` consumes the tokens with literal
 * fallbacks.
 *
 * Scoping: base/size/typography tokens ship on `:root`, which would leak into
 * the host GUI, so they are re-scoped to the panel roots here at module init
 * (a one-time string replace on bundled text). The color theme ships behind
 * `[data-color-mode]`/`[data-light-theme]` selectors; the panel overlay
 * carries those attributes itself (see Panel.tsx), which both activates the
 * theme and keeps it scoped — and leaves dark mode one attribute away.
 * @module @scrum-harness/ui/client/primer
 */

import baseSize from '@primer/primitives/dist/css/base/size/size.css'
import baseTypography from '@primer/primitives/dist/css/base/typography/typography.css'
import space from '@primer/primitives/dist/css/functional/spacing/space.css'
import typography from '@primer/primitives/dist/css/functional/typography/typography.css'
import radius from '@primer/primitives/dist/css/functional/size/radius.css'
import border from '@primer/primitives/dist/css/functional/size/border.css'
import themeLight from '@primer/primitives/dist/css/functional/themes/light.css'

/** Selector list of the SCRUM surfaces that host the tokens. */
const SCOPE = '.scrum-overlay, .scrum-wi-overlay'

/** The whole Primer token sheet, scoped to the SCRUM panel. */
export const PRIMER_CSS = [baseSize, baseTypography, space, typography, radius, border]
  .map(sheet => sheet.replaceAll(':root', SCOPE))
  .concat(themeLight)
  .join('\n')
