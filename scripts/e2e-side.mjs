#!/usr/bin/env node
/**
 * End-to-end dogfood of the SCRUM side column (comp-55 R11) against a LIVE
 * DSH web GUI, driven by the Playwright that ships in the deepseek-harness
 * checkout (no install). Not part of the vitest suite (it needs the server
 * and a real browser): run it by hand after `npm run bundle` and print the
 * PASS/FAIL lines into the validation artifact.
 *
 *   node scripts/e2e-side.mjs [--url http://127.0.0.1:3090] [--session "title"] [--shots /tmp/e2e]
 *
 * The session named by --session is opened read-only (no message is sent);
 * it should be a non-blank session of this workspace that contains at least
 * one tool call. Screenshots of the numbered steps land in --shots.
 */
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] ?? true])
  return acc
}, []))
const URL = args.url ?? 'http://127.0.0.1:3090'
const SESSION = args.session ?? 'Retomar tarefa rel-17'
const OTHER = args.other ?? 'o que houve?'
const SHOTS = args.shots ?? '/tmp/e2e-side'
mkdirSync(SHOTS, { recursive: true })

const require = createRequire(import.meta.url)
const { chromium } = require('<deepseek-harness>/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright')

const results = []
const check = (step, name, ok, detail = '') => {
  results.push({ step, name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} [${step}] ${name}${detail ? ` — ${detail}` : ''}`)
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const stateCalls = []
page.on('request', req => { if (req.url().includes('/scrum-api/state')) stateCalls.push(Date.now()) })

const side = () => page.locator('.scrum-view.is-side')
const sideWidth = async () => (await side().count()) === 0 ? 0 : ((await side().boundingBox())?.width ?? 0)
const capsule = () => page.locator('.scrum-capsule')
const openSession = async (title) => {
  await page.getByText(title, { exact: true }).first().click()
  await sleep(1500)
}

await page.goto(URL)
await sleep(2500)
await openSession(SESSION)

// (10 first half) fresh page: switch off, tool panel in place.
check(10, 'reload → desligado', (await capsule().getAttribute('aria-pressed')) === 'false' && (await side().count()) === 0)

// (1) capsule opens the column with this workspace's board.
await capsule().click()
await sleep(1200)
const w1 = await sideWidth()
// comp-57: opens at DETAILS_DEFAULT 420 (track 420 − 1px border = 419 of content).
check(1, 'cápsula abre a coluna em 420 (default do ui-layout)', w1 >= 419 && w1 <= 420, `${w1}px`)
check(1, 'quadro do workspace', (await page.locator('.is-side .scrum-ws').innerText()).includes('scrum-harness'))
check(1, 'backlog com linhas', (await page.locator('.is-side .scrum-bl-row').count()) > 3)
// The script was written against a populated board; on a fresh one (a
// single release) it clicks the first item and "switches" to the second when
// there is one. Titles are the clickable cells; add-rows have none.
const titleCount = await page.locator('.is-side .scrum-bl-title').count()
const ROW_A = Math.min(3, titleCount - 1)
const ROW_B = Math.min(ROW_A + 1, titleCount - 1)
const scroll = await page.locator('.is-side .scrum-body').evaluate(el => ({ sh: el.scrollHeight, ch: el.clientHeight, oy: getComputedStyle(el).overflowY }))
check(1, 'backlog rola dentro da coluna', scroll.oy === 'auto' && scroll.ch > 0 && scroll.ch < 900, JSON.stringify(scroll))
check(1, 'cápsula pressionada', (await capsule().getAttribute('aria-pressed')) === 'true' && (await capsule().getAttribute('title')) === 'Fechar a coluna lateral')
await page.screenshot({ path: join(SHOTS, '1-open.png') })

// (2) drag the details handle to the clamp ends.
const drag = async (dx) => {
  const handle = page.locator('.scrum-view.is-side').locator('xpath=ancestor::*[contains(@class,"frame")]').first()
  const box = await side().boundingBox()
  const x = box.x, y = box.y + 450
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y, { steps: 8 })
  await page.mouse.up()
  await sleep(600)
  void handle
}
await drag(400)
const wMin = await sideWidth()
// The track is 300px; the column paints a 1px left border, so the content box reads 299.
check(2, 'arraste até o mínimo (300)', Math.round(wMin) >= 299 && Math.round(wMin) <= 300, `${wMin}px`)
// v0.23: the column renders the whole board, exactly as the retired tab did —
// the four-column backlog grid, the title + breadcrumb, the lanes toggle.
const item = await page.locator('.is-side .scrum-bl-row').nth(ROW_A).evaluate(el => getComputedStyle(el).gridTemplateColumns)
check(2, 'backlog em quatro colunas (Item | Estado | Pontos | Sprint)', item.split(' ').length === 4, item)
check(2, 'cabeçalho completo (título + trilha)', (await page.locator('.is-side .scrum-head h1').count()) === 1 && (await page.locator('.is-side .scrum-head .scrum-sub').isVisible()))
await page.locator('.is-side .scrum-tab', { hasText: 'Board' }).click()
await sleep(500)
// Without an active sprint the Tarefas board is the «Nenhuma sprint ativa»
// empty state; fall back to the Componentes / Funções pivots, which have a
// grid whenever the backlog has items (an empty board only proves the pivot).
const noSprint = (await page.locator('.is-side .scrum-board').count()) === 0
if (noSprint) {
  for (const pivot of ['Componentes', 'Funções']) {
    await page.locator('.is-side .scrum-pivot-btn', { hasText: pivot }).click(); await sleep(400)
    if ((await page.locator('.is-side .scrum-board').count()) > 0) break
  }
}
if ((await page.locator('.is-side .scrum-board').count()) > 0) {
  const cols = await page.locator('.is-side .scrum-board').first().evaluate(el => getComputedStyle(el).gridTemplateColumns)
  check(2, 'board com as colunas lado a lado', cols.split(' ').length >= 3, `${cols}${noSprint ? ' (sem sprint ativa: pivô de nível)' : ''}`)
  check(2, 'com «☰ Raias» (só no board de tarefas)', noSprint || (await page.locator('.is-side .scrum-btn', { hasText: 'Raias' }).count()) === 1)
} else {
  check(2, 'board vazio neste quadro (sem sprint ativa e sem itens) — pivô renderiza', (await page.locator('.is-side .scrum-pivot-btn').count()) === 3 && (await page.locator('.is-side .scrum-empty').count()) === 1)
}
await page.screenshot({ path: join(SHOTS, '2-min-board.png') })
// comp-57: DETAILS_MAX 900 only fits from 1820px (280 + 900 + 640); at 1600 the
// concession chain stops at 680, so the max is measured at 1920.
await page.setViewportSize({ width: 1920, height: 900 })
await sleep(600)
await drag(-700)
const wMax = await sideWidth()
check(2, 'arraste até o máximo (900 do ui-layout)', Math.round(wMax) >= 899, `${wMax}px`)
await page.screenshot({ path: join(SHOTS, '2-max-board.png') })
await page.setViewportSize({ width: 1600, height: 900 })
await sleep(600)
check(2, 'a 1600 a concessão para em 680 (1600 − 280 − 640)', Math.round(await sideWidth()) >= 679, `${await sideWidth()}px`)
await page.locator('.is-side .scrum-tab', { hasText: 'Backlog' }).click()
await sleep(300)

// (3) the work item form covers the page from the column.
await page.locator('.is-side .scrum-bl-title').nth(ROW_A).click()
await sleep(500)
const overlay = await page.locator('.scrum-wi-overlay').boundingBox()
check(3, 'form cobre a página', overlay !== null && overlay.x === 0 && overlay.width === 1600 && overlay.height === 900, JSON.stringify(overlay))
await page.screenshot({ path: join(SHOTS, '3-form.png') })
await page.keyboard.press('Escape')
await sleep(300)
check(3, 'form fecha', (await page.locator('.scrum-wi-overlay').count()) === 0)

// (F) comp-56 — the draggable form: modal while centered, floating and
// click-through once moved, position remembered on the page.
await page.locator('.is-side .scrum-bl-title').nth(ROW_A).click()
await sleep(400)
const dialog = page.locator('.scrum-wi')
const before = await dialog.boundingBox()
const head = page.locator('.scrum-wi .scrum-details-head')
const hb = await head.boundingBox()
await page.mouse.move(hb.x + 40, hb.y + hb.height / 2)
await page.mouse.down()
await page.mouse.move(hb.x + 40 - 300, hb.y + hb.height / 2, { steps: 10 })
await page.mouse.up()
await sleep(300)
const after = await dialog.boundingBox()
check('F', 'arrastar 300px pelo cabeçalho move o form', Math.round(before.x - after.x) === 300, `${before.x} → ${after.x}`)
const overlayEl = page.locator(".scrum-wi-overlay")
const ov = await overlayEl.evaluate(el => ({ moved: el.classList.contains('is-moved'), pe: getComputedStyle(el).pointerEvents, bg: getComputedStyle(el).backgroundColor }))
check('F', 'movido: overlay click-through e transparente', ov.moved && ov.pe === 'none' && /rgba\(0, 0, 0, 0\)|transparent/.test(ov.bg), JSON.stringify(ov))
check('F', 'aria-modal cai para false', (await dialog.getAttribute('aria-modal')) === 'false')
await page.locator('textarea[placeholder="Message the agent"], [contenteditable="true"]').first().click({ position: { x: 5, y: 5 } }).catch(() => {})
await sleep(200)
check('F', 'o composer do chat recebe o clique com o form aberto', (await page.locator('.scrum-wi').count()) === 1 && (await page.evaluate(() => !document.activeElement?.closest('.scrum-wi'))))
await page.locator('.is-side .scrum-bl-title').nth(ROW_B).click()
await sleep(400)
const afterSwitch = await dialog.boundingBox()
check('F', 'trocar o item mantém a posição', Math.round(afterSwitch.x) === Math.round(after.x), `${after.x} → ${afterSwitch.x}`)
await page.keyboard.press('Escape')
await sleep(200)
await page.locator('.is-side .scrum-bl-title').nth(ROW_A).click()
await sleep(400)
const reopened = await dialog.boundingBox()
check('F', 'fechar e reabrir mantém a posição', Math.round(reopened.x) === Math.round(after.x), `${reopened.x}`)
const hb2 = await head.boundingBox()
await page.mouse.move(hb2.x + 40, hb2.y + hb2.height / 2)
await page.mouse.down()
await page.mouse.move(hb2.x + 40, hb2.y + 2000, { steps: 10 })
await page.mouse.up()
await sleep(300)
const low = await dialog.boundingBox()
check('F', 'arrastar para baixo: o form fica inteiro na viewport (rodapé alcançável)', low.y + low.height <= 900 + 1 && low.y >= 0, `top ${low.y} h ${low.height}`)
check('F', '«Fechar» do rodapé visível', await page.locator('.scrum-wi .scrum-details-foot button', { hasText: 'Fechar' }).isVisible())
await page.locator('.scrum-wi button[title="Voltar ao centro (modal)"]').click()
await sleep(300)
const centered = await dialog.boundingBox()
check('F', '⌖ Centralizar → centrado e modal', Math.abs((centered.x + centered.width / 2) - 800) < 2 && (await dialog.getAttribute('aria-modal')) === 'true' && !(await overlayEl.evaluate(el => el.classList.contains("is-moved"))))
await page.mouse.click(20, 450)
await sleep(300)
check('F', 'clique no backdrop fecha (modal de volta)', (await page.locator('.scrum-wi').count()) === 0)
await page.locator('.is-side .scrum-bl-title').nth(ROW_A).click()
await sleep(300)
const hb3 = await head.boundingBox()
await page.mouse.move(hb3.x + 40, hb3.y + hb3.height / 2)
await page.mouse.down()
await page.mouse.move(hb3.x + 40 + 900, hb3.y + hb3.height / 2, { steps: 10 })
await page.mouse.up()
await sleep(300)
await page.setViewportSize({ width: 700, height: 900 })
await sleep(500)
const shrunk = await dialog.boundingBox()
check('F', 'viewport 700px → o form volta para dentro (≥ 24px visíveis)', shrunk.x <= 700 - 24 + 1, `left ${shrunk.x} w ${shrunk.width}`)
await page.screenshot({ path: join(SHOTS, 'F-drag.png') })
await page.setViewportSize({ width: 1600, height: 900 })
await sleep(500)
// Only the 24px strip is on screen: drag it back by that strip (the handle
// is the whole header), then centre.
const strip = await head.boundingBox()
await page.mouse.move(Math.min(strip.x + 10, 1590), strip.y + strip.height / 2)
await page.mouse.down()
await page.mouse.move(Math.min(strip.x + 10, 1590) - 900, strip.y + strip.height / 2, { steps: 10 })
await page.mouse.up()
await sleep(300)
check('F', 'a faixa visível de 24px ainda é alça', (await dialog.boundingBox()).x < 1000)
await page.locator('.scrum-wi button[title="Voltar ao centro (modal)"]').click()
await sleep(200)
await page.keyboard.press('Escape')
await sleep(300)

// (G) comp-58 — artifacts rendered as Primer markdown: Visualizar | Escrever
// per artifact, the frontmatter as a table, mermaid inline, the sanitizer
// policy probed with raw html (never saved: the dialog is accepted on Esc).
// The component: the first one whose row carries a phase chip (a component
// with artifacts), preferring comp-58 (its validation is empty → Escrever).
{
  const compRow = (id) => page.locator('.is-side .scrum-bl-row', { has: page.locator('.scrum-id', { hasText: id }) }).first()
  let target = compRow('comp-58')
  if ((await target.count()) === 0) target = page.locator('.is-side .scrum-bl-row', { has: page.locator('.scrum-phase') }).first()
  const hasTarget = (await target.count()) > 0
  check('G', 'há um componente com artefatos no quadro', hasTarget)
  if (hasTarget) {
    const requests = []
    const onReq = req => { if (req.url().includes('example.invalid')) requests.push(req.url()) }
    page.on('request', onReq)
    await target.locator('.scrum-bl-title').click({ force: true })
    await sleep(800)
    const artifact = (label) => page.locator('.scrum-artifact', { has: page.locator('summary > span:first-child', { hasText: new RegExp('^' + label + '$') }) })
    const selectedOf = async (label) => artifact(label).locator('.scrum-artifact-tabs [role=tab][aria-selected=true]').evaluate(el => el.textContent)
    const openArtifact = async (label) => { const d = artifact(label); if (!(await d.evaluate(el => el.open))) { await d.locator('summary').click(); await sleep(300) } }
    const labels = ['Requisitos', 'Revisão dos requisitos', 'Desenho', 'Validação']
    const sizes = await Promise.all(labels.map(l => artifact(l).locator('.scrum-artifact-size').innerText()))
    const filled = labels.filter((_, i) => !sizes[i].includes('vazio'))
    const empty = labels.filter((_, i) => sizes[i].includes('vazio'))
    const modes = await Promise.all(labels.map(selectedOf))
    check('G', 'Visualizar por padrão nos artefatos com texto', filled.every(l => modes[labels.indexOf(l)] === 'Visualizar'), JSON.stringify(Object.fromEntries(labels.map((l, i) => [l, modes[i]]))))
    check('G', 'artefato vazio abre em Escrever', empty.length === 0 || empty.every(l => modes[labels.indexOf(l)] === 'Escrever'), empty.join(', ') || '(nenhum vazio)')
    for (const l of filled) await openArtifact(l)
    await sleep(1500)
    const first = filled[0]
    const md = artifact(first).locator('.scrum-md')
    check('G', 'frontmatter como tabela (chave | valor), sem o texto literal ---', (await md.locator('.scrum-md-fm table tr').count()) >= 2 && !(await md.locator('.scrum-md-html').allInnerTexts()).join('').includes('\n---\n'))
    check('G', 'títulos renderizados (h2/h3) no corpo', (await md.locator('.scrum-md-html h2, .scrum-md-html h3').count()) >= 1)
    check('G', 'textarea oculto em Visualizar', (await artifact(first).locator('textarea').isVisible()) === false)
    const withFigures = artifact('Desenho')
    if ((await withFigures.count()) > 0 && filled.includes('Desenho')) {
      const figs = await withFigures.locator('.scrum-md figure').count()
      const svgs = await withFigures.locator('.scrum-md figure svg').count()
      const order = await withFigures.locator('.scrum-md > *').evaluateAll(els => els.map(e => e.tagName === 'FIGURE' ? 'F' : e.classList.contains('scrum-md-html') ? 'H' : 'x').join(''))
      // order reads like xHFHFH: x = the frontmatter table, H = html segment, F = figure.
      check('G', 'diagramas inline entre segmentos de html', figs >= 1 && svgs >= 1 && /HF+H/.test(order), `figures=${figs} svg=${svgs} order=${order}`)
    }
    await page.screenshot({ path: join(SHOTS, 'G-view.png') })
    // Escrever → the textarea, intact; edit a heading → Visualizar shows it and the • lights.
    await artifact(first).locator('[role=tab]', { hasText: 'Escrever' }).click()
    await sleep(200)
    const ta = artifact(first).locator('textarea')
    check('G', '«Escrever» → textarea visível', await ta.isVisible())
    const original = await ta.inputValue()
    check('G', 'texto intacto no textarea', original.startsWith('---'))
    await ta.evaluate((el, v) => { const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; setter.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }, original + '\n\n## Título de dogfood G\n')
    await sleep(200)
    await artifact(first).locator('[role=tab]', { hasText: 'Visualizar' }).click()
    await sleep(500)
    check('G', 'título editado renderizado e • aceso', (await artifact(first).locator('.scrum-md-html h2', { hasText: 'Título de dogfood G' }).count()) === 1 && (await artifact(first).locator('.scrum-artifact-dirty').count()) === 1)
    // Sanitizer probe as its own block (blank line before → a block html token).
    const probe = '\n\n<script>window.__x=1</script>\n<img src="https://example.invalid/p.gif" onerror="window.__x=2">\n<svg><image href="https://example.invalid/s.png"/></svg>\n<a href="javascript:alert(1)">j</a>\n<a href="//example.invalid/x">p</a>\n<a href="https://example.com">e</a>\n<div class="scrum-wi-overlay"></div>\n<style>body{display:none}</style>\n'
    await artifact(first).locator('[role=tab]', { hasText: 'Escrever' }).click()
    await sleep(200)
    await ta.evaluate((el, v) => { const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; setter.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }, original + probe)
    await sleep(200)
    await artifact(first).locator('[role=tab]', { hasText: 'Visualizar' }).click()
    await sleep(800)
    const probeState = await page.evaluate(() => ({
      x: window.__x,
      // Only the html segments: the mermaid svg of a figure legitimately carries its own <style>.
      scriptStyleSvg: document.querySelectorAll('.scrum-md-html script, .scrum-md-html style, .scrum-md-html svg').length,
      classed: document.querySelectorAll('.scrum-md-html [class]').length,
      js: document.querySelectorAll('.scrum-md a[href^="javascript:"]').length,
      rel: document.querySelectorAll('.scrum-md a[href^="//"]').length,
      ok: [...document.querySelectorAll('.scrum-md a[href="https://example.com"]')].map(a => [a.target, a.rel]),
      bodyVisible: getComputedStyle(document.body).display !== 'none',
      alt: document.querySelectorAll('.scrum-md-html span[title^="imagem remota"]').length,
    }))
    check('G', 'sonda: nada executa, nada de script/style/svg/class/javascript:/protocol-relative', probeState.x === undefined && probeState.scriptStyleSvg === 0 && probeState.classed === 0 && probeState.js === 0 && probeState.rel === 0 && probeState.bodyVisible, JSON.stringify(probeState))
    check('G', 'sonda: https → target _blank + rel noopener noreferrer (o hook correu); img remota → [alt]', probeState.ok.length === 1 && probeState.ok[0][0] === '_blank' && /noopener/.test(probeState.ok[0][1]) && /noreferrer/.test(probeState.ok[0][1]) && probeState.alt === 1, JSON.stringify(probeState.ok))
    await sleep(500)
    check('G', 'sonda: nenhuma requisição para example.invalid', requests.length === 0, requests.join(' '))
    page.off('request', onReq)
    await page.screenshot({ path: join(SHOTS, 'G-probe.png') })
    // Dark theme: the sheet follows the tokens (no dark rule of its own).
    // --bgColor-default differs per theme (--bgColor-neutral-muted is the same alpha in both).
    const preColor = async () => md.evaluate(el => getComputedStyle(el).backgroundColor)
    const light = await preColor()
    // The form is modal (overlay over the column): the theme button is reached by a DOM click.
    await page.locator('.is-side .scrum-tab[title="Tema escuro"]').evaluate(el => el.click())
    await sleep(300)
    const dark = await preColor()
    check('G', '🌙 escurece a folha .scrum-md pelos tokens', light !== dark, `${light} → ${dark}`)
    await page.screenshot({ path: join(SHOTS, 'G-dark.png') })
    await page.locator('.is-side .scrum-tab[title="Tema claro"]').evaluate(el => el.click())
    await sleep(200)
    // Discard: nothing of block G persists.
    page.once('dialog', d => d.accept())
    await page.keyboard.press('Escape')
    await sleep(400)
    check('G', 'descartado sem salvar (form fechado)', (await page.locator('.scrum-wi-overlay').count()) === 0)
  }
}

// (8) poll: open → one /scrum-api/state per ~4s; closed → none.
stateCalls.length = 0
await sleep(8500)
const openCalls = stateCalls.length
check(8, 'coluna aberta pola (~2 em 8.5s)', openCalls >= 2 && openCalls <= 3, `${openCalls}`)

// (4) × closes without flashing the tool panel; double click does not reopen.
const closeBtn = page.locator('.is-side .scrum-tab[title="Fechar e devolver os detalhes de tool"]')
await closeBtn.click()
await sleep(60)
const stillOurs = (await side().count()) === 1
await closeBtn.click({ force: true }).catch(() => {})
await sleep(900)
check(4, '× mantém o ocupante durante o fechamento (sem piscar)', stillOurs)
check(4, 'duplo clique no × não reabre', (await side().count()) === 0 && (await capsule().getAttribute('aria-pressed')) === 'false')
stateCalls.length = 0
await sleep(8500)
check(8, 'coluna fechada não pola', stateCalls.length === 0, `${stateCalls.length}`)
// tool call → the tool DetailsPanel returns.
// A chat tool-call row ("Tool call<name> · <arg>") opens the details column
// through ChatView's openDetails; with our registration disposed, the
// occupant must be ui-conversation's DetailsPanel showing that call.
const toolCall = page.locator('button:has-text("Tool call"), [role="button"]:has-text("Tool call")').first()
if (await toolCall.count()) {
  const name = ((await toolCall.innerText()).replace(/^Tool call\s*/, '').split(' ·')[0].split('\n')[0]).trim()
  await toolCall.click()
  await sleep(900)
  const detailsCol = page.locator('.scrum-capsule').locator('xpath=ancestor::*[contains(@class,"frame")]//*[contains(@class,"detailsCol")]').first()
  const text = (await detailsCol.innerText().catch(() => ''))
  // R11(4): the tool DetailsPanel is the occupant again (its own header text); which
  // call it shows is ChatView's business (a row click may expand instead of select).
  check(4, 'painel de tools volta', (await side().count()) === 0 && /Details|Detalhes/.test(text), `clicou ${name} | ${text.slice(0, 40).replace(/\n/g, ' ')}`)
  await page.screenshot({ path: join(SHOTS, '4-tools.png') })
  await page.locator('.scrum-capsule').locator('xpath=ancestor::*[contains(@class,"frame")]//*[contains(@class,"detailsCol")]//button').first().click().catch(() => {})
  await sleep(600)
} else {
  check(4, 'painel de tools volta (sem tool call nesta sessão)', false, 'escolha uma sessão com tool calls')
}
await capsule().click()
await sleep(1000)
check(4, 'religar → coluna em Backlog sem seleção', (await sideWidth()) > 0 && (await page.locator('.is-side .scrum-tab.is-active').innerText()) === 'Backlog' && (await page.locator('.scrum-wi-overlay').count()) === 0)

// (5) concession: narrow the window until the center starves.
await page.locator('.is-side .scrum-tab', { hasText: 'Sprints' }).click()
await sleep(300)
await page.setViewportSize({ width: 900, height: 900 })
await sleep(800)
check(5, 'center < 640 → coluna some', (await sideWidth()) === 0)
await capsule().click()
await sleep(600)
check(5, '▦ sob concessão é inócuo', (await sideWidth()) === 0 && (await capsule().getAttribute('aria-pressed')) === 'true')
await page.screenshot({ path: join(SHOTS, '5-concession.png') })
await page.setViewportSize({ width: 1600, height: 900 })
await sleep(800)
check(5, 'alargar → volta na mesma seção', (await sideWidth()) > 0 && (await page.locator('.is-side .scrum-tab.is-active').innerText()) === 'Sprints')

// (6) session switch closes; ▦ reopens.
await openSession(OTHER)
check(6, 'trocar de sessão → fechada', (await sideWidth()) === 0 && (await capsule().getAttribute('title')) === 'Reabrir a coluna')
await capsule().click()
await sleep(1000)
check(6, '▦ (reopen) → volta', (await sideWidth()) > 0)
await openSession(SESSION)

// (7) theme in the column persists (page-level switch) and survives a reopen.
await capsule().click().catch(() => {})
await sleep(800)
if ((await sideWidth()) === 0) { await capsule().click(); await sleep(800) }
await page.locator('.is-side .scrum-tab[title="Tema escuro"]').click()
await sleep(200)
const modes = await page.locator('.scrum-view').evaluateAll(els => els.map(e => e.getAttribute('data-color-mode')))
check(7, '🌙 escurece a coluna (único ponto de montagem)', modes.length === 1 && modes[0] === 'dark', JSON.stringify(modes))
await page.locator('.is-side .scrum-tab[title="Tema claro"]').click()
await sleep(200)

// (9) v0.23: no ▦ SCRUM tab in the conversation view ring — the capsule is the only trigger.
check(9, 'sem aba ▦ SCRUM no anel de views', (await page.getByRole('tab', { name: '▦ SCRUM' }).count()) === 0 && (await page.locator('.scrum-view.is-tab').count()) === 0)
check(9, 'uma única cápsula «▦ SCRUM» (cabeçalho da sessão)', (await page.locator('button:has-text("▦ SCRUM")').count()) === 1)
await capsule().click()
await sleep(900)
check(9, 'cápsula fecha e vira «Abrir ao lado»', (await sideWidth()) === 0 && (await capsule().getAttribute('title')) === 'Abrir ao lado')

// (10) reload → off.
await capsule().click()
await sleep(600)
await page.reload()
await sleep(2500)
check(10, 'reload → desligado, painel de tools no lugar', (await side().count()) === 0 && (await page.locator('.scrum-capsule').getAttribute('aria-pressed')) === 'false')

// (11) blank session: no capsule (no header), nothing visible, no poll.
await page.locator('.scrum-capsule').click()
await sleep(400)
await page.getByText('New Session', { exact: true }).click()
await sleep(1200)
stateCalls.length = 0
await sleep(4500)
check(11, 'sessão blank: sem cápsula, sem coluna visível, sem poll', (await page.locator('.scrum-capsule').count()) === 0 && (await sideWidth()) === 0 && stateCalls.length === 0, `capsule=${await page.locator('.scrum-capsule').count()} polls=${stateCalls.length}`)

await browser.close()
const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed${failed.length ? ` — FAILED: ${failed.map(f => `[${f.step}] ${f.name}`).join('; ')}` : ''}`)
process.exit(failed.length ? 1 : 0)
