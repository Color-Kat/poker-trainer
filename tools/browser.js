// Headless Chromium helper for checks/screenshots (uses the cached Playwright browser).
// Usage as script: node tools/browser.js [width=1280] [height=800] [out=.shots/page.png]
//   → builds nothing; opens index.html, prints console errors, saves a screenshot.
// Usage as module: const { open } = require('./browser'); const { page, errors, close } = await open({ width, height });
const path = require('path');
const fs = require('fs');
const os = require('os');
const { chromium } = require('playwright-core');

function findChrome() {
  const base = path.join(os.homedir(), '.cache', 'ms-playwright');
  const dirs = fs.existsSync(base) ? fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse() : [];
  for (const d of dirs) {
    const p = path.join(base, d, 'chrome-linux64', 'chrome');
    if (fs.existsSync(p)) return p;
  }
  throw new Error('No cached Chromium in ~/.cache/ms-playwright');
}

async function open({ width = 1280, height = 800, file = path.join(__dirname, '..', 'index.html'), mobile = false } = {}) {
  const browser = await chromium.launch({ executablePath: findChrome(), args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('file://' + file);
  return { browser, page, errors, close: () => browser.close() };
}
module.exports = { open, findChrome };

if (require.main === module) {
  (async () => {
    const [w = 1280, h = 800, out = '.shots/page.png'] = process.argv.slice(2);
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    const { page, errors, close } = await open({ width: +w, height: +h, mobile: +w < 700 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: out, fullPage: false });
    console.log(errors.length ? errors.join('\n') : 'no console errors');
    console.log('screenshot: ' + out);
    await close();
  })().catch((e) => { console.error(e); process.exit(1); });
}
