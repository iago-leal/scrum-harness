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
check(1, 'cápsula abre a coluna (largura > 0)', w1 > 0, `${w1}px`)
check(1, 'quadro do workspace', (await page.locator('.is-side .scrum-ws').innerText()).includes('scrum-harness'))
check(1, 'backlog com linhas', (await page.locator('.is-side .scrum-bl-row').count()) > 3)
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
const item = await page.locator('.is-side .scrum-bl-row').nth(3).evaluate(el => getComputedStyle(el).gridTemplateColumns)
check(2, 'backlog em duas colunas', item.split(' ').length === 2, item)
await page.locator('.is-side .scrum-tab', { hasText: 'Board' }).click()
await sleep(500)
const cols = await page.locator('.is-side .scrum-board').first().evaluate(el => getComputedStyle(el).gridTemplateColumns)
check(2, 'board empilhado (1 coluna)', cols.split(' ').length === 1, cols)
check(2, 'board com cabeçalhos', (await page.locator('.is-side .scrum-col-head').count()) >= 4)
check(2, 'sem «☰ Raias»', (await page.locator('.is-side .scrum-btn', { hasText: 'Raias' }).count()) === 0)
await page.screenshot({ path: join(SHOTS, '2-min-board.png') })
await drag(-600)
const wMax = await sideWidth()
check(2, 'arraste até o máximo', wMax > 300, `${wMax}px (clamp do ui-layout)`)
await page.screenshot({ path: join(SHOTS, '2-max-board.png') })
await page.locator('.is-side .scrum-tab', { hasText: 'Backlog' }).click()
await sleep(300)

// (3) the work item form covers the page from the column.
await page.locator('.is-side .scrum-bl-title').nth(3).click()
await sleep(500)
const overlay = await page.locator('.scrum-wi-overlay').boundingBox()
check(3, 'form cobre a página', overlay !== null && overlay.x === 0 && overlay.width === 1600 && overlay.height === 900, JSON.stringify(overlay))
await page.screenshot({ path: join(SHOTS, '3-form.png') })
await page.keyboard.press('Escape')
await sleep(300)
check(3, 'form fecha', (await page.locator('.scrum-wi-overlay').count()) === 0)

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

// (7) theme in the column flips the tab too.
await capsule().click().catch(() => {})
await sleep(800)
if ((await sideWidth()) === 0) { await capsule().click(); await sleep(800) }
await page.locator('.is-side .scrum-tab[title="Tema escuro"]').click()
await sleep(200)
await page.getByRole('tab', { name: '▦ SCRUM' }).click().catch(async () => { await page.locator('button:has-text("▦ SCRUM")').nth(1).click() })
await sleep(800)
const modes = await page.locator('.scrum-view').evaluateAll(els => els.map(e => e.getAttribute('data-color-mode')))
check(7, '🌙 na coluna escurece a aba também', modes.length === 2 && modes.every(m => m === 'dark'), JSON.stringify(modes))
await page.locator('.scrum-view.is-tab .scrum-tab[title="Tema claro"]').click()
await sleep(200)

// (9) the tab's «⇥ Ao lado» state and title.
const aoLado = page.locator('.scrum-view.is-tab .scrum-tab', { hasText: 'Ao lado' })
check(9, '«⇥ Ao lado» ligado com title de fechar', (await aoLado.evaluate(el => el.classList.contains('is-on'))) && (await aoLado.getAttribute('title')) === 'Fechar a coluna lateral')
await aoLado.click()
await sleep(900)
check(9, '«⇥ Ao lado» fecha e vira «Abrir ao lado»', (await sideWidth()) === 0 && (await aoLado.getAttribute('title')) === 'Abrir ao lado')

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
