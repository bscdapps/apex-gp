/**
 * OMGIithub capture — desktop + mobile screenshots of a live preview.
 *
 * Opens CAPTURE_URL in the worker's instrumented Chromium, waits for the
 * scene to finish booting (the APEX loading overlay is removed only after
 * `Engine.init()` resolves and the render loop starts), warms the frame, and
 * writes `final-desktop.png` / `final-mobile.png` into CAPTURE_DIR.
 *
 * Readiness deliberately uses `page.waitForFunction` rather than
 * `locator.waitFor({ state: 'visible' })`: Playwright's injected visibility
 * poll never settles on this WebGL page under SwiftShader and times out even
 * though `<body>` is visibly laid out. A predicate over real canvas/overlay
 * state is deterministic and cheap.
 *
 * Exit codes: 0 success, 75 transient browser/navigation infrastructure,
 * 1 script or rendering defect.
 */
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const runtime = join(process.env.HOME, '.local/share/omgithub-playwright')
const require = createRequire(join(runtime, 'package.json'))
const { chromium } = require('playwright')

// Queue screenshots for the WIP preview when the harness provides the hook.
try {
  const { instrument } = require(join(process.env.RUNTIME_DIR || '', 'scripts/wip-screenshots.cjs'))
  instrument({ chromium })
} catch (error) {
  console.error(`capture instrumentation unavailable: ${error.message}`)
}

const config = JSON.parse(readFileSync(join(runtime, process.platform === 'darwin' ? 'metal.json' : 'linux.json'), 'utf8'))
if (process.platform === 'linux') process.env.DISPLAY ||= ':' + readFileSync(join(runtime, 'display'), 'utf8').trim()

const url = process.env.CAPTURE_URL
const output = process.env.CAPTURE_DIR
if (!url || !output) {
  console.error('Set CAPTURE_URL and CAPTURE_DIR.')
  process.exit(1)
}
mkdirSync(output, { recursive: true })

const VIEWS = [['desktop', 1440, 900], ['mobile', 390, 844]]
const TRANSIENT_HTTP = new Set([408, 429, 500, 502, 503, 504])
const READY_TIMEOUT = Number(process.env.CAPTURE_READY_TIMEOUT || 120000)
const WARM_MS = Number(process.env.CAPTURE_WARM_MS || 4000)

const fail = (message, exitCode) => Object.assign(new Error(message), { exitCode })
const transient = error => { throw Object.assign(error, { exitCode: 75 }) }
const timed = async (label, fn) => {
  const start = Date.now()
  try { return await fn() } finally { console.log(`[timing] capture ${label}: ${Date.now() - start} ms`) }
}

let browser
try {
  browser = await timed('browser launch', () =>
    chromium.launch({ ...config.browser.launchOptions, timeout: 30000 }).catch(transient))
  for (const [name, width, height] of VIEWS) {
    const page = await timed(`${name} page`, () => browser.newPage({ viewport: { width, height } }).catch(transient))
    page.setDefaultTimeout(30000)
    page.on('pageerror', error => console.error(`[${name}] pageerror: ${error.message}`))
    const response = await timed(`${name} goto`, () => page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(transient))
    if (!response?.ok()) {
      const status = response?.status()
      throw fail(`HTTP ${status ?? 'no response'} loading preview`, !response || TRANSIENT_HTTP.has(status) ? 75 : 1)
    }
    await timed(`${name} ready`, () => page.waitForFunction(() => {
      if (!document.body) return false
      const canvas = document.querySelector('canvas')
      return !!canvas && canvas.width > 0 && canvas.height > 0 && !document.getElementById('apex-loading')
    }, null, { timeout: READY_TIMEOUT }).catch(error => {
      if (error.name === 'TimeoutError' || !browser.isConnected()) transient(error)
      throw fail(`preview never finished rendering for ${name}: ${error.message}`, 1)
    }))
    await timed(`${name} warm`, () => page.waitForTimeout(WARM_MS))
    await timed(`${name} screenshot`, () => page.screenshot({ path: join(output, `final-${name}.png`), timeout: 30000 }).catch(error => {
      if (error.name === 'TimeoutError' || !browser.isConnected()) transient(error)
      throw error
    }))
    await page.close()
    console.log(`captured ${name} ${width}x${height}`)
  }
} catch (error) {
  console.error(error)
  process.exitCode = error.exitCode || 1
} finally {
  await browser?.close().catch(error => { console.error(error); process.exitCode ||= 75 })
}
